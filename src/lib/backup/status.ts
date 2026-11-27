/**
 * Backup health.
 *
 * The production backup failed on three consecutive days without anyone noticing,
 * and the reason is structural rather than personal: the only place the result
 * existed was a workflow run that nobody opens. This module turns each attempt
 * into a row, derives the health of the whole backup series from those rows, and
 * raises an operator notification when the series is broken.
 *
 * Three design rules:
 *
 * 1. **Absence is a verdict.** No successful backup is `never`, not "fine because
 *    nothing complained". A checker that only reports failures cannot tell you the
 *    job stopped running.
 * 2. **Excerpts are redacted.** A failure excerpt is prose for a human; it must not
 *    carry a connection string, password, token or key. Redaction happens here, at
 *    the boundary, so every caller inherits it.
 * 3. **Alerts are deduplicated per state per day.** A broken backup must not page
 *    twelve times a day and train everyone to ignore it.
 */

import { db } from '@/lib/db';
import { notifyOperator } from '@/lib/notifications/operator';

export type BackupStatus = 'running' | 'succeeded' | 'failed';
export type BackupStage =
  | 'secrets'
  | 'preflight'
  | 'dump'
  | 'storage'
  | 'checksum'
  | 'publish'
  | 'restore'
  | 'unknown';

export type BackupVerdict = 'ok' | 'stale' | 'failed' | 'never' | 'unverified';

export interface BackupRunInput {
  environment?: string;
  status: BackupStatus;
  stage?: BackupStage;
  startedAt?: string | Date;
  finishedAt?: string | Date;
  databaseProvider?: string;
  artifactPath?: string;
  artifactBytes?: number;
  checksum?: string;
  restoreTested?: boolean;
  restoreVerifiedAt?: string | Date;
  commit?: string;
  failureExcerpt?: string;
  source?: 'workflow' | 'manual' | 'checker';
  metadata?: Record<string, unknown>;
}

export interface BackupHealth {
  verdict: BackupVerdict;
  /** Why the verdict is what it is, in one sentence a human can act on. */
  reason: string;
  environment: string;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  ageHours: number | null;
  consecutiveFailures: number;
  lastStatus: BackupStatus | null;
  lastStage: BackupStage | null;
  lastArtifactBytes: number | null;
  lastChecksum: string | null;
  restoreVerifiedAt: string | null;
  /** True only when the newest successful run also proves a restore. */
  restoreEvidence: boolean;
  /** Empty when healthy; otherwise what a human must do next. */
  actions: string[];
}

export const DEFAULT_MAX_AGE_HOURS = 36;
export const FAILURE_ALERT_THRESHOLD = 2;

const MAX_EXCERPT = 600;

/**
 * Remove anything that could be a credential from a free-text excerpt.
 *
 * Deliberately blunt: a backup excerpt is diagnostic prose, so losing a URL is an
 * acceptable cost for never carrying `DATABASE_URL=mysql://user:pass@host/db`.
 */
export function redactExcerpt(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let text = raw.slice(0, 4_000);

  // scheme://user:password@host
  text = text.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1***:***@');
  // Bare key=value / KEY: value pairs for anything credential-shaped.
  text = text.replace(
    /\b([A-Z0-9_]*(?:PASSWORD|PASSWD|SECRET|TOKEN|API_KEY|APIKEY|PRIVATE_KEY|CREDENTIAL)[A-Z0-9_]*)\s*[:=]\s*\S+/gi,
    '$1=***',
  );
  // Private key bodies.
  text = text.replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[redacted private key]');
  // Bearer tokens and JWTs.
  text = text.replace(/\bBearer\s+[A-Za-z0-9._-]{12,}/gi, 'Bearer ***');
  text = text.replace(/\beyJ[A-Za-z0-9._-]{20,}/g, '***jwt***');
  // Long high-entropy blobs (hex/base64 secrets) that survived the above.
  text = text.replace(/\b[A-Fa-f0-9]{40,}\b/g, '***');
  text = text.replace(/\b[A-Za-z0-9+/]{48,}={0,2}\b/g, '***');

  return text.trim().slice(0, MAX_EXCERPT);
}

function toDate(value: string | Date | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

interface HealthRow {
  environment: string;
  status: string;
  stage: string | null;
  finishedAt: Date | null;
  restoreTested: boolean;
  restoreVerifiedAt: Date | null;
  artifactBytes: bigint | number | null;
  checksum: string | null;
}

/**
 * Derive the health of one environment from its runs.
 *
 * `runs` must be newest-first; `running` rows are ignored for freshness because an
 * attempt that has not finished proves nothing either way.
 */
export function evaluateBackupHealth(
  runs: HealthRow[],
  options: { environment?: string; now?: Date; maxAgeHours?: number } = {},
): BackupHealth {
  const environment = options.environment ?? 'production';
  const now = options.now ?? new Date();
  const maxAgeHours = options.maxAgeHours ?? DEFAULT_MAX_AGE_HOURS;

  const relevant = runs.filter((run) => run.environment === environment);
  const completed = relevant.filter((run) => run.status === 'succeeded' || run.status === 'failed');
  const successes = completed.filter((run) => run.status === 'succeeded');
  const latestAttempt = completed[0] ?? null;
  const latestSuccess = successes[0] ?? null;

  let consecutiveFailures = 0;
  for (const run of completed) {
    if (run.status !== 'failed') break;
    consecutiveFailures += 1;
  }

  const lastSuccessDate = latestSuccess?.finishedAt ?? null;
  const ageHours = lastSuccessDate ? Math.round(((now.getTime() - lastSuccessDate.getTime()) / 3_600_000) * 10) / 10 : null;
  const restoreEvidence = Boolean(latestSuccess?.restoreTested && latestSuccess?.restoreVerifiedAt);

  const base: Omit<BackupHealth, 'verdict' | 'reason' | 'actions'> = {
    environment,
    lastAttemptAt: iso(latestAttempt?.finishedAt ?? null),
    lastSuccessAt: iso(lastSuccessDate),
    ageHours,
    consecutiveFailures,
    lastStatus: (latestAttempt?.status as BackupStatus) ?? null,
    lastStage: (latestAttempt?.stage as BackupStage) ?? null,
    lastArtifactBytes: latestSuccess?.artifactBytes == null ? null : Number(latestSuccess.artifactBytes),
    lastChecksum: latestSuccess?.checksum ?? null,
    restoreVerifiedAt: iso(latestSuccess?.restoreVerifiedAt ?? null),
    restoreEvidence,
  };

  if (!completed.length) {
    return {
      ...base,
      verdict: 'never',
      reason: `No completed backup has ever been recorded for ${environment}.`,
      actions: [
        'Run the "Verified production database backup" workflow and confirm it reaches the server.',
        'If it fails before contacting the host, check the required production SSH secrets — the workflow names the missing ones.',
      ],
    };
  }

  if (latestAttempt && latestAttempt.status === 'failed') {
    const stage = latestAttempt.stage && latestAttempt.stage !== 'unknown' ? ` at the ${latestAttempt.stage} stage` : '';
    return {
      ...base,
      verdict: 'failed',
      reason: `The most recent backup failed${stage}${consecutiveFailures > 1 ? ` (${consecutiveFailures} consecutive failures)` : ''}.`,
      actions: [
        'Open the workflow run annotations — the failing stage is reported there even when raw logs are unavailable.',
        'Do not treat the previous snapshot as current until a new verified backup exists.',
      ],
    };
  }

  if (ageHours !== null && ageHours > maxAgeHours) {
    return {
      ...base,
      verdict: 'stale',
      reason: `The newest successful backup is ${ageHours} hours old (limit ${maxAgeHours}).`,
      actions: [
        'Check whether the scheduled workflow is still running; a stale series usually means the schedule is disabled or the trigger was removed.',
        'Take a manual backup before any migration or deployment.',
      ],
    };
  }

  if (!restoreEvidence) {
    return {
      ...base,
      verdict: 'unverified',
      reason: 'A recent backup exists, but no isolated restore of it has been verified.',
      actions: [
        'Run the backup with restore verification (`backup.sh --verify-restore`) and record the result.',
        'Uploaded is not recoverable: an untested snapshot is a hypothesis.',
      ],
    };
  }

  return {
    ...base,
    verdict: 'ok',
    reason: `Verified backup ${ageHours ?? 0} hours old, with an isolated restore recorded.`,
    actions: [],
  };
}

export interface RecordBackupResult {
  id: string;
  health: BackupHealth;
  alerted: boolean;
}

/** Persist one attempt and evaluate what the series now looks like. */
export async function recordBackupRun(
  input: BackupRunInput,
  options: { now?: Date; maxAgeHours?: number } = {},
): Promise<RecordBackupResult> {
  const environment = (input.environment ?? 'production').slice(0, 64);
  const startedAt = toDate(input.startedAt) ?? new Date();
  const finishedAt = input.status === 'running' ? null : (toDate(input.finishedAt) ?? new Date());
  const restoreVerifiedAt = toDate(input.restoreVerifiedAt) ?? null;

  const created = await db.backupRun.create({
    data: {
      environment,
      status: input.status,
      stage: input.stage ?? null,
      startedAt,
      finishedAt,
      durationMs: finishedAt ? Math.max(0, finishedAt.getTime() - startedAt.getTime()) : null,
      databaseProvider: input.databaseProvider?.slice(0, 32) ?? null,
      artifactPath: input.artifactPath?.slice(0, 512) ?? null,
      artifactBytes: input.artifactBytes == null ? null : BigInt(Math.max(0, Math.trunc(input.artifactBytes))),
      checksum: input.checksum?.slice(0, 128) ?? null,
      restoreTested: Boolean(input.restoreTested),
      restoreVerifiedAt,
      commit: input.commit?.slice(0, 64) ?? null,
      failureExcerpt: redactExcerpt(input.failureExcerpt),
      source: input.source ?? 'workflow',
      metadata: input.metadata ? JSON.stringify(input.metadata).slice(0, 2_000) : null,
    },
    select: { id: true },
  });

  const health = await evaluateEnvironmentHealth(environment, options);
  const alerted = await alertOnHealth(health, options.now ?? new Date());

  return { id: created.id, health, alerted };
}

/** Read the newest runs for one environment and derive its health. */
export async function evaluateEnvironmentHealth(
  environment = 'production',
  options: { now?: Date; maxAgeHours?: number; take?: number } = {},
): Promise<BackupHealth> {
  const runs = await db.backupRun.findMany({
    where: { environment },
    orderBy: [{ finishedAt: 'desc' }, { createdAt: 'desc' }],
    take: options.take ?? 30,
    select: {
      environment: true,
      status: true,
      stage: true,
      finishedAt: true,
      restoreTested: true,
      restoreVerifiedAt: true,
      artifactBytes: true,
      checksum: true,
    },
  });
  return evaluateBackupHealth(runs, {
    environment,
    ...(options.now ? { now: options.now } : {}),
    ...(options.maxAgeHours ? { maxAgeHours: options.maxAgeHours } : {}),
  });
}

/**
 * Raise a notification when the backup series is broken.
 *
 * Deduplicated per verdict per UTC day, so a week-long outage produces one alert a
 * day rather than one per check. `ok` and `unverified` do not alert: the first is
 * healthy, the second is a documentation gap rather than an outage.
 */
export async function alertOnHealth(
  health: BackupHealth,
  now: Date = new Date(),
  companyId?: string,
): Promise<boolean> {
  const shouldAlert =
    health.verdict === 'failed' ||
    health.verdict === 'stale' ||
    health.verdict === 'never' ||
    health.consecutiveFailures >= FAILURE_ALERT_THRESHOLD;
  if (!shouldAlert) return false;

  // Platform-level infrastructure notifications: they are for the operator, not
  // for a customer. Without a tenant the notification is written unowned, which is
  // visible to super administrators only.
  const day = now.toISOString().slice(0, 10);
  const result = await notifyOperator({
    companyId: companyId ?? '',
    ...(companyId ? {} : { scope: 'platform' as const }),
    type: 'ops.backup',
    title: `Backup ${health.verdict}: ${health.environment}`,
    message: `${health.reason} ${health.actions[0] ?? ''}`.trim(),
    dedupeKey: `backup:${health.environment}:${health.verdict}:${day}`,
    evidence: { verdict: health.verdict, consecutiveFailures: health.consecutiveFailures, ageHours: health.ageHours },
  }).catch(() => ({ created: false }));

  return Boolean(result.created);
}
