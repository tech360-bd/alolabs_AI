import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

// GET /api/usage/workflows — workflow usage data with summaries
export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      db.workflowUsageSummary.findMany({
        skip,
        take: limit,
        orderBy: { calculatedAt: 'desc' },
      }),
      db.workflowUsageSummary.count(),
    ]);

    // Get total counts for stats
    const totalSuccess = data.reduce((sum, d) => sum + d.successCount, 0);
    const totalFailed = data.reduce((sum, d) => sum + d.failureCount, 0);

    return NextResponse.json({
      data,
      total,
      page,
      limit,
      stats: {
        totalRuns: totalSuccess + totalFailed,
        successCount: totalSuccess,
        failureCount: totalFailed,
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}