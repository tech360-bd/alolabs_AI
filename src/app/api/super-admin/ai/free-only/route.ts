import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/api-auth';
import {
  FreeOnlyAdminError,
  getFreeOnlyStatus,
  listFreeOnlyAudit,
  setFreeOnlyMode,
} from '@/lib/ai-router/free-only-admin';

export const dynamic = 'force-dynamic';

const UpdateSchema = z.object({
  enabled: z.boolean(),
  /** Required when disabling: opening paid routing must be an explicit act. */
  confirm: z.boolean().optional(),
});

function adminError(error: unknown) {
  if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (error instanceof Error && error.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (error instanceof FreeOnlyAdminError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  return null;
}

/** Current FREE-ONLY status + recent administrator change history. */
export async function GET() {
  try {
    await requireRole('super_admin');
    const status = await getFreeOnlyStatus();
    let audit: Awaited<ReturnType<typeof listFreeOnlyAudit>> = [];
    try {
      audit = await listFreeOnlyAudit();
    } catch (err) {
      console.error('[SuperAdmin FreeOnly] audit read failed:', err);
    }
    return NextResponse.json({ status, audit });
  } catch (error) {
    const response = adminError(error);
    if (response) return response;
    console.error('[SuperAdmin FreeOnly] GET failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Enable or disable the global FREE-ONLY operating mode.
 *
 * Fail-closed: the Settings row is persisted before the in-memory mode is
 * flipped, so a failed disable leaves the mode ENABLED. Every change is
 * written to the AuditEvent ledger with the previous and next value.
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await requireRole('super_admin');
    const parsed = UpdateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const result = await setFreeOnlyMode(
      { userId: actor.userId },
      parsed.data.enabled,
      { confirm: parsed.data.confirm },
    );
    return NextResponse.json({ status: result.status });
  } catch (error) {
    const response = adminError(error);
    if (response) return response;
    console.error('[SuperAdmin FreeOnly] POST failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
