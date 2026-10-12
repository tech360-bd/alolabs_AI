import { v1Handler, V1Error } from '@/lib/v1';
import { getRun, getRunDetail, cancelRun } from '@/lib/runs';

/**
 * /api/v1/runs/:id — run detail (GET) or cancel (DELETE).
 */

export const GET = v1Handler(async ({ identity }, request) => {
  const id = request.nextUrl.pathname.split('/').pop()!;
  const detail = await getRunDetail(id);
  if (!detail || !detail.run) throw new V1Error('Run not found', 404, 'NOT_FOUND');
  if (detail.run.companyId !== identity.companyId) {
    throw new V1Error('Forbidden', 403, 'FORBIDDEN');
  }
  return detail;
});

export const DELETE = v1Handler(async ({ identity }, request) => {
  const id = request.nextUrl.pathname.split('/').pop()!;
  const run = await getRun(id);
  if (!run) throw new V1Error('Run not found', 404, 'NOT_FOUND');
  if (run.companyId !== identity.companyId) {
    throw new V1Error('Forbidden', 403, 'FORBIDDEN');
  }
  const cancelled = await cancelRun(id);
  if (!cancelled) throw new V1Error('Run is already in a terminal state', 409, 'CONFLICT');
  return { id, status: 'cancelled' };
});
