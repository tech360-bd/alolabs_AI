import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const url = request.nextUrl
    const type = url.searchParams.get('type') || ''
    const contactId = url.searchParams.get('contactId') || ''
    const dealId = url.searchParams.get('dealId') || ''
    const status = url.searchParams.get('status') || ''
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)))

    const where: Record<string, unknown> = {}
    if (type) where.type = type
    if (contactId) where.contactId = contactId
    if (dealId) where.dealId = dealId
    if (status) where.status = status

    const [activities, total] = await Promise.all([
      db.crmActivity.findMany({
        where,
        include: {
          contact: { select: { id: true, firstName: true, lastName: true, email: true } },
          deal: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.crmActivity.count({ where }),
    ])

    return NextResponse.json({
      data: activities,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error('[CRM Activities GET]', error)
    return NextResponse.json({ error: 'Failed to fetch activities' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const body = await request.json()
    const { contactId, dealId, type, subject, description, direction, scheduledAt, durationMin, assignedTo, status } = body

    if (!type || !subject) {
      return NextResponse.json({ error: 'type and subject are required' }, { status: 400 })
    }

    const activity = await db.crmActivity.create({
      data: {
        contactId: contactId || null,
        dealId: dealId || null,
        type,
        subject,
        description: description || null,
        direction: direction || null,
        status: status || (scheduledAt ? 'scheduled' : 'completed'),
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        completedAt: !scheduledAt ? new Date() : null,
        durationMin: durationMin || null,
        assignedTo: assignedTo || null,
      },
    })

    // Update contact's lastContactAt if activity is linked to a contact
    if (contactId) {
      await db.crmContact.update({
        where: { id: contactId },
        data: { lastContactAt: new Date() },
      })
    }

    return NextResponse.json({ data: activity }, { status: 201 })
  } catch (error) {
    console.error('[CRM Activities POST]', error)
    return NextResponse.json({ error: 'Failed to create activity' }, { status: 500 })
  }
}