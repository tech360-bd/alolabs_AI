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
  const normalized = key.replace(/\//g, '/').replace(/^\/+/g, '');
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

/**
 * Build a config from the environment. Returns null when the endpoint or
 * credentials are absent, which `connectMinio` reports as "not configured"
 * rather than silently pretending to be connected.
 *
 * MINIO_URL may include a scheme/port (`https://minio.local:9000`); the
 * S3 client wants them split out. Plain `host:port` is also accepted.
 */
function getDefaultConfig(): MinioConfig | null {
  const configured = process.env.MINIO_URL?.trim();
  const accessKey = process.env.MINIO_ACCESS_KEY ?? process.env.S3_ACCESS_KEY;
  const secretKey = process.env.MINIO_SECRET_KEY ?? process.env.S3_SECRET_KEY;

  if (!configured || !accessKey || !secretKey) return null;

  let endPoint = configured;
  let port = 9000;
  let useSSL = false;

  try {
    const withScheme = /^[a-z]+:\/\//i.test(configured) ? configured : `http://${configured}`;
    const parsed = new URL(withScheme);
    endPoint = parsed.hostname;
    useSSL = parsed.protocol === 'https:';
    if (parsed.port) port = Number.parseInt(parsed.port, 10);
    else port = useSSL ? 443 : 80;
  } catch {
    return null;
  }

  return {
    endPoint,
    port,
    accessKey,
    secretKey,
    useSSL,
    region: process.env.MINIO_REGION?.trim() || process.env.S3_REGION?.trim() || 'us-east-1',
    bucket: process.env.MINIO_BUCKET?.trim() || process.env.S3_BUCKET?.trim() || 'alolabs',
  };
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
      update: { status: 'fallback', lastError: error, errorCount: { increment: 1 } }
    }).catch(() => {});

    return { success: false, error };
  }
}

export async function uploadObject(key: string, data: Buffer | string): Promise<void> {
  if (!connected || !minioClient) {
    // Fallback to local storage
    const localPath = localPathFor(key);
    await mkdir(path.dirname(localPath), { recursive: true });
    await writeFile(localPath, data);
    return;
  }

  const body = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  await minioClient.putObject(config!.bucket, sanitizeObjectKey(key), body);
}

export async function downloadObject(key: string): Promise<Buffer> {
  if (!connected || !minioClient) {
    // Fallback to local storage
    const localPath = localPathFor(key);
    return await readFile(localPath);
  }

  return await minioClient.getObjectBuffer(config!.bucket, sanitizeObjectKey(key));
}

export async function deleteObject(key: string): Promise<void> {
  if (!connected || !minioClient) {
    // Fallback to local storage
    const localPath = localPathFor(key);
    await unlink(localPath).catch(() => {});
    return;
  }

  await minioClient.removeObject(config!.bucket, sanitizeObjectKey(key));
}

export async function listObjects(prefix?: string, limit?: number): Promise<string[]> {
  const maxKeys = typeof limit === 'number' && limit > 0 ? Math.min(limit, 1000) : undefined;

  if (!connected || !minioClient) {
    // Fallback to local storage
    const dir = prefix ? path.join(LOCAL_STORAGE_DIR, prefix) : LOCAL_STORAGE_DIR;
    try {
      const files = await readdir(dir);
      const keys = files.map(f => path.join(prefix || '', f));
      return maxKeys ? keys.slice(0, maxKeys) : keys;
    } catch {
      return [];
    }
  }

  const objects = await minioClient.listObjects(config!.bucket, {
    ...(prefix ? { prefix } : {}),
    ...(maxKeys ? { maxKeys } : {}),
  });
  return objects.map(obj => obj.key);
}

export async function getMinioStatus(): Promise<{ connected: boolean; error?: string; latencyMs?: number; version?: string }> {
  return { connected, error: connectionError ?? undefined, latencyMs: undefined, version: undefined };
}

/** Last connection error text, or null when healthy/never attempted. */
export function getMinioError(): string | null {
  return connectionError;
}

/** True when the S3 endpoint is currently connected (not the local fallback). */
export function isMinioConnected(): boolean {
  return connected && minioClient !== null;
}

/**
 * Reachability probe used by /api/infra/ping.
 *
 * Opens a real request (listBuckets) rather than reporting the cached flag, so
 * a stale "connected" state after a network partition is surfaced as a failure.
 */
export async function pingMinio(): Promise<{ success: boolean; latencyMs: number; error?: string }> {
  const startedAt = Date.now();
  if (!minioClient) {
    return { success: false, latencyMs: 0, error: connectionError ?? 'MinIO is not connected' };
  }
  try {
    await minioClient.listBuckets();
    return { success: true, latencyMs: Date.now() - startedAt };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    connectionError = message;
    return { success: false, latencyMs: Date.now() - startedAt, error: message };
  }
}

/**
 * Upload and report where the bytes actually landed.
 *
 * `/api/infra/minio/objects` surfaces `storageType` to the operator, so the
 * local-filesystem fallback must never be reported as `minio`.
 */
export async function putObject(
  key: string,
  data: Buffer | string,
  contentType?: string,
): Promise<{ key: string; size: number; storageType: 'minio' | 'local' }> {
  const safeKey = sanitizeObjectKey(key);
  const body = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;

  if (!connected || !minioClient) {
    const localPath = localPathFor(safeKey);
    await mkdir(path.dirname(localPath), { recursive: true });
    await writeFile(localPath, body);
    return { key: safeKey, size: body.byteLength, storageType: 'local' };
  }

  await minioClient.putObject(config!.bucket, safeKey, body, contentType);
  return { key: safeKey, size: body.byteLength, storageType: 'minio' };
}
