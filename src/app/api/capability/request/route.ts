import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

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
    const { type, title, description, proposedBy, id, action } = body

    // Handle approve/reject action
    if (id && action && ['approve', 'reject'].includes(action)) {
      const existing = await db.capabilityRequest.findUnique({ where: { id } })
      if (!existing) {
        return NextResponse.json({ error: 'Request not found' }, { status: 404 })
      }
      const updated = await db.capabilityRequest.update({
        where: { id },
        data: { status: action === 'approve' ? 'approved' : 'rejected' },
      })
      return NextResponse.json(updated)
    }

    // Create new request
    if (!type || !title) {
      return NextResponse.json(
        { error: 'type and title are required' },
        { status: 400 }
      )
    }

    const validTypes = ['new_agent', 'new_skill', 'new_workflow']
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `type must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      )
    }

    const capabilityRequest = await db.capabilityRequest.create({
      data: {
        type,
        title,
        description: description || null,
        proposedBy: proposedBy || null,
        status: 'pending',
      },
    })

    return NextResponse.json(
      {
        id: capabilityRequest.id,
        type: capabilityRequest.type,
        title: capabilityRequest.title,
        status: capabilityRequest.status,
        message: 'Capability request submitted successfully',
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[Capability Request] Error:', error)
    return NextResponse.json(
      { error: 'Failed to create capability request' },
      { status: 500 }
    )
  }
}