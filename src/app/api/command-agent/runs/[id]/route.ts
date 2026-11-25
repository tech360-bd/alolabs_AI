import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, type AuthenticatedUser } from '@/lib/api-auth';
import { authFailure } from '@/lib/api/route-errors';
import { canUseCommandAgent, resolveCommandCompany } from '@/lib/command-agent/access';
import { getCommandRun } from '@/lib/command-agent/run-store';

export const dynamic = 'force-dynamic';

/**
 * GET /api/command-agent/runs/[id] — the stored timeline of one command run.
 *
 * A reload must show the same events the operator saw live. The run is an
 * artifact scoped to the company, and this endpoint re-checks both the tenant
 * and the caller's role before returning anything.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let actor: AuthenticatedUser;
  try {
    actor = await requireAuth();
  } catch (error) {
    return authFailure(error) ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!canUseCommandAgent(actor)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  if (!id || id.length > 200) {
    return NextResponse.json({ error: 'Invalid run id' }, { status: 400 });
  }

  try {
    const company = await resolveCommandCompany(actor, request.nextUrl.searchParams.get('targetCompany'));
    if (!company) return NextResponse.json({ error: 'Target company not found or not accessible' }, { status: 404 });

    const run = await getCommandRun(id, company.id);
    if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });

    return NextResponse.json({ success: true, run, company: { id: company.id, name: company.name } });
  } catch (error) {
    const response = authFailure(error);
    if (response) return response;
    console.error('[Command Agent] run read failed:', error);
    return NextResponse.json({ error: 'Could not load the run' }, { status: 500 });
  }
}
