/**
 * ALO Labs AgentOS — Local filesystem storage provider
 *
 * Private-by-default object storage on local disk.
 *
 * Security model
 *  - Every stored object has a private sidecar `<key>.metadata` (mode 0600)
 *    that records the owning tenant (`companyId`), the uploader, the SHA-256
 *    checksum, size, MIME type and creation time. Ownership is PERSISTED, not
 *    inferred from the path, and tenant-facing routes must compare the
 *    persisted `companyId` with the caller's membership before returning bytes.
 *  - Objects without a metadata sidecar are invisible to `list()` and return
 *    `null` from `getMetadata()` (fail closed). Bytes are never deleted by
 *    this provider except through an explicit `delete(key)`.
 *  - Keys are validated against path traversal (`..`, absolute paths,
 *    backslashes, NUL bytes) and must resolve inside `basePath`.
 *  - Files are written with the `wx` flag so an existing object can never be
 *    silently overwritten.
 *  - Signed URLs are HMAC-SHA256 over `key:expires` with
 *    `STORAGE_SIGNING_SECRET`; verification is constant-time and fails closed
 *    when the secret is not configured.
 *
 * This file intentionally lives at `src/lib/storage/local-storage.ts`; the
 * repository `.gitignore` must NOT contain a bare `local-*` pattern (it used
 * to, which is how this file went missing from the committed tree).
 */

import fs from 'fs/promises';
import path from 'path';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';

// ─── Public types ───────────────────────────────────────────────────────────

export interface UploadedFile {
  /** Storage key, e.g. `uploads/2026-10-08/<uuid>-report.pdf` */
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  /** SHA-256 hex digest of the stored bytes */
  checksum: string;
  /** Owning tenant. Empty string means "unowned" and is never tenant-accessible. */
  companyId: string;
  /** Uploader identity (user id) or `system`. */
  uploadedBy: string;
  folder: string;
  url: string;
  createdAt: Date;
}

export interface UploadOptions {
  folder?: string;
  companyId?: string;
  uploadedBy?: string;
  /** Override MIME detection (validated to a sane token). */
  mimeType?: string;
}

export interface StorageStats {
  totalFiles: number;
  totalSize: number;
  byType: Record<string, number>;
  byMonth: Record<string, number>;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** 5 GiB hard ceiling for a single object. */
export const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024;

const METADATA_SUFFIX = '.metadata';
const DEFAULT_FOLDER = 'uploads';
const DEFAULT_SIGNED_URL_TTL_SECONDS = 3600;
const PUBLIC_ROUTE_PREFIX = '/api/storage/files/';

const MIME_BY_EXTENSION: Record<string, string> = {
  txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json',
  html: 'text/html', htm: 'text/html', xml: 'application/xml', yaml: 'application/yaml', yml: 'application/yaml',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  mp4: 'video/mp4', webm: 'video/webm',
  zip: 'application/zip', gz: 'application/gzip', tar: 'application/x-tar',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Reduce an arbitrary user-supplied filename to a safe basename: strips
 * directories, control characters and shell-unfriendly characters, collapses
 * whitespace and caps the length while preserving the extension.
 */
export function sanitizeFilename(name: string): string {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  // Strip C0 control characters and DEL. The `no-control-regex` disable that
  // used to sit here was dead: the rule is not enabled by this project's flat
  // ESLint config, so the directive only produced an "unused eslint-disable"
  // warning. The character class below is intentional and must stay.
  let cleaned = base.replace(/[\x00-\x1f\x7f]/g, '').replace(/[^A-Za-z0-9._ -]/g, '_').replace(/\s+/g, '-');
  cleaned = cleaned.replace(/^[._-]+/, ''); // no hidden/relative prefixes
  if (!cleaned) cleaned = 'file';
  if (cleaned.length > 120) {
    const ext = path.extname(cleaned).slice(0, 16);
    cleaned = cleaned.slice(0, 120 - ext.length) + ext;
  }
  return cleaned;
}

function detectMimeType(buffer: Buffer, filename: string, override?: string): string {
  if (override && /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(override)) return override.toLowerCase();
  // Magic bytes first — the extension can lie.
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 6 && (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a')) return 'image/gif';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    const ext = path.extname(filename).slice(1).toLowerCase();
    if (ext === 'docx' || ext === 'xlsx' || ext === 'pptx') return MIME_BY_EXTENSION[ext];
    return 'application/zip';
  }
  if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) return 'application/gzip';
  const ext = path.extname(filename).slice(1).toLowerCase();
  return MIME_BY_EXTENSION[ext] ?? 'application/octet-stream';
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isEnoent(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  const message = (error as { message?: unknown }).message;
  return code === 'ENOENT' || (typeof message === 'string' && message.includes('ENOENT'));
}

function parseMetadata(raw: string): UploadedFile | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.companyId !== 'string') return null;
    return {
      id: record.id,
      originalName: typeof record.originalName === 'string' ? record.originalName : path.basename(record.id),
      mimeType: typeof record.mimeType === 'string' ? record.mimeType : 'application/octet-stream',
      size: typeof record.size === 'number' ? record.size : 0,
      checksum: typeof record.checksum === 'string' ? record.checksum : '',
      companyId: record.companyId,
      uploadedBy: typeof record.uploadedBy === 'string' ? record.uploadedBy : 'system',
      folder: typeof record.folder === 'string' ? record.folder : record.id.split('/')[0] ?? DEFAULT_FOLDER,
      url: `${PUBLIC_ROUTE_PREFIX}${encodeURIComponent(record.id)}`,
      createdAt: typeof record.createdAt === 'string' ? new Date(record.createdAt) : new Date(0),
    };
  } catch {
    return null;
  }
}

// ─── Provider ───────────────────────────────────────────────────────────────

export class LocalStorageProvider {
  private readonly basePath: string;

  constructor(options: { basePath: string }) {
    const configured = options.basePath && options.basePath.trim().length > 0
      ? options.basePath
      : path.join(process.cwd(), DEFAULT_FOLDER);
    this.basePath = path.resolve(configured);
  }

  // ── Key validation ────────────────────────────────────────────────────────

  /**
   * Validate a storage key (or folder) and return its absolute path inside
   * `basePath`. Throws `Invalid file key` on any traversal attempt.
   */
  private resolveKey(key: string): string {
    if (typeof key !== 'string' || key.length === 0 || key.length > 1024) throw new Error('Invalid file key');
    if (key.includes('\0') || key.includes('\\') || key.startsWith('/') || key.startsWith('~')) throw new Error('Invalid file key');
    if (/^[A-Za-z]:/.test(key)) throw new Error('Invalid file key');
    const segments = key.split('/');
    if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) throw new Error('Invalid file key');
    if (key.endsWith(METADATA_SUFFIX)) throw new Error('Invalid file key');
    const absolute = path.resolve(this.basePath, key);
    const relative = path.relative(this.basePath, absolute);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Invalid file key');
    return absolute;
  }

  private resolveFolder(folder: string): string {
    return this.resolveKey(folder);
  }

  // ── Upload ────────────────────────────────────────────────────────────────

  async upload(buffer: Buffer, filename: string, options: UploadOptions = {}): Promise<UploadedFile> {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('Cannot upload an empty file');
    if (buffer.length > MAX_FILE_SIZE) throw new Error(`File exceeds the maximum size of ${MAX_FILE_SIZE} bytes`);

    const folder = options.folder ? sanitizeFilename(options.folder) : DEFAULT_FOLDER;
    // Folder names are validated as keys too (no traversal, no hidden dirs).
    this.resolveFolder(folder);

    const createdAt = new Date();
    const safeName = sanitizeFilename(filename);
    const key = `${folder}/${isoDate(createdAt)}/${randomUUID()}-${safeName}`;
    const absolute = this.resolveKey(key);

    await fs.mkdir(path.dirname(absolute), { recursive: true });

    const record: UploadedFile = {
      id: key,
      originalName: safeName,
      mimeType: detectMimeType(buffer, safeName, options.mimeType),
      size: buffer.length,
      checksum: createHash('sha256').update(buffer).digest('hex'),
      companyId: options.companyId ?? '',
      uploadedBy: options.uploadedBy ?? 'system',
      folder,
      url: `${PUBLIC_ROUTE_PREFIX}${encodeURIComponent(key)}`,
      createdAt,
    };

    // `wx` — never overwrite an existing object or sidecar.
    await fs.writeFile(absolute, buffer, { flag: 'wx', mode: 0o600 });
    await fs.writeFile(
      `${absolute}${METADATA_SUFFIX}`,
      JSON.stringify({ ...record, createdAt: createdAt.toISOString() }),
      { flag: 'wx', mode: 0o600 },
    );

    return record;
  }

  // ── Metadata ──────────────────────────────────────────────────────────────

  /** Persisted ownership/integrity record for a key, or `null` (fail closed). */
  async getMetadata(key: string): Promise<UploadedFile | null> {
    const absolute = this.resolveKey(key);
    let raw: string;
    try {
      raw = (await fs.readFile(`${absolute}${METADATA_SUFFIX}`)).toString('utf8');
    } catch (error) {
      if (isEnoent(error)) return null;
      throw error;
    }
    const metadata = parseMetadata(raw);
    if (!metadata || metadata.id !== key) return null;
    return metadata;
  }

  // ── Download ──────────────────────────────────────────────────────────────

  async download(key: string): Promise<Buffer> {
    const absolute = this.resolveKey(key);
    try {
      return await fs.readFile(absolute);
    } catch (error) {
      if (isEnoent(error)) throw new Error('File not found');
      throw error;
    }
  }

  /**
   * Download and verify the stored checksum. Throws `File integrity check
   * failed` when the bytes no longer match the persisted SHA-256 digest.
   */
  async downloadVerified(key: string): Promise<{ buffer: Buffer; metadata: UploadedFile }> {
    const metadata = await this.getMetadata(key);
    if (!metadata) throw new Error('File not found');
    const buffer = await this.download(key);
    if (metadata.checksum) {
      const actual = createHash('sha256').update(buffer).digest('hex');
      if (actual !== metadata.checksum) throw new Error('File integrity check failed');
    }
    return { buffer, metadata };
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async delete(key: string): Promise<void> {
    const absolute = this.resolveKey(key);
    try {
      await fs.unlink(absolute);
    } catch (error) {
      if (isEnoent(error)) throw new Error('File not found');
      throw error;
    }
    // Sidecar + thumbnail cleanup is best-effort: the object is already gone.
    await fs.unlink(`${absolute}${METADATA_SUFFIX}`).catch(() => undefined);
    const thumb = this.thumbnailKeyFor(key);
    if (thumb) {
      await fs.unlink(path.resolve(this.basePath, thumb)).catch(() => undefined);
      await fs.unlink(`${path.resolve(this.basePath, thumb)}${METADATA_SUFFIX}`).catch(() => undefined);
    }
  }

  // ── List ──────────────────────────────────────────────────────────────────

  /**
   * List owned objects under `folder` (recursively). Objects without a valid
   * metadata sidecar are hidden. Missing folders yield an empty list.
   */
  async list(folder: string = DEFAULT_FOLDER): Promise<UploadedFile[]> {
    const root = this.resolveFolder(folder);
    const results: UploadedFile[] = [];
    const seen = new Set<string>();

    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > 8 || seen.has(dir)) return;
      seen.add(dir);
      let entries: Array<{ name: string; isFile: () => boolean; isDirectory: () => boolean }>;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true }) as unknown as typeof entries;
      } catch (error) {
        if (isEnoent(error)) return;
        throw error;
      }
      for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(entryPath, depth + 1);
          continue;
        }
        if (!entry.isFile() || entry.name.endsWith(METADATA_SUFFIX)) continue;
        try {
          await fs.stat(entryPath);
        } catch {
          continue; // unreadable entries are skipped, never fatal
        }
        const key = path.relative(this.basePath, entryPath).split(path.sep).join('/');
        let metadata: UploadedFile | null = null;
        try {
          metadata = await this.getMetadata(key);
        } catch {
          metadata = null;
        }
        if (metadata) results.push(metadata);
      }
    };

    await walk(root, 0);
    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return results;
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  async getStats(): Promise<StorageStats> {
    const stats: StorageStats = { totalFiles: 0, totalSize: 0, byType: {}, byMonth: {} };
    const seen = new Set<string>();

    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > 8 || seen.has(dir)) return;
      seen.add(dir);
      let entries: Array<{ name: string; isFile: () => boolean; isDirectory: () => boolean }>;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true }) as unknown as typeof entries;
      } catch (error) {
        if (isEnoent(error)) return;
        throw error;
      }
      for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(entryPath, depth + 1);
          continue;
        }
        if (!entry.isFile() || entry.name.endsWith(METADATA_SUFFIX)) continue;
        try {
          const info = await fs.stat(entryPath);
          stats.totalFiles += 1;
          stats.totalSize += info.size;
          const ext = path.extname(entry.name).slice(1).toLowerCase() || 'none';
          stats.byType[ext] = (stats.byType[ext] ?? 0) + 1;
          const month = new Date(info.mtime).toISOString().slice(0, 7);
          stats.byMonth[month] = (stats.byMonth[month] ?? 0) + 1;
        } catch {
          // skip unreadable entries
        }
      }
    };

    await walk(this.basePath, 0);
    return stats;
  }

  // ── URLs ──────────────────────────────────────────────────────────────────

  getPublicUrl(fileId: string): string {
    return `${PUBLIC_ROUTE_PREFIX}${fileId}`;
  }

  private signingSecret(): string | null {
    const secret = process.env.STORAGE_SIGNING_SECRET;
    if (secret && secret.length >= 16) return secret;
    return null;
  }

  private signature(fileId: string, expires: number): string | null {
    const secret = this.signingSecret();
    if (!secret) return null;
    return createHmac('sha256', secret).update(`${fileId}:${expires}`).digest('hex');
  }

  getSignedUrl(fileId: string, expiresInSeconds: number = DEFAULT_SIGNED_URL_TTL_SECONDS): string {
    const ttl = Number.isFinite(expiresInSeconds) && expiresInSeconds > 0
      ? Math.min(expiresInSeconds, 7 * 24 * 3600)
      : DEFAULT_SIGNED_URL_TTL_SECONDS;
    const expires = Math.floor(Date.now() / 1000) + Math.floor(ttl);
    const sig = this.signature(fileId, expires);
    if (!sig) throw new Error('Configuration required: STORAGE_SIGNING_SECRET (>= 16 chars) must be set to issue signed URLs');
    return `${PUBLIC_ROUTE_PREFIX}${fileId}?expires=${expires}&sig=${sig}`;
  }

  verifySignedUrl(fileId: string, expires: number, sig: string): boolean {
    if (!Number.isFinite(expires) || expires <= Math.floor(Date.now() / 1000)) return false;
    if (typeof sig !== 'string' || !/^[0-9a-f]{64}$/i.test(sig)) return false;
    const expected = this.signature(fileId, expires);
    if (!expected) return false; // no secret → nothing can be valid
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(sig, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  // ── Thumbnails ────────────────────────────────────────────────────────────

  private thumbnailKeyFor(key: string): string | null {
    const ext = path.extname(key);
    if (!ext) return null;
    return `${key.slice(0, -ext.length)}_thumb${ext}`;
  }

  /**
   * Generate (or regenerate) a thumbnail for an image object using `sharp`.
   * Returns the thumbnail's public URL. Throws when the source is missing or
   * is not an image, or when `sharp` is unavailable in this runtime.
   */
  async generateThumbnail(key: string, width: number = 200, height: number = 200): Promise<string> {
    const absolute = this.resolveKey(key);
    const thumbKey = this.thumbnailKeyFor(key) ?? `${key}_thumb`;
    const thumbAbsolute = path.resolve(this.basePath, thumbKey);

    let source: Buffer;
    try {
      source = await fs.readFile(absolute);
    } catch (error) {
      if (isEnoent(error)) throw new Error('File not found');
      throw error;
    }

    let sharpModule: (typeof import('sharp'))['default'];
    try {
      sharpModule = (await import('sharp')).default;
    } catch {
      throw new Error('Configuration required: the "sharp" image library is not available in this runtime');
    }

    const w = Math.max(16, Math.min(2048, Math.floor(width)));
    const h = Math.max(16, Math.min(2048, Math.floor(height)));
    const output = await sharpModule(source).resize(w, h, { fit: 'inside', withoutEnlargement: true }).toBuffer();

    await fs.mkdir(path.dirname(thumbAbsolute), { recursive: true });
    await fs.writeFile(thumbAbsolute, output, { mode: 0o600 });
    const sourceMeta = await this.getMetadata(key).catch(() => null);
    const thumbMeta = {
      id: thumbKey,
      originalName: path.basename(thumbKey),
      mimeType: sourceMeta?.mimeType ?? detectMimeType(output, thumbKey),
      size: output.length,
      checksum: createHash('sha256').update(output).digest('hex'),
      companyId: sourceMeta?.companyId ?? '',
      uploadedBy: sourceMeta?.uploadedBy ?? 'system',
      folder: sourceMeta?.folder ?? key.split('/')[0],
      url: `${PUBLIC_ROUTE_PREFIX}${encodeURIComponent(thumbKey)}`,
      createdAt: new Date().toISOString(),
    };
    await fs.writeFile(`${thumbAbsolute}${METADATA_SUFFIX}`, JSON.stringify(thumbMeta), { mode: 0o600 }).catch(() => undefined);
    return this.getPublicUrl(thumbKey);
  }
}
