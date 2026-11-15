// @vitest-environment node
/**
 * Acceptance tests: the client portal and the internal AgentOS platform are
 * separate surfaces. Real database, real route handlers, real sessions.
 *
 *   • a client can use the portal and nothing internal;
 *   • staff can use the internal tools and never the portal;
 *   • one client can never read or change another client's records;
 *   • nothing internal (agents, departments, models, costs, storage keys…)
 *     appears in any portal response;
 *   • registration can never mint a privileged login.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { createRealDb, type RealDb } from '../helpers/real-db';

// Legacy internal routes read the Authorization header through next/headers.
const incoming = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock('next/headers', () => ({
  headers: async () => incoming.headers,
  cookies: async () => ({ get: () => undefined }),
}));

type Handler = (request: NextRequest, segment?: { params: Promise<Record<string, string>> }) => Promise<Response>;

let real: RealDb;
let storageDir: string;
const tokens = { staff: '', superAdmin: '', clientA: '', clientB: '' };
const ids = { staff: '', clientA: '', clientB: '', companyA: '', companyB: '', internalCompany: '' };

function req(method: string, path: string, token: string, body?: unknown, extraHeaders: Record<string, string> = {}): NextRequest {
  const headers: Record<string, string> = { ...extraHeaders };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined && !(body instanceof FormData)) headers['content-type'] = 'application/json';
  incoming.headers = new Headers(headers);
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
  });
}

async function call(handler: Handler, request: NextRequest, params: Record<string, string> = {}) {
  const response = await handler(request, { params: Promise.resolve(params) });
  const text = await response.clone().text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* binary / empty */ }
  return { status: response.status, json, text, response };
}

async function route(path: string): Promise<Record<string, Handler>> {
  return (await import(`@/app/api/${path}/route`)) as Record<string, Handler>;
}

async function violations(type: string): Promise<number> {
  return real.db.securityEvent.count({ where: { type } });
}

beforeAll(async () => {
  real = await createRealDb('alo-client-separation');
  storageDir = mkdtempSync(join(tmpdir(), 'alo-client-storage-'));
  process.env.STORAGE_PROVIDER = 'local';
  process.env.STORAGE_LOCAL_PATH = storageDir;

  const { hashPassword, createSessionToken } = await import('@/lib/auth');
  const { provisionClientAccount, ensureServiceCatalogue } = await import('@/lib/client-services/operations');
  const passwordHash = await hashPassword('correct horse battery staple');
  const db = real.db;

  const internalCompany = await db.company.create({ data: { name: 'ALO Labs', slug: 'alo-labs', status: 'active', accountType: 'internal' } });
  const staff = await db.user.create({ data: { email: 'staff@alolabs.test', name: 'Staff Member', role: 'account_manager', passwordHash } });
  const superAdmin = await db.user.create({ data: { email: 'root@alolabs.test', name: 'Root', role: 'super_admin', passwordHash } });
  await db.companyUser.create({ data: { companyId: internalCompany.id, userId: staff.id, role: 'admin' } });
  await db.companyUser.create({ data: { companyId: internalCompany.id, userId: superAdmin.id, role: 'owner' } });

  const clientA = await db.user.create({ data: { email: 'a@client-a.test', name: 'Alice A', role: 'client', passwordHash } });
  const clientB = await db.user.create({ data: { email: 'b@client-b.test', name: 'Bob B', role: 'client', passwordHash } });
  const accountA = await provisionClientAccount({ userId: clientA.id, companyName: 'Client A Ltd', billingEmail: clientA.email });
  const accountB = await provisionClientAccount({ userId: clientB.id, companyName: 'Client B Ltd', billingEmail: clientB.email });
  await ensureServiceCatalogue();

  Object.assign(ids, {
    staff: staff.id, clientA: clientA.id, clientB: clientB.id,
    companyA: accountA.companyId, companyB: accountB.companyId, internalCompany: internalCompany.id,
  });
  tokens.staff = await createSessionToken(staff.id);
  tokens.superAdmin = await createSessionToken(superAdmin.id);
  tokens.clientA = await createSessionToken(clientA.id);
  tokens.clientB = await createSessionToken(clientB.id);
}, 120_000);

afterAll(async () => {
  await real?.cleanup();
  if (storageDir) rmSync(storageDir, { recursive: true, force: true });
});

describe('who may enter which surface', () => {
  it('admits a client to the portal', async () => {
    const { GET } = await route('portal/dashboard');
    const result = await call(GET, req('GET', '/api/portal/dashboard', tokens.clientA));
    expect(result.status).toBe(200);
  });

  it('refuses staff — even a Super Admin — on the client portal API', async () => {
    const { GET } = await route('portal/dashboard');
    for (const token of [tokens.staff, tokens.superAdmin]) {
      const result = await call(GET, req('GET', '/api/portal/dashboard', token));
      expect(result.status).toBe(401);
      expect(result.text).not.toContain('Client A');
    }
  });

  it('refuses an anonymous caller on both surfaces', async () => {
    expect((await call((await route('portal/dashboard')).GET, req('GET', '/api/portal/dashboard', ''))).status).toBe(401);
    expect((await call((await route('internal/clients')).GET, req('GET', '/api/internal/clients', ''))).status).toBe(401);
  });

  it('refuses a client on the internal client-management API and records it', async () => {
    const before = await violations('client_to_internal_denied');
    const { GET } = await route('internal/clients');
    const result = await call(GET, req('GET', '/api/internal/clients', tokens.clientA));
    expect([401, 403, 404]).toContain(result.status);
    expect(result.text).not.toContain('Client B');
    expect(await violations('client_to_internal_denied')).toBeGreaterThan(before);
    expect((await call(GET, req('GET', '/api/internal/clients', tokens.staff))).status).toBe(200);
  });

  it('refuses a client on the legacy internal APIs (agents, users, engines, companies)', async () => {
    for (const path of ['agents', 'users', 'enterprise/engines', 'companies', 'sister-companies']) {
      const { GET } = await route(path);
      const result = await call(GET, req('GET', `/api/${path}`, tokens.clientA));
      expect([401, 403, 404], `${path} → ${result.status}`).toContain(result.status);
    }
  });

  it('lets staff, not clients, read the access-violation log', async () => {
    const { GET } = await route('internal/security/access-violations');
    expect((await call(GET, req('GET', '/api/internal/security/access-violations', tokens.clientA))).status).not.toBe(200);
    const asRoot = await call(GET, req('GET', '/api/internal/security/access-violations', tokens.superAdmin));
    expect(asRoot.status).toBe(200);
  });
});

describe('the proxy routes each audience to its own surface', () => {
  const page = (path: string, cookie: string) =>
    new NextRequest(`http://localhost${path}`, { headers: { cookie: `session-token=${cookie}` } });

  it('sends a client away from /dashboard and staff away from /portal', async () => {
    const { proxy } = await import('@/proxy');
    const client = proxy(page('/dashboard', tokens.clientA));
    expect(client.status).toBeGreaterThanOrEqual(300);
    expect(new URL(client.headers.get('location')!).pathname).toBe('/portal');

    const staff = proxy(page('/portal/projects', tokens.staff));
    expect(new URL(staff.headers.get('location')!).pathname).toBe('/dashboard');
  });

  it('never forwards a client API call to an internal handler', async () => {
    const { proxy } = await import('@/proxy');
    for (const path of ['/api/agents', '/api/internal/clients', '/api/v1/runs', '/api/departments']) {
      const response = proxy(new NextRequest(`http://localhost${path}`, { headers: { authorization: `Bearer ${tokens.clientA}` } }));
      expect(response.headers.get('x-middleware-rewrite') ?? '', path).toContain('/api/access-denied');
    }
  });

  it('never forwards a staff API call to a portal handler', async () => {
    const { proxy } = await import('@/proxy');
    const response = proxy(new NextRequest('http://localhost/api/portal/projects', { headers: { authorization: `Bearer ${tokens.staff}` } }));
    expect(response.headers.get('x-middleware-rewrite') ?? '').toContain('/api/access-denied');
  });

  it('lets each audience through to its own API', async () => {
    const { proxy } = await import('@/proxy');
    const client = proxy(new NextRequest('http://localhost/api/portal/projects', { headers: { authorization: `Bearer ${tokens.clientA}` } }));
    expect(client.headers.get('x-middleware-rewrite')).toBeNull();
    const staff = proxy(new NextRequest('http://localhost/api/internal/clients', { headers: { authorization: `Bearer ${tokens.staff}` } }));
    expect(staff.headers.get('x-middleware-rewrite')).toBeNull();
  });
});

describe('tenant isolation between clients', () => {
  let projectA = '';
  let documentA = '';

  it('lets client A request a service and see the project', async () => {
    const { POST, GET } = await route('portal/projects');
    const created = await call(POST, req('POST', '/api/portal/projects', tokens.clientA, {
      title: 'Automate our invoice approvals',
      requirements: 'We approve about 300 invoices a month by email and want one tracked workflow.',
      serviceSlug: 'business-process-automation',
      acceptTerms: true,
    }));
    expect(created.status, created.text).toBe(200);
    projectA = created.json.project.id;
    expect(created.json.project.status).toBe('requested');

    const listA = await call(GET, req('GET', '/api/portal/projects', tokens.clientA));
    expect(listA.json.projects.map((p: { id: string }) => p.id)).toContain(projectA);
  });

  it('hides it from client B: lists, direct id, messages, documents', async () => {
    const list = await call((await route('portal/projects')).GET, req('GET', '/api/portal/projects', tokens.clientB));
    expect(list.json.projects).toEqual([]);

    const before = await violations('cross_tenant_access_denied');
    const direct = await call((await route('portal/projects/[id]')).GET, req('GET', `/api/portal/projects/${projectA}`, tokens.clientB), { id: projectA });
    expect(direct.status).toBe(404);
    expect(direct.text).not.toContain('invoice approvals');
    expect(await violations('cross_tenant_access_denied')).toBeGreaterThan(before);

    const messages = await route('portal/projects/[id]/messages');
    expect((await call(messages.GET, req('GET', `/api/portal/projects/${projectA}/messages`, tokens.clientB), { id: projectA })).status).toBe(404);
    const post = await call(messages.POST, req('POST', `/api/portal/projects/${projectA}/messages`, tokens.clientB, { body: 'hello from B' }), { id: projectA });
    expect(post.status).toBe(404);
    expect(await real.db.clientMessage.count({ where: { threadId: projectA, body: 'hello from B' } })).toBe(0);

    const withdraw = await call((await route('portal/projects/[id]/withdraw')).POST, req('POST', `/api/portal/projects/${projectA}/withdraw`, tokens.clientB, {}), { id: projectA });
    expect(withdraw.status).toBe(404);
    expect((await real.db.clientProject.findUnique({ where: { id: projectA } }))?.status).toBe('requested');
  });

  it('ignores a forged company on the request and records the attempt', async () => {
    const before = await violations('tenant_tampering_denied');
    const { GET } = await route('portal/projects');
    const forged = await call(GET, req('GET', `/api/portal/projects?companyId=${ids.companyA}`, tokens.clientB, undefined, { 'x-company-id': ids.companyA }));
    expect(forged.status).toBe(200);
    expect(forged.json.projects).toEqual([]);
    expect(await violations('tenant_tampering_denied')).toBeGreaterThan(before);
  });

  it('does not let a client place a record in another company through the body', async () => {
    const { POST } = await route('portal/projects');
    const created = await call(POST, req('POST', '/api/portal/projects', tokens.clientB, {
      title: 'B project with a forged owner',
      requirements: 'Please put this in company A. It must not work.',
      serviceSlug: 'custom-software-integrations',
      acceptTerms: true,
      companyId: ids.companyA,
    }));
    expect(created.status, created.text).toBe(200);
    const row = await real.db.clientProject.findUnique({ where: { id: created.json.project.id } });
    expect(row?.companyId).toBe(ids.companyB);
  });

  it('keeps uploaded documents private to the account that owns them', async () => {
    const form = new FormData();
    form.set('file', new File([Buffer.from('quarterly figures, confidential')], 'figures.txt', { type: 'text/plain' }));
    const documents = await route('portal/projects/[id]/documents');
    const upload = await call(documents.POST, req('POST', `/api/portal/projects/${projectA}/documents`, tokens.clientA, form), { id: projectA });
    expect(upload.status, upload.text).toBe(200);
    documentA = upload.json.document.id;
    expect(upload.text).not.toContain('storageKey');

    const download = (await route('portal/documents/[id]/download')).GET;
    const own = await call(download, req('GET', `/api/portal/documents/${documentA}/download`, tokens.clientA), { id: documentA });
    expect(own.status).toBe(200);
    expect(own.text).toBe('quarterly figures, confidential');

    const foreign = await call(download, req('GET', `/api/portal/documents/${documentA}/download`, tokens.clientB), { id: documentA });
    expect(foreign.status).toBe(404);
    expect(foreign.text).not.toContain('confidential');

    const staff = await call(download, req('GET', `/api/portal/documents/${documentA}/download`, tokens.staff), { id: documentA });
    expect(staff.status).toBe(401);
  });

  it('delivers work to the owning client only, and only when it is client-safe', async () => {
    const patch = (await route('internal/client-projects/[id]')).PATCH;
    for (const status of ['reviewing', 'approved', 'in_progress']) {
      const moved = await call(patch, req('PATCH', `/api/internal/client-projects/${projectA}`, tokens.staff, { status }), { id: projectA });
      expect(moved.status, moved.text).toBe(200);
    }
    // A client cannot drive the staff side of the lifecycle.
    const byClient = await call(patch, req('PATCH', `/api/internal/client-projects/${projectA}`, tokens.clientA, { status: 'completed' }), { id: projectA });
    expect(byClient.status).not.toBe(200);

    const publish = (await route('internal/client-projects/[id]/deliverables')).POST;
    const leaky = await call(publish, req('POST', `/api/internal/client-projects/${projectA}/deliverables`, tokens.staff, {
      title: 'Workflow design',
      content: 'Produced by agent AGENT-FIN-0042 in the Finance department using gpt-4o. Token cost $0.42.',
    }), { id: projectA });
    expect(leaky.status).toBe(422);
    expect(await real.db.clientDeliverable.count({ where: { projectId: projectA } })).toBe(0);

    const clean = await call(publish, req('POST', `/api/internal/client-projects/${projectA}/deliverables`, tokens.staff, {
      title: 'Workflow design',
      description: 'The proposed approval workflow, ready for your review.',
      content: 'Step 1: invoices arrive in a shared inbox. Step 2: they are matched to purchase orders. Step 3: a manager approves.',
    }), { id: projectA });
    expect(clean.status, clean.text).toBe(200);

    const list = (await route('portal/deliverables')).GET;
    const forA = await call(list, req('GET', '/api/portal/deliverables', tokens.clientA));
    expect(forA.json.deliverables).toHaveLength(1);
    const forB = await call(list, req('GET', '/api/portal/deliverables', tokens.clientB));
    expect(forB.json.deliverables).toEqual([]);

    const deliverableId = forA.json.deliverables[0].id;
    const approve = (await route('portal/deliverables/[id]/approve')).POST;
    expect((await call(approve, req('POST', `/api/portal/deliverables/${deliverableId}/approve`, tokens.clientB, {}), { id: deliverableId })).status).toBe(404);
    const dl = (await route('portal/deliverables/[id]/download')).GET;
    expect((await call(dl, req('GET', `/api/portal/deliverables/${deliverableId}/download`, tokens.clientB), { id: deliverableId })).status).toBe(404);
    expect((await call(dl, req('GET', `/api/portal/deliverables/${deliverableId}/download`, tokens.clientA), { id: deliverableId })).status).toBe(200);
  });
});

describe('nothing internal reaches a client', () => {
  const FORBIDDEN = /agent|department|workflow|prompt|provider|model|token|cost|storageKey|internal|runId|taskId|companyId|orchestr|AgentOS/i;

  it('returns only client-safe fields from every read endpoint', async () => {
    const { findInternalLeak } = await import('@/lib/portal/leak-guard');
    const paths = ['dashboard', 'services', 'projects', 'deliverables', 'billing', 'tickets', 'notifications', 'account'];
    for (const path of paths) {
      const { GET } = await route(`portal/${path}`);
      const result = await call(GET, req('GET', `/api/portal/${path}`, tokens.clientA));
      expect(result.status, `${path}: ${result.text.slice(0, 200)}`).toBe(200);
      expect(findInternalLeak(result.json), path).toBeNull();
      const keys = new Set<string>();
      JSON.stringify(result.json, (key, value) => { if (key) keys.add(key); return value; });
      for (const key of keys) expect(FORBIDDEN.test(key), `${path} exposes key "${key}"`).toBe(false);
    }
  });

  it('describes services without saying how they are produced', async () => {
    const { GET } = await route('portal/services');
    const result = await call(GET, req('GET', '/api/portal/services', tokens.clientA));
    expect(result.json.services.length).toBeGreaterThanOrEqual(6);
    expect(result.text).not.toMatch(/internalFulfilment|AgentOS|\bLLM\b|OpenAI|Ollama|\bagents?\b/i);
  });

  it('blocks a response that would carry an internal field, instead of sending it', async () => {
    const { clientRoute } = await import('@/lib/portal/auth');
    const before = await violations('internal_data_leak_blocked');
    const leaky = clientRoute(async () => ({ project: { id: 'p1', title: 'x', agentId: 'AGENT-1' } })) as Handler;
    const result = await call(leaky, req('GET', '/api/portal/projects', tokens.clientA));
    expect(result.status).toBe(500);
    expect(result.text).not.toContain('AGENT-1');
    expect(await violations('internal_data_leak_blocked')).toBeGreaterThan(before);
  });
});

describe('registration and role changes cannot cross the boundary', () => {
  it('creates a client login no matter what the registration body asks for', async () => {
    const before = await violations('privilege_escalation_denied');
    const { POST } = await route('auth/register');
    const result = await call(POST, req('POST', '/api/auth/register', '', {
      email: 'mallory@example.test',
      password: 'a long enough password 123',
      name: 'Mallory',
      companyName: 'Mallory Co',
      role: 'super_admin',
      accountType: 'internal',
      isAdmin: true,
    }));
    expect(result.status, result.text).toBe(201);
    const user = await real.db.user.findUnique({ where: { email: 'mallory@example.test' } });
    expect(user?.role).toBe('client');
    const membership = await real.db.companyUser.findFirst({ where: { userId: user!.id }, include: { company: true } });
    expect(membership?.company.accountType).toBe('client');
    expect(await violations('privilege_escalation_denied')).toBeGreaterThan(before);

    const { verifySessionToken } = await import('@/lib/auth');
    const token: string = result.json.token;
    expect(await verifySessionToken(token)).toBeNull();
    expect((await verifySessionToken(token, { audience: 'client' }))?.userId).toBe(user!.id);
  });

  it('will not turn a client login into internal personnel', async () => {
    const { PUT } = await route('users/[id]');
    const result = await call(PUT, req('PUT', `/api/users/${ids.clientA}`, tokens.superAdmin, { role: 'admin' }), { id: ids.clientA });
    expect(result.status).toBe(409);
    expect((await real.db.user.findUnique({ where: { id: ids.clientA } }))?.role).toBe('client');
  });

  it('creates staff accounts only with an explicit internal role', async () => {
    const { POST } = await route('users');
    const base = { email: 'new.staff@alolabs.test', name: 'New Staff', password: 'a long enough password 123' };
    expect((await call(POST, req('POST', '/api/users', tokens.superAdmin, base))).status).toBe(400);
    expect((await call(POST, req('POST', '/api/users', tokens.superAdmin, { ...base, role: 'client' }))).status).toBe(400);
    expect((await call(POST, req('POST', '/api/users', tokens.superAdmin, { ...base, role: 'account_manager' }))).status).toBe(201);
    expect((await call(POST, req('POST', '/api/users', tokens.clientA, { ...base, email: 'x@alolabs.test', role: 'admin' }))).status).not.toBe(201);
  });

  it('signs a client out without a request body', async () => {
    const { createSessionToken, verifySessionToken } = await import('@/lib/auth');
    const token = await createSessionToken(ids.clientB);
    const { POST } = await route('auth/logout');
    const response = await POST(new NextRequest('http://localhost/api/auth/logout', { method: 'POST', headers: { authorization: `Bearer ${token}` } }));
    expect(response.status).toBe(200);
    expect(await verifySessionToken(token, { audience: 'client' })).toBeNull();
  });
});
