import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { legacyTenant, tenantWhere, legacyAuthResponse } from '@/lib/api/legacy-session'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Session → live Company membership. Authentication alone never authorises.
    const tenant = await legacyTenant(request);
    const { id } = await params
    const contact = await db.crmContact.findFirst({
      where: tenantWhere(tenant, { id }),
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
    const authFailure = legacyAuthResponse(error);
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status });
    console.error('[CRM Contact GET by ID]', error)
    return NextResponse.json({ error: 'Failed to fetch contact' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Session → live Company membership. Authentication alone never authorises.
    const tenant = await legacyTenant(request);
    const { id } = await params
    const body = await request.json()
    const { firstName, lastName, email, phone, company, jobTitle, source, status, tags, metadata, assignedTo, score, lastContactAt } = body

    const contact = await db.crmContact.findFirst({ where: tenantWhere(tenant, { id }) })
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
    const authFailure = legacyAuthResponse(error);
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status });
    console.error('[CRM Contact PUT]', error)
    const msg = error instanceof Error && error.message.includes('Unique') ? 'Email already exists' : 'Failed to update contact'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Session → live Company membership. Authentication alone never authorises.
    const tenant = await legacyTenant(request);
    const { id } = await params
    // Prove ownership BEFORE mutating. The previous version passed the tenant
    // filter into `delete`, whose where clause accepts only unique fields — so
    // the filter was meaningless and this deleted any tenant's contact by id.
    const owned = await db.crmContact.findFirst({ where: tenantWhere(tenant, { id }), select: { id: true } })
    if (!owned) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    await db.crmContact.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    const authFailure = legacyAuthResponse(error);
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status });
    console.error('[CRM Contact DELETE]', error)
    return NextResponse.json({ error: 'Failed to delete contact' }, { status: 500 })
  }
}