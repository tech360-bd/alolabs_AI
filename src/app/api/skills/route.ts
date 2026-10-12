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
    const category = searchParams.get('category') || '';
    const status = searchParams.get('status') || '';

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { slug: { contains: search } },
      ];
    }
    if (category) where.category = category;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      db.skill.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.skill.count({ where }),
    ]);

    return NextResponse.json({ data, total, page, limit });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Skills GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();

    const skill = await db.skill.create({
      data: {
        name: body.name,
        slug: body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        category: body.category || '',
        categorySlug: body.categorySlug || (body.category || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        title: body.title || body.name,
        status: body.status || 'private',
        riskLevel: body.riskLevel || 'low',
        requiresApproval: body.requiresApproval ?? true,
        allowedTools: body.allowedTools || '[]',
        forbiddenTools: body.forbiddenTools || '[]',
        inputs: body.inputs || '[]',
        outputs: body.outputs || '[]',
        purpose: body.purpose || '',
        safetyRules: body.safetyRules || '[]',
        approvalRules: body.approvalRules || '',
        failureHandling: body.failureHandling || '',
        content: body.content || '',
      },
    });

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'create',
        resource: 'skills',
        details: JSON.stringify({ skillId: skill.id, name: skill.name }),
      },
    });

    return NextResponse.json(skill, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Skills POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}