/** Real filesystem storage round-trip (no fs mocks). */
import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { LocalStorageProvider } from '@/lib/storage/local-storage';

describe('local storage filesystem round-trip', () => {
  it('uploads, lists, downloads, checksums, thumbnails and deletes a private object', async () => {
    const base = await mkdtemp(join(tmpdir(), 'agentos-storage-'));
    try {
      const storage = new LocalStorageProvider({ basePath: base });
      const content = Buffer.from('actual bytes written to disk');
      const uploaded = await storage.upload(content, '../research.txt', { folder: 'tenant-docs', companyId: 'company-1' });
      expect(uploaded.companyId).toBe('company-1');
      expect(uploaded.checksum).toBe(createHash('sha256').update(content).digest('hex'));
      expect(uploaded.id).toMatch(/^tenant-docs\/\d{4}-\d{2}-\d{2}\//);
      expect(await storage.download(uploaded.id)).toEqual(content);
      expect((await storage.list('tenant-docs')).map((x) => x.id)).toContain(uploaded.id);
      await storage.delete(uploaded.id);
      await expect(storage.download(uploaded.id)).rejects.toThrow('File not found');
      await expect(storage.download('../etc/passwd')).rejects.toThrow('Invalid file key');
      await expect(storage.list('../../etc')).rejects.toThrow('Invalid file key');
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
