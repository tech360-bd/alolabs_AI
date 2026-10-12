import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

function buildWhereClause(
  search: string,
  department: string,
  role: string,
  type: string,
  status: string
): Prisma.AgentWhereInput {
  const conditions: Prisma.AgentWhereInput[] = []

  if (search) {
    conditions.push({
      OR: [
        { name: { contains: search } },
        { agentId: { contains: search } },
        { departmentName: { contains: search } },
        { purpose: { contains: search } },
      ],
    })
  }
  if (department) {
    conditions.push({ departmentName: department })
  }
  if (role) {
    conditions.push({ role })
  }
  if (type) {
    conditions.push({ type })
  }
  if (status) {
    conditions.push({ status })
  }

  return conditions.length > 0 ? { AND: conditions } : {}
}

function safeParseJSON(jsonStr: string): unknown[] {
  try {
    const parsed = JSON.parse(jsonStr)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function GET(request: NextRequest) {
  try {
    await getAuthUser() // optional — works with or without Bearer token (public for dashboard)
    const { searchParams } = new URL(request.url)
    const page = Math.max(Number(searchParams.get('page') || 1), 1)
    const limit = Math.min(Number(searchParams.get('limit') || 50), 200)
    const search = searchParams.get('search') || ''
    const department = searchParams.get('department') || ''
    const role = searchParams.get('role') || ''
    const type = searchParams.get('type') || ''
    const status = searchParams.get('status') || ''

    const where = buildWhereClause(search, department, role, type, status)

    const [agents, total] = await Promise.all([
      db.agent.findMany({
        include: { department: true },
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'asc' },
      }),
      db.agent.count({ where }),
    ])

    const mapped = agents.map((a) => {
      const allowedSkills = safeParseJSON(a.allowedSkills)
      return {
        id: a.id,
        agentId: a.agentId,
        name: a.name,
        role: a.role,
        type: a.type,
        status: a.status,
        departmentName: a.departmentName,
        departmentSlug: a.department?.slug ?? null,
        purpose: a.purpose,
        capabilities: allowedSkills.length,
        lastActive: a.updatedAt.toISOString(),
        version: a.version,
        createdAt: a.createdAt.toISOString(),
      }
    })

    return NextResponse.json({ agents: mapped, total, page, limit })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Enterprise API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
