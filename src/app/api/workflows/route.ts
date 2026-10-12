import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const workflows = await db.workflow.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { workflowSteps: true } },
      },
    });

    const data = workflows.map((w) => ({
      id: w.id,
      name: w.name,
      slug: w.slug,
      description: w.description,
      triggers: w.triggers,
      stepCount: w._count.workflowSteps,
      departmentId: w.departmentId,
      status: w.status,
      createdAt: w.createdAt.toISOString(),
      updatedAt: w.updatedAt.toISOString(),
    }));

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}