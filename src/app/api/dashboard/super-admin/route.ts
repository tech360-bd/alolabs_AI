import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  try {
    await requireRole('super_admin');
    const [
      agentsCount,
      departmentsCount,
      companiesCount,
      skillsCount,
      workflowsCount,
      agentRunsCount,
      skillRunsCount,
      workflowRunsCount,
      usageLogsCount,
      pendingApprovalsCount,
    ] = await Promise.all([
      db.agent.count(),
      db.department.count(),
      db.company.count(),
      db.skill.count(),
      db.workflow.count(),
      db.agentRun.count(),
      db.skillRun.count(),
      db.workflowRun.count(),
      db.usageLog.count(),
      db.approval.count({ where: { status: 'pending' } }),
    ])

    const [
      paymentGuardSetting,
      protectionModeSetting,
      selfImprovementSetting,
      productivityModeSetting,
      ragSetting,
    ] = await Promise.all([
      db.settings.findUnique({ where: { key: 'payment_guard_enabled' } }),
      db.settings.findUnique({ where: { key: 'protection_mode_enabled' } }),
      db.settings.findUnique({ where: { key: 'self_improvement_enabled' } }),
      db.settings.findUnique({ where: { key: 'productivity_mode_enabled' } }),
      db.settings.findUnique({ where: { key: 'rag_enabled' } }),
    ])

    const payment_guard_enabled = paymentGuardSetting?.value === 'true'
    const protection_mode_enabled = protectionModeSetting?.value === 'true'
    const self_improvement_enabled = selfImprovementSetting?.value === 'true'
    const productivity_mode_enabled = productivityModeSetting?.value === 'true'
    const rag_enabled = ragSetting?.value === 'true'

    const activeCompanies = await db.company.findMany({
      where: { status: 'active' },
      select: { id: true, webCrmConnected: true },
    })

    let all_sister_companies_connected = false
    if (activeCompanies.length >= 6) {
      const connectedCount = activeCompanies.filter(
        (c) => c.webCrmConnected
      ).length
      all_sister_companies_connected = connectedCount >= 6
    }

    return NextResponse.json({
      counts: {
        agents: agentsCount,
        departments: departmentsCount,
        companies: companiesCount,
        skills: skillsCount,
        workflows: workflowsCount,
        agentRuns: agentRunsCount,
        skillRuns: skillRunsCount,
        workflowRuns: workflowRunsCount,
        usageLogs: usageLogsCount,
        pendingApprovals: pendingApprovalsCount,
      },
      feature_flags: {
        payment_guard_enabled,
        protection_mode_enabled,
        self_improvement_enabled,
        productivity_mode_enabled,
        rag_enabled,
        paid_ai_api_allowed: false,
        central_agent_hub_enabled: true,
        multi_company_routing_enabled: true,
        company_usage_tracking_enabled: true,
        selected_agent_runtime_enabled: true,
        web_crm_auto_connected: true,
        all_sister_companies_connected,
      },
    })
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message === 'Forbidden' ? 'Forbidden' : 'Unauthorized' }, { status: error.message === 'Forbidden' ? 403 : 401 });
    }
    console.error('[Super Admin Dashboard] Error:', error)
    return NextResponse.json(
      { error: 'Failed to load super admin dashboard' },
      { status: 500 }
    )
  }
}