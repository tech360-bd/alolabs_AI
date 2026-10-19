import { v1Handler, v1Pagination } from '@/lib/v1';
import { db } from '@/lib/db';

/**
 * /api/v1/tools — the observable tool surface (GET).
 *
 * ToolRun is the audit trail of every external capability execution. This
 * endpoint aggregates it into a tool usage registry (calls, failures, success
 * rate) plus the most recent executions.
 */

export const GET = v1Handler(async ({ identity }, request) => {
  const { limit, offset } = v1Pagination(request);
  const toolName = request.nextUrl.searchParams.get('tool') ?? undefined;
  // ToolRun has no tenant column; derive a strict tenant boundary from its
  // required business-task parent and omit legacy or detached runs.
  const tenantTasks = await db.task.findMany({
    where: { companyId: identity.companyId },
    select: { id: true },
  });
  const where = {
    taskId: { in: tenantTasks.map((task) => task.id) },
    ...(toolName ? { toolName } : {}),
  };

  const [recentRuns, total, all] = await Promise.all([
    db.toolRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.toolRun.count({ where }),
    db.toolRun.findMany({
      where,
      select: { toolName: true, toolCategory: true, status: true },
      take: 20000,
    }),
  ]);

  const usage = new Map<string, { category: string; calls: number; failed: number }>();
  for (const run of all) {
    const entry = usage.get(run.toolName) ?? { category: run.toolCategory, calls: 0, failed: 0 };
    entry.calls += 1;
    if (run.status !== 'success') entry.failed += 1;
    usage.set(run.toolName, entry);
  }

  const tools = Array.from(usage.entries())
    .map(([name, stats]) => ({
      name,
      category: stats.category,
      calls: stats.calls,
      failed: stats.failed,
      successRate: stats.calls > 0 ? Math.round(((stats.calls - stats.failed) / stats.calls) * 100) : 0,
    }))
    .sort((a, b) => b.calls - a.calls);

  return { tools, recentRuns, total };
});
