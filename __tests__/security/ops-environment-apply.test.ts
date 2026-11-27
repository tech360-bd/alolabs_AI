// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The two machine endpoints that can move a credential: claim (returns values) and
 * result (records an outcome). Both must be unreachable without the ops token, and
 * the claim response must never be cacheable.
 */

// The service is replaced wholesale rather than partially imported: importing the
// real module pulls in the Prisma client, and this test is about the HTTP boundary,
// not about the database. (The service rules are covered against a real database by
// `npm run verify:environments` and by the script tests.)
vi.mock('@/lib/environments/service', async () => {
  class EnvironmentError extends Error {
    constructor(message: string, readonly status: number, readonly code: string) {
      super(message);
    }
  }
  return {
    EnvironmentError,
    claimApply: vi.fn(async (applyId: string) => ({
      applyId,
      projectSlug: 'agentos',
      environment: 'staging',
      version: 3,
      checksum: 'b'.repeat(64),
      values: { API_KEY: 'sk-secret-value' },
    })),
    recordApplyResult: vi.fn(async (input: { outcome: string; healthCheck?: string }) => {
      if (input.outcome === 'succeeded' && !input.healthCheck) {
        throw new EnvironmentError('A successful apply must include the health check that proved it.', 400, 'invalid');
      }
      return { applyId: 'apply-1', status: input.outcome };
    }),
  };
});

vi.mock('@/lib/audit-events', () => ({ writeAuditEvent: vi.fn(async () => ({ id: 'audit-1' })) }));

import { claimApply, recordApplyResult } from '@/lib/environments/service';
import { POST as claim } from '@/app/api/ops/environments/claim/route';
import { POST as result } from '@/app/api/ops/environments/result/route';

const TOKEN = 'c'.repeat(32);

function post(url: string, body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`https://app.example.test${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const auth = { authorization: `Bearer ${TOKEN}` };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BACKUP_INGEST_TOKEN = TOKEN;
});

describe('POST /api/ops/environments/claim', () => {
  it('fails closed when the ops token is not configured', async () => {
    delete process.env.BACKUP_INGEST_TOKEN;
    const response = await claim(post('/api/ops/environments/claim', { applyId: 'a1', hostRef: 'h' }, auth));
    expect(response.status).toBe(503);
    expect(claimApply).not.toHaveBeenCalled();
  });

  it('rejects a wrong or missing bearer before touching a secret', async () => {
    expect((await claim(post('/api/ops/environments/claim', { applyId: 'a1', hostRef: 'h' }))).status).toBe(401);
    expect(
      (await claim(post('/api/ops/environments/claim', { applyId: 'a1', hostRef: 'h' }, { authorization: 'Bearer nope' }))).status,
    ).toBe(401);
    expect(claimApply).not.toHaveBeenCalled();
  });

  it('requires an apply id and a host reference', async () => {
    expect((await claim(post('/api/ops/environments/claim', { hostRef: 'h' }, auth))).status).toBe(400);
    expect((await claim(post('/api/ops/environments/claim', { applyId: 'a1' }, auth))).status).toBe(400);
    expect(claimApply).not.toHaveBeenCalled();
  });

  it('returns values without allowing a cache to keep them', async () => {
    const response = await claim(post('/api/ops/environments/claim', { applyId: 'a1', hostRef: 'runner-1' }, auth));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body.values.API_KEY).toBe('sk-secret-value');
    expect(claimApply).toHaveBeenCalledWith('a1', { hostRef: 'runner-1', allowReclaim: false });
  });

  it('passes a reclaim flag through for a retried workflow', async () => {
    await claim(post('/api/ops/environments/claim', { applyId: 'a1', hostRef: 'runner-1', reclaim: true }, auth));
    expect(claimApply).toHaveBeenCalledWith('a1', { hostRef: 'runner-1', allowReclaim: true });
  });
});

describe('POST /api/ops/environments/result', () => {
  it('is token-gated like claim', async () => {
    delete process.env.BACKUP_INGEST_TOKEN;
    expect((await result(post('/api/ops/environments/result', { applyId: 'a1', outcome: 'failed' }, auth))).status).toBe(503);
    process.env.BACKUP_INGEST_TOKEN = TOKEN;
    expect((await result(post('/api/ops/environments/result', { applyId: 'a1', outcome: 'failed' }))).status).toBe(401);
  });

  it('rejects an unknown outcome or extra fields', async () => {
    expect((await result(post('/api/ops/environments/result', { applyId: 'a1', outcome: 'probably' }, auth))).status).toBe(400);
    expect(
      (await result(post('/api/ops/environments/result', { applyId: 'a1', outcome: 'failed', extra: 1 }, auth))).status,
    ).toBe(400);
    expect(recordApplyResult).not.toHaveBeenCalled();
  });

  it('refuses to record success without a health check', async () => {
    const response = await result(post('/api/ops/environments/result', { applyId: 'a1', outcome: 'succeeded' }, auth));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/health check/i);
  });

  it('records a verified success and a failure', async () => {
    const success = await result(
      post('/api/ops/environments/result', { applyId: 'a1', outcome: 'succeeded', healthCheck: '/api/health 200' }, auth),
    );
    expect(success.status).toBe(200);
    expect((await success.json()).status).toBe('succeeded');

    const failure = await result(post('/api/ops/environments/result', { applyId: 'a1', outcome: 'failed', detail: 'reload failed' }, auth));
    expect(failure.status).toBe(200);
    expect((await failure.json()).status).toBe('failed');
  });
});
