import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireCompanyAuth } from '@/lib/api-auth'
import { approveExecution, rejectExecution } from '@/lib/ai-workforce/execution-engine'

const ApprovalStatusSchema = z.enum(['pending', 'approved', 'rejected', 'expired', 'cancelled', 'auto_approved'])

const CreateApprovalSchema = z.object({
  type: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  requestJson: z.record(z.string(), z.unknown()).optional(),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
})

const ReviewApprovalSchema = z.object({
  approvalId: z.string().trim().min(1),
  comment: z.string().trim().max(2000).optional(),
})

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error'
  const status = message === 'Unauthorized' ? 401
    : message === 'Forbidden' ? 403
      : message.includes('not found') ? 404
        : message.includes('pending') || message.includes('awaiting') || message.includes('Approval-required') ? 409
          : 500
  return NextResponse.json({ error: message }, { status })
}

function canReview(role: string, companyRole: string | undefined): boolean {
  return ['super_admin', 'admin', 'owner'].includes(role) ||
    ['owner', 'admin', 'manager'].includes(companyRole ?? '')
}

function parsePage(value: string | null, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const page = parsePage(request.nextUrl.searchParams.get('page'), 1)
    const limit = Math.min(100, parsePage(request.nextUrl.searchParams.get('limit'), 20))
    const statusFilter = request.nextUrl.searchParams.get('status')

    const where: Prisma.ApprovalWhereInput = { companyId: user.companyId }
    if (statusFilter && statusFilter !== 'all') {
      const parsedStatus = ApprovalStatusSchema.safeParse(statusFilter)
      if (!parsedStatus.success) {
        return NextResponse.json({ error: 'Unsupported approval status' }, { status: 400 })
      }
      where.status = parsedStatus.data
    }

    const [approvals, total] = await Promise.all([
      db.approval.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      db.approval.count({ where }),
    ])

    const data = approvals.map((approval) => ({
      id: approval.id,
      type: approval.type,
      title: approval.title,
      description: approval.description,
      status: approval.status,
      riskLevel: approval.riskLevel,
      executionId: approval.executionId,
      responseNote: approval.responseNote,
      user: approval.user
        ? { name: approval.user.name, email: approval.user.email }
        : undefined,
      createdAt: approval.createdAt.toISOString(),
    }))

    return NextResponse.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    if (!canReview(user.role, user.companyRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const action = request.nextUrl.searchParams.get('action')
    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 })
    }

    const parsed = ReviewApprovalSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const approval = await db.approval.findFirst({
      where: { id: parsed.data.approvalId, companyId: user.companyId },
      select: { id: true, executionId: true, status: true, expiresAt: true },
    })
    if (!approval) return NextResponse.json({ error: 'Approval not found for this company' }, { status: 404 })
    if (approval.status !== 'pending') {
      return NextResponse.json({ error: 'Only pending approvals can be reviewed' }, { status: 409 })
    }
    if (approval.expiresAt && approval.expiresAt.getTime() < Date.now()) {
      await db.approval.updateMany({ where: { id: approval.id, status: 'pending' }, data: { status: 'expired', reviewedAt: new Date() } })
      return NextResponse.json({ error: 'Approval has expired and can no longer be decided' }, { status: 409 })
    }

    if (approval.executionId) {
      const execution = await db.agentExecution.findFirst({
        where: {
          id: approval.executionId,
          companyId: user.companyId,
          approvalId: approval.id,
        },
        select: { id: true, status: true },
      })
      if (!execution) {
        return NextResponse.json({ error: 'Approval is not linked to an execution in this company' }, { status: 409 })
      }
      if (execution.status !== 'approval_required') {
        return NextResponse.json({ error: 'Execution is no longer awaiting approval' }, { status: 409 })
      }

      if (action === 'approve') {
        const result = await approveExecution(execution.id, user.companyId, user.userId)
        return NextResponse.json(
          { success: result.success, data: result },
          { status: result.success ? 200 : result.needsApproval ? 202 : 502 },
        )
      }

      const result = await rejectExecution(
        execution.id,
        user.companyId,
        user.userId,
        parsed.data.comment ?? 'Rejected by an authorized reviewer',
      )
      return NextResponse.json({ success: true, data: result })
    }

    const result = await db.$transaction(async (transaction) => {
      const update = await transaction.approval.updateMany({
        where: { id: approval.id, companyId: user.companyId, status: 'pending' },
        data: {
          status: action === 'approve' ? 'approved' : 'rejected',
          reviewedBy: user.userId,
          reviewedAt: new Date(),
          responseNote: action === 'reject' ? parsed.data.comment ?? null : null,
        },
      })
      if (update.count !== 1) throw new Error('Approval is no longer pending')

      await transaction.auditLog.create({
        data: {
          action: `approval.${action}`,
          resource: approval.id,
          userId: user.userId,
          details: JSON.stringify({ companyId: user.companyId }),
        },
      })

      return transaction.approval.findFirst({
        where: { id: approval.id, companyId: user.companyId },
      })
    })

    // If an AgentOS run paused for this review, resume or fail it.
    const { resolveRunApproval } = await import('@/lib/runs')
    const resolution = await resolveRunApproval({
      approvalId: approval.id,
      approved: action === 'approve',
      reviewerId: user.userId,
      note: parsed.data.comment,
    })

    return NextResponse.json({
      success: true,
      status: result?.status,
      runId: resolution.runId,
      resumedRunId: resolution.resumed ? resolution.runId : null,
      runStatus: resolution.status ?? null,
    })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const parsed = CreateApprovalSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const approval = await db.approval.create({
      data: {
        type: parsed.data.type,
        title: parsed.data.title,
        description: parsed.data.description ?? '',
        requestJson: JSON.stringify(parsed.data.requestJson ?? {}),
        riskLevel: parsed.data.riskLevel ?? 'medium',
        requestedBy: user.userId,
        companyId: user.companyId,
      },
    })

    await db.auditLog.create({
      data: {
        action: 'approval.requested',
        resource: approval.id,
        userId: user.userId,
        details: JSON.stringify({ companyId: user.companyId, type: approval.type }),
      },
    }).catch(() => {})

    return NextResponse.json({
      id: approval.id,
      type: approval.type,
      title: approval.title,
      status: approval.status,
    }, { status: 201 })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}
