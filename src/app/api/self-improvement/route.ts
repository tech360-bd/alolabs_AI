import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/api-auth';

const CreateReportSchema = z.object({
  taskId: z.string().min(1).max(191).optional().nullable(),
  agentId: z.string().min(1).max(191).optional().nullable(),
  whatWorked: z.array(z.string().trim().min(1).max(2000)).max(50).optional(),
  whatFailed: z.array(z.string().trim().min(1).max(2000)).max(50).optional(),
  corrections: z.array(z.string().trim().min(1).max(2000)).max(50).optional(),
  pattern: z.string().trim().max(4000).optional().nullable(),
  suggestion: z.string().trim().max(4000).optional().nullable(),
}).strict().refine((value) => Boolean(value.taskId || value.agentId), {
  message: 'taskId or agentId is required',
  path: ['taskId'],
});

export async function GET(request: NextRequest) {
  try {
    await requireRole('super_admin');
    const { searchParams } = new URL(request.url);
    const pageValue = Number(searchParams.get('page') || 1);
    const limitValue = Number(searchParams.get('limit') || 20);
    const page = Number.isSafeInteger(pageValue) && pageValue > 0 ? Math.min(pageValue, 10_000) : 1;
    const limit = Number.isSafeInteger(limitValue) && limitValue > 0 ? Math.min(limitValue, 100) : 20;
    const agentId = searchParams.get('agentId');
    const taskId = searchParams.get('taskId');
    const where = {
      ...(agentId ? { agentId } : {}),
      ...(taskId ? { taskId } : {}),
    };
    const [data, total] = await Promise.all([
      db.learningReport.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' } }),
      db.learningReport.count({ where }),
    ]);
    return NextResponse.json({ data, total, page, limit, visibility: 'super_admin_global' });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof Error && error.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('[Self-Improvement] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole('super_admin');
    const parsed = CreateReportSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const { taskId, agentId, whatWorked, whatFailed, corrections, pattern, suggestion } = parsed.data;
    const [task, agent] = await Promise.all([
      taskId ? db.task.findUnique({ where: { id: taskId }, select: { id: true } }) : Promise.resolve(null),
      agentId ? db.agent.findUnique({ where: { id: agentId }, select: { id: true } }) : Promise.resolve(null),
    ]);
    if (taskId && !task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    if (agentId && !agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

    const report = await db.$transaction(async (transaction) => {
      const created = await transaction.learningReport.create({
        data: {
          taskId: taskId || null,
          agentId: agentId || null,
          whatWorked: JSON.stringify(whatWorked ?? []),
          whatFailed: JSON.stringify(whatFailed ?? []),
          corrections: JSON.stringify(corrections ?? []),
          pattern: pattern || null,
          suggestion: suggestion || null,
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorUserId: user.userId,
          action: 'self_improvement.report.create',
          resource: 'learning-report',
          resourceId: created.id,
          details: JSON.stringify({ taskId: taskId ?? null, agentId: agentId ?? null, status: 'candidate_only' }),
        },
      });
      return created;
    });
    return NextResponse.json({ data: report, status: 'candidate_only', runtimeEffect: 'none' }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof Error && error.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('[Self-Improvement] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
