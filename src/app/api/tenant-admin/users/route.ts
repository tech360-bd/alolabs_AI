import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { tenantTarget } from '@/lib/api/secure-route'

// GET: List users for a tenant (from CompanyUser table joined with User)
export async function GET(request: NextRequest) {
  try {
    const user = await requireRole('super_admin', 'admin')
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')

    if (!companyId) {
      return NextResponse.json({ error: 'companyId query parameter is required' }, { status: 400 })
    }
    const target = tenantTarget(user, companyId)
    if (!target.ok) return NextResponse.json({ error: target.error }, { status: target.status })

    const company = await db.company.findUnique({ where: { id: companyId } })
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    const companyUsers = await db.companyUser.findMany({
      where: { companyId },
      include: {
        company: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    const userIds = companyUsers.map((cu) => cu.userId)
    const users = userIds.length > 0
      ? await db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, name: true, role: true, isActive: true, lastLoginAt: true },
        })
      : []

    const userMap = new Map(users.map((u) => [u.id, u]))

    const enriched = companyUsers.map((cu) => ({
      id: cu.id,
      userId: cu.userId,
      companyId: cu.companyId,
      tenantRole: cu.role,
      joinedAt: cu.createdAt,
      user: userMap.get(cu.userId) ?? null,
    }))

    return NextResponse.json({ users: enriched, total: enriched.length })
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message === 'Forbidden' ? 'Forbidden' : 'Unauthorized' }, { status: error.message === 'Forbidden' ? 403 : 401 })
    }
    console.error('Error listing tenant users:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: Add user to tenant
export async function POST(request: NextRequest) {
  try {
    // `admin` is the acting principal; `user` below is the invited account.
    const admin = await requireRole('super_admin', 'admin')
    const body = await request.json()
    const { companyId, userId, role } = body

    if (!companyId || !userId) {
      return NextResponse.json({ error: 'companyId and userId are required' }, { status: 400 })
    }
    const target = tenantTarget(admin, companyId)
    if (!target.ok) return NextResponse.json({ error: target.error }, { status: target.status })

    const company = await db.company.findUnique({ where: { id: companyId } })
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    const user = await db.user.findUnique({ where: { id: userId } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const existing = await db.companyUser.findUnique({
      where: { companyId_userId: { companyId, userId } },
    })

    if (existing) {
      return NextResponse.json({ error: 'User is already a member of this company' }, { status: 409 })
    }

    const companyUser = await db.companyUser.create({
      data: { companyId, userId, role: role || 'operator' },
    })

    return NextResponse.json({ companyUser }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message === 'Forbidden' ? 'Forbidden' : 'Unauthorized' }, { status: error.message === 'Forbidden' ? 403 : 401 })
    }
    console.error('Error adding user to tenant:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: Remove user from tenant
export async function DELETE(request: NextRequest) {
  try {
    const user = await requireRole('super_admin', 'admin')
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')
    const userId = searchParams.get('userId')

    if (!companyId || !userId) {
      return NextResponse.json({ error: 'companyId and userId query parameters are required' }, { status: 400 })
    }
    const target = tenantTarget(user, companyId)
    if (!target.ok) return NextResponse.json({ error: target.error }, { status: target.status })

    const existing = await db.companyUser.findUnique({
      where: { companyId_userId: { companyId, userId } },
    })

    if (!existing) {
      return NextResponse.json({ error: 'User is not a member of this company' }, { status: 404 })
    }

    await db.companyUser.delete({ where: { id: existing.id } })

    return NextResponse.json({ message: 'User removed from company successfully' })
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message === 'Forbidden' ? 'Forbidden' : 'Unauthorized' }, { status: error.message === 'Forbidden' ? 403 : 401 })
    }
    console.error('Error removing user from tenant:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
