import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireCompanyAuth } from '@/lib/api-auth'
import { approveExecution, rejectExecution } from '@/lib/ai-workforce'

const CreateApprovalSchema = z.object({
  executionId: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  requestType: z.string().trim().min(1).max(80),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  requestJson: z.record(z.string(), z.unknown()).default({}),
})

const ReviewSchema = z.object({
  id: z.string().min(1),
  action: z.enum(['approve', 'reject']),
  note: z.string().trim().max(2000).optional(),
})

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error'
  const status = message === 'Unauthorized' ? 401
    : message === 'Forbidden' ? 403
      : message.includes('not found') ? 404
        : message.includes('Pending') || message.includes('Approval-required') || message.includes('Only pending') ? 409
          : 500
  return NextResponse.json({ error: message, success: false }, { status })
}

async function canReview(companyId: string, userId: string, userRole: string): Promise<boolean> {
  if (userRole === 'admin' || userRole === 'super_admin' || userRole === 'owner') return true
  const membership = await db.companyUser.findUnique({
    where: { companyId_userId: { companyId, userId } },
    select: { role: true },
  })
  return membership?.role === 'admin' || membership?.role === 'owner' || membership?.role === 'manager'
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const search = req.nextUrl.searchParams
    const where: Prisma.ApprovalWhereInput = { companyId: user.companyId }
    const status = search.get('status')
    const riskLevel = search.get('riskLevel')
    if (status) where.status = status
    if (riskLevel) where.riskLevel = riskLevel
    const data = await db.approval.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 })
    return NextResponse.json({ data, success: true })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const parsed = CreateApprovalSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten(), success: false }, { status: 400 })
    }

    if (parsed.data.executionId) {
      const execution = await db.agentExecution.findFirst({
        where: { id: parsed.data.executionId, companyId: user.companyId },
        select: { id: true, approvalId: true, status: true },
      })
      if (!execution) return NextResponse.json({ error: 'Execution not found for this company', success: false }, { status: 404 })
      if (execution.approvalId || execution.status !== 'approval_required') {
        return NextResponse.json({ error: 'Execution is not awaiting a new approval', success: false }, { status: 409 })
      }
    }

    const data = await db.$transaction(async (transaction) => {
      const approval = await transaction.approval.create({
        data: {
          executionId: parsed.data.executionId,
          title: parsed.data.title,
          description: parsed.data.description,
          type: parsed.data.requestType,
          riskLevel: parsed.data.riskLevel,
          requestJson: JSON.stringify(parsed.data.requestJson),
          requestedBy: user.userId,
          companyId: user.companyId,
        },
      })
      if (parsed.data.executionId) {
        const linked = await transaction.agentExecution.updateMany({
          where: {
            id: parsed.data.executionId,
            companyId: user.companyId,
            status: 'approval_required',
            approvalId: null,
          },
          data: { approvalId: approval.id },
        })
        if (linked.count !== 1) throw new Error('Execution is no longer awaiting approval')
      }
      return approval
    })
    return NextResponse.json({ data, success: true }, { status: 201 })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    if (!await canReview(user.companyId, user.userId, user.role)) {
      return NextResponse.json({ error: 'Forbidden', success: false }, { status: 403 })
    }
    const parsed = ReviewSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten(), success: false }, { status: 400 })
    }

    const approval = await db.approval.findFirst({
      where: { id: parsed.data.id, companyId: user.companyId },
      select: { id: true, executionId: true, status: true },
    })
    if (!approval) return NextResponse.json({ error: 'Approval not found for this company', success: false }, { status: 404 })
    if (approval.status !== 'pending') {
      return NextResponse.json({ error: 'Only pending approvals can be reviewed', success: false }, { status: 409 })
    }

    if (approval.executionId) {
      const execution = await db.agentExecution.findFirst({
        where: { id: approval.executionId, companyId: user.companyId, approvalId: approval.id },
        select: { id: true, status: true },
      })
      if (execution?.status === 'approval_required') {
        if (parsed.data.action === 'approve') {
          const result = await approveExecution(execution.id, user.companyId, user.userId)
          return NextResponse.json({ data: result, success: result.success }, { status: result.success ? 200 : result.needsApproval ? 202 : 502 })
        }
        const result = await rejectExecution(
          execution.id,
          user.companyId,
          user.userId,
          parsed.data.note || 'Rejected by an authorized reviewer',
        )
        return NextResponse.json({ data: result, success: true })
      }
      if (execution) {
        return NextResponse.json({ error: 'Execution is no longer awaiting approval', success: false }, { status: 409 })
      }
    }

    const result = await db.approval.updateMany({
      where: { id: approval.id, companyId: user.companyId, status: 'pending' },
      data: {
        status: parsed.data.action === 'approve' ? 'approved' : 'rejected',
        reviewedBy: user.userId,
        reviewedAt: new Date(),
        responseNote: parsed.data.action === 'reject' ? parsed.data.note ?? null : null,
      },
    })
    if (result.count === 0) return NextResponse.json({ error: 'Approval is no longer pending', success: false }, { status: 409 })
    await db.auditLog.create({
      data: {
        action: `approval.${parsed.data.action}`,
        resource: approval.id,
        userId: user.userId,
        details: JSON.stringify({ companyId: user.companyId }),
      },
    })
    const data = await db.approval.findFirst({ where: { id: approval.id, companyId: user.companyId } })
    return NextResponse.json({ data, success: true })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}
