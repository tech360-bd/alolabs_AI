import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { getAgentHealthMonitor } from '@/lib/agent-runtime/health';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    await requireAuth();

    const { agentId } = await params;

    // Fetch agent with department info
    const agentRecord = await db.agent.findUnique({
      where: { agentId },
      include: {
        department: {
          select: { name: true, description: true },
        },
      },
    });

    if (!agentRecord) {
      return NextResponse.json(
        { error: `Agent ${agentId} not found` },
        { status: 404 },
      );
    }

    // Fetch real execution data in parallel
    const [runs, memories] = await Promise.all([
      db.agentRun.findMany({
        where: { agentId: agentRecord.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          input: true,
          output: true,
          model: true,
          tokensUsed: true,
          latencyMs: true,
          confidence: true,
          contextSources: true,
          status: true,
          createdAt: true,
        },
      }),
      db.agentMemory.findMany({
        where: { agentId: agentRecord.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          category: true,
          content: true,
          temperature: true,
          createdAt: true,
        },
      }),
    ]);

    // Parse allowed skills and fetch skill details
    let skills: Array<{
      name: string;
      slug: string;
      category: string;
      purpose: string;
      status: string;
      riskLevel: string;
    }> = [];
    try {
      const skillSlugs: string[] = JSON.parse(agentRecord.allowedSkills);
      if (skillSlugs.length > 0) {
        skills = await db.skill.findMany({
          where: {
            slug: { in: skillSlugs },
            status: { in: ['private', 'approved'] },
          },
          take: 20,
          select: {
            name: true,
            slug: true,
            category: true,
            purpose: true,
            status: true,
            riskLevel: true,
          },
        });
      }
    } catch {
      // allowedSkills is not valid JSON, skip
    }

    // Get real-time health from the in-memory health monitor
    const health = getAgentHealthMonitor().getHealth(agentId);

    // Compute real statistics from AgentRun data
    const totalRuns = runs.length;
    const completedRuns = runs.filter((r) => r.status === 'completed');
    const successRate = totalRuns > 0 ? completedRuns.length / totalRuns : 0;

    const latencies = runs.filter((r) => r.latencyMs != null).map((r) => r.latencyMs as number);
    const avgLatency = latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0;

    const confidences = runs.filter((r) => r.confidence != null).map((r) => r.confidence as number);
    const avgConfidence = confidences.length > 0
      ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 1000) / 1000
      : 0;

    const tokensList = runs.map((r) => r.tokensUsed).filter((t) => t > 0);
    const avgTokens = tokensList.length > 0
      ? Math.round(tokensList.reduce((a, b) => a + b, 0) / tokensList.length)
      : 0;
    const totalTokens = tokensList.reduce((a, b) => a + b, 0);

    // Model usage distribution
    const modelUsage: Record<string, number> = {};
    for (const run of runs) {
      if (run.model) {
        modelUsage[run.model] = (modelUsage[run.model] || 0) + 1;
      }
    }

    // RAG usage rate (runs where contextSources includes 'rag')
    const ragRuns = runs.filter((r) => r.contextSources?.includes('rag')).length;
    const ragUsageRate = totalRuns > 0
      ? Math.round((ragRuns / totalRuns) * 1000) / 1000
      : 0;

    const lastRunAt = runs.length > 0 ? runs[0].createdAt.toISOString() : null;

    return NextResponse.json({
      success: true,
      agent: {
        agentId: agentRecord.agentId,
        name: agentRecord.name,
        role: agentRecord.role,
        type: agentRecord.type,
        departmentName: agentRecord.departmentName,
        purpose: agentRecord.purpose,
        status: agentRecord.status,
      },
      department: {
        name: agentRecord.department?.name ?? agentRecord.departmentName,
        description: agentRecord.department?.description ?? null,
      },
      stats: {
        totalRuns,
        successRate: Math.round(successRate * 1000) / 1000,
        avgLatency,
        avgConfidence,
        avgTokens,
        totalTokens,
        ragUsageRate,
        modelUsage,
        lastRunAt,
      },
      health,
      skills,
      recentRuns: runs.slice(0, 10).map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      })),
      memory: memories.map((m) => ({
        ...m,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('[/api/enterprise/agents/[agentId]/detail]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
