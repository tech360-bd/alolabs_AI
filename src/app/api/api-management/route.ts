import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import crypto from 'crypto'

// ─── GET: API Management Overview ────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    // 1. Total API keys by type
    const keysByType = await db.companyApiKey.groupBy({
      by: ['keyType'],
      _count: { id: true },
    })
    const keyTypeCounts: Record<string, number> = {}
    for (const kt of keysByType) {
      keyTypeCounts[kt.keyType] = kt._count.id
    }

    // 2. Total requests today (from UsageLog)
    const requestsToday = await db.usageLog.count({
      where: { createdAt: { gte: todayStart } },
    })

    // 3. Rate limit hits (failed requests today = proxy for rate limit)
    const rateLimitHitsToday = await db.usageLog.count({
      where: {
        createdAt: { gte: todayStart },
        status: 'failed',
      },
    })

    // 4. Top API consumers (companies by request count today)
    const topConsumers = await db.usageLog.groupBy({
      by: ['companyId', 'companyName'],
      where: { createdAt: { gte: todayStart } },
      _count: { id: true },
      _sum: { tokensOrLocalUsed: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    })

    // 5. API response time distribution (computed from UsageLog durations)
    const recentLogs = await db.usageLog.findMany({
      where: {
        createdAt: { gte: todayStart },
        completedAt: { not: null },
      },
      select: {
        startedAt: true,
        completedAt: true,
      },
      take: 1000,
    })

    const responseTimes = recentLogs
      .map((log) => {
        if (!log.completedAt) return 0
        return log.completedAt.getTime() - log.startedAt.getTime()
      })
      .filter((t) => t > 0)
      .sort((a, b) => a - b)

    const avgResponseTime =
      responseTimes.length > 0
        ? responseTimes.reduce((s, t) => s + t, 0) / responseTimes.length
        : 0
    const p50 = percentile(responseTimes, 50)
    const p95 = percentile(responseTimes, 95)
    const p99 = percentile(responseTimes, 99)

    // 6. Error rate breakdown by endpoint category (using agentName as proxy)
    const errorBreakdown = await db.usageLog.groupBy({
      by: ['agentName'],
      where: {
        createdAt: { gte: todayStart },
        status: 'failed',
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    })

    // 7. Total keys active/suspended stats
    const totalKeys = await db.companyApiKey.count()
    const activeKeys = await db.companyApiKey.count({ where: { isActive: true } })
    const suspendedKeys = await db.companyApiKey.count({ where: { isActive: false } })

    return NextResponse.json({
      data: {
        keys: {
          total: totalKeys,
          active: activeKeys,
          suspended: suspendedKeys,
          byType: keyTypeCounts,
        },
        requests: {
          today: requestsToday,
          rateLimitHitsToday,
        },
        topConsumers: topConsumers.map((c) => ({
          companyId: c.companyId,
          companyName: c.companyName || 'Unknown',
          requestCount: c._count.id,
          tokensUsed: c._sum.tokensOrLocalUsed || 0,
        })),
        responseTimes: {
          avg: Math.round(avgResponseTime),
          p50: Math.round(p50),
          p95: Math.round(p95),
          p99: Math.round(p99),
          sampleSize: responseTimes.length,
        },
        errorBreakdown: errorBreakdown.map((e) => ({
          category: e.agentName || 'unknown',
          errorCount: e._count.id,
        })),
      },
    })
  } catch (error) {
    console.error('API management GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch API management data' }, { status: 500 })
  }
}

// ─── POST: Create a new API key ─────────────────────────────────────────────

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
    const { companyId, name, type = 'live', scopes = [], rateLimit = 1000, ipAllowlist = [] } = body

    if (!companyId || !name) {
      return NextResponse.json({ error: 'companyId and name are required' }, { status: 400 })
    }

    // Verify company exists
    const company = await db.company.findUnique({ where: { id: companyId } })
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    // Generate API key
    const rawKey = `alo_${type}_${crypto.randomBytes(32).toString('hex')}`
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex')
    const keyPrefix = rawKey.substring(0, 12)
    const keySuffix = rawKey.substring(rawKey.length - 4)

    const apiKey = await db.companyApiKey.create({
      data: {
        companyId,
        keyHash,
        keyPrefix,
        keySuffix,
        name,
        keyType: type,
        scopes: JSON.stringify(scopes),
        rateLimit: rateLimit ? parseInt(String(rateLimit)) : 1000,
        ipAllowlist: JSON.stringify(ipAllowlist),
        isActive: true,
      },
    })

    return NextResponse.json({
      data: {
        id: apiKey.id,
        name: apiKey.name,
        type: apiKey.keyType,
        prefix: keyPrefix,
        scopes: JSON.parse(apiKey.scopes),
        rateLimit: apiKey.rateLimit,
        status: apiKey.isActive ? 'active' : 'suspended',
        key: rawKey, // Only returned on creation
        createdAt: apiKey.createdAt,
      },
    })
  } catch (error) {
    console.error('API management POST error:', error)
    return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 })
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0
  const idx = Math.ceil((p / 100) * arr.length) - 1
  return arr[Math.max(0, idx)] || 0
}