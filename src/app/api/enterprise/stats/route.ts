import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { getConstitutionStats, getEnterpriseStats } from '@/lib/enterprise-spec'
import { db } from '@/lib/db'

export async function GET() {
  try {
    await requireAuth()

    const constitutionStats = getConstitutionStats()
    const enterpriseStats = getEnterpriseStats()

    // Live DB entity counts
    const [agentCount, departmentCount, sopCount, skillCount, promptCount, knowledgeCount, eventCount, engineCount, dataLakeCount] =
      await Promise.all([
        db.agent.count(),
        db.department.count(),
        db.enterpriseSOP.count(),
        db.skill.count(),
        db.promptTemplate.count(),
        db.knowledgeNode.count(),
        db.enterpriseEvent.count(),
        db.engineRecord.count(),
        db.dataLakeEntry.count(),
      ])

    return NextResponse.json({
      // Spec-derived constitution distribution
      constitution: {
        total: constitutionStats.total,
        byChapter: constitutionStats.byChapter,
        byPriority: constitutionStats.byPriority,
        byCategory: constitutionStats.byCategory,
      },
      // Spec-derived enterprise structure counts
      enterprise: {
        divisions: enterpriseStats.divisions,
        departments: enterpriseStats.departments,
        events: enterpriseStats.events,
        constitutionRules: enterpriseStats.constitutionRules,
        eventByPriority: enterpriseStats.eventByPriority,
      },
      // Live database entity counts
      db: {
        agents: agentCount,
        departments: departmentCount,
        sops: sopCount,
        skills: skillCount,
        prompts: promptCount,
        knowledgeNodes: knowledgeCount,
        events: eventCount,
        engineRecords: engineCount,
        dataLakeEntries: dataLakeCount,
      },
      // Backward compat: flat top-level numbers
      departments: enterpriseStats.departments,
      agents: agentCount,
      rules: enterpriseStats.constitutionRules,
      sops: sopCount,
      skills: skillCount,
      prompts: promptCount,
      knowledgeNodes: knowledgeCount,
      collaborations: 0,
      engineRecords: engineCount,
      events: Math.max(enterpriseStats.events, eventCount),
      dataLakeEntries: dataLakeCount,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Enterprise API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
