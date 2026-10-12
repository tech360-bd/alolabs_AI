import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';

const defaults = {
  enabled: true, safetyLevel: 'standard', blockedPatterns: [], allowedDomains: [],
  maxKnowledgePerDay: 50, maxConfidence: 0.95, requireVerification: true,
  autoFilterToxic: true, learningScope: 'task_domain', dataRetentionDays: 90,
  violationCount: 0,
};
function readConfig(value: string) {
  try { return { ...defaults, ...((JSON.parse(value) as Record<string, unknown>).protectiveMode as object ?? {}) }; }
  catch { return defaults; }
}

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const agentId = new URL(req.url).searchParams.get('agentId');
    if (agentId) {
      const agent = await db.agent.findUnique({ where: { id: agentId }, select: { agentId: true, name: true, departmentName: true, selfImprovement: true } });
      if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
      return NextResponse.json({ data: { agentId, agent: { agentId: agent.agentId, name: agent.name, departmentName: agent.departmentName }, ...readConfig(agent.selfImprovement) } });
    }
    const agents = await db.agent.findMany({ where: { status: 'active' }, take: 50, select: { id: true, agentId: true, name: true, departmentName: true, selfImprovement: true } });
    const data = agents.map((agent) => ({ agentId: agent.id, agent: { agentId: agent.agentId, name: agent.name, departmentName: agent.departmentName }, ...readConfig(agent.selfImprovement) }));
    const violations = data.map((item) => Number(item.violationCount) || 0);
    return NextResponse.json({ data, stats: { total: data.length, disabledAgents: data.filter((item) => !item.enabled).length, highViolationCount: violations.filter((count) => count >= 5).length, avgViolationCount: violations.length ? violations.reduce((a, b) => a + b, 0) / violations.length : 0 } });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('Unauthorized')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireAuth();
    const body = await req.json();
    if (!body.agentId) return NextResponse.json({ error: 'agentId required' }, { status: 400 });
    const agent = await db.agent.findUnique({ where: { id: body.agentId }, select: { selfImprovement: true } });
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    let root: Record<string, unknown> = {};
    try { root = JSON.parse(agent.selfImprovement) as Record<string, unknown>; } catch { root = {}; }
    const allowed = ['enabled','safetyLevel','blockedPatterns','allowedDomains','maxKnowledgePerDay','maxConfidence','requireVerification','autoFilterToxic','learningScope','dataRetentionDays'];
    const changes = Object.fromEntries(allowed.filter((key) => body[key] !== undefined).map((key) => [key, body[key]]));
    const protectiveMode = { ...readConfig(agent.selfImprovement), ...changes };
    await db.agent.update({ where: { id: body.agentId }, data: { selfImprovement: JSON.stringify({ ...root, protectiveMode }) } });
    return NextResponse.json({ data: { agentId: body.agentId, ...protectiveMode } });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('Unauthorized')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
