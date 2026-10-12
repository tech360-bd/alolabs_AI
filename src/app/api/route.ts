import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { verifySessionToken } = await import('@/lib/auth');
    const session = await verifySessionToken(token);
    if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    return NextResponse.json({
      name: 'ALO Labs Agent Hub API',
      version: '1.0.0',
      endpoints: 131,
      status: 'operational',
    });
  } catch (error) {
    console.error('[/api GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}