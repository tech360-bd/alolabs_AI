import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

function buildWhere(
  search: string,
  category: string,
  department: string,
  status: string
): Prisma.EnterpriseSOPWhereInput {
  const conditions: Prisma.EnterpriseSOPWhereInput[] = []

  if (search) {
    conditions.push({
      OR: [
        { title: { contains: search } },
        { sopId: { contains: search } },
        { description: { contains: search } },
      ],
    })
  }
  if (category) {
    conditions.push({ category })
  }
  if (department) {
    conditions.push({
      department: { slug: department },
    })
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
    await requireAuth()
    const { searchParams } = new URL(request.url)
    const page = Math.max(Number(searchParams.get('page') || 1), 1)
    const limit = Math.min(Number(searchParams.get('limit') || 50), 200)
    const search = searchParams.get('search') || ''
    const category = searchParams.get('category') || ''
    const priority = searchParams.get('priority') || ''
    const status = searchParams.get('status') || ''

    const where = buildWhere(search, category, '', status)

    // Apply priority filter separately since it's a field on the model
    if (priority) {
      const existing = where.AND as Prisma.EnterpriseSOPWhereInput[] | undefined
      const priorityCondition: Prisma.EnterpriseSOPWhereInput = { priority }
      if (Array.isArray(existing)) {
        existing.push(priorityCondition)
      } else if (existing) {
        ;(where as { AND: Prisma.EnterpriseSOPWhereInput[] }).AND = [existing, priorityCondition]
      } else {
        ;(where as Record<string, unknown>).AND = [priorityCondition]
      }
    }

    const [sops, total] = await Promise.all([
      db.enterpriseSOP.findMany({
        include: { department: true },
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.enterpriseSOP.count({ where }),
    ])

    const mapped = sops.map((s) => {
      const steps = safeParseJSON(s.steps)
      const checklist = safeParseJSON(s.checklist)

      return {
        id: s.id,
        sopId: s.sopId,
        title: s.title,
        category: s.category,
        priority: s.priority,
        description: s.description,
        departmentName: s.department?.name ?? null,
        departmentSlug: s.department?.slug ?? null,
        status: s.status,
        isActive: s.isActive,
        estimatedTime: s.estimatedTime,
        version: s.version,
        stepCount: steps.length,
        checklistCount: checklist.length,
        steps,
        checklist,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      }
    })

    return NextResponse.json({ sops: mapped, total, page, limit })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Enterprise API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
