import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireMachineToken } from '@/lib/api/machine-auth';
import { writeAuditEvent } from '@/lib/audit-events';
import { claimApply, EnvironmentError } from '@/lib/environments/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/ops/environments/claim — a host collects the payload for one apply.
 *
 * This is the only endpoint that returns decrypted values, so it is the most
 * restricted one in the product: machine token only, no session path, and each call
 * names exactly one apply row. The response is `Cache-Control: no-store` because a
 * proxy that keeps a copy of this body keeps a copy of every credential.
 *
 * The audit records the apply, the host and the key *names* — never a value.
 */

const ClaimSchema = z
  .object({
    applyId: z.string().trim().min(1).max(191),
    hostRef: z.string().trim().min(1).max(191),
    /** A retried workflow may re-collect the payload for the same apply. */
    reclaim: z.boolean().optional(),
  })
  .strict();

export async function POST(request: NextRequest) {
  const auth = requireMachineToken(request, { unconfiguredMessage: 'Environment apply is not configured' });
  if (!auth.ok) return auth.response!;

  const parsed = ClaimSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid claim request', issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) },
      { status: 400 },
    );
  }

  try {
    const payload = await claimApply(parsed.data.applyId, {
      hostRef: parsed.data.hostRef,
      allowReclaim: parsed.data.reclaim === true,
    });

    await writeAuditEvent({
      action: 'environment.apply_claimed',
      resource: 'EnvironmentApply',
      resourceId: parsed.data.applyId,
      details: {
        hostRef: parsed.data.hostRef,
        project: payload.projectSlug,
        environment: payload.environment,
        version: payload.version,
        keys: Object.keys(payload.values).sort(),
      },
    }).catch(() => undefined);

    return NextResponse.json(payload, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    if (error instanceof EnvironmentError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: 'Claim failed' }, { status: 500 });
  }
}
