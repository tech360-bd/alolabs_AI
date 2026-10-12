import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const type = searchParams.get('type')
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    // Query conversations that involve multiple agents (collaboration sessions)
    const where: Record<string, unknown> = {}
    if (status && status !== 'all') {
      where.status = status
    }

    const conversations = await db.conversation.findMany({
      where,
      include: {
        messages: {
          take: 10,
          orderBy: { createdAt: 'asc' },
        },
        agentRuns: {
          include: {
            agent: { select: { name: true, agentId: true, departmentName: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    })

    // Transform conversations into collaboration sessions
    const sessions = conversations.map(conv => {
      const uniqueAgentNames = [...new Set(
        conv.agentRuns.map(r => r.agent?.name).filter(Boolean) as string[]
      )]
      const types = ['task', 'brainstorm', 'review', 'planning', 'problem_solving', 'creative'] as const
      const detectedType = conv.title
        ? types.find(t => conv.title!.toLowerCase().includes(t.replace('_', ''))) || 'task'
        : 'task'

      return {
        id: conv.id,
        title: conv.title || 'Untitled Collaboration',
        type: detectedType,
        status: conv.status as 'active' | 'completed' | 'failed' | 'paused',
        agentCount: uniqueAgentNames.length,
        agents: uniqueAgentNames,
        createdAt: conv.createdAt.toISOString(),
        updatedAt: conv.updatedAt.toISOString(),
        taskInput: conv.agentRuns[0]?.input || '{}',
        taskOutput: conv.agentRuns[conv.agentRuns.length - 1]?.output || '',
        metrics: {
          messages: conv.messages.length,
          duration: conv.updatedAt.getTime() - conv.createdAt.getTime(),
          quality: conv.agentRuns.length > 0
            ? Math.round(conv.agentRuns.reduce((s, r) => s + (r.confidence || 0), 0) / conv.agentRuns.length * 100)
            : 0,
        },
        messages: conv.messages.map(m => ({
          role: m.role as 'agent' | 'system' | 'user',
          content: m.content,
          timestamp: m.createdAt.toISOString(),
        })),
      }
    })

    // Get aggregate stats
    const [total, active, completed] = await Promise.all([
      db.conversation.count({ where }),
      db.conversation.count({ where: { ...where, status: 'active' } }),
      db.conversation.count({ where: { ...where, status: 'completed' } }),
    ])

    // Average agents per collaboration (from agent runs)
    const avgAgentResult = await db.agentRun.groupBy({
      by: ['conversationId'],
      _count: { id: true },
    })
    const avgAgents = avgAgentResult.length > 0
      ? Number((avgAgentResult.reduce((s, r) => s + r._count.id, 0) / avgAgentResult.length).toFixed(1))
      : 0

    let filtered = sessions
    if (type && type !== 'all') {
      filtered = filtered.filter(s => s.type === type)
    }

    return NextResponse.json({
      sessions: filtered,
      stats: { total, active, completed, avgAgentsPerSession: avgAgents },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Enterprise collaborations error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
