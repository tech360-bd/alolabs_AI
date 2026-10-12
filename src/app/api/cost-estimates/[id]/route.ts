import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const { id } = await params

    const costEstimate = await db.costEstimate.findUnique({
      where: { id },
    })

    if (!costEstimate) {
      return NextResponse.json(
        { error: 'Cost estimate not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(costEstimate)
  } catch (error) {
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
    const { action } = body

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be "approve" or "reject"' },
        { status: 400 }
      )
    }

    const existing = await db.costEstimate.findUnique({ where: { id } })
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
    console.error('[Cost Estimate Action] Error:', error)
    return NextResponse.json(
      { error: 'Failed to process cost estimate action' },
      { status: 500 }
    )
  }
}