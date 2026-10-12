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
    const search = url.searchParams.get('search') || ''
    const status = url.searchParams.get('status') || ''
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)))
    const sortBy = url.searchParams.get('sortBy') || 'createdAt'
    const sortOrder = url.searchParams.get('sortOrder') || 'desc'

    const where: Record<string, unknown> = {}
    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { email: { contains: search } },
        { company: { contains: search } },
      ]
    }
    if (status) {
      where.status = status
    }

    const orderBy: Record<string, string> = {}
    orderBy[sortBy] = sortOrder

    const [contacts, total] = await Promise.all([
      db.crmContact.findMany({
        where,
        include: {
          _count: { select: { deals: true, activities: true, notes: true } },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.crmContact.count({ where }),
    ])

    return NextResponse.json({
      data: contacts,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error('[CRM Contacts GET]', error)
    return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 })
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
    const { firstName, lastName, email, phone, company, jobTitle, source, tags, metadata, assignedTo } = body

    if (!firstName || !lastName || !email) {
      return NextResponse.json({ error: 'firstName, lastName, and email are required' }, { status: 400 })
    }

    const contact = await db.crmContact.create({
      data: {
        firstName,
        lastName,
        email,
        phone: phone || null,
        company: company || null,
        jobTitle: jobTitle || null,
        source: source || 'manual',
        status: 'lead',
        tags: tags ? JSON.stringify(tags) : '[]',
        metadata: metadata ? JSON.stringify(metadata) : '{}',
        assignedTo: assignedTo || null,
      },
    })

    return NextResponse.json({ data: contact }, { status: 201 })
  } catch (error: unknown) {
    console.error('[CRM Contacts POST]', error)
    const msg = error instanceof Error && error.message.includes('Unique') ? 'Email already exists' : 'Failed to create contact'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}