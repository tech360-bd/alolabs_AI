// @vitest-environment node
/**
 * AI provider configuration lifecycle against a REAL database and a REAL
 * (local) OpenAI-compatible HTTP endpoint.
 *
 * Proves: keys are encrypted at rest and never serialised; tenant scoping of
 * configs and of routing; the connectivity test records a verdict; routing
 * decisions are persisted to ModelRoutingDecision; key rotation/deletion
 * propagate to the live router.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createRealDb, seedCompany, type RealDb } from '../helpers/real-db';
import { useRealFetch } from '../helpers/real-fetch';

const API_KEY = 'sk-live-provider-key-ABCDEF123456';
let server: http.Server;
let baseUrl = '';
let restoreFetch: () => void = () => undefined;
let real: RealDb;
let companyA: { id: string };
let companyB: { id: string };
let adminA: { userId: string; role: string; companyId: string };
let adminB: { userId: string; role: string; companyId: string };
let viewerA: { userId: string; role: string; companyId: string };

type ProviderAdmin = typeof import('@/lib/ai-router/provider-admin');
type AiRouterModule = typeof import('@/lib/ai-router');
let admin: ProviderAdmin;
let aiRouter: AiRouterModule;

beforeAll(async () => {
  process.env.ENCRYPTION_KEY = 'test-encryption-key-for-provider-configs-0123456789';
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_BASE_URL;
  process.env.ZAI_SDK_ENABLED = 'false';
  process.env.AI_PROVIDER_SYNC_MS = '0';

  restoreFetch = useRealFetch();
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (req.headers.authorization !== `Bearer ${API_KEY}`) return send(401, { error: { message: 'bad key' } });
      if (req.url === '/v1/models') return send(200, { data: [{ id: 'local-model' }] });
      if (req.url === '/v1/chat/completions') {
        const body = JSON.parse(raw) as { model: string };
        return send(200, {
          id: 'c-1',
          model: body.model,
          choices: [{ index: 0, message: { role: 'assistant', content: 'pong' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
        });
      }
      send(404, {});
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;

  real = await createRealDb('alo-provider-config');
  // createRealDb reset the module registry; import application modules after it.
  admin = await import('@/lib/ai-router/provider-admin');
  aiRouter = await import('@/lib/ai-router');
  aiRouter.__resetRouterBootstrapForTests();
  aiRouter.resetProviderRegistryState();

  companyA = await seedCompany(real.db, 'Provider Tenant A');
  companyB = await seedCompany(real.db, 'Provider Tenant B');
  const mkUser = async (email: string, role: string, companyId: string) => {
    const user = await real.db.user.create({ data: { email, name: email, role, passwordHash: 'x' } });
    await real.db.companyUser.create({ data: { userId: user.id, companyId, role: role === 'viewer' ? 'viewer' : 'admin' } });
    return { userId: user.id, role, companyId };
  };
  adminA = await mkUser('admin-a@example.test', 'admin', companyA.id);
  adminB = await mkUser('admin-b@example.test', 'admin', companyB.id);
  viewerA = await mkUser('viewer-a@example.test', 'viewer', companyA.id);
}, 120_000);

afterAll(async () => {
  restoreFetch();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await real?.cleanup();
});

describe('AI provider configuration (real DB + real HTTP)', () => {
  let configId = '';

  it('stores the API key encrypted and never serialises it', async () => {
    const view = await admin.createProviderConfig(adminA, {
      provider: 'openai-compatible',
      name: 'Local vLLM',
      baseUrl,
      apiKey: API_KEY,
      models: [{ id: 'local-model', contextLength: 8192, costPerMillionTokens: 0.5 }],
    });
    configId = view.id;
    expect(view.hasApiKey).toBe(true);
    expect(view.keyFingerprint).toMatch(/…3456 \(sha256:[0-9a-f]{12}\)/);
    expect(JSON.stringify(view)).not.toContain(API_KEY);

    const row = await real.db.aIProviderConfig.findUniqueOrThrow({ where: { id: configId } });
    expect(row.encryptedApiKey).toMatch(/^v1:/);
    expect(row.encryptedApiKey).not.toContain(API_KEY);
    expect(row.companyId).toBe(companyA.id);

    const audit = await real.db.auditLog.findFirst({ where: { action: 'provider.create', resource: 'ai-providers' } });
    expect(audit).not.toBeNull();
    expect(audit!.details).not.toContain(API_KEY);
  });

  it('refuses provider management to non-admins and to other tenants', async () => {
    await expect(
      admin.createProviderConfig(viewerA, { provider: 'openai-compatible', name: 'Nope', baseUrl, apiKey: API_KEY }),
    ).rejects.toMatchObject({ status: 403 });

    // Tenant B cannot see, update, test or delete tenant A's config.
    const listB = await admin.listProviderConfigs(adminB);
    expect(listB.find((c) => c.id === configId)).toBeUndefined();
    await expect(admin.updateProviderConfig(adminB, configId, { isEnabled: false })).rejects.toMatchObject({ status: 404 });
    await expect(admin.testProviderConfig(adminB, configId)).rejects.toMatchObject({ status: 404 });
    await expect(admin.deleteProviderConfig(adminB, configId)).rejects.toMatchObject({ status: 404 });

    // A tenant admin cannot create shared providers.
    await expect(
      admin.createProviderConfig(adminA, { provider: 'openai-compatible', name: 'Shared', baseUrl, apiKey: API_KEY, scope: 'global' }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('registers the configured provider in the router, scoped to its tenant', async () => {
    const router = await aiRouter.ensureRouterSynced({ force: true });
    const name = `openai-compatible:${companyA.id}.local-vllm`.toLowerCase();
    const summary = router.getProviderSummaries().find((p) => p.provider === name);
    expect(summary).toBeDefined();
    expect(summary!.companyId).toBe(companyA.id);

    // Tenant B gets "no provider" — never A's endpoint.
    await expect(
      router.chat({ model: 'local-model', messages: [{ role: 'user', content: 'x' }] }, companyB.id, 'agent-b'),
    ).rejects.toThrow(/No providers are available/);

    const response = await router.chat(
      { model: 'local-model', messages: [{ role: 'user', content: 'ping' }] },
      companyA.id,
      'agent-a',
      { runId: 'run-provider-test', taskType: 'integration' },
    );
    expect(response.content).toBe('pong');

    // Decisions are persisted asynchronously; wait briefly.
    await new Promise((r) => setTimeout(r, 150));
    const decisions = await real.db.modelRoutingDecision.findMany({ orderBy: { createdAt: 'asc' } });
    expect(decisions.length).toBeGreaterThanOrEqual(2);
    const denied = decisions.find((d) => d.companyId === companyB.id);
    expect(denied).toMatchObject({ success: false, errorCode: 'PROVIDER_UNAVAILABLE', selectedProvider: null });
    const served = decisions.find((d) => d.runId === 'run-provider-test');
    expect(served).toMatchObject({
      success: true,
      companyId: companyA.id,
      agentId: 'agent-a',
      selectedProvider: name,
      selectedModel: 'local-model',
      promptTokens: 5,
      completionTokens: 1,
      taskType: 'integration',
    });
    expect(served!.costUsd).toBeCloseTo((6 / 1_000_000) * 0.5, 12);
  });

  it('runs a real connectivity test and records the verdict', async () => {
    const result = await admin.testProviderConfig(adminA, configId, { withChat: true });
    expect(result.status).toBe('healthy');
    expect(result.models).toEqual(['local-model']);
    expect(result.chat).toMatchObject({ ok: true, model: 'local-model' });

    const row = await real.db.aIProviderConfig.findUniqueOrThrow({ where: { id: configId } });
    expect(row.lastHealthStatus).toBe('healthy');
    expect(row.lastHealthAt).not.toBeNull();
    expect(row.lastError).toBeNull();
  });

  it('detects a bad key on rotation and reports unauthorized without leaking it', async () => {
    const rotated = await admin.updateProviderConfig(adminA, configId, { apiKey: 'sk-rotated-but-wrong-9999' });
    expect(rotated.keyFingerprint).toMatch(/…9999/);
    expect(rotated.lastHealthStatus).toBeNull(); // verdict invalidated by the change

    const result = await admin.testProviderConfig(adminA, configId);
    expect(result.status).toBe('unauthorized');
    expect(JSON.stringify(result)).not.toContain('sk-rotated-but-wrong-9999');

    const router = await aiRouter.ensureRouterSynced({ force: true });
    await expect(
      router.chat({ model: 'local-model', messages: [{ role: 'user', content: 'x' }] }, companyA.id),
    ).rejects.toThrow(/401/);

    // Rotate back to the valid key: service restored.
    await admin.updateProviderConfig(adminA, configId, { apiKey: API_KEY });
    const ok = await (await aiRouter.ensureRouterSynced({ force: true })).chat(
      { model: 'local-model', messages: [{ role: 'user', content: 'x' }] },
      companyA.id,
    );
    expect(ok.content).toBe('pong');
  });

  it('disabling or deleting a config removes it from the router', async () => {
    const name = `openai-compatible:${companyA.id}.local-vllm`.toLowerCase();
    await admin.updateProviderConfig(adminA, configId, { isEnabled: false });
    let router = await aiRouter.ensureRouterSynced({ force: true });
    expect(router.getProvider(name as never)).toBeUndefined();

    await admin.updateProviderConfig(adminA, configId, { isEnabled: true });
    router = await aiRouter.ensureRouterSynced({ force: true });
    expect(router.getProvider(name as never)).toBeDefined();

    await admin.deleteProviderConfig(adminA, configId);
    router = await aiRouter.ensureRouterSynced({ force: true });
    expect(router.getProvider(name as never)).toBeUndefined();
    expect(await real.db.aIProviderConfig.count()).toBe(0);
  });

  it('refuses to store keys when ENCRYPTION_KEY is missing', async () => {
    const saved = process.env.ENCRYPTION_KEY;
    const savedApp = process.env.APP_SECRET;
    delete process.env.ENCRYPTION_KEY;
    delete process.env.APP_SECRET;
    try {
      await expect(
        admin.createProviderConfig(adminA, { provider: 'groq', name: 'Groq', apiKey: 'gsk_test_key_12345' }),
      ).rejects.toMatchObject({ status: 503, code: 'ENCRYPTION_NOT_CONFIGURED' });
    } finally {
      process.env.ENCRYPTION_KEY = saved;
      if (savedApp) process.env.APP_SECRET = savedApp;
    }
  });
});
