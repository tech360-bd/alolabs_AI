import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { fakeDb, resetAgentOsMocks } from '../helpers/fake-db';

vi.mock('@/lib/db', () => ({ db: fakeDb.db }));
vi.mock('@/lib/auth', () => ({ verifySessionToken: vi.fn(async () => ({ userId: 'u1' })) }));
// Rate limiting is covered by its own lib tests; keep gateway tests
// deterministic by allowing each case to choose the limiter outcome.
const checkEndpointLimitMock = vi.fn(async (..._args: unknown[]) => ({ allowed: true, remaining: 99, resetAt: Date.now() + 60_000, limit: 100 }));
vi.mock('@/lib/security/rate-limiter', () => ({ checkEndpointLimit: (...args: unknown[]) => checkEndpointLimitMock(...args) }));
vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => data }),
  },
}));

import { GET as getKnowledge, POST as postKnowledge } from '@/app/api/v1/knowledge/route';
import { POST as postInference } from '@/app/api/v1/models/inference/route';
import { GET as getAnalytics } from '@/app/api/v1/analytics/route';
import { CompanyAIError } from '@/lib/multi-tenant-ai/service';

type Request = import('next/server').NextRequest;
const makeRequest = (url: string, method: string, headers: Record<string, string> = {}, body?: unknown): Request => ({
  url,
  nextUrl: new URL(url),
  method,
  headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  json: async () => body ?? {},
} as unknown as Request);

const KEY_C1_READ = 'alo_knowledge_read_key_c1';
const KEY_C1_WRITE = 'alo_knowledge_write_key_c1';
const KEY_C2_READ = 'alo_knowledge_read_key_c2';

const mkKey = async (id: string, companyId: string, scopes: string[], plain: string) => {
  await fakeDb.db.companyApiKey.create({ data: {
    id, companyId, keyHash: createHash('sha256').update(plain).digest('hex'),
    isActive: true, scopes: JSON.stringify(scopes), name: id,
  } });
  return plain;
};

beforeEach(async () => {
  resetAgentOsMocks();
  checkEndpointLimitMock.mockClear();
  checkEndpointLimitMock.mockImplementation(async () => ({ allowed: true, remaining: 99, resetAt: Date.now() + 60_000, limit: 100 }));
  await fakeDb.db.company.create({ data: { id: 'c1', status: 'active', accountType: 'internal' } });
  await fakeDb.db.company.create({ data: { id: 'c2', status: 'active', accountType: 'internal' } });
  await fakeDb.db.user.create({ data: { id: 'u1', isActive: true, role: 'admin', email: 'u1@example.test', name: 'User 1' } });
  await fakeDb.db.companyUser.create({ data: { id: 'cu1', userId: 'u1', companyId: 'c1' } });
  await mkKey('k1', 'c1', ['knowledge:read', 'analytics:read'], KEY_C1_READ);
  await mkKey('k2', 'c1', ['knowledge:write', 'knowledge:read', 'models:execute'], KEY_C1_WRITE);
  await mkKey('k3', 'c2', ['knowledge:read'], KEY_C2_READ);
});

describe('/api/v1/knowledge', () => {
  it('denies a key without knowledge:read', async () => {
    const key = await mkKey('k4', 'c1', ['runs:read'], 'alo_runs_only_key');
    const res = await getKnowledge(makeRequest('https://x.test/api/v1/knowledge', 'GET', { 'x-api-key': key }));
    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toContain('knowledge:read');
  });

  it('lists only the caller company nodes and applies q/type filters', async () => {
    await fakeDb.db.knowledgeNode.create({ data: { nodeId: 'kn_a', companyId: 'c1', title: 'Admission Process', type: 'process', content: 'How enrolment works', updatedAt: new Date() } });
    await fakeDb.db.knowledgeNode.create({ data: { nodeId: 'kn_b', companyId: 'c1', title: 'Refund Rule', type: 'rule', content: '', updatedAt: new Date() } });
    await fakeDb.db.knowledgeNode.create({ data: { nodeId: 'kn_foreign', companyId: 'c2', title: 'Secret foreign node', type: 'rule', content: '', updatedAt: new Date() } });

    const all = await getKnowledge(makeRequest('https://x.test/api/v1/knowledge', 'GET', { 'x-api-key': KEY_C1_READ }));
    expect(all.status).toBe(200);
    const allBody = await all.json();
    expect(allBody.data.nodes).toHaveLength(2); // foreign node invisible
    expect(allBody.data.nodes.map((n: { nodeId: string }) => n.nodeId).sort()).toEqual(['kn_a', 'kn_b']);

    const search = await getKnowledge(makeRequest('https://x.test/api/v1/knowledge?q=admission', 'GET', { 'x-api-key': KEY_C1_READ }));
    const searchBody = await search.json();
    expect(searchBody.data.nodes).toHaveLength(1);
    expect(searchBody.data.nodes[0].nodeId).toBe('kn_a');
  });

  it('creates a node stamped with the caller companyId (c2 key cannot write into c1)', async () => {
    const res = await postKnowledge(makeRequest('https://x.test/api/v1/knowledge', 'POST',
      { 'x-api-key': KEY_C1_WRITE },
      { title: 'NRC Admission FAQ', type: 'document', content: 'Q&A content' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.nodeId).toMatch(/^kn_/);
    const stored = await fakeDb.db.knowledgeNode.findUnique({ where: { nodeId: body.data.nodeId } });
    expect(stored.companyId).toBe('c1');

    const c2Key = await mkKey('k5', 'c2', ['knowledge:write'], 'alo_c2_write_key');
    const res2 = await postKnowledge(makeRequest('https://x.test/api/v1/knowledge', 'POST',
      { 'x-api-key': c2Key },
      { title: 'C2 node', type: 'concept' }));
    const stored2 = await fakeDb.db.knowledgeNode.findUnique({ where: { nodeId: (await res2.json()).data.nodeId } });
    expect(stored2.companyId).toBe('c2');
  });

  it('rejects an invalid node type with 400', async () => {
    const res = await postKnowledge(makeRequest('https://x.test/api/v1/knowledge', 'POST',
      { 'x-api-key': KEY_C1_WRITE },
      { title: 'Bad', type: 'not-a-type' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('VALIDATION_ERROR');
  });
});

describe('/api/v1/models/inference', () => {
  const executeMock = vi.hoisted(() => vi.fn());
  vi.mock('@/lib/multi-tenant-ai/service', () => {
    class FakeCompanyAIError extends Error {
      constructor(message: string, public status: number, public code: string, public requestId?: string) { super(message); }
    }
    return { executeCompanyAIChat: executeMock, CompanyAIError: FakeCompanyAIError };
  });

  it('requires models:execute for API keys', async () => {
    const res = await postInference(makeRequest('https://x.test/api/v1/models/inference', 'POST',
      { 'x-api-key': KEY_C1_READ },
      { messages: [{ role: 'user', content: 'hi' }] }));
    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toContain('models:execute');
  });

  it('executes through the company AI gateway and maps the result', async () => {
    executeMock.mockResolvedValueOnce({
      requestId: 'req_1', provider: 'ollama-local', profile: 'free_general', estimatedCostUsd: 0,
      attempts: 1, fallbackUsed: false,
      response: { id: 'r1', content: 'Hello!', model: 'qwen2.5:7b', usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 }, finishReason: 'stop', latencyMs: 42, usageSource: 'provider_reported' },
    });

    const res = await postInference(makeRequest('https://x.test/api/v1/models/inference', 'POST',
      { 'x-api-key': KEY_C1_WRITE },
      { messages: [{ role: 'user', content: 'Say hello' }], idempotencyKey: 'idem-abc-12345' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.content).toBe('Hello!');
    expect(body.data.provider).toBe('ollama-local');
    expect(body.data.usage.totalTokens).toBe(7);
    // idempotency key reaches the gateway so duplicate execution is prevented there
    expect(executeMock.mock.calls[0][2].idempotencyKey).toBe('idem-abc-12345');
    // actor identity comes from the key, not the body (apiKey identity form)
    expect(executeMock.mock.calls[0][0]).toEqual({ companyId: 'c1', userId: 'apikey:k2', role: 'api' });
  });

  it('maps CompanyAIError status/code onto the v1 error envelope', async () => {
    executeMock.mockRejectedValueOnce(new CompanyAIError('budget exceeded', 402, 'BUDGET_EXCEEDED'));
    const res = await postInference(makeRequest('https://x.test/api/v1/models/inference', 'POST',
      { 'x-api-key': KEY_C1_WRITE },
      { messages: [{ role: 'user', content: 'hi' }] }));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error.code).toBe('BUDGET_EXCEEDED');
  });

  it('rejects an invalid routing profile with 400', async () => {
    const res = await postInference(makeRequest('https://x.test/api/v1/models/inference', 'POST',
      { 'x-api-key': KEY_C1_WRITE },
      { messages: [{ role: 'user', content: 'hi' }], profile: 'unlimited_paid' }));
    expect(res.status).toBe(400);
  });
});

describe('/api/v1/analytics', () => {
  it('aggregates only the caller company usage inside the window', async () => {
    const now = new Date();
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days ago
    await fakeDb.db.tokenUsage.create({ data: { id: 't1', companyId: 'c1', model: 'qwen2.5:7b', promptTokens: 100, completionTokens: 50, totalTokens: 150, costEstimate: 0, createdAt: now } });
    await fakeDb.db.tokenUsage.create({ data: { id: 't2', companyId: 'c1', model: 'qwen2.5:7b', promptTokens: 10, completionTokens: 5, totalTokens: 15, costEstimate: 0, createdAt: now } });
    await fakeDb.db.tokenUsage.create({ data: { id: 't3', companyId: 'c1', model: 'deepseek-v3', promptTokens: 7, completionTokens: 3, totalTokens: 10, costEstimate: 0.01, createdAt: now } });
    await fakeDb.db.tokenUsage.create({ data: { id: 't4', companyId: 'c1', model: 'old-model', promptTokens: 999, completionTokens: 0, totalTokens: 999, costEstimate: 9, createdAt: old } });
    await fakeDb.db.tokenUsage.create({ data: { id: 't5', companyId: 'c2', model: 'foreign', promptTokens: 500, completionTokens: 0, totalTokens: 500, costEstimate: 1, createdAt: now } });

    const res = await getAnalytics(makeRequest('https://x.test/api/v1/analytics?days=30', 'GET', { 'x-api-key': KEY_C1_READ }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.totals).toEqual({ requests: 3, promptTokens: 117, completionTokens: 58, totalTokens: 175, costEstimate: 0.01 });
    expect(body.data.byModel[0].model).toBe('qwen2.5:7b');
    expect(body.data.byModel).toHaveLength(2);
    expect(body.data.byDay).toHaveLength(1);
  });

  it('honours the model filter', async () => {
    await fakeDb.db.tokenUsage.create({ data: { id: 't6', companyId: 'c1', model: 'a', promptTokens: 1, completionTokens: 1, totalTokens: 2, costEstimate: 0, createdAt: new Date() } });
    await fakeDb.db.tokenUsage.create({ data: { id: 't7', companyId: 'c1', model: 'b', promptTokens: 5, completionTokens: 5, totalTokens: 10, costEstimate: 0, createdAt: new Date() } });
    const res = await getAnalytics(makeRequest('https://x.test/api/v1/analytics?model=a', 'GET', { 'x-api-key': KEY_C1_READ }));
    const body = await res.json();
    expect(body.data.byModel).toHaveLength(1);
    expect(body.data.byModel[0].model).toBe('a');
    expect(body.data.totals.requests).toBe(1);
  });
});

describe('v1 gateway rate limiting', () => {
  it('returns a uniform 429 when the limiter denies the tenant', async () => {
    checkEndpointLimitMock.mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000, limit: 100 });
    const res = await getKnowledge(makeRequest('https://x.test/api/v1/knowledge', 'GET', { 'x-api-key': KEY_C1_READ }));
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe('RATE_LIMITED');
  });
});
