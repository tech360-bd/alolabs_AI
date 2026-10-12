import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const { id } = await params
    const deal = await db.crmDeal.findUnique({
      where: { id },
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
    console.error('[CRM Deal GET by ID]', error)
    return NextResponse.json({ error: 'Failed to fetch deal' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const { id } = await params
    const body = await request.json()
    const { title, value, currency, probability, expectedClose, actualClose, lostReason, stageId, status, assignedTo, metadata } = body

    const deal = await db.crmDeal.findUnique({ where: { id } })
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
    console.error('[CRM Deal PUT]', error)
    return NextResponse.json({ error: 'Failed to update deal' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const { id } = await params
    await db.crmDeal.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[CRM Deal DELETE]', error)
    return NextResponse.json({ error: 'Failed to delete deal' }, { status: 500 })
  }
}