import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

// GET /api/training — list training records with optional filters
export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get('agentId');
    const status = searchParams.get('status');
    const type = searchParams.get('type');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (agentId) where.agentId = agentId;
    if (status) where.status = status;
    if (type) where.trainingType = type;

    const [data, total] = await Promise.all([
      db.agentTrainingRecord.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          agent: { select: { id: true, name: true, type: true } },
        },
      }),
      db.agentTrainingRecord.count({ where }),
    ]);

    return NextResponse.json({ data, total, page, limit });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/training — create a new training record
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const { agentId, trainingType, curriculumId } = body;

    if (!agentId || !trainingType) {
      return NextResponse.json({ error: 'agentId and trainingType are required' }, { status: 400 });
    }

    const record = await db.agentTrainingRecord.create({
      data: {
        agentId,
        trainingType,
        curriculumId: curriculumId || null,
        status: 'pending',
      },
      include: {
        agent: { select: { id: true, name: true, type: true } },
      },
    });

    return NextResponse.json({ data: record }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}