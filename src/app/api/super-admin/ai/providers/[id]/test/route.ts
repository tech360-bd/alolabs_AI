import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { ProviderAdminError, testProviderConfig } from '@/lib/ai-router/provider-admin';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole('super_admin');
    const { id } = await params;
    // Connectivity probes are metadata-only. External chat probes could be billable.
    const result = await testProviderConfig(
      { userId: actor.userId, role: actor.role, companyId: actor.companyId ?? '' },
      id,
      { withChat: false },
    );
    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof Error && error.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (error instanceof ProviderAdminError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    console.error('[SuperAdmin Provider] Test failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
