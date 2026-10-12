import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const search = searchParams.get('search') || '';
    const type = searchParams.get('type') || '';
    const taskId = searchParams.get('taskId') || '';

    const where: Record<string, unknown> = {};
    if (search) {
      where.content = { contains: search };
    }
    if (type) where.type = type;
    if (taskId) where.taskId = taskId;

    const [data, total] = await Promise.all([
      db.output.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.output.count({ where }),
    ]);

    return NextResponse.json({ data, total, page, limit });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Outputs GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}