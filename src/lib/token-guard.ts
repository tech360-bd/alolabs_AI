import { db } from '@/lib/db'

// ──────────────────────────────────────────────
// Type definitions
// ──────────────────────────────────────────────

export interface TokenBudgetCheck {
  allowed: boolean
  reason?: string
  monthlyUsed: number
  monthlyBudget: number
  dailyUsed: number
  dailyBudget: number
}

// ──────────────────────────────────────────────
// checkTokenBudget
//
// Checks whether adding `estimatedTokens` would exceed
// the company's daily or monthly token budget.
// If the warning threshold is crossed, an Alert is created.
// ──────────────────────────────────────────────

export async function checkTokenBudget(
  companyId: string,
  estimatedTokens: number,
): Promise<TokenBudgetCheck> {
  const budget = await db.tokenBudget.findUnique({
    where: { companyId },
  })

  // If no budget is configured for the company, allow everything
  if (!budget) {
    return {
      allowed: true,
      monthlyUsed: 0,
      monthlyBudget: 0,
      dailyUsed: 0,
      dailyBudget: 0,
    }
  }

  // Check if daily counter needs reset (new day)
  const now = new Date()
  const budgetDay = budget.lastResetAt ? new Date(budget.lastResetAt) : null
  const isNewDay = !budgetDay || (
    now.getFullYear() !== budgetDay.getFullYear() ||
    now.getMonth() !== budgetDay.getMonth() ||
    now.getDate() !== budgetDay.getDate()
  )

  if (isNewDay && budget.dailyUsed > 0) {
    await db.tokenBudget.update({
      where: { companyId },
      data: { dailyUsed: 0, lastResetAt: now },
    })
    budget.dailyUsed = 0
    budget.lastResetAt = now
  }

  // Check if monthly counter needs reset (new month)
  const budgetMonth = budget.lastResetAt ? new Date(budget.lastResetAt) : null
  const isNewMonth = !budgetMonth || (
    now.getFullYear() !== budgetMonth.getFullYear() ||
    now.getMonth() !== budgetMonth.getMonth()
  )

  if (isNewMonth && budget.monthlyUsed > 0) {
    await db.tokenBudget.update({
      where: { companyId },
      data: { monthlyUsed: 0, lastResetAt: now },
    })
    budget.monthlyUsed = 0
    budget.lastResetAt = now
  }

  const newMonthlyTotal = budget.monthlyUsed + estimatedTokens
  const newDailyTotal = budget.dailyUsed + estimatedTokens

  // Block if monthly budget exceeded
  if (newMonthlyTotal > budget.monthlyBudget) {
    return {
      allowed: false,
      reason: `Monthly token budget exceeded. Used: ${budget.monthlyUsed}, Budget: ${budget.monthlyBudget}, Requested: ${estimatedTokens}`,
      monthlyUsed: budget.monthlyUsed,
      monthlyBudget: budget.monthlyBudget,
      dailyUsed: budget.dailyUsed,
      dailyBudget: budget.dailyBudget,
    }
  }

  // Block if daily budget exceeded
  if (newDailyTotal > budget.dailyBudget) {
    return {
      allowed: false,
      reason: `Daily token budget exceeded. Used: ${budget.dailyUsed}, Budget: ${budget.dailyBudget}, Requested: ${estimatedTokens}`,
      monthlyUsed: budget.monthlyUsed,
      monthlyBudget: budget.monthlyBudget,
      dailyUsed: budget.dailyUsed,
      dailyBudget: budget.dailyBudget,
    }
  }

  // Check warning thresholds — fire alerts but still allow
  const monthlyRatio = budget.monthlyBudget > 0 ? newMonthlyTotal / budget.monthlyBudget : 0
  const dailyRatio = budget.dailyBudget > 0 ? newDailyTotal / budget.dailyBudget : 0

  if (monthlyRatio >= budget.warningThreshold) {
    await createBudgetAlert(
      companyId,
      'monthly',
      budget.monthlyUsed,
      budget.monthlyBudget,
      estimatedTokens,
      monthlyRatio,
    )
  }

  if (dailyRatio >= budget.warningThreshold) {
    await createBudgetAlert(
      companyId,
      'daily',
      budget.dailyUsed,
      budget.dailyBudget,
      estimatedTokens,
      dailyRatio,
    )
  }

  return {
    allowed: true,
    monthlyUsed: budget.monthlyUsed,
    monthlyBudget: budget.monthlyBudget,
    dailyUsed: budget.dailyUsed,
    dailyBudget: budget.dailyBudget,
  }
}

// ──────────────────────────────────────────────
// recordTokenUsage
//
// Increments the company's token usage counters
// and records a TokenUsage entry.
// ──────────────────────────────────────────────

export async function recordTokenUsage(
  companyId: string,
  tokens: number,
  meta?: {
    agentId?: string
    taskId?: string
    model?: string
    promptTokens?: number
    completionTokens?: number
    costEstimate?: number
  },
): Promise<void> {
  const now = new Date()

  await db.tokenBudget.update({
    where: { companyId },
    data: {
      monthlyUsed: { increment: tokens },
      dailyUsed: { increment: tokens },
      lastResetAt: now,
    },
  }).catch(() => {
    // Budget record may not exist — silently ignore
  })

  if (meta) {
    await db.tokenUsage.create({
      data: {
        companyId,
        agentId: meta.agentId,
        taskId: meta.taskId,
        model: meta.model || 'deepseek-v3',
        promptTokens: meta.promptTokens ?? 0,
        completionTokens: meta.completionTokens ?? 0,
        totalTokens: tokens,
        costEstimate: meta.costEstimate ?? 0,
      },
    }).catch(() => {
      // Silently ignore write failures
    })
  }
}

// ──────────────────────────────────────────────
// Helper: create a budget warning alert
// ──────────────────────────────────────────────

async function createBudgetAlert(
  companyId: string,
  period: 'monthly' | 'daily',
  used: number,
  budget: number,
  requested: number,
  ratio: number,
): Promise<void> {
  const alertName = `token_budget_${period}_warning`
  const severity = ratio >= 0.95 ? 'critical' : 'warning'

  // Upsert the alert: update if already firing, create if not
  const existing = await db.alert.findFirst({
    where: {
      name: alertName,
      condition: { contains: companyId },
      isFiring: true,
    },
  })

  if (existing) {
    await db.alert.update({
      where: { id: existing.id },
      data: {
        severity,
        lastFiredAt: new Date(),
        condition: JSON.stringify({
          type: 'token_budget_warning',
          companyId,
          period,
          used,
          budget,
          requested,
          ratio: Math.round(ratio * 100) / 100,
          percentage: Math.round(ratio * 100),
        }),
      },
    })
  } else {
    await db.alert.create({
      data: {
        name: alertName,
        severity,
        isFiring: true,
        lastFiredAt: new Date(),
        condition: JSON.stringify({
          type: 'token_budget_warning',
          companyId,
          period,
          used,
          budget,
          requested,
          ratio: Math.round(ratio * 100) / 100,
          percentage: Math.round(ratio * 100),
        }),
      },
    })
  }
}