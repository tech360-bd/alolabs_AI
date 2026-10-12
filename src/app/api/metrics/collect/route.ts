import { NextRequest, NextResponse } from 'next/server'
import { collectSystemMetrics } from '@/lib/metrics-collector'

// ──────────────────────────────────────────────
// POST /api/metrics/collect — trigger system metrics collection
// ──────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const metrics = await collectSystemMetrics()

    return NextResponse.json({
      data: metrics,
      message: 'System metrics collected and recorded successfully',
    })
  } catch (error) {
    console.error('Error collecting system metrics:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}