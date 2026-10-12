import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const [totalLearningReports, totalSuggestions, totalImprovements] = await Promise.all([
      db.learningReport.count(),
      db.automationSuggestion.count(),
      db.workflowImprovementRequest.count(),
    ])

    const approvedSuggestions = await db.automationSuggestion.count({
      where: { status: 'approved' },
    })

    const implementedSuggestions = await db.automationSuggestion.count({
      where: { status: 'implemented' },
    })

    const rejectedSuggestions = await db.automationSuggestion.count({
      where: { status: 'rejected' },
    })

    const suggestedSuggestions = await db.automationSuggestion.count({
      where: { status: 'suggested' },
    })

    const approvedImprovements = await db.workflowImprovementRequest.count({
      where: { status: 'approved' },
    })

    const rejectedImprovements = await db.workflowImprovementRequest.count({
      where: { status: 'rejected' },
    })

    const pendingImprovements = await db.workflowImprovementRequest.count({
      where: { status: 'pending' },
    })

    const recentLearningReports = await db.learningReport.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    const recentSuggestions = await db.automationSuggestion.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    const recentImprovements = await db.workflowImprovementRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    return NextResponse.json({
      summary: {
        learningReports: totalLearningReports,
        automationSuggestions: totalSuggestions,
        workflowImprovements: totalImprovements,
      },
      suggestionStats: {
        approved: approvedSuggestions,
        implemented: implementedSuggestions,
        rejected: rejectedSuggestions,
        suggested: suggestedSuggestions,
      },
      improvementStats: {
        approved: approvedImprovements,
        rejected: rejectedImprovements,
        pending: pendingImprovements,
      },
      recentLearningReports,
      recentSuggestions,
      recentImprovements,
    })
  } catch (error) {
    console.error('[Self Improvement Report] Error:', error)
    return NextResponse.json(
      { error: 'Failed to load self improvement report' },
      { status: 500 }
    )
  }
}