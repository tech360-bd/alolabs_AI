import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { legacyTenant, tenantWhere, legacyAuthResponse } from '@/lib/api/legacy-session'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Session → live Company membership. Authentication alone never authorises.
    const tenant = await legacyTenant(request);
    const { id } = await params
    const deal = await db.crmDeal.findFirst({
      where: tenantWhere(tenant, { id }),
      include: {
        contact: true,
        pipeline: { include: { stages: { orderBy: { sortOrder: 'asc' } } } },
        stage: true,
        activities: { orderBy: { createdAt: 'desc' } },
      },
    })

    if (!deal) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 })
    }

    return NextResponse.json({ data: deal })
  } catch (error) {
    const authFailure = legacyAuthResponse(error);
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status });
    console.error('[CRM Deal GET by ID]', error)
    return NextResponse.json({ error: 'Failed to fetch deal' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Session → live Company membership. Authentication alone never authorises.
    const tenant = await legacyTenant(request);
    const { id } = await params
    const body = await request.json()
    const { title, value, currency, probability, expectedClose, actualClose, lostReason, stageId, status, assignedTo, metadata } = body

    const deal = await db.crmDeal.findFirst({ where: tenantWhere(tenant, { id }) })
    if (!deal) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}
    if (title !== undefined) updateData.title = title
    if (value !== undefined) updateData.value = value
    if (currency !== undefined) updateData.currency = currency
    if (probability !== undefined) updateData.probability = probability
    if (expectedClose !== undefined) updateData.expectedClose = expectedClose ? new Date(expectedClose) : null
    if (actualClose !== undefined) updateData.actualClose = actualClose ? new Date(actualClose) : null
    if (lostReason !== undefined) updateData.lostReason = lostReason || null
    if (stageId !== undefined) updateData.stageId = stageId
    if (status !== undefined) updateData.status = status
    if (assignedTo !== undefined) updateData.assignedTo = assignedTo || null
    if (metadata !== undefined) updateData.metadata = JSON.stringify(metadata)

    const updated = await db.crmDeal.update({
      where: { id },
      data: updateData,
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, email: true } },
        pipeline: { select: { id: true, name: true } },
        stage: { select: { id: true, name: true, color: true } },
      },
    })

    return NextResponse.json({ data: updated })
  } catch (error) {
    const authFailure = legacyAuthResponse(error);
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status });
    console.error('[CRM Deal PUT]', error)
    return NextResponse.json({ error: 'Failed to update deal' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Session → live Company membership. Authentication alone never authorises.
    const tenant = await legacyTenant(request);
    const { id } = await params
    // Ownership proven first; `delete` takes a unique where only.
    const owned = await db.crmDeal.findFirst({ where: tenantWhere(tenant, { id }), select: { id: true } })
    if (!owned) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })
    await db.crmDeal.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    const authFailure = legacyAuthResponse(error);
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status });
    console.error('[CRM Deal DELETE]', error)
    return NextResponse.json({ error: 'Failed to delete deal' }, { status: 500 })
  }
}