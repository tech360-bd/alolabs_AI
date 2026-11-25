import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/api-auth';
import { getSiteDoctorStatus, runSiteDoctor } from '@/lib/self-healing/site-doctor';
import { writeAuditEvent } from '@/lib/audit-events';

export const dynamic = 'force-dynamic';

/**
 * Site Doctor — internet-facing self-healing for the Super Admin Console.
 *
 * GET  → latest recorded probe per configured target + aggregate counts.
 * POST → run one probe + repair cycle NOW. Every attempt is persisted in
 *        SiteDoctorProbe; repeated failures are escalated to the audit
 *        ledger. Verdicts are verbatim — a failing target is reported as
 *        failing, never dressed up.
 *
 * Access: platform super_admin only.
 */

const RunSchema = z.object({
  targets: z.array(z.string().trim().url().max(500)).max(5).optional(),
}).strict();

export async function GET() {
  try {
    await requireRole('super_admin');
    const status = await getSiteDoctorStatus();
    return NextResponse.json({ success: true, ...status });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    console.error('[SiteDoctor] status failed:', error);
    return NextResponse.json({ error: 'Failed to read site doctor status' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireRole('super_admin');
    let parsed;
    try { parsed = RunSchema.safeParse(await request.json()); }
    catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const report = await runSiteDoctor({
      ...(parsed.data.targets ? { targets: parsed.data.targets } : {}),
      actorUserId: actor.userId,
    });

    await writeAuditEvent({
      actorUserId: actor.userId,
      action: 'site_doctor.manual_run',
      resource: 'site-doctor',
      details: { targets: report.targets, results: report.results },
    });

    return NextResponse.json({ success: true, ...report });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    console.error('[SiteDoctor] run failed:', error);
    return NextResponse.json({ error: 'Failed to run site doctor cycle' }, { status: 500 });
  }
}
