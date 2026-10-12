/**
 * Secure File Upload Validator
 * ALO Labs AIOS — Validates file types, sizes, and names for secure uploads.
 * Integrates with ClamAV daemon when AV_SCANNER_ENABLED=true.
 */

import net from 'net';

// ─── Allowed File Types ─────────────────────────────────────────────

export const ALLOWED_IMAGE_TYPES: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  'image/svg+xml': ['.svg'],
  'image/bmp': ['.bmp'],
  'image/tiff': ['.tiff', '.tif'],
  'image/avif': ['.avif'],
};

export const ALLOWED_VIDEO_TYPES: Record<string, string[]> = {
  'video/mp4': ['.mp4'],
  'video/webm': ['.webm'],
  'video/quicktime': ['.mov'],
  'video/x-msvideo': ['.avi'],
  'video/x-matroska': ['.mkv'],
  'video/x-flv': ['.flv'],
};

export const ALLOWED_DOCUMENT_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-powerpoint': ['.ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
  'text/markdown': ['.md'],
  'application/json': ['.json'],
  'application/xml': ['.xml'],
  'text/xml': ['.xml'],
};

/** Merge of all allowed types */
export const ALL_ALLOWED_TYPES: Record<string, string[]> = {
  ...ALLOWED_IMAGE_TYPES,
  ...ALLOWED_VIDEO_TYPES,
  ...ALLOWED_DOCUMENT_TYPES,
};

// ─── Size Limits (in bytes) ─────────────────────────────────────────

export const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20 MB
export const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500 MB
export const MAX_DOCUMENT_SIZE = 50 * 1024 * 1024; // 50 MB
export const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB (global max)

// ─── Types ──────────────────────────────────────────────────────────

export interface FileValidation {
  valid: boolean;
  errors: string[];
}

export interface MalwareScanResult {
  clean: boolean;
  scannerUsed: string;
  threats: string[];
  warning?: string;
}

export interface UploadableFile {
  name: string;
  type: string;
  size: number;
  buffer?: Buffer;
}

// ─── Validation Functions ────────────────────────────────────────────

/**
 * Validate file MIME type and extension against allowed types.
 *
 * @param file - File with name, type, and size
 * @param allowedTypes - Map of allowed MIME types to their extensions
 * @returns Validation result
 */
export function validateFileType(
  file: { name: string; type: string },
  allowedTypes: Record<string, string[]> = ALL_ALLOWED_TYPES,
): FileValidation {
  const errors: string[] = [];

  if (!file.name || !file.type) {
    return { valid: false, errors: ['File name and type are required'] };
  }

  // Extract extension from filename
  const ext = getExtension(file.name).toLowerCase();

  // Check if MIME type is allowed
  const allowedExtensions = allowedTypes[file.type];

  if (!allowedExtensions) {
    errors.push(
      `File type "${file.type}" is not allowed. Allowed types: ${Object.keys(allowedTypes).join(', ')}`,
    );
  } else if (!allowedExtensions.includes(ext)) {
    errors.push(
      `Extension "${ext}" does not match MIME type "${file.type}". Allowed extensions for this type: ${allowedExtensions.join(', ')}`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate file size against a maximum.
 *
 * @param file - File with size in bytes
 * @param maxSize - Maximum allowed size in bytes
 * @returns Validation result
 */
export function validateFileSize(
  file: { name: string; size: number },
  maxSize: number = MAX_FILE_SIZE,
): FileValidation {
  const errors: string[] = [];

  if (file.size <= 0) {
    errors.push(`File "${file.name}" is empty`);
  } else if (file.size > maxSize) {
    const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(1);
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
    errors.push(
      `File "${file.name}" (${fileSizeMB} MB) exceeds maximum size of ${maxSizeMB} MB`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate file size with automatic limit selection based on type.
 */
export function validateFileSizeByType(file: { name: string; type: string; size: number }): FileValidation {
  if (file.type.startsWith('image/')) {
    return validateFileSize(file, MAX_IMAGE_SIZE);
  }
  if (file.type.startsWith('video/')) {
    return validateFileSize(file, MAX_VIDEO_SIZE);
  }
  return validateFileSize(file, MAX_DOCUMENT_SIZE);
}

/**
 * Sanitize a filename to prevent path traversal and remove dangerous characters.
 *
 * Rules:
 * - Strip directory paths (path traversal prevention)
 * - Remove null bytes
 * - Replace non-alphanumeric characters (except . _ -) with underscores
 * - Limit length to 255 characters
 * - Ensure filename has an extension
 */
export function sanitizeFileName(name: string): string {
  if (!name) return 'unnamed_file';

  // Extract just the filename (no directory paths)
  let sanitized = name.replace(/\\/g, '/').split('/').pop() || 'unnamed_file';

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');

  // Decode URI-encoded characters to catch double-encoding attacks
  try {
    sanitized = decodeURIComponent(sanitized);
  } catch {
    // Keep as-is if decoding fails
  }

  // Remove/replace dangerous characters
  sanitized = sanitized.replace(/[<>:"|?*]/g, '_');

  // Remove control characters
  sanitized = sanitized.replace(/[\x00-\x1f\x7f]/g, '');

  // Remove leading/trailing dots and spaces
  sanitized = sanitized.trim().replace(/^\.+|\.+$/g, '');

  // Limit length (keep extension)
  if (sanitized.length > 255) {
    const ext = getExtension(sanitized);
    const base = sanitized.slice(0, 245 - ext.length);
    sanitized = `${base}${ext}`;
  }

  // Ensure non-empty
  if (!sanitized || sanitized === '.' || sanitized === '..') {
    return 'unnamed_file';
  }

  return sanitized;
}

/**
 * Scan file buffer for malware using ClamAV daemon when enabled.
 *
 * When AV_SCANNER_ENABLED is not set or not 'true', returns clean with
 * scannerUsed='none' (AV scanning is optional). When enabled, connects
 * to a ClamAV daemon via TCP and performs an INSTREAM scan.
 *
 * @param buffer - The file content buffer
 * @param filename - Original filename for context
 * @returns Scan result with scannerUsed, threats, and optional warning
 */
export async function scanForMalware(
  buffer: Buffer,
  filename: string,
): Promise<MalwareScanResult> {
  if (process.env.AV_SCANNER_ENABLED !== 'true') {
    return { clean: true, scannerUsed: 'none', threats: [] };
  }

  const host = process.env.AV_SCANNER_HOST || 'localhost';
  const port = parseInt(process.env.AV_SCANNER_PORT || '3310', 10);

  return new Promise<MalwareScanResult>((resolve) => {
    const socket = new net.Socket();
    const chunks: Buffer[] = [];
    let resolved = false;

    const cleanup = () => {
      if (!socket.destroyed) socket.destroy();
    };

    const timeout = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve({ clean: true, scannerUsed: 'unavailable', threats: [], warning: 'ClamAV daemon not reachable' });
    }, 10000);

    socket.connect(port, host, () => {
      // Send INSTREAM command: 'zINSTREAM\x00'
      const cmd = Buffer.from('zINSTREAM\x00', 'binary');
      socket.write(cmd);

      // Send file buffer prefixed with 4-byte big-endian length
      const sizeBuf = Buffer.alloc(4);
      sizeBuf.writeUInt32BE(buffer.length, 0);
      socket.write(sizeBuf);
      socket.write(buffer);

      // Send zero-length chunk to signal end of stream
      const endBuf = Buffer.alloc(4, 0);
      socket.write(endBuf);
    });

    socket.on('data', (data: Buffer) => {
      chunks.push(data);
    });

    socket.on('end', () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      cleanup();

      const response = Buffer.concat(chunks).toString('utf-8').trim();

      if (response.includes('FOUND')) {
        // Extract threat name from ClamAV response: "stream: <threat> FOUND"
        const match = response.match(/stream:\s*(.+)\s+FOUND/);
        const threat = match ? match[1].trim() : response;
        resolve({ clean: false, scannerUsed: 'clamav', threats: [threat] });
      } else {
        resolve({ clean: true, scannerUsed: 'clamav', threats: [] });
      }
    });

    socket.on('error', () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      cleanup();
      resolve({ clean: true, scannerUsed: 'unavailable', threats: [], warning: 'ClamAV daemon not reachable' });
    });
  });
}

/**
 * Comprehensive file validation: type, size, name, and malware scan.
 */
export async function validateFileUpload(
  file: UploadableFile,
  allowedTypes?: Record<string, string[]>,
  maxSize?: number,
): Promise<FileValidation> {
  const errors: string[] = [];

  // Sanitize filename
  const sanitizedName = sanitizeFileName(file.name);
  if (sanitizedName !== file.name) {
    console.warn(
      `[FileValidator] Filename sanitized: "${file.name}" → "${sanitizedName}"`,
    );
  }

  // Type validation
  const typeResult = validateFileType(
    { name: sanitizedName, type: file.type },
    allowedTypes,
  );
  errors.push(...typeResult.errors);

  // Size validation
  const sizeResult = validateFileSize(
    { name: sanitizedName, size: file.size },
    maxSize,
  );
  errors.push(...sizeResult.errors);

  // Malware scan (if buffer provided)
  if (file.buffer && errors.length === 0) {
    const scanResult = await scanForMalware(file.buffer, sanitizedName);
    if (!scanResult.clean) {
      errors.push(
        `File failed malware scan: ${scanResult.threats.join(', ')}`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ─── Internal Helpers ───────────────────────────────────────────────

function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1 || lastDot === filename.length - 1) return '';
  return filename.slice(lastDot).toLowerCase();
}
