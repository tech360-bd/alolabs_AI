import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/api-auth'
import { parseBody } from '@/lib/validators'

const incidentIdUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  status: z.enum(['open', 'investigating', 'resolved', 'closed']).optional(),
  type: z.enum(['general', 'security', 'performance', 'data', 'infrastructure']).optional(),
  assignedTo: z.string().nullable().optional(),
  resolution: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

// GET /api/incidents/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth()
    const { id } = await params

    const incident = await db.incident.findUnique({ where: { id } })
    if (!incident) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 })
    }

    return NextResponse.json({ data: incident })
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Incident GET by ID error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/incidents/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const body = await request.json()
    const parsed = parseBody(incidentIdUpdateSchema, body)
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status })

    const { resolution, metadata, ...rest } = parsed.data

    const existing = await db.incident.findUnique({ where: { id } })
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
    console.error('Incidents PUT by ID error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/incidents/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const existing = await db.incident.findUnique({ where: { id } })
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
    console.error('Incidents DELETE by ID error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
