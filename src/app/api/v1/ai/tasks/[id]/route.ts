import { v1Handler, V1Error } from '@/lib/v1';
import { db } from '@/lib/db';
import { publicTaskResponse } from '@/lib/api/public-response';
import { randomUUID } from 'node:crypto';

/**
 * GET /api/v1/ai/tasks/:taskId — get one task (ownership-verified).
 *
 * Returns a sanitized public DTO. Never reveals which agent/model executed
 * the task — only the service, status, and a redacted result summary.
 */

export const GET = v1Handler(async ({ identity }, request) => {
  const taskId = request.nextUrl.pathname.split('/').pop()!;
  const task = await db.task.findFirst({
    where: { id: taskId, companyId: identity.companyId },
    select: {
      id: true,
      status: true,
      title: true,
      description: true,
      createdAt: true,
      completedAt: true,
    },
  });
  if (!task) throw new V1Error('Task not found', 404, 'NOT_FOUND');

  // The description carries the service + a redacted input summary.
  // We do NOT expose the raw description (it may contain input details);
  // instead we extract just the service tag.
  const serviceMatch = task.title.match(/^\[([^\]]+)\]/);
  const service = serviceMatch ? serviceMatch[1] : 'ai-tasks';

  return publicTaskResponse({
    requestId: randomUUID(),
    taskId: task.id,
    service,
    status: mapStatus(task.status),
    result: {
      summary: task.status === 'completed' ? 'Task completed.' : task.status === 'failed' ? 'Task failed.' : undefined,
    },
    usageUnits: 1,
    createdAt: task.createdAt.toISOString(),
    completedAt: task.completedAt?.toISOString(),
  });
});

function mapStatus(internal: string): 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' {
  switch (internal) {
    case 'pending': return 'pending';
    case 'running': case 'in_progress': return 'running';
    case 'completed': case 'succeeded': return 'completed';
    case 'failed': case 'error': return 'failed';
    case 'cancelled': case 'canceled': return 'cancelled';
    default: return 'pending';
  }
}
