import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { tenantTarget } from '@/lib/api/secure-route'

// GET: Get usage quotas for a company
export async function GET(request: NextRequest) {
  try {
    const user = await requireRole('admin', 'super_admin');
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')

    if (!companyId) {
      return NextResponse.json({ error: 'companyId query parameter is required' }, { status: 400 })
    }
    const target = tenantTarget(user, companyId)
    if (!target.ok) return NextResponse.json({ error: target.error }, { status: target.status })

    // Verify company exists
    const company = await db.company.findUnique({
      where: { id: companyId },
      include: {
        subscription: { include: { plan: true } },
        tokenBudget: true,
      },
    })

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    // Get current month's usage count from UsageLog
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    const currentMonthUsage = await db.usageLog.count({
      where: {
        companyId,
        createdAt: { gte: startOfMonth, lt: endOfMonth },
      },
    })

    // Get subscription limits
    const plan = company.subscription?.plan
    const subscriptionLimits = {
      agentLimit: plan?.agentLimit ?? 100,
      skillLimit: plan?.skillLimit ?? 500,
      workflowLimit: plan?.workflowLimit ?? 100,
      monthlyTokens: plan?.monthlyTokens ?? 1000000,
      monthlyRequests: plan?.monthlyRequests ?? 50000,
    }

    // Get current counts for agents/skills/workflows accessible to this company
    // Company has permissions via CompanyPermission table; for simplicity, count all active
    const agentCount = await db.agent.count({
      where: { status: 'active' },
    })

    const skillCount = await db.skill.count({
      where: { status: { in: ['private', 'approved'] } },
    })

    const workflowCount = await db.workflow.count({
      where: { status: 'active' },
    })

    // Token budget status
    const tokenBudget = company.tokenBudget
    const tokenBudgetStatus = {
      monthlyBudget: tokenBudget?.monthlyBudget ?? 1000000,
      monthlyUsed: tokenBudget?.monthlyUsed ?? 0,
      dailyBudget: tokenBudget?.dailyBudget ?? 50000,
      dailyUsed: tokenBudget?.dailyUsed ?? 0,
      warningThreshold: tokenBudget?.warningThreshold ?? 0.8,
      blockThreshold: tokenBudget?.blockThreshold ?? 1.0,
      monthlyUsagePercent: tokenBudget
        ? ((tokenBudget.monthlyUsed / tokenBudget.monthlyBudget) * 100).toFixed(2)
        : '0.00',
      dailyUsagePercent: tokenBudget
        ? ((tokenBudget.dailyUsed / tokenBudget.dailyBudget) * 100).toFixed(2)
        : '0.00',
      isWarning: tokenBudget
        ? tokenBudget.monthlyUsed / tokenBudget.monthlyBudget >= (tokenBudget.warningThreshold ?? 0.8)
        : false,
      isBlocked: tokenBudget
        ? tokenBudget.monthlyUsed / tokenBudget.monthlyBudget >= (tokenBudget.blockThreshold ?? 1.0)
        : false,
    }

    return NextResponse.json({
      companyId,
      companyName: company.name,
      monthlyUsage: {
        limit: company.monthlyUsageLimit,
        current: currentMonthUsage,
        remaining: Math.max(0, company.monthlyUsageLimit - currentMonthUsage),
        usagePercent: ((currentMonthUsage / company.monthlyUsageLimit) * 100).toFixed(2),
      },
      subscriptionLimits,
      currentCounts: {
        agents: agentCount,
        skills: skillCount,
        workflows: workflowCount,
      },
      subscriptionRemaining: {
        agents: Math.max(0, subscriptionLimits.agentLimit - agentCount),
        skills: Math.max(0, subscriptionLimits.skillLimit - skillCount),
        workflows: Math.max(0, subscriptionLimits.workflowLimit - workflowCount),
      },
      tokenBudget: tokenBudgetStatus,
      subscription: company.subscription
        ? {
            status: company.subscription.status,
            planName: plan?.name ?? 'Free',
            currentPeriodEnd: company.subscription.currentPeriodEnd,
          }
        : null,
    })
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message === 'Forbidden' ? 'Forbidden' : 'Unauthorized' }, { status: error.message === 'Forbidden' ? 403 : 401 });
    }
    console.error('Error fetching usage quotas:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}