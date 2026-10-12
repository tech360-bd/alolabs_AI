import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

function buildWhere(
  search: string,
  category: string,
  department: string
): Prisma.PromptTemplateWhereInput {
  const conditions: Prisma.PromptTemplateWhereInput[] = []

  if (search) {
    conditions.push({
      OR: [
        { title: { contains: search } },
        { templateId: { contains: search } },
        { description: { contains: search } },
        { systemPrompt: { contains: search } },
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
    const { searchParams } = new URL(request.url)
    const page = Math.max(Number(searchParams.get('page') || 1), 1)
    const limit = Math.min(Number(searchParams.get('limit') || 100), 500)
    const search = searchParams.get('search') || ''
    const category = searchParams.get('category') || ''
    const department = searchParams.get('department') || ''

    const where = buildWhere(search, category, department)

    const [prompts, total] = await Promise.all([
      db.promptTemplate.findMany({
        include: { department: true },
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.promptTemplate.count({ where }),
    ])

    const mapped = prompts.map((p) => {
      const variables = safeParseJSON(p.variables)
      const tags = safeParseJSON(p.tags)

      return {
        id: p.id,
        templateId: p.templateId,
        title: p.title,
        category: p.category,
        subcategory: p.subcategory,
        departmentName: p.department?.name ?? null,
        departmentSlug: p.department?.slug ?? null,
        description: p.description,
        outputFormat: p.outputFormat,
        temperature: p.temperature,
        maxTokens: p.maxTokens,
        usageCount: p.usageCount,
        rating: p.rating,
        version: p.version,
        isPublic: p.isPublic,
        isActive: p.isActive,
        variableCount: variables.length,
        tagCount: tags.length,
        tags,
        variables,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      }
    })

    return NextResponse.json({ prompts: mapped, total, page, limit })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Enterprise API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
