import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const agentId = searchParams.get('agentId') || '';
    const taskId = searchParams.get('taskId') || '';

    const where: Record<string, unknown> = {};
    if (agentId) where.agentId = agentId;
    if (taskId) where.taskId = taskId;

    const [data, total] = await Promise.all([
      db.learningReport.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.learningReport.count({ where }),
    ]);

    return NextResponse.json({ data, total, page, limit });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Self-Improvement GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const { taskId, agentId, whatWorked, whatFailed, corrections, pattern, suggestion } = body;

    if (!taskId && !agentId) {
      return NextResponse.json({ error: 'taskId or agentId is required' }, { status: 400 });
    }

    const report = await db.learningReport.create({
      data: {
        taskId: taskId || null,
        agentId: agentId || null,
        whatWorked: whatWorked ? JSON.stringify(whatWorked) : '[]',
        whatFailed: whatFailed ? JSON.stringify(whatFailed) : '[]',
        corrections: corrections ? JSON.stringify(corrections) : '[]',
        pattern: pattern || null,
        suggestion: suggestion || null,
      },
    });

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'create',
        resource: 'self-improvement',
        details: JSON.stringify({
          reportId: report.id,
          taskId: taskId || null,
          agentId: agentId || null,
        }),
      },
    });

    return NextResponse.json(report, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Self-Improvement POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}