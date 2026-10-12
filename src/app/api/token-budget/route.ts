import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/api-auth'
import { tenantTarget } from '@/lib/api/secure-route'
import { parseBody } from '@/lib/validators'

const tokenBudgetUpdateSchema = z.object({
  companyId: z.string().min(1),
  monthlyBudget: z.number().int().positive().optional(),
  dailyBudget: z.number().int().positive().optional(),
  warningThreshold: z.number().min(0).max(1).optional(),
  blockThreshold: z.number().min(0).max(2).optional(),
  resetDayOfMonth: z.number().int().min(1).max(28).optional(),
})

// GET /api/token-budget — get token budget for a company (?companyId=xxx)
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')

    if (!companyId) {
      return NextResponse.json({ error: 'companyId query parameter is required' }, { status: 400 })
    }
    const target = tenantTarget(user, companyId)
    if (!target.ok) return NextResponse.json({ error: target.error }, { status: target.status })

    let budget = await db.tokenBudget.findUnique({ where: { companyId } })

    if (budget) {
      const now = new Date()
      const currentDay = now.getUTCDate()
      const lastReset = new Date(budget.lastResetAt)
      const lastResetMonth = lastReset.getUTCMonth()
      const lastResetYear = lastReset.getUTCFullYear()
      const currentMonth = now.getUTCMonth()
      const currentYear = now.getUTCFullYear()

      const isNewMonth =
        currentYear > lastResetYear ||
        (currentYear === lastResetYear && currentMonth > lastResetMonth)
      const isResetDay = currentDay >= budget.resetDayOfMonth

      if (isNewMonth && isResetDay) {
        budget = await db.tokenBudget.update({
          where: { companyId },
          data: { monthlyUsed: 0, dailyUsed: 0, lastResetAt: new Date() },
        })
      } else if (lastReset.getUTCDate() !== currentDay || lastResetMonth !== currentMonth) {
        const lastResetDate = new Date(lastReset.getFullYear(), lastReset.getMonth(), lastReset.getUTCDate())
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getUTCDate())
        if (todayStart > lastResetDate) {
          budget = await db.tokenBudget.update({
            where: { companyId },
            data: { dailyUsed: 0, lastResetAt: new Date() },
          })
        }
      }
    }

    if (!budget) {
      return NextResponse.json({ error: 'Token budget not found for this company' }, { status: 404 })
    }

    const monthlyPercent = budget.monthlyBudget > 0 ? (budget.monthlyUsed / budget.monthlyBudget) * 100 : 0
    const dailyPercent = budget.dailyBudget > 0 ? (budget.dailyUsed / budget.dailyBudget) * 100 : 0

    return NextResponse.json({
      data: {
        ...budget,
        lastResetAt: budget.lastResetAt.toISOString(),
        createdAt: budget.createdAt.toISOString(),
        updatedAt: budget.updatedAt.toISOString(),
        usage: {
          monthly: {
            budget: budget.monthlyBudget,
            used: budget.monthlyUsed,
            remaining: Math.max(0, budget.monthlyBudget - budget.monthlyUsed),
            percent: Math.round(monthlyPercent * 100) / 100,
          },
          daily: {
            budget: budget.dailyBudget,
            used: budget.dailyUsed,
            remaining: Math.max(0, budget.dailyBudget - budget.dailyUsed),
            percent: Math.round(dailyPercent * 100) / 100,
          },
        },
        warnings: {
          monthlyWarning: monthlyPercent >= budget.warningThreshold * 100,
          monthlyBlocked: monthlyPercent >= budget.blockThreshold * 100,
          dailyWarning: dailyPercent >= budget.warningThreshold * 100,
          dailyBlocked: dailyPercent >= budget.blockThreshold * 100,
        },
      },
    })
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/token-budget error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/token-budget — create or update token budget
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await request.json()
    const companyId = body.companyId

    if (!companyId || typeof companyId !== 'string') {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
    }
    const target = tenantTarget(user, companyId)
    if (!target.ok) return NextResponse.json({ error: target.error }, { status: target.status })

    const company = await db.company.findUnique({ where: { id: companyId } })
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    const { monthlyBudget, dailyBudget, warningThreshold, blockThreshold, resetDayOfMonth } = body

    const budget = await db.tokenBudget.upsert({
      where: { companyId },
      create: {
        companyId,
        monthlyBudget: typeof monthlyBudget === 'number' ? monthlyBudget : 1000000,
        dailyBudget: typeof dailyBudget === 'number' ? dailyBudget : 50000,
        warningThreshold: typeof warningThreshold === 'number' ? warningThreshold : 0.8,
        blockThreshold: typeof blockThreshold === 'number' ? blockThreshold : 1.0,
        resetDayOfMonth: typeof resetDayOfMonth === 'number' ? resetDayOfMonth : 1,
      },
      update: {
        ...(monthlyBudget !== undefined && { monthlyBudget }),
        ...(dailyBudget !== undefined && { dailyBudget }),
        ...(warningThreshold !== undefined && { warningThreshold }),
        ...(blockThreshold !== undefined && { blockThreshold }),
        ...(resetDayOfMonth !== undefined && { resetDayOfMonth }),
      },
    })

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'create',
        resource: 'token-budget',
        details: JSON.stringify({ companyId, budgetId: budget.id }),
      },
    })

    return NextResponse.json({ data: budget })
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/token-budget error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/token-budget — update token budget (requires companyId)
export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await req.json()
    const parsed = parseBody(tokenBudgetUpdateSchema, body)
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status })

    const { companyId, ...updateData } = parsed.data

    const target = tenantTarget(user, companyId)
    if (!target.ok) return NextResponse.json({ error: target.error }, { status: target.status })

    const existing = await db.tokenBudget.findUnique({ where: { companyId } })
    if (!existing) {
      return NextResponse.json({ error: 'Token budget not found for this company' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    if (updateData.monthlyBudget !== undefined) data.monthlyBudget = updateData.monthlyBudget
    if (updateData.dailyBudget !== undefined) data.dailyBudget = updateData.dailyBudget
    if (updateData.warningThreshold !== undefined) data.warningThreshold = updateData.warningThreshold
    if (updateData.blockThreshold !== undefined) data.blockThreshold = updateData.blockThreshold
    if (updateData.resetDayOfMonth !== undefined) data.resetDayOfMonth = updateData.resetDayOfMonth

    const budget = await db.tokenBudget.update({
      where: { companyId },
      data,
    })

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'update',
        resource: 'token-budget',
        details: JSON.stringify({ companyId, changes: Object.keys(updateData) }),
      },
    })

    return NextResponse.json({ data: budget })
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('PUT /api/token-budget error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/token-budget — delete token budget for a company
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId')
    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
    }
    const target = tenantTarget(user, companyId)
    if (!target.ok) return NextResponse.json({ error: target.error }, { status: target.status })

    const existing = await db.tokenBudget.findUnique({ where: { companyId } })
    if (!existing) {
      return NextResponse.json({ error: 'Token budget not found for this company' }, { status: 404 })
    }

    await db.tokenBudget.delete({ where: { companyId } })

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'delete',
        resource: 'token-budget',
        details: JSON.stringify({ companyId, budgetId: existing.id }),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('DELETE /api/token-budget error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
