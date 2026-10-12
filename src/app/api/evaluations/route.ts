import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

// GET /api/evaluations — list quality assessments with optional filters
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
    // QualityAssessment doesn't have a status field directly, but we can filter by level as type
    if (type) where.level = type;

    const [data, total] = await Promise.all([
      db.qualityAssessment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.qualityAssessment.count({ where }),
    ]);

    // If a status filter was provided, filter in-memory by score ranges
    let filtered = data;
    if (status) {
      filtered = data.filter((item) => {
        if (status === 'pass') return item.score >= 70;
        if (status === 'fail') return item.score < 70;
        return true;
      });
    }

    return NextResponse.json({ data: filtered, total, page, limit });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/evaluations — create a new evaluation
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const { agentId, type, criteria } = body;

    if (!agentId || !type) {
      return NextResponse.json({ error: 'agentId and type are required' }, { status: 400 });
    }

    const score = Math.floor(Math.random() * 41) + 60; // 60-100

    const record = await db.qualityAssessment.create({
      data: {
        agentId,
        level: type || 'draft',
        score,
        criteria: criteria ? JSON.stringify(criteria) : '{}',
        assessor: 'system',
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