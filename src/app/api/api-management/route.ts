import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { legacyTenant, tenantWhere, legacyAuthResponse } from '@/lib/api/legacy-session'
import crypto from 'crypto'

// ─── GET: API Management Overview (Tenant-scoped) ────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const tenant = await legacyTenant(request)
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const keysByType = await db.companyApiKey.groupBy({
      by: ['keyType'],
      where: tenantWhere(tenant),
      _count: { id: true },
    })
    const keyTypeCounts: Record<string, number> = {}
    for (const kt of keysByType) {
      keyTypeCounts[kt.keyType] = kt._count.id
    }

    const requestsToday = await db.usageLog.count({
      where: tenantWhere(tenant, { createdAt: { gte: todayStart } }),
    })

    const rateLimitHitsToday = await db.usageLog.count({
      where: tenantWhere(tenant, {
        createdAt: { gte: todayStart },
        status: 'failed',
      }),
    })

    const topConsumers = await db.usageLog.groupBy({
      by: ['companyId', 'companyName'],
      where: tenantWhere(tenant, { createdAt: { gte: todayStart } }),
      _count: { id: true },
      _sum: { tokensOrLocalUsed: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    })

    const recentLogs = await db.usageLog.findMany({
      where: tenantWhere(tenant, {
        createdAt: { gte: todayStart },
        completedAt: { not: null },
      }),
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

    const errorBreakdown = await db.usageLog.groupBy({
      by: ['agentName'],
      where: tenantWhere(tenant, {
        createdAt: { gte: todayStart },
        status: 'failed',
      }),
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    })

    const totalKeys = await db.companyApiKey.count({ where: tenantWhere(tenant) })
    const activeKeys = await db.companyApiKey.count({ where: tenantWhere(tenant, { isActive: true }) })
    const suspendedKeys = await db.companyApiKey.count({ where: tenantWhere(tenant, { isActive: false }) })

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
    const authFailure = legacyAuthResponse(error)
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status })
    console.error('API management GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch API management data' }, { status: 500 })
  }
}

// ─── POST: Create a new API key (Tenant-scoped + admin/owner role) ───────────

export async function POST(request: NextRequest) {
  try {
    const tenant = await legacyTenant(request)
    if (!['owner', 'admin'].includes(tenant.companyRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { companyId: requestedCompanyId, name, type = 'live', scopes = [], rateLimit = 1000, ipAllowlist = [] } = body

    if (requestedCompanyId && requestedCompanyId !== tenant.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const company = await db.company.findUnique({ where: { id: tenant.companyId } })
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    const rawKey = `alo_${type}_${crypto.randomBytes(32).toString('hex')}`
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex')
    const keyPrefix = rawKey.substring(0, 12)
    const keySuffix = rawKey.substring(rawKey.length - 4)

    const apiKey = await db.companyApiKey.create({
      data: {
        companyId: tenant.companyId,
        createdBy: tenant.userId,
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
        key: rawKey,
        createdAt: apiKey.createdAt,
      },
    })
  } catch (error) {
    const authFailure = legacyAuthResponse(error)
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status })
    console.error('API management POST error:', error)
    return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 })
  }
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0
  const idx = Math.ceil((p / 100) * arr.length) - 1
  return arr[Math.max(0, idx)] || 0
}
