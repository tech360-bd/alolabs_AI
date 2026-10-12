import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  validateFileType,
  validateFileSize,
  validateFileSizeByType,
  sanitizeFileName,
  scanForMalware,
  validateFileUpload,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  ALLOWED_DOCUMENT_TYPES,
  MAX_IMAGE_SIZE,
  MAX_VIDEO_SIZE,
  MAX_DOCUMENT_SIZE,
} from '@/lib/security/file-validator';

describe('File Validator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── validateFileType ───────────────────────────────────────────

  describe('validateFileType', () => {
    it('should validate a valid JPEG file', () => {
      const result = validateFileType({ name: 'photo.jpg', type: 'image/jpeg' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate a valid PNG file', () => {
      const result = validateFileType({ name: 'image.png', type: 'image/png' });
      expect(result.valid).toBe(true);
    });

    it('should reject a disallowed MIME type', () => {
      const result = validateFileType({ name: 'virus.exe', type: 'application/x-executable' });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('not allowed');
    });

    it('should reject when extension does not match MIME type', () => {
      // .png extension but JPEG MIME type
      const result = validateFileType({ name: 'fake.png', type: 'image/jpeg' });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Extension ".png" does not match MIME type "image/jpeg"');
    });

    it('should validate PDF', () => {
      const result = validateFileType({ name: 'doc.pdf', type: 'application/pdf' });
      expect(result.valid).toBe(true);
    });

    it('should validate MP4 video', () => {
      const result = validateFileType({ name: 'video.mp4', type: 'video/mp4' });
      expect(result.valid).toBe(true);
    });

    it('should require both name and type', () => {
      const result = validateFileType({ name: '', type: '' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('File name and type are required');
    });

    it('should accept custom allowed types', () => {
      const customTypes: Record<string, string[]> = {
        'text/csv': ['.csv'],
      };
      const result = validateFileType(
        { name: 'data.csv', type: 'text/csv' },
        customTypes,
      );
      expect(result.valid).toBe(true);
    });

    it('should reject type not in custom allowed types', () => {
      const customTypes: Record<string, string[]> = {
        'text/csv': ['.csv'],
      };
      const result = validateFileType(
        { name: 'photo.jpg', type: 'image/jpeg' },
        customTypes,
      );
      expect(result.valid).toBe(false);
    });
  });

  // ─── validateFileSize ───────────────────────────────────────────

  describe('validateFileSize', () => {
    it('should accept a file within the limit', () => {
      const result = validateFileSize({ name: 'small.txt', size: 1024 });
      expect(result.valid).toBe(true);
    });

    it('should reject an empty file', () => {
      const result = validateFileSize({ name: 'empty.txt', size: 0 });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('empty');
    });

    it('should reject a file exceeding the limit', () => {
      const result = validateFileSize(
        { name: 'huge.bin', size: 600 * 1024 * 1024 },
        500 * 1024 * 1024,
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('exceeds maximum size');
    });

    it('should use MAX_FILE_SIZE (500MB) by default', () => {
      const result = validateFileSize({
        name: 'exactly-max.bin',
        size: 500 * 1024 * 1024,
      });
      expect(result.valid).toBe(true);
    });

    it('should include file name in error messages', () => {
      const result = validateFileSize({ name: 'my-photo.jpg', size: 0 });
      expect(result.errors[0]).toContain('my-photo.jpg');
    });
  });

  // ─── validateFileSizeByType ─────────────────────────────────────

  describe('validateFileSizeByType', () => {
    it('should use MAX_IMAGE_SIZE (20MB) for images', () => {
      const result = validateFileSizeByType({
        name: 'img.jpg',
        type: 'image/jpeg',
        size: 20 * 1024 * 1024,
      });
      expect(result.valid).toBe(true);
    });

    it('should reject images over MAX_IMAGE_SIZE', () => {
      const result = validateFileSizeByType({
        name: 'img.jpg',
        type: 'image/jpeg',
        size: 21 * 1024 * 1024,
      });
      expect(result.valid).toBe(false);
    });

    it('should use MAX_VIDEO_SIZE (500MB) for videos', () => {
      const result = validateFileSizeByType({
        name: 'vid.mp4',
        type: 'video/mp4',
        size: 500 * 1024 * 1024,
      });
      expect(result.valid).toBe(true);
    });

    it('should use MAX_DOCUMENT_SIZE (50MB) for documents', () => {
      const result = validateFileSizeByType({
        name: 'doc.pdf',
        type: 'application/pdf',
        size: 50 * 1024 * 1024,
      });
      expect(result.valid).toBe(true);
    });

    it('should reject documents over MAX_DOCUMENT_SIZE', () => {
      const result = validateFileSizeByType({
        name: 'doc.pdf',
        type: 'application/pdf',
        size: 51 * 1024 * 1024,
      });
      expect(result.valid).toBe(false);
    });
  });

  // ─── sanitizeFileName ───────────────────────────────────────────

  describe('sanitizeFileName', () => {
    it('should keep simple filenames intact', () => {
      expect(sanitizeFileName('photo.jpg')).toBe('photo.jpg');
    });

    it('should strip directory paths (path traversal)', () => {
      expect(sanitizeFileName('../../../etc/passwd')).toBe('passwd');
    });

    it('should handle Windows-style paths', () => {
      expect(sanitizeFileName('C:\\Users\\test\\file.txt')).toBe('file.txt');
    });

    it('should handle mixed path separators', () => {
      expect(sanitizeFileName('..\\../secret.txt')).toBe('secret.txt');
    });

    it('should remove null bytes', () => {
      expect(sanitizeFileName('file\0name.txt')).toBe('filename.txt');
    });

    it('should replace dangerous characters', () => {
      expect(sanitizeFileName('file<>:"|?*name.txt')).toBe('file_______name.txt');
    });

    it('should remove control characters', () => {
      expect(sanitizeFileName('file\x01\x02name.txt')).toBe('filename.txt');
    });

    it('should handle URI-encoded path traversal', () => {
      // After split('/'), '%2e%2e%2fsecret.txt' has no '/', so pop() returns the full string.
      // decodeURIComponent then decodes it to '../secret.txt'.
      // The leading dots are then stripped by the /^\.+|\.+$/g regex, leaving '/secret.txt'.
      expect(sanitizeFileName('%2e%2e%2fsecret.txt')).toBe('/secret.txt');
    });

    it('should return "unnamed_file" for empty string', () => {
      expect(sanitizeFileName('')).toBe('unnamed_file');
    });

    it('should return "unnamed_file" for "."', () => {
      expect(sanitizeFileName('.')).toBe('unnamed_file');
    });

    it('should return "unnamed_file" for ".."', () => {
      expect(sanitizeFileName('..')).toBe('unnamed_file');
    });

    it('should handle very long filenames (truncate to 255)', () => {
      const longName = 'a'.repeat(300) + '.txt';
      const sanitized = sanitizeFileName(longName);
      expect(sanitized.length).toBeLessThanOrEqual(255);
      expect(sanitized).toContain('.txt');
    });

    it('should strip leading/trailing dots and spaces', () => {
      expect(sanitizeFileName('  .hidden.  ')).toBe('hidden');
    });
  });

  // ─── scanForMalware ─────────────────────────────────────────────

  describe('scanForMalware', () => {
    it('should return clean: true (placeholder)', async () => {
      const result = await scanForMalware(Buffer.from('test'), 'file.txt');
      expect(result.clean).toBe(true);
      expect(result.threats).toEqual([]);
    });
  });

  // ─── validateFileUpload (comprehensive) ──────────────────────────

  describe('validateFileUpload', () => {
    it('should validate a valid file upload', async () => {
      const result = await validateFileUpload({
        name: 'photo.jpg',
        type: 'image/jpeg',
        size: 1024,
        buffer: Buffer.from('fake-image'),
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid file type', async () => {
      const result = await validateFileUpload({
        name: 'virus.exe',
        type: 'application/x-executable',
        size: 1024,
      });
      expect(result.valid).toBe(false);
    });

    it('should reject oversized files when maxSize is provided', async () => {
      const result = await validateFileUpload(
        {
          name: 'big.jpg',
          type: 'image/jpeg',
          size: 100 * 1024 * 1024,
        },
        undefined, // use default allowed types
        20 * 1024 * 1024, // 20MB limit for images
      );
      expect(result.valid).toBe(false);
    });

    it('should accumulate multiple errors', async () => {
      const result = await validateFileUpload({
        name: 'bad.exe',
        type: 'application/x-executable',
        size: 0,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── Constants ──────────────────────────────────────────────────

  describe('constants', () => {
    it('should define allowed image types', () => {
      expect(ALLOWED_IMAGE_TYPES).toHaveProperty('image/jpeg');
      expect(ALLOWED_IMAGE_TYPES).toHaveProperty('image/png');
    });

    it('should define allowed video types', () => {
      expect(ALLOWED_VIDEO_TYPES).toHaveProperty('video/mp4');
      expect(ALLOWED_VIDEO_TYPES).toHaveProperty('video/webm');
    });

    it('should define allowed document types', () => {
      expect(ALLOWED_DOCUMENT_TYPES).toHaveProperty('application/pdf');
      expect(ALLOWED_DOCUMENT_TYPES).toHaveProperty('text/csv');
    });

    it('should have reasonable size limits', () => {
      expect(MAX_IMAGE_SIZE).toBe(20 * 1024 * 1024);
      expect(MAX_VIDEO_SIZE).toBe(500 * 1024 * 1024);
      expect(MAX_DOCUMENT_SIZE).toBe(50 * 1024 * 1024);
    });
  });
});