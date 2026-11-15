import { db } from '@/lib/db';
import { CLIENT_SERVICE_ROLES, InternalError, internalRoute, readJsonBody } from '@/lib/internal/auth';
import { isDeliverableType, publishDeliverable } from '@/lib/client-services/fulfilment';
import { readUpload } from '@/lib/portal/documents';

/**
 * POST /api/internal/client-projects/:id/deliverables — deliver work to the client.
 * Accepts multipart (`file`, `title`, `description`, `type`, `isFinal`) or JSON
 * (`title`, plus `content` or `externalUrl`). Text is checked for internal
 * detail before it is published.
 */
export const POST = internalRoute<{ id: string }>(CLIENT_SERVICE_ROLES, async (ctx, { id }) => {
  const project = await db.clientProject.findUnique({ where: { id }, select: { companyId: true } });
  if (!project) throw new InternalError(404, 'Client project not found.');

  const isMultipart = (ctx.request.headers.get('content-type') ?? '').includes('multipart/form-data');
  let fields: Record<string, unknown>;
  let file: { name: string; type: string; buffer: Buffer } | undefined;
  if (isMultipart) {
    const upload = await readUpload(ctx.request);
    file = upload.file;
    fields = Object.fromEntries([...upload.form.entries()].filter(([, v]) => typeof v === 'string'));
  } else {
    fields = await readJsonBody(ctx.request);
  }
  if (typeof fields.title !== 'string') throw new InternalError(400, 'title is required.');

  const deliverable = await publishDeliverable({
    companyId: project.companyId,
    projectId: id,
    staffUserId: ctx.userId,
    title: fields.title,
    description: typeof fields.description === 'string' ? fields.description : undefined,
    type: isDeliverableType(fields.type) ? fields.type : undefined,
    isFinal: fields.isFinal === true || fields.isFinal === 'true',
    file,
    content: typeof fields.content === 'string' ? fields.content : undefined,
    externalUrl: typeof fields.externalUrl === 'string' ? fields.externalUrl : undefined,
  });
  return { deliverable };
});
