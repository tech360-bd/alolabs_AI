import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireMachineToken } from '@/lib/api/machine-auth';
import { writeAuditEvent } from '@/lib/audit-events';
import { EnvironmentError, recordApplyResult } from '@/lib/environments/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/ops/environments/result — the host reports what happened.
 *
 * A `succeeded` report without a health check is rejected: writing a file is not
 * evidence that the service is running it. The route records the outcome; it never
 * decides that an apply worked on its own.
 */

const ResultSchema = z
  .object({
    applyId: z.string().trim().min(1).max(191),
    outcome: z.enum(['succeeded', 'failed', 'rolled_back']),
    stage: z.string().trim().max(64).optional(),
    detail: z.string().max(2_000).optional(),
    healthCheck: z.string().trim().max(500).optional(),
    hostRef: z.string().trim().max(191).optional(),
  })
  .strict();

export async function POST(request: NextRequest) {
  const auth = requireMachineToken(request, { unconfiguredMessage: 'Environment apply is not configured' });
  if (!auth.ok) return auth.response!;

  const parsed = ResultSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid apply result', issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) },
      { status: 400 },
    );
  }

  try {
    const result = await recordApplyResult(parsed.data);
    await writeAuditEvent({
      action: `environment.apply_${parsed.data.outcome}`,
      resource: 'EnvironmentApply',
      resourceId: parsed.data.applyId,
      details: { stage: parsed.data.stage ?? null, healthCheck: parsed.data.healthCheck ?? null },
    }).catch(() => undefined);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof EnvironmentError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: 'Result could not be recorded' }, { status: 500 });
  }
}
