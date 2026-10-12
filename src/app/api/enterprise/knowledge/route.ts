import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

function buildWhere(
  search: string,
  type: string,
  department: string
): Prisma.KnowledgeNodeWhereInput {
  const conditions: Prisma.KnowledgeNodeWhereInput[] = []

  if (search) {
    conditions.push({
      OR: [
        { title: { contains: search } },
        { nodeId: { contains: search } },
        { domain: { contains: search } },
        { content: { contains: search } },
      ],
    })
  }
  if (type) {
    conditions.push({ type })
  }
  if (department) {
    conditions.push({
      department: { slug: department },
    })
  }

  return conditions.length > 0 ? { AND: conditions } : {}
}

function safeParseJSON(jsonStr: string): Record<string, unknown> {
  try {
    return JSON.parse(jsonStr)
  } catch {
    return {}
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(request.url)
    const page = Math.max(Number(searchParams.get('page') || 1), 1)
    const limit = Math.min(Number(searchParams.get('limit') || 50), 200)
    const search = searchParams.get('search') || ''
    const type = searchParams.get('type') || ''
    const department = searchParams.get('department') || ''

    const where = buildWhere(search, type, department)

    const [nodes, total] = await Promise.all([
      db.knowledgeNode.findMany({
        include: { department: true },
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.knowledgeNode.count({ where }),
    ])

    // Count outgoing edges for each node
    const nodeIds = nodes.map((n) => n.id)
    const edgeCounts = nodeIds.length > 0
      ? await db.knowledgeEdge.groupBy({
          by: ['fromNodeId'],
          where: { fromNodeId: { in: nodeIds } },
          _count: { id: true },
        })
      : []

    const edgeCountMap = new Map(edgeCounts.map((e) => [e.fromNodeId, e._count.id]))

    const mapped = nodes.map((n) => ({
      id: n.id,
      nodeId: n.nodeId,
      title: n.title,
      type: n.type,
      domain: n.domain,
      departmentName: n.department?.name ?? null,
      departmentSlug: n.department?.slug ?? null,
      confidence: n.confidence,
      version: n.version,
      source: n.source,
      metadata: safeParseJSON(n.metadata),
      connections: edgeCountMap.get(n.id) ?? 0,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
    }))

    return NextResponse.json({ nodes: mapped, total, page, limit })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Enterprise API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
