import { db } from '@/lib/db'
import { legacyTenant, tenantWhere, legacyAuthResponse } from '@/lib/api/legacy-session'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const tenant = await legacyTenant(request)
    const feedbackLogs = await db.feedbackLog.findMany({
      where: tenantWhere(tenant),
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    return NextResponse.json(feedbackLogs)
  } catch (error) {
    const authFailure = legacyAuthResponse(error)
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status })
    console.error('[Feedback List] Error:', error)
    return NextResponse.json(
      { error: 'Failed to list feedback logs' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenant = await legacyTenant(request)
    const body = await request.json()
    const { taskId, agentId, companyId: requestedCompanyId, category, content, fromUser } = body

    if (requestedCompanyId && requestedCompanyId !== tenant.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!category || !content) {
      return NextResponse.json(
        { error: 'category and content are required' },
        { status: 400 }
      )
    }

    const validCategories = ['correction', 'praise', 'complaint', 'suggestion']
    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: `category must be one of: ${validCategories.join(', ')}` },
        { status: 400 }
      )
    }

    const feedback = await db.feedbackLog.create({
      data: {
        taskId: taskId || null,
        agentId: agentId || null,
        companyId: tenant.companyId,
        category,
        content,
        fromUser: fromUser ?? false,
      },
    })

    return NextResponse.json(feedback, { status: 201 })
  } catch (error) {
    const authFailure = legacyAuthResponse(error)
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status })
    console.error('[Feedback Create] Error:', error)
    return NextResponse.json(
      { error: 'Failed to submit feedback' },
      { status: 500 }
    )
  }
}
