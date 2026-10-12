/**
 * MinIO / S3-Compatible File Storage Adapter
 * Uses the official `minio` npm package for proper AWS SigV4 authentication.
 * Falls back to local filesystem when MinIO/S3 is not available.
 */

import * as Minio from 'minio';
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
let minioClient: Minio.Client | null = null;

const LOCAL_STORAGE_DIR = path.join(process.cwd(), 'storage', 'minio-fallback');

export async function connectMinio(cfg?: MinioConfig): Promise<{ success: boolean; error?: string; latencyMs?: number; version?: string }> {
  const startTime = Date.now();

  try {
    config = cfg || getDefaultConfig();

    if (!config) {
      connectionError = 'MinIO: No configuration provided. Set MINIO_URL or MINIO_* env vars.';
      connected = false;
      return { success: false, error: connectionError };
    }

    // Create the Minio client with proper S3-compatible configuration
    minioClient = new Minio.Client({
      endPoint: config.endPoint,
      port: config.port,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
      useSSL: config.useSSL,
      region: config.region,
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
        await minioClient.makeBucket(config.bucket, config.region);
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

export async function putObject(key: string, data: ArrayBuffer, contentType: string, metadata?: Record<string, string>): Promise<{ success: boolean; key: string; size: number; storageType: string }> {
  if (connected && minioClient && config) {
    try {
      await minioClient.putObject(config.bucket, key, Buffer.from(data), data.byteLength, {
        'Content-Type': contentType,
        ...metadata,
      });
      return { success: true, key, size: data.byteLength, storageType: 'minio' };
    } catch (err) {
      console.error('[MinIO] putObject failed:', err, '- falling back to local');
    }
  }

  // Fallback to local filesystem
  const localPath = path.join(LOCAL_STORAGE_DIR, key);
  await mkdir(path.dirname(localPath), { recursive: true });
  await writeFile(localPath, Buffer.from(data));

  return { success: true, key, size: data.byteLength, storageType: 'local' };
}

export async function getObject(key: string): Promise<{ data: ArrayBuffer; contentType?: string; storageType: string } | null> {
  if (connected && minioClient && config) {
    try {
      const stream = await minioClient.getObject(config.bucket, key);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const result = Buffer.concat(chunks);
      return { data: result.buffer, storageType: 'minio' };
    } catch (err) {
      // Object not found or other error — fall through to local
      console.debug('[MinIO] getObject failed for', key, '- trying local fallback');
    }
  }

  // Fallback to local filesystem
  const localPath = path.join(LOCAL_STORAGE_DIR, key);
  try {
    const data = await readFile(localPath);
    return { data: data.buffer, storageType: 'local' };
  } catch {
    return null;
  }
}

export async function deleteObject(key: string): Promise<{ success: boolean; storageType: string }> {
  if (connected && minioClient && config) {
    try {
      await minioClient.removeObject(config.bucket, key);
      return { success: true, storageType: 'minio' };
    } catch (err) {
      console.error('[MinIO] deleteObject failed:', err);
    }
  }

  // Fallback: delete local
  const localPath = path.join(LOCAL_STORAGE_DIR, key);
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
      const objects: { key: string; size: number; lastModified: string; storageType: string }[] = [];
      const stream = minioClient.listObjects(config.bucket, prefix || '', true);
      let count = 0;
      for await (const obj of stream) {
        if (count >= maxKeys) break;
        objects.push({
          key: obj.name,
          size: obj.size,
          lastModified: obj.lastModified?.toISOString() || '',
          storageType: 'minio',
        });
        count++;
      }
      return objects;
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
      const url = await minioClient.presignedGetObject(config.bucket, key, expiresInSeconds);
      return { url, storageType: 'minio' };
    } catch {
      // Fall through to proxy URL
    }
  }

  // Fallback: use the API route as proxy
  return { url: `/api/infra/minio/objects?key=${encodeURIComponent(key)}`, storageType: 'local' };
}

export async function getObjectSize(key: string): Promise<number> {
  if (connected && minioClient && config) {
    try {
      const stat = await minioClient.statObject(config.bucket, key);
      return stat.size;
    } catch {
      // Fall through to local
    }
  }

  try {
    const s = await stat(path.join(LOCAL_STORAGE_DIR, key));
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
        accessKey: url.username || '',
        secretKey: url.password || '',
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
