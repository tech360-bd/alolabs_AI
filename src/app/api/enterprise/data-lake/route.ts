import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(request.url)
    const source = searchParams.get('source')
    const category = searchParams.get('category')
    const limit = parseInt(searchParams.get('limit') || '100', 10)

    const where: Record<string, unknown> = {}
    if (source && source !== 'all') {
      where.source = source
    }
    if (category && category !== 'all') {
      where.category = category
    }

    const entries = await db.dataLakeEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    // Resolve department names for entries that have departmentId
    const deptIds = [...new Set(entries.map(e => e.departmentId).filter(Boolean) as string[])]
    const deptMap: Record<string, string> = {}
    if (deptIds.length > 0) {
      const depts = await db.department.findMany({
        where: { id: { in: deptIds } },
        select: { id: true, name: true },
      })
      for (const d of depts) deptMap[d.id] = d.name
    }

    const mapped = entries.map(e => ({
      id: e.id,
      source: e.source,
      category: e.category,
      format: e.format,
      size: e.size,
      department: e.departmentId ? (deptMap[e.departmentId] || 'Unknown') : 'System',
      retention: e.retention,
      tags: JSON.parse(e.tags || '[]'),
      createdAt: e.createdAt.toISOString(),
    }))

    // Aggregate stats
    const [totalCount, totalSizeResult, bySourceArr, byCategoryArr] = await Promise.all([
      db.dataLakeEntry.count({ where }),
      db.dataLakeEntry.aggregate({ where, _sum: { size: true } }),
      db.dataLakeEntry.groupBy({ by: ['source'], _count: { id: true }, where }),
      db.dataLakeEntry.groupBy({ by: ['category'], _count: { id: true }, where }),
    ])

    const bySource: Record<string, number> = Object.fromEntries(bySourceArr.map(r => [r.source, r._count.id]))
    const byCategory: Record<string, number> = Object.fromEntries(byCategoryArr.map(r => [r.category, r._count.id]))

    return NextResponse.json({
      entries: mapped,
      stats: { total: totalCount, bySource, byCategory, totalSize: totalSizeResult._sum.size || 0 },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Enterprise data-lake error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
