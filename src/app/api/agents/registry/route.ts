import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)))
    const department = searchParams.get('department') || ''
    const search = searchParams.get('search') || ''

    // Build where clause
    const where: Record<string, unknown> = {}

    if (department) {
      where.OR = [
        { departmentId: department },
        { departmentName: { contains: department } },
        { department: { slug: department } },
      ]
    }

    if (search) {
      const searchClause = {
        OR: [
          { name: { contains: search } },
          { agentId: { contains: search } },
          { purpose: { contains: search } },
          { departmentName: { contains: search } },
        ],
      }
      if (where.OR) {
        where.AND = [
          { OR: (where.OR as Array<unknown>) },
          searchClause,
        ]
        delete where.OR
      } else {
        Object.assign(where, searchClause)
      }
    }

    const skip = (page - 1) * limit

    const [agents, total] = await Promise.all([
      db.agent.findMany({
        where,
        select: {
          id: true,
          agentId: true,
          name: true,
          slug: true,
          departmentId: true,
          departmentName: true,
          purpose: true,
          role: true,
          status: true,
          version: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { agentId: 'asc' },
        skip,
        take: limit,
      }),
      db.agent.count({ where }),
    ])

    return NextResponse.json({
      agents,
      total,
      page,
      limit,
    })
  } catch (error) {
    console.error('[Agents Registry] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch agent registry' },
      { status: 500 }
    )
  }
}