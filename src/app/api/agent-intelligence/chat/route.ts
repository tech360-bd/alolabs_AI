import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    const { agentId, message } = await req.json();
    if (!agentId || !message) {
      return NextResponse.json({ error: 'agentId and message required' }, { status: 400 });
    }

    const agent = await db.agent.findUnique({
      where: { id: agentId },
      include: {
        memory: { orderBy: { updatedAt: 'desc' }, take: 30 },
        department: true,
      },
    });
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

    const knowledgeContext = agent.memory
      .map((entry) => `[${entry.category}] ${entry.content}`)
      .join('\n');
    const totalUses = agent.memory.reduce((sum, entry) => sum + entry.useCount, 0);
    const avgConfidence = totalUses > 0
      ? agent.memory.reduce((sum, entry) => sum + entry.successCount, 0) / totalUses
      : 0;

    const systemPrompt = `You are ${agent.name}, a ${agent.role} AI agent in the ${agent.department.name} department.

Your purpose: ${agent.purpose}
Your capabilities: ${agent.allowedSkills}

Your accumulated knowledge (${agent.memory.length} entries, ${avgConfidence > 0 ? `${(avgConfidence * 100).toFixed(0)}% confidence` : 'no confidence history yet'}):
${knowledgeContext}

Based on your knowledge and expertise, provide a thorough, professional response. If you do not have specific knowledge, say so honestly and suggest what you would need to learn.`;

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        agentId: agent.agentId,
        name: agent.name,
        department: agent.department.name,
        type: agent.type,
        role: agent.role,
        evolution: { level: 1, levelName: 'Novice', maturityScore: 0, modelReadiness: 0 },
        knowledgeCount: agent.memory.length,
        avgConfidence,
      },
      systemPrompt,
      knowledgeEntries: agent.memory.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
