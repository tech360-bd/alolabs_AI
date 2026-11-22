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

export async function getMinioStatus(): Promise<{ connected: boolean; error?: string; latencyMs?: number; version?: string }> {
  return { connected, error: connectionError, latencyMs: undefined, version: undefined };
}

export async function uploadObject(key: string, data: Buffer | string): Promise<void> {
  if (!connected || !minioClient) {
    // Fallback to local storage
    const localPath = localPathFor(key);
    await mkdir(path.dirname(localPath), { recursive: true });
    await writeFile(localPath, data);
    return;
  }

  await minioClient.putObject(config!.bucket, sanitizeObjectKey(key), data);
}

export async function downloadObject(key: string): Promise<Buffer> {
  if (!connected || !minioClient) {
    // Fallback to local storage
    const localPath = localPathFor(key);
    return await readFile(localPath);
  }

  return await minioClient.getObject(config!.bucket, sanitizeObjectKey(key));
}

export async function deleteObject(key: string): Promise<void> {
  if (!connected || !minioClient) {
    // Fallback to local storage
    const localPath = localPathFor(key);
    await unlink(localPath).catch(() => {});
    return;
  }

  await minioClient.deleteObject(config!.bucket, sanitizeObjectKey(key));
}

export async function listObjects(prefix?: string): Promise<string[]> {
  if (!connected || !minioClient) {
    // Fallback to local storage
    const dir = prefix ? path.join(LOCAL_STORAGE_DIR, prefix) : LOCAL_STORAGE_DIR;
    try {
      const files = await readdir(dir);
      return files.map(f => path.join(prefix || '', f));
    } catch {
      return [];
    }
  }

  const objects = await minioClient.listObjects(config!.bucket, prefix);
  return objects.map(obj => obj.name);
}

export async function getMinioStatus(): Promise<{ connected: boolean; error?: string; latencyMs?: number; version?: string }> {
  return { connected, error: connectionError, latencyMs: undefined, version: undefined };
}
