import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/api-auth'
import { parseBody, parseQuery, paginationQuery, buildWhereClause, buildOrderBy, paginatedResponse } from '@/lib/validators'

const qualityCreateSchema = z.object({
  agentId: z.string().optional(),
  skillId: z.string().optional(),
  workflowId: z.string().optional(),
  assessor: z.enum(['system', 'human', 'peer']).default('system'),
  level: z.enum(['draft', 'junior', 'mid', 'senior', 'expert', 'dept_lead']).default('draft'),
  score: z.number().min(0).max(100),
  criteria: z.union([z.string(), z.record(z.string(), z.unknown())]).default('{}'),
  notes: z.string().optional(),
})

const qualityUpdateSchema = z.object({
  id: z.string().min(1),
  assessor: z.enum(['system', 'human', 'peer']).optional(),
  level: z.enum(['draft', 'junior', 'mid', 'senior', 'expert', 'dept_lead']).optional(),
  score: z.number().min(0).max(100).optional(),
  criteria: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
  notes: z.string().nullable().optional(),
})

// GET /api/quality
export async function GET(request: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(request.url)
    const parsed = parseQuery(paginationQuery, searchParams)
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status })

    const { page, limit, sort, order } = parsed.data

    const filters: Record<string, unknown> = {}
    const agentId = searchParams.get('agentId')
    const skillId = searchParams.get('skillId')
    const workflowId = searchParams.get('workflowId')
    if (agentId) filters.agentId = agentId
    if (skillId) filters.skillId = skillId
    if (workflowId) filters.workflowId = workflowId

    const where = buildWhereClause([], undefined, filters)
    const orderBy = buildOrderBy(sort, order)

    const [assessments, total] = await Promise.all([
      db.qualityAssessment.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.qualityAssessment.count({ where }),
    ])

    return NextResponse.json({ ...paginatedResponse(assessments, page, limit, total) })
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Quality GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/quality
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await request.json()
    const parsed = parseBody(qualityCreateSchema, body)
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status })

    const data = parsed.data
    const assessment = await db.qualityAssessment.create({
      data: {
        agentId: data.agentId,
        skillId: data.skillId,
        workflowId: data.workflowId,
        assessor: data.assessor,
        level: data.level,
        score: data.score,
        criteria: typeof data.criteria === 'string' ? data.criteria : JSON.stringify(data.criteria),
        notes: data.notes,
      },
    })

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'create',
        resource: 'quality',
        details: JSON.stringify({ assessmentId: assessment.id, score: assessment.score }),
      },
    })

    return NextResponse.json({ data: assessment }, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Quality POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/quality
export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await req.json()
    const parsed = parseBody(qualityUpdateSchema, body)
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status })

    const { id, criteria, ...rest } = parsed.data

    const existing = await db.qualityAssessment.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    if (rest.assessor !== undefined) data.assessor = rest.assessor
    if (rest.level !== undefined) {
      data.level = rest.level
      if (['senior', 'expert', 'dept_lead'].includes(rest.level)) {
        data.promotedAt = new Date()
      }
    }
    if (rest.score !== undefined) data.score = rest.score
    if (criteria !== undefined) data.criteria = typeof criteria === 'string' ? criteria : JSON.stringify(criteria)
    if (rest.notes !== undefined) data.notes = rest.notes

    const assessment = await db.qualityAssessment.update({
      where: { id },
      data,
    })

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'update',
        resource: 'quality',
        details: JSON.stringify({ assessmentId: id, changes: Object.keys(data) }),
      },
    })

    return NextResponse.json({ data: assessment })
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Quality PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/quality
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const existing = await db.qualityAssessment.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
    }

    await db.qualityAssessment.delete({ where: { id } })

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'delete',
        resource: 'quality',
        details: JSON.stringify({ assessmentId: id }),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Quality DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}