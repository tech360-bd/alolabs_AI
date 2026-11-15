/**
 * Client documents — upload and ownership-checked download.
 *
 * A file is reachable only through a `ClientDocument` row, and that row is
 * only reachable through `tenantDb(companyId)`. A download therefore passes
 * three independent ownership checks before a byte is sent:
 *
 *   1. the document row is looked up with `{ id, companyId }` — another
 *      client's id simply is not found;
 *   2. the storage object's own metadata records the owning company, and must
 *      match (so a row pointing at someone else's object still fails);
 *   3. the bytes are checked against the checksum recorded at upload.
 *
 * Storage keys never leave the server. Clients address files by document id.
 */

import { createHash } from 'crypto';
import { getStorage } from '@/lib/storage';
import {
  ALLOWED_DOCUMENT_TYPES,
  ALLOWED_IMAGE_TYPES,
  sanitizeFileName,
  validateFileUpload,
} from '@/lib/security/file-validator';
import { tenantDb } from '@/lib/portal/tenant-db';

export const MAX_CLIENT_FILE_BYTES = 25 * 1024 * 1024;

/** SVG is excluded: it can carry script and is never needed for requirements. */
const { 'image/svg+xml': _svg, ...SAFE_IMAGES } = ALLOWED_IMAGE_TYPES;
const CLIENT_FILE_TYPES: Record<string, string[]> = {
  ...ALLOWED_DOCUMENT_TYPES,
  ...SAFE_IMAGES,
  'application/zip': ['.zip'],
  'application/x-zip-compressed': ['.zip'],
};

export class DocumentError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'DocumentError';
  }
}

export interface StoreDocumentInput {
  companyId: string;
  projectId?: string | null;
  ticketId?: string | null;
  kind: 'requirement' | 'deliverable' | 'attachment';
  file: { name: string; type: string; buffer: Buffer };
  uploadedByType: 'client' | 'service_team';
  uploadedByUserId: string;
}

export async function storeClientDocument(input: StoreDocumentInput) {
  const { file } = input;
  if (!file.buffer.length) throw new DocumentError(400, 'The file is empty.');
  if (file.buffer.length > MAX_CLIENT_FILE_BYTES) {
    throw new DocumentError(413, `Files must be ${MAX_CLIENT_FILE_BYTES / (1024 * 1024)} MB or smaller.`);
  }
  const fileName = sanitizeFileName(file.name).slice(0, 180) || 'file';
  const validation = await validateFileUpload(
    { name: fileName, type: file.type, size: file.buffer.length, buffer: file.buffer },
    CLIENT_FILE_TYPES,
    MAX_CLIENT_FILE_BYTES,
  );
  if (!validation.valid) {
    throw new DocumentError(400, 'This file type is not accepted. Please upload a document, spreadsheet, image or ZIP archive.');
  }

  const stored = await getStorage().upload(file.buffer, fileName, {
    folder: `client-documents/${input.companyId}`,
    companyId: input.companyId,
    uploadedBy: input.uploadedByUserId,
    mimeType: file.type,
  });

  return tenantDb(input.companyId).clientDocument.create({
    data: {
      projectId: input.projectId ?? null,
      ticketId: input.ticketId ?? null,
      kind: input.kind,
      fileName,
      mimeType: file.type || 'application/octet-stream',
      size: file.buffer.length,
      checksum: stored.checksum || createHash('sha256').update(file.buffer).digest('hex'),
      storageKey: stored.id,
      uploadedByType: input.uploadedByType,
      uploadedByUserId: input.uploadedByUserId,
    },
  });
}

/**
 * Load a document's bytes for `companyId`. Returns null whenever the caller
 * should see "not found" — missing row, another tenant's row, an object whose
 * recorded owner differs, or bytes that fail their checksum.
 */
export async function loadOwnedDocument(
  companyId: string,
  documentId: string,
): Promise<{ fileName: string; mimeType: string; buffer: Buffer } | null> {
  const doc = await tenantDb(companyId).clientDocument.findOwned(documentId);
  if (!doc) return null;

  const storage = getStorage();
  const key = String(doc.storageKey);
  const meta = await storage.getMetadata(key).catch(() => null);
  if (!meta || meta.companyId !== companyId) return null;

  let buffer: Buffer;
  try {
    buffer = await storage.download(key);
  } catch {
    return null;
  }
  const expected = String(doc.checksum || meta.checksum || '');
  if (expected && createHash('sha256').update(buffer).digest('hex') !== expected) return null;

  return { fileName: String(doc.fileName), mimeType: String(doc.mimeType), buffer };
}

/** A file response that is always a download, never rendered inline. */
export function fileResponse(file: { fileName: string; mimeType: string; buffer: Buffer }): Response {
  const ascii = file.fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return new Response(new Uint8Array(file.buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(file.buffer.length),
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}

/** Read one uploaded file out of a multipart request. */
export async function readUpload(request: Request): Promise<{ form: FormData; file: { name: string; type: string; buffer: Buffer } }> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new DocumentError(400, 'A file upload is required.');
  }
  const entry = form.get('file');
  if (!entry || typeof entry === 'string') throw new DocumentError(400, 'A file upload is required.');
  const blob = entry as File;
  if (blob.size > MAX_CLIENT_FILE_BYTES) {
    throw new DocumentError(413, `Files must be ${MAX_CLIENT_FILE_BYTES / (1024 * 1024)} MB or smaller.`);
  }
  return {
    form,
    file: { name: blob.name || 'file', type: blob.type || 'application/octet-stream', buffer: Buffer.from(await blob.arrayBuffer()) },
  };
}
