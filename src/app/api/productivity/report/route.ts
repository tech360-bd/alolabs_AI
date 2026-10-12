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
    const productivityReports = await db.productivityReport.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    const totalReports = await db.productivityReport.count()

    const avgScores = await db.productivityReport.aggregate({
      _avg: {
        speedScore: true,
        qualityScore: true,
        reuseScore: true,
        errorScore: true,
        finalProductivityScore: true,
      },
    })

    const performanceScores = await db.agentPerformanceScore.findMany({
      orderBy: { calculatedAt: 'desc' },
      take: 100,
    })

    const avgPerformance = await db.agentPerformanceScore.aggregate({
      _avg: {
        successRate: true,
        errorRate: true,
        avgRuntimeMs: true,
        outputQualityScore: true,
        productivityScore: true,
      },
      _sum: {
        userCorrectionCount: true,
        blockedActionCount: true,
        approvalRequiredCount: true,
      },
    })

    const topPerformers = await db.agentPerformanceScore.findMany({
      where: { productivityScore: { gt: 0 } },
      orderBy: { productivityScore: 'desc' },
      take: 10,
    })

    return NextResponse.json({
      summary: {
        totalReports,
        averageScores: {
          speed: avgScores._avg.speedScore ?? 0,
          quality: avgScores._avg.qualityScore ?? 0,
          reuse: avgScores._avg.reuseScore ?? 0,
          error: avgScores._avg.errorScore ?? 0,
          overall: avgScores._avg.finalProductivityScore ?? 0,
        },
        averagePerformance: {
          successRate: avgPerformance._avg.successRate ?? 0,
          errorRate: avgPerformance._avg.errorRate ?? 0,
          avgRuntimeMs: avgPerformance._avg.avgRuntimeMs ?? 0,
          outputQuality: avgPerformance._avg.outputQualityScore ?? 0,
          productivityScore: avgPerformance._avg.productivityScore ?? 0,
          totalCorrections: avgPerformance._sum.userCorrectionCount ?? 0,
          totalBlockedActions: avgPerformance._sum.blockedActionCount ?? 0,
          totalApprovalRequired: avgPerformance._sum.approvalRequiredCount ?? 0,
        },
      },
      productivityReports,
      performanceScores,
      topPerformers,
    })
  } catch (error) {
    console.error('[Productivity Report] Error:', error)
    return NextResponse.json(
      { error: 'Failed to load productivity report' },
      { status: 500 }
    )
  }
}