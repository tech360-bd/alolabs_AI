import { v1Handler, V1Error } from '@/lib/v1';
import { getProjectDetail } from '@/lib/projects';

/**
 * /api/v1/projects/:id — project detail (runs, artifacts, totals).
 */

export const GET = v1Handler(async ({ identity }, request) => {
  const id = decodeURIComponent(request.nextUrl.pathname.split('/').pop()!);
  const detail = await getProjectDetail(id);
  if (!detail || !detail.project) throw new V1Error('Project not found', 404, 'NOT_FOUND');
  if (detail.project.companyId !== identity.companyId) {
    throw new V1Error('Forbidden', 403, 'FORBIDDEN');
  }
  return detail;
});
