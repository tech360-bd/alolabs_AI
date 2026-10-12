import { NextRequest, NextResponse } from 'next/server';
import { evaluateProtection, ProtectionCheck } from '../route';

export async function POST(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const body: ProtectionCheck = await request.json();

    if (!body.action || typeof body.action !== 'string') {
      return NextResponse.json(
        { error: 'action is required and must be a string' },
        { status: 400 }
      );
    }

    const result = await evaluateProtection(body);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Protection Evaluate Error]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}