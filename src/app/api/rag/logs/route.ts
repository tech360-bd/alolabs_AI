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
    const queries = await db.ragQuery.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    return NextResponse.json(queries)
  } catch (error) {
    console.error('[RAG Logs] Error:', error)
    return NextResponse.json(
      { error: 'Failed to load RAG query logs' },
      { status: 500 }
    )
  }
}