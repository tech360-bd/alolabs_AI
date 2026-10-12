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
    const feedbackLogs = await db.feedbackLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    return NextResponse.json(feedbackLogs)
  } catch (error) {
    console.error('[Feedback List] Error:', error)
    return NextResponse.json(
      { error: 'Failed to list feedback logs' },
      { status: 500 }
    )
  }
}

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
    const { taskId, agentId, companyId, category, content, fromUser } = body

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
        companyId: companyId || null,
        category,
        content,
        fromUser: fromUser ?? false,
      },
    })

    return NextResponse.json(feedback, { status: 201 })
  } catch (error) {
    console.error('[Feedback Create] Error:', error)
    return NextResponse.json(
      { error: 'Failed to submit feedback' },
      { status: 500 }
    )
  }
}