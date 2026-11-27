// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/backup/status', () => ({
  recordBackupRun: vi.fn(async (input: Record<string, unknown>) => ({
    id: 'backup-1',
    alerted: false,
    health: {
      verdict: 'ok',
      reason: 'recorded',
      consecutiveFailures: 0,
      ageHours: 1,
      restoreEvidence: true,
      environment: (input.environment as string) ?? 'production',
    },
  })),
}));

vi.mock('@/lib/audit-events', () => ({ writeAuditEvent: vi.fn(async () => ({ id: 'audit-1' })) }));

import { recordBackupRun } from '@/lib/backup/status';
import { POST } from '@/app/api/ops/backups/ingest/route';
import { constantTimeEqual, requireMachineToken } from '@/lib/api/machine-auth';

const TOKEN = 'a'.repeat(32);

function request(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('https://app.example.test/api/ops/backups/ingest', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const report = { status: 'succeeded' as const, environment: 'production', artifactBytes: 1024 };

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.BACKUP_INGEST_TOKEN;
});

describe('machine auth', () => {
  it('fails closed when the token is not configured', () => {
    const result = requireMachineToken(request(report));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not-configured');
    expect(result.response?.status).toBe(503);
  });

  it('fails closed when the configured token is too short to be a secret', () => {
    process.env.BACKUP_INGEST_TOKEN = 'short';
    const result = requireMachineToken(request(report, { authorization: 'Bearer short' }));
    expect(result.ok).toBe(false);
    expect(result.response?.status).toBe(503);
  });

  it('rejects a missing, wrong or malformed bearer', () => {
    process.env.BACKUP_INGEST_TOKEN = TOKEN;
    expect(requireMachineToken(request(report)).response?.status).toBe(401);
    expect(requireMachineToken(request(report, { authorization: 'Bearer nope' })).response?.status).toBe(401);
    expect(requireMachineToken(request(report, { authorization: `Basic ${TOKEN}` })).response?.status).toBe(401);
  });

  it('accepts the exact token', () => {
    process.env.BACKUP_INGEST_TOKEN = TOKEN;
    expect(requireMachineToken(request(report, { authorization: `Bearer ${TOKEN}` })).ok).toBe(true);
  });

  it('compares without leaking length-dependent timing through an early return', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
    expect(constantTimeEqual('', '')).toBe(true);
  });
});

describe('POST /api/ops/backups/ingest', () => {
  it('answers 503 when unconfigured, before parsing anything', async () => {
    const response = await POST(request(report, { authorization: `Bearer ${TOKEN}` }));
    expect(response.status).toBe(503);
    expect(recordBackupRun).not.toHaveBeenCalled();
  });

  it('rejects a wrong token without touching the database', async () => {
    process.env.BACKUP_INGEST_TOKEN = TOKEN;
    const response = await POST(request(report, { authorization: 'Bearer wrong' }));
    expect(response.status).toBe(401);
    expect(recordBackupRun).not.toHaveBeenCalled();
  });

  it('rejects an unknown field rather than silently ignoring it', async () => {
    process.env.BACKUP_INGEST_TOKEN = TOKEN;
    const response = await POST(
      request({ ...report, databaseUrl: 'mysql://user:pass@host/db' }, { authorization: `Bearer ${TOKEN}` }),
    );
    expect(response.status).toBe(400);
    expect(recordBackupRun).not.toHaveBeenCalled();
  });

  it('rejects a checksum that is not a sha256 digest', async () => {
    process.env.BACKUP_INGEST_TOKEN = TOKEN;
    const response = await POST(request({ ...report, checksum: 'not-a-digest' }, { authorization: `Bearer ${TOKEN}` }));
    expect(response.status).toBe(400);
  });

  it('records a valid report and returns the derived health', async () => {
    process.env.BACKUP_INGEST_TOKEN = TOKEN;
    const response = await POST(
      request(
        {
          status: 'failed',
          stage: 'preflight',
          failureExcerpt: 'PREFLIGHT FAIL free disk space is below 2048 MiB',
          checksum: 'b'.repeat(64),
        },
        { authorization: `Bearer ${TOKEN}` },
      ),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.health.verdict).toBe('ok');
    expect(recordBackupRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', stage: 'preflight', source: 'workflow' }),
    );
  });
});
