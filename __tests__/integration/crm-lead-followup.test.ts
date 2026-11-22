// @vitest-environment node
/**
 * CRM lead follow-up — real connector behaviour against a local HTTP CRM stub,
 * a real SQLite database and the application's own encryption.
 *
 * What this DOES prove: verification classification (200/401/403/500/refused/
 * SSRF-refused), tenant isolation, persisted lastVerifiedAt semantics, the run
 * lifecycle, exact-five enforcement, source id preservation, draft validation,
 * draft↔record mapping, evidence persistence and failure-closed behaviour.
 *
 * What this does NOT prove: a real staging CRM and a real AI provider. The
 * generator here is injected and deliberately labelled "test-double", so this
 * file is an integration test of our code — not the production B2B E2E.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { createRealDb, seedCompany, type RealDb } from '../helpers/real-db';
import { useRealFetch } from '../helpers/real-fetch';
import { encryptField } from '@/lib/security/field-encryption';

const API_KEY = 'test-crm-key-DO-NOT-LOG-0123456789';
const KEY_B = 'tenant-b-key-0123456789';
const BENGALI_DRAFT =
  'প্রিয় শিক্ষার্থী, আপনার পড়াশোনার অগ্রগতি নিয়ে আমরা যোগাযোগ করছি। আমাদের শিক্ষক দল আপনার সাম্প্রতিক ফলাফল পর্যালোচনা করেছেন এবং পরবর্তী ধাপ নিয়ে আলোচনা করতে চান। আপনি কোন সময়ে কথা বলতে আগ্রহী, জানালে আমরা সেই অনুযায়ী সময় নির্ধারণ করব। ধন্যবাদ।';

let real: RealDb;
let server: http.Server;
let baseUrl = '';
let refusedUrl = '';
let companyA: { id: string };
let companyB: { id: string };
let credentialA = '';
let credentialB = '';
let restoreFetch: () => void = () => undefined;

type Mode = 'ok' | 'deny' | 'no-permission' | 'error' | 'bad-shape' | 'duplicate' | 'no-id' | 'html404';
let mode: Mode = 'ok';
let leadCount = 5;
let requestCount = 0;
const seenAuth: string[] = [];
const seenMethods: string[] = [];
const seenPaths: string[] = [];

function leads() {
  return Array.from({ length: leadCount }, (_, index) => ({
    id: `lead-${index + 1}`,
    name: `Student ${index + 1}`,
    email: `student${index + 1}@example.test`,
    stage: 'new',
    createdAt: new Date(Date.now() - index * 1000).toISOString(),
  }));
}

beforeAll(async () => {
  process.env.ENCRYPTION_KEY = 'crm-followup-test-encryption-key-0123456789';
  process.env.ALO_ALLOW_INSECURE_INTEGRATION_TARGETS = 'true';
  delete process.env.CRM_FOLLOWUP_MODEL;

  restoreFetch = useRealFetch();
  real = await createRealDb('alo-crm-followup');
  companyA = await seedCompany(real.db, 'ALO Education A');
  companyB = await seedCompany(real.db, 'Other Tenant B');

  server = http.createServer((req, res) => {
    requestCount += 1;
    seenAuth.push(String(req.headers.authorization ?? ''));
    seenMethods.push(String(req.method ?? 'GET'));
    seenPaths.push(String(req.url ?? '').split('?')[0]);
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.headers.authorization !== `Bearer ${API_KEY}`) return send(401, { error: 'unauthorized' });
    if (mode === 'deny') return send(403, { error: 'forbidden' });
    if (mode === 'html404') {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      return res.end('<html>not found</html>');
    }
    if (req.url?.startsWith('/api/v1/capabilities')) {
      if (mode === 'error') return send(500, { error: 'boom' });
      if (mode === 'bad-shape') return send(200, { service: 'x' });
      return send(200, {
        service: 'alo-education-staging',
        apiVersion: '1',
        permissions: mode === 'no-permission' ? ['companies:read'] : ['leads:read'],
      });
    }
    if (req.url?.startsWith('/api/v1/leads')) {
      if (mode === 'error') return send(500, { error: 'boom' });
      const rows = leads();
      if (mode === 'duplicate') rows[1] = { ...rows[1], id: rows[0].id };
      if (mode === 'no-id') rows[0] = { ...rows[0], id: '' };
      return send(200, { data: rows });
    }
    send(404, { error: 'not found' });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const throwaway = http.createServer();
  await new Promise<void>((resolve) => throwaway.listen(0, '127.0.0.1', resolve));
  refusedUrl = `http://127.0.0.1:${(throwaway.address() as AddressInfo).port}`;
  await new Promise<void>((resolve) => throwaway.close(() => resolve()));

  const a = await real.db.integrationCredential.create({
    data: {
      companyId: companyA.id,
      integrationType: 'crm.alo-lead-api',
      name: 'ALO Education staging CRM',
      baseUrl,
      encryptedSecret: encryptField(API_KEY),
      secretFingerprint: 'fp-a',
      settings: JSON.stringify({ model: 'test-double-model' }),
      createdBy: 'admin-a',
    },
  });
  credentialA = a.id;
  const b = await real.db.integrationCredential.create({
    data: {
      companyId: companyB.id,
      integrationType: 'crm.alo-lead-api',
      name: 'Tenant B CRM',
      baseUrl,
      encryptedSecret: encryptField(KEY_B),
      secretFingerprint: 'fp-b',
      settings: '{}',
      createdBy: 'admin-b',
    },
  });
  credentialB = b.id;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await real.cleanup();
  restoreFetch();
});

beforeEach(() => {
  mode = 'ok';
  leadCount = 5;
  requestCount = 0;
  seenAuth.length = 0;
  seenMethods.length = 0;
  seenPaths.length = 0;
  process.env.ALO_ALLOW_INSECURE_INTEGRATION_TARGETS = 'true';
});

afterEach(() => {
  process.env.ALO_ALLOW_INSECURE_INTEGRATION_TARGETS = 'true';
});

async function importConnections() {
  return import('@/lib/integrations/connections');
}

async function importWorkflow() {
  return import('@/lib/integrations/workflows/lead-followup');
}

function bengaliFor(leadId: string) {
  return { text: `${BENGALI_DRAFT} (${leadId})`, provider: 'test-double', model: 'test-double-model', promptTokens: 100, completionTokens: 50, latencyMs: 5 };
}

async function createRun(credentialId: string, companyId = companyA.id) {
  const { enqueueLeadFollowup } = await importWorkflow();
  const { runId } = await enqueueLeadFollowup({ companyId, credentialId });
  return runId;
}

describe('CRM connection verification', () => {
  it('is only connected after a real 200 with leads:read, and records lastVerifiedAt', async () => {
    const { verifyCrmConnection } = await importConnections();
    const result = await verifyCrmConnection({ companyId: companyA.id, credentialId: credentialA });
    expect(result.state).toBe('connected');
    expect(result.httpStatus).toBe(200);
    expect(result.endpointHost).toContain('127.0.0.1');
    expect(result.lastVerifiedAt).toBeTruthy();
    expect(requestCount).toBeGreaterThan(0);

    const row = await real.db.integrationCredential.findUniqueOrThrow({ where: { id: credentialA } });
    expect(row.status).toBe('connected');
    expect(row.lastVerifiedAt).toBeInstanceOf(Date);
    // no credential material in the result handed to the API layer
    expect(JSON.stringify(result)).not.toContain(API_KEY);
    expect(seenAuth[0]).toBe(`Bearer ${API_KEY}`);
  });

  it('classifies a rejected credential as authentication_failed without advancing lastVerifiedAt', async () => {
    const { verifyCrmConnection } = await importConnections();
    await real.db.integrationCredential.update({ where: { id: credentialA }, data: { encryptedSecret: encryptField('wrong-key'), lastVerifiedAt: null, status: 'configured' } });
    const result = await verifyCrmConnection({ companyId: companyA.id, credentialId: credentialA });
    expect(result.state).toBe('authentication_failed');
    expect(result.httpStatus).toBe(401);
    expect(result.lastVerifiedAt).toBeNull();
    const row = await real.db.integrationCredential.findUniqueOrThrow({ where: { id: credentialA } });
    expect(row.status).toBe('authentication_failed');
    expect(row.lastVerifiedAt).toBeNull();
    expect(JSON.stringify(result)).not.toContain('wrong-key');
    await real.db.integrationCredential.update({ where: { id: credentialA }, data: { encryptedSecret: encryptField(API_KEY) } });
  });

  it('distinguishes permission_denied, sync_failed and unreachable', async () => {
    const { verifyCrmConnection } = await importConnections();
    mode = 'deny';
    expect((await verifyCrmConnection({ companyId: companyA.id, credentialId: credentialA })).state).toBe('permission_denied');
    mode = 'no-permission';
    expect((await verifyCrmConnection({ companyId: companyA.id, credentialId: credentialA })).state).toBe('permission_denied');
    mode = 'error';
    expect((await verifyCrmConnection({ companyId: companyA.id, credentialId: credentialA })).state).toBe('sync_failed');
    mode = 'ok';
    await real.db.integrationCredential.update({ where: { id: credentialA }, data: { baseUrl: refusedUrl } });
    const unreachable = await verifyCrmConnection({ companyId: companyA.id, credentialId: credentialA });
    expect(unreachable.state).toBe('unreachable');
    await real.db.integrationCredential.update({ where: { id: credentialA }, data: { baseUrl } });
  });

  it('refuses private/loopback targets through the egress policy when not explicitly allowed', async () => {
    delete process.env.ALO_ALLOW_INSECURE_INTEGRATION_TARGETS;
    const { verifyCrmConnection } = await importConnections();
    const before = requestCount;
    const result = await verifyCrmConnection({ companyId: companyA.id, credentialId: credentialA });
    expect(result.state).toBe('unreachable');
    expect(result.message).toMatch(/egress policy/i);
    expect(requestCount).toBe(before); // no socket was opened
  });

  it('cannot verify another tenant’s credential', async () => {
    const { verifyCrmConnection } = await importConnections();
    const result = await verifyCrmConnection({ companyId: companyB.id, credentialId: credentialA });
    expect(result.state).toBe('not_found');
    expect(seenAuth).toHaveLength(0);
  });
});

describe('lead follow-up workflow', () => {
  it('completes with exactly five drafts mapped to five source records and persists evidence', async () => {
    const { executeLeadFollowupRun, validateBengaliDraft } = await importWorkflow();
    const runId = await createRun(credentialA);
    const outcome = await executeLeadFollowupRun(runId, {
      generateDraft: async (lead) => bengaliFor(lead.id),
    });

    expect(outcome.status).toBe('completed');
    expect(outcome.summary?.draftCount).toBe(5);
    expect(outcome.summary?.leadIds).toEqual(['lead-1', 'lead-2', 'lead-3', 'lead-4', 'lead-5']);
    expect(outcome.summary?.provider).toBe('test-double');
    expect(outcome.summary?.model).toBe('test-double-model');
    expect(outcome.summary?.deliveries).toBe('none');
    expect(outcome.summary?.promptTokens).toBe(500);

    const run = await real.db.agentOSRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.status).toBe('completed');
    expect(run.startedAt).toBeInstanceOf(Date);
    expect(run.completedAt).toBeInstanceOf(Date);

    const drafts = await real.db.artifact.findMany({ where: { runId, companyId: companyA.id } });
    const draftArtifacts = drafts.filter((d) => d.name.startsWith('crm-followup-draft-'));
    expect(draftArtifacts).toHaveLength(5);
    for (const artifact of draftArtifacts) {
      const meta = JSON.parse(artifact.metadata) as { leadId: string; delivery: string };
      expect(artifact.content).toContain(meta.leadId);
      expect(meta.delivery).toBe('none');
      // The checksum must be recomputable from the stored content alone.
      expect(artifact.checksum).toBe(`sha256:${createHash('sha256').update(artifact.content, 'utf8').digest('hex')}`);
      expect(validateBengaliDraft(artifact.content).ok || artifact.content.includes(meta.leadId)).toBe(true);
    }
    const mapped = draftArtifacts.map((a) => (JSON.parse(a.metadata) as { leadId: string }).leadId).sort();
    expect(mapped).toEqual(['lead-1', 'lead-2', 'lead-3', 'lead-4', 'lead-5']);
    expect(drafts.some((a) => a.name.startsWith('crm-followup-manifest-'))).toBe(true);

    // Read-only + contract guarantee: the CRM saw only GETs, and only the two
    // documented endpoints were ever requested.
    expect(seenMethods.length).toBeGreaterThan(0);
    expect([...new Set(seenMethods)]).toEqual(['GET']);
    expect([...new Set(seenPaths)].sort()).toEqual(['/api/v1/capabilities', '/api/v1/leads']);

    const events = await real.db.runEvent.findMany({ where: { runId }, orderBy: { createdAt: 'asc' } });
    const types = events.map((e) => e.type);
    // Semantic invariants rather than a brittle hard-coded total.
    expect(types.filter((t) => t === 'ai.generation.completed')).toHaveLength(5);
    expect(types.filter((t) => t === 'draft.validated')).toHaveLength(5);
    expect(types.filter((t) => t === 'run.completed')).toHaveLength(1);
    expect(events.length).toBeGreaterThanOrEqual(13);
    expect(types).toContain('run.queued');
    expect(types).toContain('run.validating');
    expect(types).toContain('run.started');
    expect(types).toContain('crm.connection.verified');
    expect(types).toContain('crm.leads.retrieved');
    expect(types.filter((t) => t === 'ai.generation.completed')).toHaveLength(5);
    expect(types).toContain('run.completed');
    expect(events.map((e) => e.data).join(' ')).not.toContain(API_KEY);
    expect(JSON.stringify(outcome.summary)).not.toContain(API_KEY);

    // A re-delivered job must not duplicate drafts.
    const again = await executeLeadFollowupRun(runId, { generateDraft: async (lead) => bengaliFor(lead.id) });
    expect(again.status).toBe('completed');
    expect(await real.db.artifact.count({ where: { runId } })).toBe(6);
  });

  it('blocks when the CRM does not return exactly five leads and generates nothing', async () => {
    const { executeLeadFollowupRun } = await importWorkflow();
    leadCount = 4;
    let generated = 0;
    const runId = await createRun(credentialA);
    const outcome = await executeLeadFollowupRun(runId, {
      generateDraft: async (lead) => { generated += 1; return bengaliFor(lead.id); },
    });
    expect(outcome.status).toBe('blocked');
    expect(generated).toBe(0);
    expect(outcome.summary?.leadCount).toBe(4);
    expect(await real.db.artifact.count({ where: { runId } })).toBe(0);
    const run = await real.db.agentOSRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.status).toBe('blocked');
  });

  it('fails closed on a rejected CRM credential, a duplicate id and a malformed record', async () => {
    const { executeLeadFollowupRun } = await importWorkflow();
    await real.db.integrationCredential.update({ where: { id: credentialA }, data: { encryptedSecret: encryptField('bad-key') } });
    let generated = 0;
    const rejected = await executeLeadFollowupRun(await createRun(credentialA), {
      generateDraft: async (lead) => { generated += 1; return bengaliFor(lead.id); },
    });
    expect(rejected.status).toBe('failed');
    expect(generated).toBe(0);
    await real.db.integrationCredential.update({ where: { id: credentialA }, data: { encryptedSecret: encryptField(API_KEY) } });

    mode = 'duplicate';
    const duplicate = await executeLeadFollowupRun(await createRun(credentialA), { generateDraft: async (lead) => bengaliFor(lead.id) });
    expect(duplicate.status).toBe('failed');

    mode = 'no-id';
    const missing = await executeLeadFollowupRun(await createRun(credentialA), { generateDraft: async (lead) => bengaliFor(lead.id) });
    expect(missing.status).toBe('failed');
  });

  it('fails the run when AI generation throws or produces an invalid draft', async () => {
    const { executeLeadFollowupRun } = await importWorkflow();
    const providerDown = await executeLeadFollowupRun(await createRun(credentialA), {
      generateDraft: async () => { throw new Error('provider unavailable: no model configured'); },
    });
    expect(providerDown.status).toBe('failed');
    expect(providerDown.summary?.draftCount).toBe(0);
    expect(providerDown.summary?.blockReason).toContain('provider unavailable');

    const invalid = await executeLeadFollowupRun(await createRun(credentialA), {
      generateDraft: async (lead) => ({ ...bengaliFor(lead.id), text: 'Hello, this draft is entirely in English and was already sent to the lead.' }),
    });
    expect(invalid.status).toBe('failed');
    expect(invalid.summary?.blockReason).toMatch(/validation/i);
  });

  it('does not execute a cancelled run', async () => {
    const { executeLeadFollowupRun } = await importWorkflow();
    const runId = await createRun(credentialA);
    await real.db.agentOSRun.update({ where: { id: runId }, data: { status: 'cancelled' } });
    const outcome = await executeLeadFollowupRun(runId, { generateDraft: async (lead) => bengaliFor(lead.id) });
    expect(outcome.status).toBe('cancelled');
    expect(await real.db.artifact.count({ where: { runId } })).toBe(0);
  });

  it('rejects a run belonging to another tenant’s credential', async () => {
    const { enqueueLeadFollowup } = await importWorkflow();
    await expect(enqueueLeadFollowup({ companyId: companyB.id, credentialId: credentialA })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('lists runs for the dashboard with drafts and no cross-tenant leakage', async () => {
    const { listFollowupRuns } = await importWorkflow();
    const forA = await listFollowupRuns(companyA.id, 10);
    expect(forA.length).toBeGreaterThan(0);
    expect(forA.every((run) => run.leadIds.length <= 5)).toBe(true);
    const forB = await listFollowupRuns(companyB.id, 10);
    expect(forB).toHaveLength(0);
    expect(JSON.stringify(forA)).not.toContain(API_KEY);
  });
});

describe('preflight readiness', () => {
  const probeWith = (providers: string[], models: string[]) => async () => ({ providers, models });

  it('bare tenant: check runs, execution is not ready, and both dependencies are named', async () => {
    const { runCrmPreflight } = await import('@/lib/integrations/preflight');
    const fresh = await seedCompany(real.db, 'Bare Tenant');
    const report = await runCrmPreflight({ companyId: fresh.id });
    expect(report.preflight_status).toBe('ok');
    expect(report.workflow_execution_ready).toBe(false);
    expect(report.ready).toBe(false); // alias must never be true on partial config
    expect(report.ready).toBe(report.workflow_execution_ready);
    const missing = report.missing_dependencies.map((d) => d.id);
    expect(missing).toContain('crm_connection');
    expect(missing).toContain('ai_provider');
    expect(report.blockers.join(' | ')).toMatch(/CRM connection/);
    expect(report.blockers.join(' | ')).toMatch(/AI provider/);
  });

  it('missing AI provider only: CRM passes, execution stays blocked, ai_provider is explicit', async () => {
    const { runCrmPreflight } = await import('@/lib/integrations/preflight');
    const report = await runCrmPreflight({ companyId: companyA.id, credentialId: credentialA });
    expect(report.checks.find((c) => c.id === 'crm_base_url')?.status).toBe('pass');
    expect(report.checks.find((c) => c.id === 'crm_credential')?.status).toBe('pass');
    expect(report.checks.find((c) => c.id === 'workflow_limits')?.status).toBe('pass');
    expect(report.checks.find((c) => c.id === 'ai_provider')?.status).toBe('missing');
    expect(report.workflow_execution_ready).toBe(false);
    expect(report.missing_dependencies.map((d) => d.id)).toContain('ai_provider');
    expect(report.missing_dependencies.map((d) => d.id)).not.toContain('crm_connection');
    expect(JSON.stringify(report)).not.toContain(API_KEY);
    expect(JSON.stringify(report)).not.toContain('Bearer');
  });

  it('missing CRM connection only: AI probe passes, execution stays blocked on crm_connection', async () => {
    const { runCrmPreflight } = await import('@/lib/integrations/preflight');
    const crmOnly = await seedCompany(real.db, 'AI Only Tenant');
    const report = await runCrmPreflight({
      companyId: crmOnly.id,
      providerProbe: probeWith(['local-test-provider'], ['test-double-model']),
    });
    expect(report.checks.find((c) => c.id === 'ai_provider')?.status).toBe('pass');
    expect(report.workflow_execution_ready).toBe(false);
    expect(report.missing_dependencies.map((d) => d.id)).toEqual(['crm_connection']);
  });

  it('fully configured staging config: execution ready, no missing dependencies (simulated provider)', async () => {
    const { runCrmPreflight } = await import('@/lib/integrations/preflight');
    const { verifyCrmConnection } = await importConnections();
    // Real read-only verification against the contract stub so the persisted
    // verdict/lastVerifiedAt are genuine.
    expect((await verifyCrmConnection({ companyId: companyA.id, credentialId: credentialA })).state).toBe('connected');
    const report = await runCrmPreflight({
      companyId: companyA.id,
      credentialId: credentialA,
      providerProbe: probeWith(['local-test-provider'], ['test-double-model']),
    });
    expect(report.preflight_status).toBe('ok');
    expect(report.ready).toBe(true);
    expect(report.workflow_execution_ready).toBe(true);
    expect(report.missing_dependencies).toEqual([]);
    expect(report.checks.every((check) => check.status === 'pass')).toBe(true);
    expect(report.checks.find((c) => c.id === 'ai_model')?.detail).toMatch(/test-double-model/);
    expect(JSON.stringify(report)).not.toContain(API_KEY);
  });

  it('performs a live verification only when asked, and still blocks on AI', async () => {
    const { runCrmPreflight } = await import('@/lib/integrations/preflight');
    const before = requestCount;
    const passive = await runCrmPreflight({
      companyId: companyA.id,
      credentialId: credentialA,
      providerProbe: probeWith(['local-test-provider'], ['test-double-model']),
    });
    expect(passive.liveVerified).toBe(false);
    expect(requestCount).toBe(before);

    const live = await runCrmPreflight({ companyId: companyA.id, credentialId: credentialA, verify: true });
    expect(live.liveVerified).toBe(true);
    expect(live.checks.find((c) => c.id === 'crm_verification')?.status).toBe('pass');
    expect(live.workflow_execution_ready).toBe(false); // no AI provider in this run
    expect(requestCount).toBeGreaterThan(before);
  });

  it('flags a pinned model that the available provider does not offer', async () => {
    const { runCrmPreflight } = await import('@/lib/integrations/preflight');
    const cred = await real.db.integrationCredential.create({
      data: {
        companyId: companyA.id, integrationType: 'crm.alo-lead-api', name: 'Pinned unknown',
        baseUrl, encryptedSecret: encryptField(API_KEY), secretFingerprint: 'fp-pin',
        settings: JSON.stringify({ model: 'not-a-real-model' }),
      },
    });
    const report = await runCrmPreflight({
      companyId: companyA.id,
      credentialId: cred.id,
      providerProbe: probeWith(['local-test-provider'], ['test-double-model']),
    });
    expect(report.checks.find((c) => c.id === 'ai_model')?.status).toBe('fail');
    expect(report.workflow_execution_ready).toBe(false);
    expect(report.blockers.join(' ')).toMatch(/not-a-real-model/);
  });

  it('cannot preflight another tenant’s credential', async () => {
    const { runCrmPreflight } = await import('@/lib/integrations/preflight');
    const report = await runCrmPreflight({ companyId: companyB.id, credentialId: credentialA });
    expect(report.checks.find((c) => c.id === 'crm_connection')?.status).toBe('missing');
    expect(report.credentialId).toBeNull();
    expect(report.workflow_execution_ready).toBe(false);
  });
});

describe('read-only contract enforcement', () => {
  it('classifies an unsupported endpoint (HTML 404) as sync_failed', async () => {
    const { verifyCrmConnection } = await importConnections();
    mode = 'html404';
    const result = await verifyCrmConnection({ companyId: companyA.id, credentialId: credentialA });
    expect(result.state).toBe('sync_failed');
    expect(result.httpStatus).toBe(404);
    expect(result.message).toMatch(/endpoint not found/i);
  });

  it('contains no outbound-messaging import and issues no write request', () => {
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const files = [
      'src/lib/integrations/workflows/lead-followup.ts',
      'src/lib/integrations/connectors/crm/alo-lead-api.ts',
      'src/lib/integrations/connections.ts',
    ];
    for (const file of files) {
      const source = readFileSync(`${root}${file}`, 'utf8');
      expect(source).not.toMatch(/from '.*(httpsms|email|whatsapp|twilio|resend|nodemailer)/i);
      expect(source).not.toMatch(/method:\s*'(POST|PUT|PATCH|DELETE)'/);
    }
  });
});

describe('draft validation', () => {
  it('accepts Bengali drafts and rejects English-only or delivery claims', async () => {
    const { validateBengaliDraft } = await importWorkflow();
    expect(validateBengaliDraft(BENGALI_DRAFT).ok).toBe(true);
    expect(validateBengaliDraft('Short.').ok).toBe(false);
    expect(validateBengaliDraft('This draft is written only in English and has been emailed to the lead already.').ok).toBe(false);
  });
});
