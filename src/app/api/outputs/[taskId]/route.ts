import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const { taskId } = await params

    const outputs = await db.output.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(outputs)
  } catch (error) {
    console.error('[Outputs] Error:', error)
    return NextResponse.json(
      { error: 'Failed to load outputs' },
      { status: 500 }
    )
  }
}