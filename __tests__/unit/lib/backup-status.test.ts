// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_AGE_HOURS,
  evaluateBackupHealth,
  redactExcerpt,
  type BackupHealth,
} from '@/lib/backup/status';

/**
 * Backup health rules.
 *
 * The production backup failed three days running and nobody noticed, because the
 * only record of an attempt was a workflow run. These tests pin the behaviour that
 * makes the failure visible: absence is a verdict, staleness is a verdict, and a
 * snapshot nobody restored is not a verified backup.
 */

const NOW = new Date('2026-11-27T12:00:00Z');

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * 3_600_000);
}

function row(overrides: Partial<Parameters<typeof evaluateBackupHealth>[0][number]> = {}) {
  return {
    environment: 'production',
    status: 'succeeded',
    stage: null as string | null,
    finishedAt: hoursAgo(6),
    restoreTested: true,
    restoreVerifiedAt: hoursAgo(6),
    artifactBytes: 12_345_678,
    checksum: 'a'.repeat(64),
    ...overrides,
  };
}

function evaluate(rows: ReturnType<typeof row>[], options: { maxAgeHours?: number } = {}): BackupHealth {
  return evaluateBackupHealth(rows, { environment: 'production', now: NOW, ...options });
}

describe('evaluateBackupHealth', () => {
  it('reports "never" when no attempt has completed', () => {
    const health = evaluate([]);
    expect(health.verdict).toBe('never');
    expect(health.lastSuccessAt).toBeNull();
    expect(health.actions.length).toBeGreaterThan(0);
  });

  it('does not treat a running attempt as evidence either way', () => {
    const health = evaluate([row({ status: 'running', finishedAt: null })]);
    expect(health.verdict).toBe('never');
  });

  it('is ok only when a recent success was also restore-verified', () => {
    const health = evaluate([row()]);
    expect(health.verdict).toBe('ok');
    expect(health.restoreEvidence).toBe(true);
    expect(health.ageHours).toBe(6);
    expect(health.actions).toHaveLength(0);
  });

  it('says unverified when a backup exists but no restore was proven', () => {
    const health = evaluate([row({ restoreTested: false, restoreVerifiedAt: null })]);
    expect(health.verdict).toBe('unverified');
    expect(health.reason).toMatch(/restore/i);
  });

  it('reports the failing stage of the most recent attempt', () => {
    const health = evaluate([row({ status: 'failed', stage: 'preflight', finishedAt: hoursAgo(1) }), row({ finishedAt: hoursAgo(26) })]);
    expect(health.verdict).toBe('failed');
    expect(health.lastStage).toBe('preflight');
    expect(health.reason).toContain('preflight');
    expect(health.consecutiveFailures).toBe(1);
  });

  it('counts consecutive failures and stops at the first success', () => {
    const health = evaluate([
      row({ status: 'failed', stage: 'secrets', finishedAt: hoursAgo(1) }),
      row({ status: 'failed', stage: 'secrets', finishedAt: hoursAgo(25) }),
      row({ status: 'failed', stage: 'secrets', finishedAt: hoursAgo(49) }),
      row({ finishedAt: hoursAgo(73) }),
    ]);
    expect(health.consecutiveFailures).toBe(3);
    expect(health.lastSuccessAt).toBe(hoursAgo(73).toISOString());
  });

  it('calls a series stale when the newest success is older than the limit', () => {
    const health = evaluate([row({ finishedAt: hoursAgo(DEFAULT_MAX_AGE_HOURS + 1), restoreVerifiedAt: hoursAgo(DEFAULT_MAX_AGE_HOURS + 1) })]);
    expect(health.verdict).toBe('stale');
    expect(health.reason).toMatch(new RegExp(String(DEFAULT_MAX_AGE_HOURS)));
  });

  it('allows the age limit to be configured per environment', () => {
    const rows = [row({ finishedAt: hoursAgo(20), restoreVerifiedAt: hoursAgo(20) })];
    expect(evaluate(rows, { maxAgeHours: 48 }).verdict).toBe('ok');
    expect(evaluate(rows, { maxAgeHours: 12 }).verdict).toBe('stale');
  });

  it('ignores other environments', () => {
    const health = evaluate([row({ environment: 'staging', finishedAt: hoursAgo(1) })]);
    expect(health.verdict).toBe('never');
  });

  it('surfaces artifact size and checksum from the last success', () => {
    const health = evaluate([row({ artifactBytes: 987_654 }), row({ status: 'failed', finishedAt: hoursAgo(0.5) })]);
    expect(health.lastArtifactBytes).toBe(987_654);
    expect(health.lastChecksum).toBe('a'.repeat(64));
  });
});

describe('redactExcerpt', () => {
  it('removes credentials embedded in connection strings', () => {
    const redacted = redactExcerpt('connect failed: mysql://alo:hunter2@db.internal:3306/agentos refused')!;
    expect(redacted).not.toContain('hunter2');
    expect(redacted).toContain('***:***@');
    expect(redacted).toContain('db.internal');
  });

  it('removes key=value secrets of many shapes', () => {
    const redacted = redactExcerpt('MYSQL_PASSWORD=s3cretvalue API_TOKEN: abcdef123456 PRIVATE_KEY=xyz')!;
    expect(redacted).not.toContain('s3cretvalue');
    expect(redacted).not.toContain('abcdef123456');
    expect(redacted).toContain('MYSQL_PASSWORD=***');
  });

  it('removes private key bodies and bearer tokens', () => {
    const text = [
      '-----BEGIN OPENSSH PRIVATE KEY-----',
      'b3BlbnNzaC1rZXktdjEAAAAA',
      '-----END OPENSSH PRIVATE KEY-----',
      'Authorization: Bearer abcdefghijklmnopqrstuvwxyz',
      'jwt eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature',
    ].join('\n');
    const redacted = redactExcerpt(text)!;
    expect(redacted).not.toContain('b3BlbnNzaC1rZXktdjEAAAAA');
    expect(redacted).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(redacted).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
  });

  it('caps the length and keeps null for empty input', () => {
    expect(redactExcerpt('')).toBeNull();
    expect(redactExcerpt(null)).toBeNull();
    expect(redactExcerpt('x'.repeat(5_000))!.length).toBeLessThanOrEqual(600);
  });

  it('leaves ordinary diagnostics readable', () => {
    const redacted = redactExcerpt('PREFLIGHT FAIL free disk space is below 2048 MiB')!;
    expect(redacted).toBe('PREFLIGHT FAIL free disk space is below 2048 MiB');
  });
});
