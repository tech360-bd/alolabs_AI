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
    const pipelineId = url.searchParams.get('pipelineId') || ''
    const stageId = url.searchParams.get('stageId') || ''
    const status = url.searchParams.get('status') || ''
    const search = url.searchParams.get('search') || ''
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)))

    const where: Record<string, unknown> = {}
    if (pipelineId) where.pipelineId = pipelineId
    if (stageId) where.stageId = stageId
    if (status) where.status = status
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { contact: { firstName: { contains: search } } },
        { contact: { lastName: { contains: search } } },
        { contact: { email: { contains: search } } },
      ]
    }

    const [deals, total] = await Promise.all([
      db.crmDeal.findMany({
        where,
        include: {
          contact: { select: { id: true, firstName: true, lastName: true, email: true } },
          pipeline: { select: { id: true, name: true } },
          stage: { select: { id: true, name: true, color: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.crmDeal.count({ where }),
    ])

    return NextResponse.json({
      data: deals,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error('[CRM Deals GET]', error)
    return NextResponse.json({ error: 'Failed to fetch deals' }, { status: 500 })
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
    const { contactId, pipelineId, stageId, title, value, currency, probability, expectedClose, assignedTo } = body

    if (!contactId || !pipelineId || !stageId || !title) {
      return NextResponse.json({ error: 'contactId, pipelineId, stageId, and title are required' }, { status: 400 })
    }

    const deal = await db.crmDeal.create({
      data: {
        contactId,
        pipelineId,
        stageId,
        title,
        value: value || 0,
        currency: currency || 'USD',
        probability: probability ?? 50,
        expectedClose: expectedClose ? new Date(expectedClose) : null,
        assignedTo: assignedTo || null,
        status: 'active',
      },
    })

    return NextResponse.json({ data: deal }, { status: 201 })
  } catch (error) {
    console.error('[CRM Deals POST]', error)
    return NextResponse.json({ error: 'Failed to create deal' }, { status: 500 })
  }
}