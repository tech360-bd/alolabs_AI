import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/api-auth';
import { db } from '@/lib/db';

function safeConfig(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

const UpdateSchema = z.object({
  agentId: z.string().min(1),
  evolutionPath: z.string().trim().min(1).max(100),
}).strict();

export async function GET(req: NextRequest) {
  try {
    await requireRole('super_admin');
    const params = req.nextUrl.searchParams;
    const pageValue = Number(params.get('page') ?? 1);
    const limitValue = Number(params.get('limit') ?? 20);
    const page = Number.isSafeInteger(pageValue) && pageValue > 0 ? Math.min(pageValue, 10_000) : 1;
    const limit = Number.isSafeInteger(limitValue) && limitValue > 0 ? Math.min(limitValue, 100) : 20;
    const agentId = params.get('agentId');
    const where = agentId ? { id: agentId } : {};
    const [agents, total] = await Promise.all([
      db.agent.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        select: { id: true, agentId: true, name: true, departmentName: true, role: true, type: true, selfImprovement: true, createdAt: true },
      }),
      db.agent.count({ where }),
    ]);
    const data = await Promise.all(agents.map(async (agent) => {
      const [verifiedKnowledge, pendingCandidates, totalSessions] = await Promise.all([
        db.agentMemory.count({ where: { agentId: agent.id, isVerified: true } }),
        db.agentMemory.count({ where: { agentId: agent.id, isVerified: false } }),
        db.agentLearningSession.count({ where: { agentId: agent.id } }),
      ]);
      const config = safeConfig(agent.selfImprovement);
      return {
        id: agent.id,
        agentId: agent.agentId,
        agentName: agent.name,
        department: agent.departmentName,
        role: agent.role,
        type: agent.type,
        level: null,
        levelName: 'Untracked',
        verifiedKnowledge,
        pendingCandidates,
        totalSessions,
        avgConfidence: null,
        maturityScore: null,
        knowledgeDensity: null,
        protectiveScore: null,
        modelReadiness: null,
        evolutionPath: typeof config.evolutionPath === 'string' ? config.evolutionPath : null,
        lastEvolvedAt: null,
        nextEvolutionAt: null,
        createdAt: agent.createdAt,
      };
    }));
    return NextResponse.json({
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      metricsStatus: { maturity: 'not_measured', modelReadiness: 'not_measured', confidence: 'not_measured' },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof Error && error.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireRole('super_admin');
    const parsed = UpdateSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const agent = await db.agent.findUnique({ where: { id: parsed.data.agentId }, select: { id: true, selfImprovement: true } });
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    const config = { ...safeConfig(agent.selfImprovement), evolutionPath: parsed.data.evolutionPath };
    await db.$transaction(async (transaction) => {
      await transaction.agent.update({ where: { id: agent.id }, data: { selfImprovement: JSON.stringify(config) } });
      await transaction.auditEvent.create({
        data: {
          actorUserId: user.userId,
          action: 'agent_evolution_path.update',
          resource: 'agent',
          resourceId: agent.id,
          details: JSON.stringify({ evolutionPath: parsed.data.evolutionPath }),
        },
      });
    });
    return NextResponse.json({ data: { agentId: parsed.data.agentId, evolutionPath: config.evolutionPath } });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof Error && error.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
