import { NextRequest, NextResponse } from 'next/server';
import { listAgentCapabilities } from '@/lib/agent-capability-registry';

/** Authenticated discovery endpoint. This exposes manifests only; it never executes plugins. */
export async function GET(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const category = params.get('category') || undefined;
  const status = params.get('status') || undefined;
  const search = params.get('search') || undefined;
  const capabilities = listAgentCapabilities({ category, status, search });
  return NextResponse.json({
    data: capabilities,
    total: capabilities.length,
    evidence: 'Repository manifests describe code presence only; they are not proof of live provider access, successful workflows, benchmark quality, or production deployment.',
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
