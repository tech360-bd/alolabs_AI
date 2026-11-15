import { clientRoute, conflict, denyForeignObject } from '@/lib/portal/auth';
import { documentDto } from '@/lib/portal/dto';
import { readUpload, storeClientDocument } from '@/lib/portal/documents';
import { logActivity } from '@/lib/client-services/operations';

/** GET /api/portal/projects/:id/documents — files shared on this project. */
export const GET = clientRoute<{ id: string }>(async (ctx, { id }) => {
  const project = await ctx.tdb.clientProject.findOwned(id, { select: { id: true } });
  if (!project) return denyForeignObject(ctx, 'client-project', id);
  const documents = await ctx.tdb.clientDocument.findMany({
    where: { projectId: id, kind: { not: 'deliverable' } },
    orderBy: { createdAt: 'desc' },
  });
  return { documents: documents.map(documentDto) };
});

/** POST /api/portal/projects/:id/documents — upload a requirement document (multipart `file`). */
export const POST = clientRoute<{ id: string }>(
  async (ctx, { id }) => {
    const project = await ctx.tdb.clientProject.findOwned(id);
    if (!project) return denyForeignObject(ctx, 'client-project', id);
    if (project.status === 'completed' || project.status === 'cancelled') {
      throw conflict('This project is closed. Please open a support request to send further files.');
    }
    const { file } = await readUpload(ctx.request);
    const document = await storeClientDocument({
      companyId: ctx.companyId,
      projectId: id,
      kind: 'requirement',
      file,
      uploadedByType: 'client',
      uploadedByUserId: ctx.userId,
    });
    await logActivity(ctx.companyId, {
      projectId: id,
      entityType: 'document',
      entityId: document.id,
      type: 'document.uploaded',
      summary: `Document uploaded: ${document.fileName}`,
      actorType: 'client',
    });
    return { document: documentDto(document) };
  },
  { rateLimit: 20 },
);
