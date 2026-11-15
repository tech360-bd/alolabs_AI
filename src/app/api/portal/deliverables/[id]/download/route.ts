import { clientRoute, denyForeignObject, notFound } from '@/lib/portal/auth';
import { fileResponse, loadOwnedDocument } from '@/lib/portal/documents';

/** GET /api/portal/deliverables/:id/download — download completed work. */
export const GET = clientRoute<{ id: string }>(async (ctx, { id }) => {
  const deliverable = await ctx.tdb.clientDeliverable.findOwned(id);
  if (!deliverable) return denyForeignObject(ctx, 'client-deliverable', id);
  if (!deliverable.documentId) throw notFound('This deliverable has no file to download.');
  // The linked document is re-checked for ownership in its own right.
  const file = await loadOwnedDocument(ctx.companyId, String(deliverable.documentId));
  if (!file) return denyForeignObject(ctx, 'client-document', String(deliverable.documentId));
  return fileResponse(file);
});
