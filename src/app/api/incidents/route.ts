import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  parseBody,
  parseQuery,
  paginationQuery,
  buildWhereClause,
  buildOrderBy,
  paginatedResponse,
} from '@/lib/validators'
import { requireCompanyAuth } from '@/lib/api-auth'

const incidentCreateSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  status: z.enum(['open', 'investigating', 'resolved', 'closed']).default('open'),
  type: z.enum(['general', 'security', 'performance', 'data', 'infrastructure']).default('general'),
  assignedTo: z.string().optional(),
  companyId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

const incidentUpdateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  status: z.enum(['open', 'investigating', 'resolved', 'closed']).optional(),
  type: z.enum(['general', 'security', 'performance', 'data', 'infrastructure']).optional(),
  assignedTo: z.string().nullable().optional(),
  resolution: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

// GET /api/incidents
export async function GET(request: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const { searchParams } = new URL(request.url)
    const parsed = parseQuery(paginationQuery, searchParams)
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status })

    const { page, limit, sort, order, search } = parsed.data

    const filters: Record<string, unknown> = {}
    const statusFilter = searchParams.get('status')
    const severityFilter = searchParams.get('severity')
    const typeFilter = searchParams.get('type')
    if (statusFilter) filters.status = statusFilter
    if (severityFilter) filters.severity = severityFilter
    if (typeFilter) filters.type = typeFilter
    // The tenant comes from the principal; a `companyId` query value is ignored
    // so a caller cannot read another tenant's incidents.
    filters.companyId = user.companyId

    const where = buildWhereClause(['title', 'description'], search, filters)
    const orderBy = buildOrderBy(sort, order)

    const [incidents, total] = await Promise.all([
      db.incident.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.incident.count({ where }),
    ])

    // Compute stats
    const allIncidents = await db.incident.findMany({ where: { companyId: user.companyId }, select: { status: true } })
    const stats = {
      open: allIncidents.filter((i) => i.status === 'open').length,
      investigating: allIncidents.filter((i) => i.status === 'investigating').length,
      resolved: allIncidents.filter((i) => i.status === 'resolved').length,
      closed: allIncidents.filter((i) => i.status === 'closed').length,
      total: allIncidents.length,
    }

    return NextResponse.json({ ...paginatedResponse(incidents, page, limit, total), stats })
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Incidents GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/incidents
export async function POST(request: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const body = await request.json()
    const parsed = parseBody(incidentCreateSchema, body)
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status })

    const data = parsed.data
    const incident = await db.incident.create({
      data: {
        title: data.title,
        description: data.description,
        severity: data.severity,
        status: data.status,
        type: data.type,
        assignedTo: data.assignedTo,
        companyId: user.companyId,
        metadata: JSON.stringify(data.metadata || {}),
      },
    })

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'create',
        resource: 'incidents',
        details: JSON.stringify({ incidentId: incident.id, title: incident.title }),
      },
    })

    return NextResponse.json({ data: incident }, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Incidents POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/incidents — update by id in body
export async function PUT(request: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const body = await request.json()
    const parsed = parseBody(incidentUpdateSchema, body)
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status })

    const { id, resolution, metadata, ...rest } = parsed.data

    // Scoped to the principal's tenant: another tenant's incident is
    // indistinguishable from one that does not exist.
    const existing = await db.incident.findFirst({ where: { id, companyId: user.companyId } })
    if (!existing) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    if (rest.title !== undefined) data.title = rest.title
    if (rest.description !== undefined) data.description = rest.description
    if (rest.severity !== undefined) data.severity = rest.severity
    if (rest.status !== undefined) {
      data.status = rest.status
      if (rest.status === 'resolved' || rest.status === 'closed') {
        data.resolvedAt = new Date()
      }
    }
    if (rest.type !== undefined) data.type = rest.type
    if (rest.assignedTo !== undefined) data.assignedTo = rest.assignedTo
    if (resolution !== undefined) data.resolution = resolution
    if (metadata !== undefined) data.metadata = JSON.stringify(metadata)

    const incident = await db.incident.update({
      where: { id },
      data,
    })

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'update',
        resource: 'incidents',
        details: JSON.stringify({ incidentId: id, changes: Object.keys(data) }),
      },
    })

    return NextResponse.json({ data: incident })
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Incidents PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/incidents
export async function DELETE(request: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const existing = await db.incident.findFirst({ where: { id, companyId: user.companyId } })
    if (!existing) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 })
    }

    await db.incident.delete({ where: { id } })

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'delete',
        resource: 'incidents',
        details: JSON.stringify({ incidentId: id, title: existing.title }),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Incidents DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
