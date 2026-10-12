import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { fakeDb, resetAgentOsMocks } from '../helpers/fake-db';

vi.mock('@/lib/db', () => ({ db: fakeDb.db }));
vi.mock('@/lib/auth', () => ({ verifySessionToken: vi.fn(async () => ({ userId: 'u1' })) }));
vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => data }),
  },
}));

import { v1Handler } from '@/lib/v1';
import { GET as getEvents } from '@/app/api/v1/events/route';

type Request = import('next/server').NextRequest;
const makeRequest = (url: string, method: string, headers: Record<string, string> = {}): Request => ({
  url,
  nextUrl: new URL(url),
  method,
  headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  json: async () => ({}),
} as unknown as Request);

beforeEach(async () => {
  resetAgentOsMocks();
  await fakeDb.db.company.create({ data: { id: 'c1', status: 'active' } });
  await fakeDb.db.company.create({ data: { id: 'c2', status: 'active' } });
  await fakeDb.db.user.create({ data: { id: 'u1', isActive: true, role: 'admin', email: 'u1@example.test', name: 'User 1' } });
  await fakeDb.db.companyUser.create({ data: { id: 'cu1', userId: 'u1', companyId: 'c1' } });
  const key = 'alo_read_only_test_key';
  await fakeDb.db.companyApiKey.create({ data: {
    id: 'k1', companyId: 'c1', keyHash: createHash('sha256').update(key).digest('hex'),
    isActive: true, scopes: '["runs:read"]', name: 'read-only',
  } });
});

describe('v1 tenant and permission boundaries', () => {
  it('allows read-only key to read, denies write and execute', async () => {
    const handler = v1Handler(async () => 'called');
    const headers = { 'x-api-key': 'alo_read_only_test_key' };
    expect((await handler(makeRequest('https://example.test/api/v1/runs', 'GET', headers))).status).toBe(200);
    const write = await handler(makeRequest('https://example.test/api/v1/runs', 'POST', headers));
    expect(write.status).toBe(403);
    expect((await write.json()).error.message).toContain('runs:write');
    const execute = await handler(makeRequest('https://example.test/api/v1/command', 'POST', headers));
    expect(execute.status).toBe(403);
    expect((await execute.json()).error.message).toContain('runs:execute');
  });

  it('does not reveal another company’s run events even when runId is guessed', async () => {
    await fakeDb.db.agentOSRun.create({ data: { id: 'foreign-run', objective: 'private', status: 'completed', companyId: 'c2' } });
    await fakeDb.db.runEvent.create({ data: { id: 'event-1', runId: 'foreign-run', type: 'run.completed', data: '{"secret":"x"}' } });
    const result = await getEvents(makeRequest('https://example.test/api/v1/events?runId=foreign-run', 'GET', { 'x-api-key': 'alo_read_only_test_key' }));
    expect(result.status).toBe(403); // key lacks events:read
    const session = await getEvents(makeRequest('https://example.test/api/v1/events?runId=foreign-run', 'GET', { authorization: 'Bearer session' }));
    expect(session.status).toBe(404);
  });

  it('rejects a malformed scope list rather than granting wildcard access', async () => {
    await fakeDb.db.companyApiKey.update({ where: { id: 'k1' }, data: { scopes: '{bad-json' } });
    const handler = v1Handler(async () => 'called');
    const response = await handler(makeRequest('https://example.test/api/v1/runs', 'GET', { 'x-api-key': 'alo_read_only_test_key' }));
    expect(response.status).toBe(403);
  });
});
