/**
 * GET /api/enterprise/constitution
 * POST /api/enterprise/constitution
 * Enterprise constitution rules — requires auth.
 * GET returns all active constitution rules (knowledge nodes of type 'rule').
 * POST creates a new constitution rule (requires admin role).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { z } from 'zod';

const CreateRuleSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  content: z.string().min(1, 'Content is required'),
  domain: z.string().optional(),
  departmentId: z.string().optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();

    const { searchParams } = new URL(request.url);
    const domain = searchParams.get('domain') || 'constitution';
    const page = Math.max(Number(searchParams.get('page') || 1), 1);
    const limit = Math.min(Number(searchParams.get('limit') || 50), 200);

    const where = {
      type: 'rule',
      domain,
      OR: [
        { companyId: user.companyId },
        { companyId: null, source: 'public' },
        { department: { is: { companyId: user.companyId } } },
      ],
    };

    const [rules, total] = await Promise.all([
      db.knowledgeNode.findMany({
        where,
        include: { department: true },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.knowledgeNode.count({ where }),
    ]);

    const mapped = rules.map((r) => ({
      id: r.id,
      nodeId: r.nodeId,
      title: r.title,
      content: r.content,
      domain: r.domain,
      departmentName: r.department?.name ?? null,
      departmentSlug: r.department?.slug ?? null,
      confidence: r.confidence,
      version: r.version,
      source: r.source,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    return NextResponse.json({ rules: mapped, total, page, limit });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof Error && error.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('Enterprise constitution GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();
    if (user.role !== 'super_admin' && !['owner', 'admin'].includes(user.companyRole ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = CreateRuleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400 },
      );
    }

    const { title, content, domain = 'constitution', departmentId, priority } = parsed.data;
    if (departmentId) {
      const department = await db.department.findFirst({ where: { id: departmentId, companyId: user.companyId }, select: { id: true } });
      if (!department) return NextResponse.json({ error: 'Department not found in this company' }, { status: 404 });
    }

    const nodeId = `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const rule = await db.$transaction(async (transaction) => {
      const created = await transaction.knowledgeNode.create({
        data: {
          nodeId,
          companyId: user.companyId,
          title,
          type: 'rule',
          domain,
          content,
          departmentId: departmentId || null,
          metadata: JSON.stringify({ priority: priority || 'medium' }),
          confidence: 1.0,
          source: 'manual',
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorUserId: user.userId,
          companyId: user.companyId,
          action: 'company.knowledge_rule.create',
          resource: 'knowledge-node',
          resourceId: created.id,
          details: JSON.stringify({ domain, departmentId: departmentId ?? null, priority: priority || 'medium' }),
        },
      });
      return created;
    });

    return NextResponse.json({
      rule: {
        id: rule.id,
        nodeId: rule.nodeId,
        title: rule.title,
        domain: rule.domain,
        createdAt: rule.createdAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof Error && error.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('Enterprise constitution POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
