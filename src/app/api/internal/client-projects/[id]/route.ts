import { db } from '@/lib/db';
import { CLIENT_SERVICE_ROLES, InternalError, internalRoute, readJsonBody } from '@/lib/internal/auth';
import { setProjectStatus } from '@/lib/client-services/operations';
import { isProjectStatus } from '@/lib/client-services/status';
import { tenantDb } from '@/lib/portal/tenant-db';

async function loadProject(id: string) {
  const project = await db.clientProject.findUnique({ where: { id } });
  if (!project) throw new InternalError(404, 'Client project not found.');
  return project;
}

/**
 * GET /api/internal/client-projects/:id — the staff view of a client project,
 * including the internal execution records a client never sees.
 */
export const GET = internalRoute<{ id: string }>(CLIENT_SERVICE_ROLES, async (_ctx, { id }) => {
  const project = await loadProject(id);
  const tdb = tenantDb(project.companyId);
  const [milestones, messages, documents, deliverables, quotations, invoices, executions] = await Promise.all([
    tdb.clientProjectMilestone.findMany({ where: { projectId: id }, orderBy: { sortOrder: 'asc' } }),
    tdb.clientMessage.findMany({ where: { threadType: 'project', threadId: id }, orderBy: { createdAt: 'asc' } }),
    tdb.clientDocument.findMany({ where: { projectId: id }, orderBy: { createdAt: 'desc' }, select: { id: true, fileName: true, kind: true, mimeType: true, size: true, uploadedByType: true, createdAt: true } }),
    tdb.clientDeliverable.findMany({ where: { projectId: id }, orderBy: { deliveredAt: 'desc' } }),
    tdb.clientQuotation.findMany({ where: { projectId: id }, orderBy: { issuedAt: 'desc' } }),
    tdb.clientInvoice.findMany({ where: { projectId: id }, orderBy: { issuedAt: 'desc' } }),
    db.clientProjectExecution.findMany({ where: { projectId: id }, orderBy: { createdAt: 'desc' } }),
  ]);
  return { project, milestones, messages, documents, deliverables, quotations, invoices, executions };
});

/** PATCH /api/internal/client-projects/:id — status, progress, target date. */
export const PATCH = internalRoute<{ id: string }>(CLIENT_SERVICE_ROLES, async (ctx, { id }) => {
  let project = await loadProject(id);
  const body = await readJsonBody(ctx.request);
  const tdb = tenantDb(project.companyId);

  if (body.status !== undefined) {
    if (!isProjectStatus(body.status)) throw new InternalError(400, 'Invalid status.');
    project = (await setProjectStatus(project.companyId, id, body.status, 'staff')) as typeof project;
  }
  const data: Record<string, unknown> = {};
  if (body.progress !== undefined) {
    const progress = Number(body.progress);
    if (!Number.isFinite(progress) || progress < 0 || progress > 100) throw new InternalError(400, 'progress must be 0–100.');
    data.progress = Math.round(progress);
  }
  if (body.targetDate !== undefined) {
    const date = body.targetDate === null ? null : new Date(String(body.targetDate));
    if (date && Number.isNaN(date.getTime())) throw new InternalError(400, 'Invalid targetDate.');
    data.targetDate = date;
  }
  if (Object.keys(data).length) project = (await tdb.clientProject.updateOwned(id, data)) as typeof project;
  return { project };
});
