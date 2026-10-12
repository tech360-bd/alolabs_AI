import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

function buildWhere(
  search: string,
  category: string,
  status: string
): Prisma.SkillWhereInput {
  const conditions: Prisma.SkillWhereInput[] = []

  if (search) {
    conditions.push({
      OR: [
        { name: { contains: search } },
        { title: { contains: search } },
        { slug: { contains: search } },
        { description: { contains: search } },
      ],
    })
  }
  if (category) {
    conditions.push({ category })
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
    const status = searchParams.get('status') || ''

    const where = buildWhere(search, category, status)

    const [skills, total] = await Promise.all([
      db.skill.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.skill.count({ where }),
    ])

    const mapped = skills.map((s) => {
      const inputs = safeParseJSON(s.inputs)
      const outputs = safeParseJSON(s.outputs)
      const requiredPermissions = safeParseJSON(s.requiredPermissions)

      return {
        id: s.id,
        name: s.name,
        slug: s.slug,
        title: s.title,
        category: s.category,
        categorySlug: s.categorySlug,
        status: s.status,
        riskLevel: s.riskLevel,
        requiresApproval: s.requiresApproval,
        description: s.description,
        purpose: s.purpose,
        version: s.version,
        runtime: s.runtime,
        inputCount: inputs.length,
        outputCount: outputs.length,
        requiredPermissionCount: requiredPermissions.length,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      }
    })

    return NextResponse.json({ skills: mapped, total, page, limit })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Enterprise API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
