// @vitest-environment node
/**
 * CONTROLLED STAGING SIMULATION — explicitly simulated, not external proof.
 *
 * This test exercises the *real* production wiring end to end against local
 * HTTP servers:
 *   CRM contract stub  → credential stored encrypted → verification → 5 leads
 *   provider admin API → encrypted provider key → router registration → health
 *   real router        → draft generator → 5 Bengali drafts → artifacts
 *
 * The "AI provider" here is a local OpenAI-compatible stub, NOT a real model,
 * and the CRM is a local contract stub, NOT a staging CRM. Therefore:
 *   - preflight reports `provider_probe: "router"` (no test seam was injected),
 *     but the MODEL is simulated and this test can never be cited as real
 *     external acceptance;
 *   - `workflow_execution_ready: true` here proves the readiness wiring flips
 *     only after real prerequisites (credential + reachable provider) exist.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createRealDb, seedCompany, type RealDb } from '../helpers/real-db';
import { useRealFetch } from '../helpers/real-fetch';
import { encryptField } from '@/lib/security/field-encryption';
import { createHash } from 'node:crypto';

const CRM_KEY = 'sim-crm-read-only-key-0123456789';
const MODEL_KEY = 'sk-simulated-model-key-0123456789';
const MODEL_ID = 'sim-bengali-model';
const BENGALI =
  'প্রিয় শিক্ষার্থী, আপনার পড়াশোনার অগ্রগতি নিয়ে আমরা যোগাযোগ করছি। আমাদের শিক্ষক দল আপনার সাম্প্রতিক ফলাফল পর্যালোচনা করেছেন এবং পরবর্তী ধাপ নিয়ে আলোচনা করতে চান। আপনি কোন সময়ে কথা বলতে আগ্রহী, জানালে আমরা সেই অনুযায়ী সময় নির্ধারণ করব। ধন্যবাদ।';

let real: RealDb;
let restoreFetch: () => void = () => undefined;
let crmServer: http.Server;
let modelServer: http.Server;
let crmUrl = '';
let modelUrl = '';
let credentialId = '';
let company: { id: string };
const crmPaths: string[] = [];
const crmMethods: string[] = [];
const modelCalls: Array<{ model: string; leadId: string }> = [];

function leads() {
  return Array.from({ length: 5 }, (_, index) => ({
    id: `lead-${index + 1}-sim`,
    name: `Student ${index + 1}`,
    email: `student${index + 1}@staging.invalid`,
    stage: 'new',
    createdAt: new Date(Date.now() - index * 1000).toISOString(),
  }));
}

beforeAll(async () => {
  process.env.ENCRYPTION_KEY = 'staging-simulation-encryption-key-0123456789';
  process.env.ALO_ALLOW_INSECURE_INTEGRATION_TARGETS = 'true';
  process.env.ZAI_SDK_ENABLED = 'false';
  process.env.AI_PROVIDER_SYNC_MS = '0';
  delete process.env.OPENAI_API_KEY;
  delete process.env.CRM_FOLLOWUP_MODEL;

  restoreFetch = useRealFetch();
  real = await createRealDb('alo-staging-sim');
  company = await seedCompany(real.db, 'ALO Education Sim');

  crmServer = http.createServer((req, res) => {
    crmPaths.push(String(req.url ?? '').split('?')[0]);
    crmMethods.push(String(req.method ?? 'GET'));
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.headers.authorization !== `Bearer ${CRM_KEY}`) return send(401, { error: 'unauthorized' });
    if (req.url?.startsWith('/api/v1/capabilities')) {
      return send(200, { service: 'alo-education-sim', apiVersion: '1', permissions: ['leads:read'] });
    }
    if (req.url?.startsWith('/api/v1/leads')) return send(200, { data: leads() });
    send(404, { error: 'not found' });
  });
  await new Promise<void>((resolve) => crmServer.listen(0, '127.0.0.1', resolve));
  crmUrl = `http://127.0.0.1:${(crmServer.address() as AddressInfo).port}`;

  modelServer = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (req.headers.authorization !== `Bearer ${MODEL_KEY}`) return send(401, { error: { message: 'bad key' } });
      if (req.url === '/v1/models') return send(200, { data: [{ id: MODEL_ID }] });
      if (req.url === '/v1/chat/completions') {
        const body = JSON.parse(raw) as { model: string; messages: Array<{ content: string }> };
        const prompt = body.messages.map((m) => m.content).join('\n');
        const leadId = /"id":\s*"([^"]+)"/.exec(prompt)?.[1] ?? 'unknown';
        modelCalls.push({ model: body.model, leadId });
        return send(200, {
          id: `chat-${modelCalls.length}`,
          model: body.model,
          choices: [{ index: 0, message: { role: 'assistant', content: `${BENGALI} (${leadId})` }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 120, completion_tokens: 60, total_tokens: 180 },
        });
      }
      send(404, {});
    });
  });
  await new Promise<void>((resolve) => modelServer.listen(0, '127.0.0.1', resolve));
  modelUrl = `http://127.0.0.1:${(modelServer.address() as AddressInfo).port}/v1`;

  const credential = await real.db.integrationCredential.create({
    data: {
      companyId: company.id,
      integrationType: 'crm.alo-lead-api',
      name: 'Staging simulation CRM',
      baseUrl: crmUrl,
      encryptedSecret: encryptField(CRM_KEY),
      secretFingerprint: 'fp-sim',
      settings: JSON.stringify({ model: MODEL_ID }),
      createdBy: 'admin-sim',
    },
  });
  credentialId = credential.id;
}, 120_000);

afterAll(async () => {
  await new Promise<void>((resolve) => crmServer.close(() => resolve()));
  await new Promise<void>((resolve) => modelServer.close(() => resolve()));
  await real?.cleanup();
  restoreFetch();
});

describe('controlled staging simulation (SIMULATED MODEL — not external proof)', () => {
  it('reports execution NOT ready before a usable AI provider exists (registered-but-unhealthy does not count)', async () => {
    const { runCrmPreflight } = await import('@/lib/integrations/preflight');
    const { verifyCrmConnection } = await import('@/lib/integrations/connections');
    expect((await verifyCrmConnection({ companyId: company.id, credentialId })).state).toBe('connected');

    const report = await runCrmPreflight({ companyId: company.id, credentialId });
    expect(report.preflight_status).toBe('ok');
    expect(report.workflow_execution_ready).toBe(false);
    expect(report.ready).toBe(false);
    expect(report.missing_dependencies.map((d) => d.id)).toContain('ai_provider');
    expect(report.provider_probe).toBe('router');
  });

  it('becomes ready only after a real provider config is stored, registered and health-checked', async () => {
    const admin = await import('@/lib/ai-router/provider-admin');
    const actor = { userId: 'admin-sim', role: 'admin', companyId: company.id };
    const view = await admin.createProviderConfig(actor, {
      provider: 'openai-compatible',
      name: 'Simulated local model',
      baseUrl: modelUrl,
      apiKey: MODEL_KEY,
      models: [{ id: MODEL_ID, contextLength: 8192 }],
    });
    expect(view.hasApiKey).toBe(true);
    expect(JSON.stringify(view)).not.toContain(MODEL_KEY);

    // Real health check against the configured endpoint (the endpoint is a stub).
    const health = await admin.testProviderConfig(actor, view.id);
    expect(health).toMatchObject({ status: 'healthy' });
    expect(health.models).toContain(MODEL_ID);

    const router = await import('@/lib/ai-router');
    await router.ensureRouterSynced({ force: true });
    const ready = await router.getRouter().getReadyProviderSummaries();
    expect(ready.some((p) => p.models.includes(MODEL_ID))).toBe(true);

    const { runCrmPreflight } = await import('@/lib/integrations/preflight');
    const report = await runCrmPreflight({ companyId: company.id, credentialId });
    expect(report.preflight_status).toBe('ok');
    expect(report.provider_probe).toBe('router');
    expect(report.workflow_execution_ready).toBe(true);
    expect(report.ready).toBe(true);
    expect(report.missing_dependencies).toEqual([]);
    expect(JSON.stringify(report)).not.toContain(MODEL_KEY);
    expect(JSON.stringify(report)).not.toContain(CRM_KEY);
  });

  it('runs the workflow through the real router and persists 5 mapped drafts with checksums', async () => {
    const { executeLeadFollowupRun, enqueueLeadFollowup } = await import('@/lib/integrations/workflows/lead-followup');
    const { runId } = await enqueueLeadFollowup({ companyId: company.id, credentialId });
    const outcome = await executeLeadFollowupRun(runId);

    expect(outcome.status).toBe('completed');
    expect(outcome.summary?.draftCount).toBe(5);
    expect(outcome.summary?.provider).toContain('openai-compatible');
    expect(outcome.summary?.model).toBe(MODEL_ID);
    expect(outcome.summary?.promptTokens).toBe(600);
    expect(outcome.summary?.completionTokens).toBe(300);
    expect(outcome.summary?.deliveries).toBe('none');

    const artifacts = await real.db.artifact.findMany({ where: { runId } });
    const drafts = artifacts.filter((a) => a.name.startsWith('crm-followup-draft-'));
    expect(drafts).toHaveLength(5);
    for (const draft of drafts) {
      expect(draft.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(draft.checksum).toBe(`sha256:${createHash('sha256').update(draft.content, 'utf8').digest('hex')}`);
      const meta = JSON.parse(draft.metadata) as { leadId: string; delivery: string };
      expect(meta.delivery).toBe('none');
      expect(draft.content).toContain(meta.leadId);
    }
    expect([...new Set(drafts.map((d) => (JSON.parse(d.metadata) as { leadId: string }).leadId))].sort()).toEqual(
      leads().map((l) => l.id).sort(),
    );

    // The model stub was called once per lead with the pinned model id.
    expect(modelCalls).toHaveLength(5);
    expect(modelCalls.every((call) => call.model === MODEL_ID)).toBe(true);
    expect(modelCalls.map((call) => call.leadId).sort()).toEqual(leads().map((l) => l.id).sort());

    // CRM saw only documented GETs — no write, no message delivery.
    expect([...new Set(crmMethods)]).toEqual(['GET']);
    expect([...new Set(crmPaths)].sort()).toEqual(['/api/v1/capabilities', '/api/v1/leads']);

    const events = await real.db.runEvent.findMany({ where: { runId } });
    const types = events.map((e) => e.type);
    expect(types.filter((t) => t === 'ai.generation.completed')).toHaveLength(5);
    expect(types.filter((t) => t === 'draft.validated')).toHaveLength(5);
    expect(types.filter((t) => t === 'run.completed')).toHaveLength(1);
    expect(events.map((e) => e.data).join(' ')).not.toContain(CRM_KEY);
    expect(events.map((e) => e.data).join(' ')).not.toContain(MODEL_KEY);
  }, 120_000);
});
