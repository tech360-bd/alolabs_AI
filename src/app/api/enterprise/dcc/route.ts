import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { db } from '@/lib/db'

export async function GET() {
  try {
    await requireAuth()

    // DCC-001: SOP Compliance — percentage of SOPs with status=approved vs total
    const [sopTotal, sopApproved] = await Promise.all([
      db.enterpriseSOP.count(),
      db.enterpriseSOP.count({ where: { status: 'approved' } }),
    ])
    const sopCompliance = sopTotal > 0 ? Math.round((sopApproved / sopTotal) * 100) : 0

    // DCC-002: Knowledge Coverage — knowledge nodes vs expected minimum per department
    const [knowledgeCount, deptCount] = await Promise.all([
      db.knowledgeNode.count(),
      db.department.count(),
    ])
    const expectedKnowledge = deptCount * 25 // 25 nodes per dept minimum
    const knowledgeCoverage = expectedKnowledge > 0 ? Math.min(100, Math.round((knowledgeCount / expectedKnowledge) * 100)) : 0

    // DCC-003: Skills Coverage — approved + active skills vs total
    const [skillTotal, skillReady] = await Promise.all([
      db.skill.count(),
      db.skill.count({ where: { status: { in: ['approved', 'private'] } } }),
    ])
    const skillsCoverage = skillTotal > 0 ? Math.round((skillReady / skillTotal) * 100) : 0

    // DCC-004: Test Pass Rate — skill validations with PASS status
    const [testTotal, testPassed] = await Promise.all([
      db.skillValidationLog.count(),
      db.skillValidationLog.count({ where: { status: 'PASS' } }),
    ])
    const testPassRate = testTotal > 0 ? Math.round((testPassed / testTotal) * 100) : 0

    // DCC-005: KPI Achievement — agents with active status vs total
    const [agentTotal, agentActive] = await Promise.all([
      db.agent.count(),
      db.agent.count({ where: { status: 'active' } }),
    ])
    const kpiAchievement = agentTotal > 0 ? Math.round((agentActive / agentTotal) * 100) : 0

    // DCC-006: Security Score — protection logs blocked (good) vs total + no critical security events
    const [protTotal, protBlocked] = await Promise.all([
      db.protectionLog.count(),
      db.protectionLog.count({ where: { blocked: true } }),
    ])
    const securityScore = protTotal > 0 ? Math.round((protBlocked / protTotal) * 100) : 100

    // DCC-007: Audit Completeness — audit logs covering all agent runs
    const [auditCount, agentRunCount] = await Promise.all([
      db.auditLog.count(),
      db.agentRun.count(),
    ])
    const auditCompleteness = agentRunCount > 0 ? Math.min(100, Math.round((auditCount / agentRunCount) * 100)) : 100

    // DCC-008: Self-Recovery Rate — agent runs completed successfully vs total completed
    const [runsCompleted, runsFailed] = await Promise.all([
      db.agentRun.count({ where: { status: { in: ['completed', 'success'] } } }),
      db.agentRun.count({ where: { status: { in: ['failed', 'error'] } } }),
    ])
    const totalFinished = runsCompleted + runsFailed
    const selfRecoveryRate = totalFinished > 0 ? Math.round((runsCompleted / totalFinished) * 100) : 0

    // DCC-009: Escalation Rate — blocked actions vs total actions (lower is better)
    const blockedCount = await db.blockedAction.count()
    const totalActions = protTotal + blockedCount
    const escalationRate = totalActions > 0 ? Math.round((blockedCount / totalActions) * 100) : 0

    const dccCriteria = [
      { id: 'DCC-001', name: 'SOP Compliance', target: 95, current: sopCompliance, unit: '%', status: sopCompliance >= 95 ? 'passing' : 'improving', description: 'Percentage of SOPs passing quality gates' },
      { id: 'DCC-002', name: 'Knowledge Coverage', target: 95, current: knowledgeCoverage, unit: '%', status: knowledgeCoverage >= 95 ? 'passing' : 'improving', description: 'Enterprise knowledge graph completeness' },
      { id: 'DCC-003', name: 'Skills Coverage', target: 95, current: skillsCoverage, unit: '%', status: skillsCoverage >= 95 ? 'passing' : 'improving', description: 'Required skills availability across departments' },
      { id: 'DCC-004', name: 'Test Pass Rate', target: 95, current: testPassRate, unit: '%', status: testPassRate >= 95 ? 'passing' : 'building', description: 'Agent test scenario pass rate' },
      { id: 'DCC-005', name: 'KPI Achievement', target: 90, current: kpiAchievement, unit: '%', status: kpiAchievement >= 90 ? 'passing' : 'building', description: 'Department KPI target achievement' },
      { id: 'DCC-006', name: 'Security Score', target: 100, current: securityScore, unit: '%', status: securityScore >= 100 ? 'passing' : 'improving', description: 'Zero-tolerance security compliance' },
      { id: 'DCC-007', name: 'Audit Completeness', target: 100, current: auditCompleteness, unit: '%', status: auditCompleteness >= 100 ? 'passing' : 'building', description: 'Complete audit trail coverage' },
      { id: 'DCC-008', name: 'Self-Recovery Rate', target: 90, current: selfRecoveryRate, unit: '%', status: selfRecoveryRate >= 90 ? 'passing' : 'building', description: 'Automated recovery from failures' },
      { id: 'DCC-009', name: 'Escalation Rate', target: 10, current: escalationRate, unit: '%', status: escalationRate <= 10 ? 'passing' : 'improving', description: 'Issues requiring human escalation (lower is better)' },
    ]

    const overallScore = Math.round(dccCriteria.reduce((sum, c) => {
      if (c.id === 'DCC-009') return sum + (c.current <= c.target ? 100 : (c.target / c.current) * 100)
      return sum + Math.min(100, (c.current / c.target) * 100)
    }, 0) / dccCriteria.length)
    const certified = dccCriteria.every(c => {
      if (c.id === 'DCC-009') return c.current <= c.target
      return c.current >= c.target
    })

    return NextResponse.json({
      criteria: dccCriteria,
      overallScore,
      certified,
      totalCriteria: dccCriteria.length,
      passingCriteria: dccCriteria.filter(c => {
        if (c.id === 'DCC-009') return c.current <= c.target
        return c.current >= c.target * 0.9
      }).length,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Enterprise DCC error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
