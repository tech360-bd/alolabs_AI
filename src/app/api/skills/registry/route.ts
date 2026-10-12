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
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)))
    const department = searchParams.get('department') || ''
    const search = searchParams.get('search') || ''

    // Build where clause
    const where: Record<string, unknown> = {}

    if (department) {
      where.category = { contains: department }
    }

    if (search) {
      Object.assign(where, {
        OR: [
          { name: { contains: search } },
          { title: { contains: search } },
          { category: { contains: search } },
          { purpose: { contains: search } },
        ],
      })
    }

    const skip = (page - 1) * limit

    const [skills, total] = await Promise.all([
      db.skill.findMany({
        where,
        select: {
          id: true,
          name: true,
          slug: true,
          category: true,
          categorySlug: true,
          title: true,
          version: true,
          status: true,
          riskLevel: true,
          requiresApproval: true,
          purpose: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      db.skill.count({ where }),
    ])

    return NextResponse.json({
      skills,
      total,
      page,
      limit,
    })
  } catch (error) {
    console.error('[Skills Registry] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch skill registry' },
      { status: 500 }
    )
  }
}