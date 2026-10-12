import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const taskId = searchParams.get('taskId') || '';

    const where: Record<string, unknown> = {};
    if (taskId) where.taskId = taskId;

    const [data, total] = await Promise.all([
      db.productivityReport.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.productivityReport.count({ where }),
    ]);

    return NextResponse.json({ data, total, page, limit });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Productivity GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const {
      taskId,
      speedScore,
      qualityScore,
      reuseScore,
      errorScore,
      finalProductivityScore,
      recommendations,
    } = body;

    const report = await db.productivityReport.create({
      data: {
        taskId: taskId || null,
        speedScore: typeof speedScore === 'number' ? speedScore : 0,
        qualityScore: typeof qualityScore === 'number' ? qualityScore : 0,
        reuseScore: typeof reuseScore === 'number' ? reuseScore : 0,
        errorScore: typeof errorScore === 'number' ? errorScore : 0,
        finalProductivityScore: typeof finalProductivityScore === 'number' ? finalProductivityScore : 0,
        recommendations: recommendations ? JSON.stringify(recommendations) : '[]',
      },
    });

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'create',
        resource: 'productivity',
        details: JSON.stringify({
          reportId: report.id,
          taskId: taskId || null,
          finalScore: report.finalProductivityScore,
        }),
      },
    });

    return NextResponse.json(report, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Productivity POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}