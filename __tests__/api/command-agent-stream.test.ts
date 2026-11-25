/**
 * Streaming Command Agent route (Phase C2).
 *
 * The stream is NDJSON with four frame types. These tests pin the wire contract
 * the panel depends on and prove that a failed run ends in an `error` frame —
 * never in a fabricated `final`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireAuthMock = vi.fn();
vi.mock('@/lib/api-auth', () => ({
  requireAuth: (...args: unknown[]) => requireAuthMock(...args),
  canManageCompany: (user: { role: string; companyRole?: string }) =>
    user.role === 'super_admin' || user.companyRole === 'owner' || user.companyRole === 'admin',
}));
vi.mock('@/lib/db', () => ({
  db: {
    company: {
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async () => ({ id: 'co_own', name: 'ALO Labs', slug: 'alo-labs', status: 'active' })),
    },
  },
}));
vi.mock('@/lib/security/rate-limiter', () => ({ checkEndpointLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock('@/lib/audit-events', () => ({ writeAuditEvent: vi.fn(async () => undefined) }));

const runMock = vi.fn();
vi.mock('@/lib/command-agent/agent', () => {
  class CompanyAIError extends Error {
    constructor(message: string, public status: number, public code: string, public requestId?: string) {
      super(message);
    }
  }
  return {
    runCommandAgent: (...args: unknown[]) => runMock(...(args as [])),
    CompanyAIError,
    COMMAND_AGENT_PROFILES: ['free_general', 'free_coding', 'free_reasoning', 'local_general', 'local_fast'],
  };
});

import { POST } from '@/app/api/command-agent/stream/route';

function post(body: unknown) {
  return POST(new NextRequest('http://localhost/api/command-agent/stream', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

function frames(text: string): Array<Record<string, unknown>> {
  return text.split('\n').filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthMock.mockResolvedValue({ userId: 'root', role: 'super_admin' });
  runMock.mockImplementation(async (input: { onEvent?: (event: unknown) => void }) => {
    input.onEvent?.({ seq: 1, at: '2026-11-25T10:00:00.000Z', type: 'run_started', data: { runId: 'run_1', profile: 'free_general' } });
    input.onEvent?.({ seq: 2, at: '2026-11-25T10:00:01.000Z', type: 'tool', data: { tool: 'get_weather', ok: true, durationMs: 120 } });
    input.onEvent?.({ seq: 3, at: '2026-11-25T10:00:02.000Z', type: 'final', data: { status: 'completed' } });
    return {
      content: 'It is sunny.', provider: 'groq', model: 'llama-free', profile: 'free_general',
      steps: 1, trace: [], images: [], skillsUsed: [], skillsRejected: [], approvals: [],
      status: 'completed', statusDetail: 'Answered', persisted: true, runId: 'run_1', eventCount: 3,
      routing: { attempts: 1, fallbackUsed: false, switches: 0, providers: ['groq'] },
    };
  });
});

describe('POST /api/command-agent/stream', () => {
  it('streams run identity, sequenced events and a real final frame', async () => {
    const response = await post({ message: 'Weather in Dhaka?', sessionId: 's1' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/x-ndjson');

    const parsed = frames(await response.text());
    expect(parsed[0]).toMatchObject({ type: 'event', event: { type: 'run_started' } });
    expect(parsed[1]).toMatchObject({ type: 'run', runId: 'run_1' });
    expect(parsed.filter((frame) => frame.type === 'event')).toHaveLength(3);
    const final = parsed.find((frame) => frame.type === 'final') as { result: { status: string; runId: string; eventCount: number } };
    expect(final.result).toMatchObject({ status: 'completed', runId: 'run_1', eventCount: 3 });
  });

  it('ends a failed run with an error frame instead of a final frame', async () => {
    const { CompanyAIError } = await import('@/lib/command-agent/agent');
    runMock.mockRejectedValue(new CompanyAIError('No free provider authorised', 503, 'NO_FREE_PROVIDER', 'req_9'));
    const response = await post({ message: 'hello' });
    const parsed = frames(await response.text());

    expect(parsed.some((frame) => frame.type === 'final')).toBe(false);
    expect(parsed.at(-1)).toMatchObject({ type: 'error', code: 'NO_FREE_PROVIDER' });
  });

  it('rejects unauthenticated and non-admin callers before running anything', async () => {
    requireAuthMock.mockRejectedValue(new Error('Unauthorized'));
    expect((await post({ message: 'hi' })).status).toBe(401);

    requireAuthMock.mockResolvedValue({ userId: 'u1', role: 'viewer', companyId: 'co_own', companyRole: 'employee' });
    expect((await post({ message: 'hi' })).status).toBe(403);
    expect(runMock).not.toHaveBeenCalled();
  });

  it('rejects malformed bodies', async () => {
    expect((await post({ message: '' })).status).toBe(400);
    expect((await post({ message: 'ok', profile: 'paid_magic' })).status).toBe(400);
  });
});
