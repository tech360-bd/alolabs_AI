import { NextResponse, type NextRequest } from 'next/server';
import { verifySessionToken } from '@/lib/auth';

export async function authenticateBearerSession(request: NextRequest): Promise<{ userId: string } | NextResponse> {
  const authHeader = await (await import('next/headers')).headers();
  const authorization = authHeader.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const token = authorization.substring(7);
  const session = await verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return session;
}
