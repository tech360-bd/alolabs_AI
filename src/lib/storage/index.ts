/**
 * ALO Labs AgentOS — Storage factory
 *
 * Provider-agnostic file storage (section 50 + section 63 no-lock-in):
 * local disk by default; S3-compatible providers can be plugged in via
 * STORAGE_PROVIDER. If a provider is not configured, callers must surface
 * "Configuration required" rather than pretending.
 */

import { LocalStorageProvider, type UploadedFile, type UploadOptions, type StorageStats } from './local-storage';

export { LocalStorageProvider, sanitizeFilename, MAX_FILE_SIZE } from './local-storage';
export type { UploadedFile, UploadOptions, StorageStats } from './local-storage';

export interface StorageProvider {
  upload(buffer: Buffer, filename: string, options?: UploadOptions): Promise<UploadedFile>;
  getMetadata(key: string): Promise<UploadedFile | null>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  list(folder?: string): Promise<UploadedFile[]>;
  getStats(): Promise<StorageStats>;
  getPublicUrl(fileId: string): string;
  getSignedUrl(fileId: string, expiresInSeconds?: number): string;
  verifySignedUrl(fileId: string, expires: number, sig: string): boolean;
  generateThumbnail(key: string, width?: number, height?: number): Promise<string>;
}

let instance: StorageProvider | null = null;

/** Get the configured storage provider (singleton). */
export function getStorage(): StorageProvider {
  if (instance) return instance;
  const provider = process.env.STORAGE_PROVIDER ?? 'local';
  if (provider === 'local') {
    instance = new LocalStorageProvider({
      basePath: process.env.STORAGE_LOCAL_PATH ?? '',
    });
    return instance;
  }
  // S3-compatible providers require configuration; without it the honest
  // answer is a clear error, never a fake.
  if (provider === 's3') {
    if (!process.env.S3_BUCKET || !process.env.AWS_ACCESS_KEY_ID) {
      throw new Error('Configuration required: S3 storage is selected but S3_BUCKET/AWS credentials are not configured');
    }
    throw new Error(`Configuration required: storage provider "${provider}" adapter is not installed`);
  }
  throw new Error(`Configuration required: unknown storage provider "${provider}"`);
}

export const StorageFactory = {
  createStorage(): StorageProvider {
    return getStorage();
  },
};
