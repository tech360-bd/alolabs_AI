import { db } from '@/lib/db';
import { badRequest, clientRoute, readBody, text } from '@/lib/portal/auth';
import { projectDto } from '@/lib/portal/dto';
import { ensureServiceCatalogue, logActivity, newReference } from '@/lib/client-services/operations';
import { isProjectStatus } from '@/lib/client-services/status';

/** GET /api/portal/projects — the client's own projects. */
export const GET = clientRoute(async (ctx) => {
  const status = ctx.request.nextUrl.searchParams.get('status');
  const projects = await ctx.tdb.clientProject.findMany({
    where: status && isProjectStatus(status) ? { status } : {},
    orderBy: { updatedAt: 'desc' },
    take: 200,
  });
  return { projects: projects.map(projectDto) };
});

/**
 * POST /api/portal/projects — request a service and submit requirements.
 *
 * The client chooses a service and describes what they need. Everything else —
 * status, progress, dates, pricing — is decided by ALO Labs; any such field in
 * the body is ignored.
 */
export const POST = clientRoute(async (ctx) => {
  const body = await readBody(ctx.request);
  const title = text(body, 'title', { min: 3, max: 160 });
  const requirements = text(body, 'requirements', { min: 10, max: 10_000 });
  if (body.acceptTerms !== true) throw badRequest('Please accept the service terms to continue.');

  await ensureServiceCatalogue();
  const slug = typeof body.serviceSlug === 'string' ? body.serviceSlug : '';
  const offering = slug ? await db.serviceOffering.findFirst({ where: { slug, isActive: true } }) : null;
  if (!offering) throw badRequest('Please choose one of the available services.');

  const project = await ctx.tdb.clientProject.create({
    data: {
      reference: newReference('PRJ'),
      serviceOfferingId: offering.id,
      serviceName: offering.name,
      title,
      requirements,
      status: 'requested',
      progress: 5,
      requestedByUserId: ctx.userId,
    },
  });
  await logActivity(ctx.companyId, {
    projectId: project.id,
    entityType: 'project',
    entityId: project.id,
    type: 'project.requested',
    summary: `Service requested: ${offering.name}`,
    actorType: 'client',
  });
  return { project: projectDto(project) };
});
