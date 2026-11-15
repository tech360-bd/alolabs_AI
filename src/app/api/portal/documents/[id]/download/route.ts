import { clientRoute, denyForeignObject } from '@/lib/portal/auth';
import { fileResponse, loadOwnedDocument } from '@/lib/portal/documents';

/**
 * GET /api/portal/documents/:id/download — download one of the caller's own
 * files. Ownership is validated against the document record AND the stored
 * object before any bytes are returned.
 */
export const GET = clientRoute<{ id: string }>(async (ctx, { id }) => {
  const file = await loadOwnedDocument(ctx.companyId, id);
  if (!file) return denyForeignObject(ctx, 'client-document', id);
  return fileResponse(file);
});
