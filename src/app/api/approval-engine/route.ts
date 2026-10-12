import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireCompanyAuth } from '@/lib/api-auth'
import { determineRequiredAction } from '@/lib/approval-engine/types'

const RiskLevelSchema = z.enum(['low', 'medium', 'high', 'critical'])
const RequiredActionSchema = z.enum(['auto_execute', 'team_review', 'manager_approve', 'block'])

const SubmitSchema = z.object({
  agentId: z.string().trim().min(1).max(100).optional(),
  action: z.string().trim().min(1).max(200),
  riskLevel: RiskLevelSchema,
  description: z.string().trim().min(1).max(5000),
  taskId: z.string().trim().min(1).max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  cost: z.number().finite().nonnegative().optional(),
})

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error'
  const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500
  return NextResponse.json({ error: message, success: false }, { status })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseRequestJson(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value)
    if (isRecord(parsed)) return parsed
  } catch {
    // Corrupt or legacy payloads are returned with no derived metadata.
  }
  return {}
}

function approvalView(approval: {
  id: string
  type: string
  title: string
  description: string | null
  requestJson: string
  riskLevel: string
  status: string
  requestedBy: string | null
  companyId: string | null
  createdAt: Date
  updatedAt: Date
}) {
  const details = parseRequestJson(approval.requestJson)
  const risk = RiskLevelSchema.safeParse(approval.riskLevel)
  const requiredAction = RequiredActionSchema.safeParse(details.requiredAction)
  return {
    id: approval.id,
    taskId: typeof details.taskId === 'string' ? details.taskId : undefined,
    agentId: typeof details.agentId === 'string' ? details.agentId : undefined,
    companyId: approval.companyId,
    userId: approval.requestedBy,
    action: typeof details.action === 'string' ? details.action : approval.type,
    riskLevel: risk.success ? risk.data : null,
    requiredAction: requiredAction.success ? requiredAction.data : null,
    status: approval.status,
    description: approval.description ?? '',
    metadata: typeof details.metadata === 'object' && details.metadata !== null && !Array.isArray(details.metadata)
      ? details.metadata
      : undefined,
    createdAt: approval.createdAt,
    updatedAt: approval.updatedAt,
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const parsed = SubmitSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({
        success: false,
        error: 'Validation failed',
        details: parsed.error.issues,
      }, { status: 400 })
    }

    const requiredAction = determineRequiredAction(
      parsed.data.riskLevel,
      undefined,
      parsed.data.action,
      parsed.data.cost,
    )
    const status = requiredAction === 'auto_execute'
      ? 'approved'
      : requiredAction === 'block'
        ? 'rejected'
        : 'pending'
    const approval = await db.approval.create({
      data: {
        type: 'agent_action',
        title: parsed.data.action,
        description: parsed.data.description,
        requestJson: JSON.stringify({
          action: parsed.data.action,
          riskLevel: parsed.data.riskLevel,
          requiredAction,
          taskId: parsed.data.taskId,
          agentId: parsed.data.agentId,
          metadata: parsed.data.metadata,
          cost: parsed.data.cost,
        }),
        status,
        requestedBy: user.userId,
        companyId: user.companyId,
        riskLevel: parsed.data.riskLevel,
        ...(requiredAction === 'block' ? { responseNote: 'Blocked by the configured default risk policy' } : {}),
      },
    })

    await db.auditLog.create({
      data: {
        action: 'approval_engine.submitted',
        resource: approval.id,
        userId: user.userId,
        details: JSON.stringify({
          companyId: user.companyId,
          requiredAction,
          riskLevel: parsed.data.riskLevel,
        }),
      },
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      approved: status === 'approved',
      requiredAction,
      data: approvalView(approval),
    }, { status: 201 })
  } catch (error: unknown) {
    console.error('[/api/approval-engine]', error)
    return errorResponse(error)
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const view = request.nextUrl.searchParams.get('view')

    if (view === 'pending' || view === 'history') {
      const where = view === 'pending'
        ? { companyId: user.companyId, status: 'pending' }
        : { companyId: user.companyId, status: { not: 'pending' } }
      const approvals = await db.approval.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
      return NextResponse.json({ success: true, data: approvals.map(approvalView) })
    }

    const where = { companyId: user.companyId }
    const [total, pending, approved, rejected, expired, riskCounts] = await Promise.all([
      db.approval.count({ where }),
      db.approval.count({ where: { ...where, status: 'pending' } }),
      db.approval.count({ where: { ...where, status: { in: ['approved', 'auto_approved'] } } }),
      db.approval.count({ where: { ...where, status: 'rejected' } }),
      db.approval.count({ where: { ...where, status: 'expired' } }),
      db.approval.groupBy({
        by: ['riskLevel'],
        where,
        _count: { _all: true },
      }),
    ])

    const byRiskLevel = { low: 0, medium: 0, high: 0, critical: 0 }
    for (const entry of riskCounts) {
      const risk = RiskLevelSchema.safeParse(entry.riskLevel)
      if (risk.success) byRiskLevel[risk.data] = entry._count._all
    }

    return NextResponse.json({
      success: true,
      data: { total, pending, approved, rejected, expired, byRiskLevel },
    })
  } catch (error: unknown) {
    console.error('[/api/approval-engine]', error)
    return errorResponse(error)
  }
}
