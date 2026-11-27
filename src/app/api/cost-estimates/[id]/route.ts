import { db } from '@/lib/db'
import { legacyTenant, tenantWhere, legacyAuthResponse } from '@/lib/api/legacy-session'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Session → live Company membership. Authentication alone never authorises.
    const tenant = await legacyTenant(request);
    const { id } = await params

    const costEstimate = await db.costEstimate.findFirst({
      where: tenantWhere(tenant, { id }),
    })

    if (!costEstimate) {
      return NextResponse.json(
        { error: 'Cost estimate not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(costEstimate)
  } catch (error) {
    const authFailure = legacyAuthResponse(error);
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status });
    console.error('[Cost Estimate Get] Error:', error)
    return NextResponse.json(
      { error: 'Failed to get cost estimate' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Session → live Company membership. Authentication alone never authorises.
    const tenant = await legacyTenant(request);
    const { id } = await params
    const body = await request.json()
    const { action } = body

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be "approve" or "reject"' },
        { status: 400 }
      )
    }

    const existing = await db.costEstimate.findFirst({ where: tenantWhere(tenant, { id }) })
    if (!existing) {
      return NextResponse.json(
        { error: 'Cost estimate not found' },
        { status: 404 }
      )
    }

    if (existing.status !== 'pending') {
      return NextResponse.json(
        { error: `Cost estimate is already ${existing.status}` },
        { status: 400 }
      )
    }

    const updated = await db.costEstimate.update({
      where: { id },
      data: {
        status: action === 'approve' ? 'approved' : 'rejected',
        approvedAt: action === 'approve' ? new Date() : null,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    const authFailure = legacyAuthResponse(error);
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status });
    console.error('[Cost Estimate Action] Error:', error)
    return NextResponse.json(
      { error: 'Failed to process cost estimate action' },
      { status: 500 }
    )
  }
}