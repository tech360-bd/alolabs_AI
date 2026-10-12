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
    const contact = await db.crmContact.findUnique({
      where: { id },
      include: {
        deals: {
          include: { pipeline: true, stage: true },
          orderBy: { createdAt: 'desc' },
        },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        notes: {
          orderBy: { createdAt: 'desc' },
        },
        scores: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    })

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    return NextResponse.json({ data: contact })
  } catch (error) {
    console.error('[CRM Contact GET by ID]', error)
    return NextResponse.json({ error: 'Failed to fetch contact' }, { status: 500 })
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
    const { firstName, lastName, email, phone, company, jobTitle, source, status, tags, metadata, assignedTo, score, lastContactAt } = body

    const contact = await db.crmContact.findUnique({ where: { id } })
    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}
    if (firstName !== undefined) updateData.firstName = firstName
    if (lastName !== undefined) updateData.lastName = lastName
    if (email !== undefined) updateData.email = email
    if (phone !== undefined) updateData.phone = phone || null
    if (company !== undefined) updateData.company = company || null
    if (jobTitle !== undefined) updateData.jobTitle = jobTitle || null
    if (source !== undefined) updateData.source = source
    if (status !== undefined) updateData.status = status
    if (tags !== undefined) updateData.tags = JSON.stringify(tags)
    if (metadata !== undefined) updateData.metadata = JSON.stringify(metadata)
    if (assignedTo !== undefined) updateData.assignedTo = assignedTo || null
    if (score !== undefined) updateData.score = score
    if (lastContactAt !== undefined) updateData.lastContactAt = lastContactAt ? new Date(lastContactAt) : null

    const updated = await db.crmContact.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ data: updated })
  } catch (error: unknown) {
    console.error('[CRM Contact PUT]', error)
    const msg = error instanceof Error && error.message.includes('Unique') ? 'Email already exists' : 'Failed to update contact'
    return NextResponse.json({ error: msg }, { status: 500 })
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
    await db.crmContact.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[CRM Contact DELETE]', error)
    return NextResponse.json({ error: 'Failed to delete contact' }, { status: 500 })
  }
}