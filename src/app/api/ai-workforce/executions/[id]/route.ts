import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireCompanyAuth } from '@/lib/api-auth'
import { approveExecution, getExecution, rejectExecution } from '@/lib/ai-workforce'
import { db } from '@/lib/db'

const ReviewSchema = z.object({
  action: z.enum(['approve', 'reject']),
  note: z.string().trim().max(2000).optional(),
})

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error'
  const status = message === 'Unauthorized' ? 401
    : message === 'Forbidden' ? 403
      : message.includes('not found') ? 404
        : message.includes('Pending') || message.includes('Approval-required') ? 409
          : 500
  return NextResponse.json({ success: false, error: message }, { status })
}

async function requireApprovalReviewer(userId: string, userRole: string, companyId: string): Promise<boolean> {
  if (userRole === 'super_admin') return true
  const membership = await db.companyUser.findUnique({
    where: { companyId_userId: { companyId, userId } },
    select: { role: true },
  })
  return userRole === 'admin' || userRole === 'owner' ||
    membership?.role === 'admin' || membership?.role === 'owner' || membership?.role === 'manager'
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompanyAuth()
    const { id } = await params
    const execution = await getExecution(id, user.companyId)
    if (!execution) return NextResponse.json({ success: false, error: 'Execution not found' }, { status: 404 })
    return NextResponse.json({ success: true, data: execution })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompanyAuth()
    const allowed = await requireApprovalReviewer(user.userId, user.role, user.companyId)
    if (!allowed) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

    const parsed = ReviewSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 400 })
    }
    const { id } = await params

    if (parsed.data.action === 'approve') {
      const result = await approveExecution(id, user.companyId, user.userId)
      return NextResponse.json({ success: result.success, data: result }, { status: result.success ? 200 : result.needsApproval ? 202 : 502 })
    }

    const result = await rejectExecution(
      id,
      user.companyId,
      user.userId,
      parsed.data.note || 'Rejected by an authorized reviewer',
    )
    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    return errorResponse(error)
  }
}
