import { requireAuth } from '@/lib/api-auth'
import { tenantTarget } from '@/lib/api/secure-route'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    // Tenant comes from the authenticated principal; a query value naming
    // another tenant is refused.
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')

    if (!companyId) {
      return NextResponse.json(
        { error: 'companyId query parameter is required' },
        { status: 400 }
      )
    }
    const target = tenantTarget(user, companyId)
    if (!target.ok) return NextResponse.json({ error: target.error }, { status: target.status })

    // Aggregate raw usage logs
    const usageLogs = await db.usageLog.findMany({
      where: { companyId },
    })

    const totalRequests = usageLogs.length
    const totalTokens = usageLogs.reduce(
      (sum, log) => sum + log.tokensOrLocalUsed,
      0
    )
    const paidApiUsed = usageLogs.filter((log) => log.paidApiUsed).length

    // Cost estimate: rough $0.002 per 1K tokens
    const costEstimate = (totalTokens / 1000) * 0.002

    // Also aggregate from CompanyUsageSummary if available
    const summaries = await db.companyUsageSummary.findMany({
      where: { companyId },
    })

    const summaryRequests = summaries.reduce((sum, s) => sum + s.totalRequests, 0)
    const summaryTokens = summaries.reduce((sum, s) => sum + s.totalTokensUsed, 0)
    const summaryCost = summaries.reduce((sum, s) => sum + s.totalCostEstimate, 0)
    const summaryPaidApi = summaries.reduce((sum, s) => sum + s.paidApiUsed, 0)
    const summaryBlocked = summaries.reduce((sum, s) => sum + s.blockedCount, 0)
    const summaryApprovalRequired = summaries.reduce(
      (sum, s) => sum + s.approvalRequired,
      0
    )

    return NextResponse.json({
      companyId,
      raw: {
        total_requests: totalRequests,
        total_tokens: totalTokens,
        cost_estimate_usd: Math.round(costEstimate * 1000) / 1000,
        paid_api_used: paidApiUsed,
      },
      summary: {
        total_requests: summaryRequests,
        total_tokens: summaryTokens,
        total_cost_estimate_usd: Math.round(summaryCost * 1000) / 1000,
        paid_api_used: summaryPaidApi,
        blocked_count: summaryBlocked,
        approval_required: summaryApprovalRequired,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[Company Usage] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch usage data' },
      { status: 500 }
    )
  }
}