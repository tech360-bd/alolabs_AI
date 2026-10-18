/**
 * MinIO / S3-Compatible File Storage Adapter
 *
 * Uses the maintained AWS SDK v3 (`@aws-sdk/client-s3`) against a
 * path-style S3 endpoint. Falls back to local filesystem when MinIO/S3 is
 * not reachable, and reports the fallback honestly through `getMinioStatus`.
 *
 * History: this adapter previously used the `minio` package, whose 8.x line
 * pins `stream-json@1.x` and `query-string@7.x` — both unpatched advisory
 * branches (the 8.x client requires `stream-json/src/...`, which 3.x removed,
 * so an npm override cannot fix it without breaking the client).
 */

import { S3CompatibleClient } from './s3/client';
import { db } from './db';
import { writeFile, mkdir, readFile, unlink, stat, readdir } from 'fs/promises';
import path from 'path';

export interface MinioConfig {
  endPoint: string;
  port: number;
  accessKey: string;
  secretKey: string;
  useSSL: boolean;
  region: string;
  bucket: string;
}

let config: MinioConfig | null = null;
let connected = false;
let connectionError: string | null = null;
let minioClient: S3CompatibleClient | null = null;

const LOCAL_STORAGE_DIR = path.join(process.cwd(), 'storage', 'minio-fallback');

/**
 * Object keys come from HTTP requests. Reject anything that could escape the
 * local fallback directory (path traversal) before it reaches the filesystem.
 */
export function sanitizeObjectKey(key: string): string {
  const normalized = key.replace(/\\/g, '/').replace(/^\/+/, '');
  const segments = normalized.split('/');
  if (!normalized || segments.some((segment) => segment === '..' || segment === '')) {
    throw new Error(`Invalid object key: ${key}`);
  }
  const localPath = path.resolve(LOCAL_STORAGE_DIR, normalized);
  const root = path.resolve(LOCAL_STORAGE_DIR) + path.sep;
  if (!localPath.startsWith(root)) {
    throw new Error(`Invalid object key: ${key}`);
  }
  return normalized;
}

function localPathFor(key: string): string {
  return path.join(LOCAL_STORAGE_DIR, sanitizeObjectKey(key));
}

export async function connectMinio(cfg?: MinioConfig): Promise<{ success: boolean; error?: string; latencyMs?: number; version?: string }> {
  const startTime = Date.now();

  try {
    config = cfg || getDefaultConfig();

    if (!config) {
      connectionError = 'MinIO: No configuration provided. Set MINIO_URL or MINIO_* env vars.';
      connected = false;
      return { success: false, error: connectionError };
    }

    minioClient = new S3CompatibleClient({
      endPoint: config.endPoint,
      port: config.port,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
      useSSL: config.useSSL,
      region: config.region,
      bucket: config.bucket,
    });

    // Test connection by listing buckets
    await minioClient.listBuckets();

    const latencyMs = Date.now() - startTime;
    connected = true;
    connectionError = null;

    // Ensure bucket exists (auto-create if needed)
    try {
      const bucketExists = await minioClient.bucketExists(config.bucket);
      if (!bucketExists) {
        await minioClient.makeBucket(config.bucket);
      }
    } catch (bucketErr) {
      console.warn('[MinIO] Bucket check/create failed:', bucketErr);
    }

    // Ensure local fallback dir exists
    await mkdir(LOCAL_STORAGE_DIR, { recursive: true });

    await db.infraService.upsert({
      where: { type: 'minio' },
      create: {
        name: 'MinIO',
        type: 'minio',
        host: config.endPoint,
        port: config.port,
        status: 'connected',
        connectedAt: new Date(),
        lastPingAt: new Date(),
        latencyMs,
        version: 'S3 Compatible',
        configJson: JSON.stringify({ bucket: config.bucket, region: config.region, ssl: config.useSSL }),
      },
      update: {
        host: config.endPoint,
        port: config.port,
        status: 'connected',
        connectedAt: new Date(),
        lastPingAt: new Date(),
        latencyMs,
        version: 'S3 Compatible',
        configJson: JSON.stringify({ bucket: config.bucket, region: config.region, ssl: config.useSSL }),
        errorCount: 0,
        lastError: null,
      },
    }).catch(() => {});

    return { success: true, latencyMs, version: 'S3 Compatible' };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    connected = false;
    connectionError = error;

    // Set up local fallback
    await mkdir(LOCAL_STORAGE_DIR, { recursive: true });

    await db.infraService.upsert({
      where: { type: 'minio' },
      create: { name: 'MinIO', type: 'minio', status: 'fallback', lastError: error, errorCount: 1 },
      update: { status: 'fallback', lastError: error, errorCount: { increment: 1 } },
    }).catch(() => {});

    return { success: false, error, latencyMs: Date.now() - startTime };
  }
}

export async function disconnectMinio(): Promise<void> {
  minioClient = null;
  connected = false;
  connectionError = null;
}

export function isMinioConnected(): boolean {
  return connected;
}

export function getMinioError(): string | null {
  return connectionError;
}

export function getMinioStatus(): 'connected' | 'fallback' | 'disconnected' {
  if (connected) return 'connected';
  if (connectionError) return 'fallback';
  return 'disconnected';
}

// ─── Object Operations ────────────────────────────────────────────────────────

/** Copy a view of a Buffer as an exactly-sized ArrayBuffer. */
function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

export async function putObject(key: string, data: ArrayBuffer, contentType: string, metadata?: Record<string, string>): Promise<{ success: boolean; key: string; size: number; storageType: string }> {
  const safeKey = sanitizeObjectKey(key);

  if (connected && minioClient && config) {
    try {
      await minioClient.putObject(config.bucket, safeKey, Buffer.from(data), contentType, metadata);
      return { success: true, key: safeKey, size: data.byteLength, storageType: 'minio' };
    } catch (err) {
      console.error('[MinIO] putObject failed:', err, '- falling back to local');
    }
  }

  // Fallback to local filesystem
  const localPath = path.join(LOCAL_STORAGE_DIR, safeKey);
  await mkdir(path.dirname(localPath), { recursive: true });
  await writeFile(localPath, Buffer.from(data));

  return { success: true, key: safeKey, size: data.byteLength, storageType: 'local' };
}

export async function getObject(key: string): Promise<{ data: ArrayBuffer; contentType?: string; storageType: string } | null> {
  const safeKey = sanitizeObjectKey(key);

  if (connected && minioClient && config) {
    try {
      const buffer = await minioClient.getObjectBuffer(config.bucket, safeKey);
      return { data: toArrayBuffer(buffer), storageType: 'minio' };
    } catch (err) {
      // Object not found or other error — fall through to local
      console.debug('[MinIO] getObject failed for', safeKey, '- trying local fallback');
    }
  }

  // Fallback to local filesystem
  const localPath = path.join(LOCAL_STORAGE_DIR, safeKey);
  try {
    const data = await readFile(localPath);
    return { data: toArrayBuffer(data), storageType: 'local' };
  } catch {
    return null;
  }
}

export async function deleteObject(key: string): Promise<{ success: boolean; storageType: string }> {
  const safeKey = sanitizeObjectKey(key);

  if (connected && minioClient && config) {
    try {
      await minioClient.removeObject(config.bucket, safeKey);
      return { success: true, storageType: 'minio' };
    } catch (err) {
      console.error('[MinIO] deleteObject failed:', err);
    }
  }

  // Fallback: delete local
  const localPath = path.join(LOCAL_STORAGE_DIR, safeKey);
  try {
    await unlink(localPath);
    return { success: true, storageType: 'local' };
  } catch {
    return { success: false, storageType: 'none' };
  }
}

export async function listObjects(prefix?: string, maxKeys: number = 100): Promise<{ key: string; size: number; lastModified: string; storageType: string }[]> {
  if (connected && minioClient && config) {
    try {
      const objects = await minioClient.listObjects(config.bucket, {
        prefix: prefix || undefined,
        maxKeys,
      });
      return objects.map((object) => ({
        key: object.key,
        size: object.size,
        lastModified: object.lastModified,
        storageType: 'minio',
      }));
    } catch (err) {
      console.error('[MinIO] listObjects failed:', err, '- falling back to local');
    }
  }

  // Fallback: list local files
  return listLocalFiles(prefix, maxKeys);
}

async function listLocalFiles(prefix?: string, maxKeys?: number): Promise<{ key: string; size: number; lastModified: string; storageType: string }[]> {
  const files: { key: string; size: number; lastModified: string; storageType: string }[] = [];

  async function walk(dir: string, baseKey: string): Promise<void> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullKey = baseKey ? `${baseKey}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          if (!prefix || fullKey.startsWith(prefix)) {
            await walk(path.join(dir, entry.name), fullKey);
          }
        } else if (!prefix || fullKey.startsWith(prefix)) {
          try {
            const s = await stat(path.join(dir, entry.name));
            files.push({
              key: fullKey,
              size: s.size,
              lastModified: s.mtime.toISOString(),
              storageType: 'local',
            });
          } catch { /* skip */ }
        }
      }
    } catch { /* directory doesn't exist */ }
  }

  await walk(LOCAL_STORAGE_DIR, '');
  return maxKeys ? files.slice(0, maxKeys) : files;
}

export async function getPresignedUrl(key: string, expiresInSeconds: number = 3600): Promise<{ url: string; storageType: string }> {
  if (connected && minioClient && config) {
    try {
      const url = await minioClient.presignedGetObject(config.bucket, sanitizeObjectKey(key), expiresInSeconds);
      return { url, storageType: 'minio' };
    } catch {
      // Fall through to proxy URL
    }
  }

  // Fallback: use the API route as proxy
  return { url: `/api/infra/minio/objects?key=${encodeURIComponent(key)}`, storageType: 'local' };
}

export async function getObjectSize(key: string): Promise<number> {
  const safeKey = sanitizeObjectKey(key);

  if (connected && minioClient && config) {
    try {
      const object = await minioClient.statObject(config.bucket, safeKey);
      return object.size;
    } catch {
      // Fall through to local
    }
  }

  try {
    const s = await stat(path.join(LOCAL_STORAGE_DIR, safeKey));
    return s.size;
  } catch {
    return 0;
  }
}

// ─── Stats & Health ──────────────────────────────────────────────────────────

export async function getMinioStats(): Promise<{
  connected: boolean;
  status: string;
  bucket?: string;
  objectCount?: number;
  totalSizeBytes?: number;
  storageType: string;
}> {
  if (connected && config) {
    try {
      const objects = await listObjects('', 1000);
      const totalSizeBytes = objects.reduce((sum, o) => sum + o.size, 0);
      return {
        connected: true,
        status: 'connected',
        bucket: config.bucket,
        objectCount: objects.length,
        totalSizeBytes,
        storageType: 'minio',
      };
    } catch {
      return { connected: true, status: 'degraded', storageType: 'minio' };
    }
  }

  try {
    const objects = await listLocalFiles('', 1000);
    return {
      connected: false,
      status: 'fallback',
      bucket: config?.bucket || 'local-storage',
      objectCount: objects.length,
      totalSizeBytes: objects.reduce((sum, o) => sum + o.size, 0),
      storageType: 'local',
    };
  } catch {
    return { connected: false, status: 'disconnected', storageType: 'none' };
  }
}

export async function pingMinio(): Promise<{ success: boolean; latencyMs: number; error?: string; storageType?: string }> {
  if (!connected || !minioClient || !config) {
    return { success: false, latencyMs: 0, error: 'Not connected', storageType: 'none' };
  }

  const startTime = Date.now();
  try {
    // List buckets as a lightweight ping
    await minioClient.listBuckets();
    const latencyMs = Date.now() - startTime;

    await db.infraService.update({
      where: { type: 'minio' },
      data: { lastPingAt: new Date(), latencyMs, status: 'connected' },
    }).catch(() => {});

    return { success: true, latencyMs, storageType: 'minio' };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    const latencyMs = Date.now() - startTime;
    await db.infraService.update({
      where: { type: 'minio' },
      data: { status: 'error', lastError: error, errorCount: { increment: 1 } },
    }).catch(() => {});
    return { success: false, latencyMs, error };
  }
}

function getDefaultConfig(): MinioConfig | null {
  if (process.env.MINIO_URL) {
    try {
      const url = new URL(process.env.MINIO_URL);
      return {
        endPoint: url.hostname || 'localhost',
        port: parseInt(url.port || '9000', 10),
        accessKey: decodeURIComponent(url.username || ''),
        secretKey: decodeURIComponent(url.password || ''),
        useSSL: url.protocol === 'https:',
        region: process.env.MINIO_REGION || 'us-east-1',
        bucket: process.env.MINIO_BUCKET || 'agent-hub',
      };
    } catch {
      return null;
    }
  }

  if (process.env.MINIO_HOST) {
    return {
      endPoint: process.env.MINIO_HOST,
      port: parseInt(process.env.MINIO_PORT || '9000', 10),
      accessKey: process.env.MINIO_ACCESS_KEY || '',
      secretKey: process.env.MINIO_SECRET_KEY || '',
      useSSL: process.env.MINIO_SSL === 'true',
      region: process.env.MINIO_REGION || 'us-east-1',
      bucket: process.env.MINIO_BUCKET || 'agent-hub',
    };
  }

  return null;
}

export function getMinioConfig(): MinioConfig | null {
  return config || getDefaultConfig();
}
