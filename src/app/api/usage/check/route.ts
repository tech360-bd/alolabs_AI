import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ─── POST: Check Usage Quota ────────────────────────────────────────────────

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
    const { companyId, action, estimatedTokens = 0 } = body

    if (!companyId || !action) {
      return NextResponse.json(
        { error: 'companyId and action are required' },
        { status: 400 },
      )
    }

    const validActions = ['agent_run', 'skill_run', 'workflow_run', 'api_call']
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action. Must be one of: ${validActions.join(', ')}` },
        { status: 400 },
      )
    }

    const warnings: string[] = []

    // 1. Check company exists and is active
    const company = await db.company.findUnique({
      where: { id: companyId },
      include: {
        subscription: {
          include: { plan: true },
        },
        tokenBudget: true,
      },
    })

    if (!company) {
      return NextResponse.json({
        allowed: false,
        reason: 'Company not found',
        limits: { used: 0, limit: 0 },
        warnings: [],
      })
    }

    if (company.status !== 'active') {
      return NextResponse.json({
        allowed: false,
        reason: `Company is ${company.status}`,
        limits: { used: 0, limit: 0 },
        warnings: [],
      })
    }

    // 2. Check monthly usage limit
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthlyUsageCount = await db.usageLog.count({
      where: {
        companyId,
        createdAt: { gte: monthStart },
        status: 'completed',
      },
    })
    const monthlyLimit = company.monthlyUsageLimit

    if (monthlyUsageCount >= monthlyLimit && monthlyLimit > 0) {
      return NextResponse.json({
        allowed: false,
        reason: `Monthly usage limit reached (${monthlyUsageCount}/${monthlyLimit} requests)`,
        limits: {
          resource: 'monthly_requests',
          used: monthlyUsageCount,
          limit: monthlyLimit,
        },
        warnings,
      })
    }

    if (monthlyLimit > 0) {
      const monthlyPct = monthlyUsageCount / monthlyLimit
      if (monthlyPct >= 0.9) {
        warnings.push(`Monthly usage at ${Math.round(monthlyPct * 100)}% (${monthlyUsageCount}/${monthlyLimit})`)
      }
    }

    // 3. Check subscription plan limits
    if (company.subscription) {
      const plan = company.subscription.plan
      if (company.subscription.status === 'cancelled' || company.subscription.status === 'past_due') {
        return NextResponse.json({
          allowed: false,
          reason: `Subscription is ${company.subscription.status}`,
          limits: { used: 0, limit: 0 },
          warnings,
        })
      }

      // Check action-specific limits
      let resourceUsed = 0
      let resourceLimit = 0
      let resourceName = ''

      switch (action) {
        case 'agent_run': {
          const agentCount = await db.usageLog.count({
            where: {
              companyId,
              agentId: { not: null },
              createdAt: { gte: monthStart },
            },
            distinct: ['agentId'] as never,
          })
          resourceUsed = agentCount
          resourceLimit = plan.agentLimit > 0 ? plan.agentLimit : 999999
          resourceName = 'agents'
          break
        }
        case 'skill_run': {
          const skillCount = await db.usageLog.count({
            where: {
              companyId,
              skillId: { not: null },
              createdAt: { gte: monthStart },
            },
            distinct: ['skillId'] as never,
          })
          resourceUsed = skillCount
          resourceLimit = plan.skillLimit > 0 ? plan.skillLimit : 999999
          resourceName = 'skills'
          break
        }
        case 'workflow_run': {
          const workflowCount = await db.usageLog.count({
            where: {
              companyId,
              workflowId: { not: null },
              createdAt: { gte: monthStart },
            },
            distinct: ['workflowId'] as never,
          })
          resourceUsed = workflowCount
          resourceLimit = plan.workflowLimit > 0 ? plan.workflowLimit : 999999
          resourceName = 'workflows'
          break
        }
        case 'api_call': {
          resourceUsed = monthlyUsageCount
          resourceLimit = plan.monthlyRequests > 0 ? plan.monthlyRequests : 999999
          resourceName = 'requests'
          break
        }
      }

      if (resourceUsed >= resourceLimit) {
        return NextResponse.json({
          allowed: false,
          reason: `Plan ${resourceName} limit reached (${resourceUsed}/${resourceLimit})`,
          limits: {
            resource: resourceName,
            used: resourceUsed,
            limit: resourceLimit,
          },
          warnings,
        })
      }

      if (resourceLimit > 0) {
        const resourcePct = resourceUsed / resourceLimit
        if (resourcePct >= 0.8) {
          warnings.push(`Plan ${resourceName} usage at ${Math.round(resourcePct * 100)}% (${resourceUsed}/${resourceLimit})`)
        }
      }

      // Check monthly requests limit from plan
      if (plan.monthlyRequests > 0 && monthlyUsageCount >= plan.monthlyRequests) {
        return NextResponse.json({
          allowed: false,
          reason: `Plan monthly request limit reached (${monthlyUsageCount}/${plan.monthlyRequests})`,
          limits: {
            resource: 'plan_requests',
            used: monthlyUsageCount,
            limit: plan.monthlyRequests,
          },
          warnings,
        })
      }
    }

    // 4. Check token budget
    if (company.tokenBudget && estimatedTokens > 0) {
      const budget = company.tokenBudget
      const remaining = budget.monthlyBudget - budget.monthlyUsed

      if (budget.monthlyUsed >= budget.monthlyBudget) {
        return NextResponse.json({
          allowed: false,
          reason: `Token budget exhausted (${budget.monthlyUsed.toLocaleString()}/${budget.monthlyBudget.toLocaleString()} tokens)`,
          limits: {
            resource: 'tokens',
            used: budget.monthlyUsed,
            limit: budget.monthlyBudget,
          },
          warnings,
        })
      }

      if (estimatedTokens > remaining) {
        return NextResponse.json({
          allowed: false,
          reason: `Insufficient token budget. Requested: ${estimatedTokens.toLocaleString()}, Available: ${remaining.toLocaleString()}`,
          limits: {
            resource: 'tokens',
            used: budget.monthlyUsed,
            limit: budget.monthlyBudget,
          },
          warnings,
        })
      }

      // Warning thresholds
      const tokenPct = budget.monthlyUsed / budget.monthlyBudget
      if (tokenPct >= budget.warningThreshold) {
        warnings.push(`Token budget at ${Math.round(tokenPct * 100)}% (${budget.monthlyUsed.toLocaleString()}/${budget.monthlyBudget.toLocaleString()})`)
      }

      // Check daily budget too
      const dailyRemaining = budget.dailyBudget - budget.dailyUsed
      if (estimatedTokens > dailyRemaining && dailyRemaining > 0) {
        warnings.push(`Daily token budget low (${budget.dailyUsed.toLocaleString()}/${budget.dailyBudget.toLocaleString()})`)
      }
    }

    // All checks passed
    return NextResponse.json({
      allowed: true,
      limits: {
        monthlyRequests: {
          used: monthlyUsageCount,
          limit: monthlyLimit,
        },
        tokenBudget: company.tokenBudget
          ? {
              monthly: { used: company.tokenBudget.monthlyUsed, limit: company.tokenBudget.monthlyBudget },
              daily: { used: company.tokenBudget.dailyUsed, limit: company.tokenBudget.dailyBudget },
            }
          : null,
        plan: company.subscription
          ? {
              name: company.subscription.plan.name,
              agentLimit: company.subscription.plan.agentLimit,
              skillLimit: company.subscription.plan.skillLimit,
              workflowLimit: company.subscription.plan.workflowLimit,
              monthlyRequests: company.subscription.plan.monthlyRequests,
              monthlyTokens: company.subscription.plan.monthlyTokens,
            }
          : null,
      },
      warnings,
    })
  } catch (error) {
    console.error('Usage check error:', error)
    return NextResponse.json(
      { error: 'Failed to check usage quota' },
      { status: 500 },
    )
  }
}