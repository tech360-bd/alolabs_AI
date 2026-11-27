import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { recordBackupRun } from '@/lib/backup/status';
import { requireMachineToken } from '@/lib/api/machine-auth';
import { writeAuditEvent } from '@/lib/audit-events';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * /api/ops/backups/ingest — the host workflow reports one backup attempt.
 *
 * This endpoint is machine-to-machine, so it cannot use a session cookie. It is
 * gated by `BACKUP_INGEST_TOKEN` (a long random value stored as a repository
 * secret), compared in constant time, and **fails closed**: if the token is not
 * configured the endpoint answers 503 rather than accepting anonymous writes.
 *
 * The payload is a status report, never a credential: the host sends what happened,
 * how big the artifact was and its checksum. The failure excerpt is redacted again
 * server-side before it is stored, so a careless caller cannot leak a password into
 * the database through this route.
 */

const IngestSchema = z
  .object({
    environment: z.string().trim().min(1).max(64).optional(),
    status: z.enum(['running', 'succeeded', 'failed']),
    stage: z
      .enum(['secrets', 'preflight', 'dump', 'storage', 'checksum', 'publish', 'restore', 'unknown'])
      .optional(),
    startedAt: z.string().datetime().optional(),
    finishedAt: z.string().datetime().optional(),
    databaseProvider: z.enum(['mysql', 'mariadb', 'sqlite', 'file', 'unknown']).optional(),
    artifactPath: z.string().max(512).optional(),
    artifactBytes: z.number().int().min(0).optional(),
    checksum: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
    restoreTested: z.boolean().optional(),
    restoreVerifiedAt: z.string().datetime().optional(),
    commit: z.string().max(64).optional(),
    failureExcerpt: z.string().max(4_000).optional(),
    source: z.enum(['workflow', 'manual', 'checker']).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export async function POST(request: NextRequest) {
  const auth = requireMachineToken(request, {
    unconfiguredMessage: 'Backup ingest is not configured',
  });
  if (!auth.ok) return auth.response!;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = IngestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid backup report', issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const recorded = await recordBackupRun({
    ...input,
    source: input.source ?? 'workflow',
  });

  await writeAuditEvent({
    action: 'ops.backup.reported',
    resource: 'BackupRun',
    resourceId: recorded.id,
    details: {
      status: input.status,
      stage: input.stage ?? null,
      environment: recorded.health.environment,
      verdict: recorded.health.verdict,
    },
  }).catch(() => undefined);

  return NextResponse.json(
    {
      id: recorded.id,
      health: {
        verdict: recorded.health.verdict,
        reason: recorded.health.reason,
        consecutiveFailures: recorded.health.consecutiveFailures,
        ageHours: recorded.health.ageHours,
        restoreEvidence: recorded.health.restoreEvidence,
      },
      alerted: recorded.alerted,
    },
    { status: 201 },
  );
}
