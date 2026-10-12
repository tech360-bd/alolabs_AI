import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import type { NextRequest } from 'next/server';

/**
 * Security regression tests for the hand-written routes that were hardened
 * individually (they do not match the generated-CRUD shape, so the converter
 * could not touch them).
 *
 * Each test drives a real route module. Only authentication, rate limiting,
 * the Prisma delegates and the in-process services (execution engine, memory
 * store, orchestrator) are mocked.
 */

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  authenticateV1: vi.fn(),
  checkRateLimit: vi.fn(),
  securityEventCreate: vi.fn(),
  auditLogCreate: vi.fn(),
  invoice: { findMany: vi.fn() },
  payment: { findMany: vi.fn() },
  subscription: { findMany: vi.fn(), findFirst: vi.fn() },
  serverLog: { create: vi.fn(), deleteMany: vi.fn() },
  securityEvent: { findMany: vi.fn() },
  incident: {
    findMany: vi.fn(),
    count: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  errorLog: { deleteMany: vi.fn() },
  marketplaceTemplate: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  templateInstall: { findMany: vi.fn(), create: vi.fn() },
  templateVersion: { create: vi.fn() },
  crossSystemSyncLog: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  agent: { findFirst: vi.fn() },
  conversation: { findUnique: vi.fn(), update: vi.fn() },
  settings: { findUnique: vi.fn() },
  usageLog: { findMany: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn() },
  companyUsageSummary: { findMany: vi.fn() },
  tokenBudget: { findUnique: vi.fn(), update: vi.fn() },
  tokenUsage: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  company: { findUnique: vi.fn() },
  companyUser: { findMany: vi.fn(), create: vi.fn(), delete: vi.fn() },
  user: { findMany: vi.fn() },
  execute: vi.fn(),
  memoryStore: {
    get: vi.fn(),
    delete: vi.fn(),
    search: vi.fn(),
    getByAgent: vi.fn(),
    getStats: vi.fn(),
    addShortTerm: vi.fn(),
    addLongTerm: vi.fn(),
    addEpisodic: vi.fn(),
  },
  orchestrator: {
    getConversation: vi.fn(),
    listConversations: vi.fn(),
  },
}));

vi.mock('@/lib/api-auth', () => ({
  getAuthUser: mocks.getAuthUser,
  requireAuth: async () => {
    const user = await mocks.getAuthUser();
    if (!user) throw new Error('Unauthorized');
    return user;
  },
  requireRole: async (...roles: string[]) => {
    const user = await mocks.getAuthUser();
    if (!user) throw new Error('Unauthorized');
    if (!roles.includes(user.role)) throw new Error('Forbidden');
    return user;
  },
  requireCompanyAuth: async () => {
    const user = await mocks.getAuthUser();
    if (!user) throw new Error('Unauthorized');
    if (!user.companyId) throw new Error('Forbidden');
    return user;
  },
}));
vi.mock('@/lib/v1-auth', () => ({ authenticateV1: mocks.authenticateV1 }));
vi.mock('@/lib/rate-limiter', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db', () => ({
  db: {
    securityEvent: { create: mocks.securityEventCreate, findMany: mocks.securityEvent.findMany },
    auditLog: { create: mocks.auditLogCreate },
    invoice: mocks.invoice,
    payment: mocks.payment,
    subscription: mocks.subscription,
    serverLog: mocks.serverLog,
    incident: mocks.incident,
    errorLog: mocks.errorLog,
    marketplaceTemplate: mocks.marketplaceTemplate,
    templateInstall: mocks.templateInstall,
    templateVersion: mocks.templateVersion,
    crossSystemSyncLog: mocks.crossSystemSyncLog,
    agent: mocks.agent,
    conversation: mocks.conversation,
    settings: mocks.settings,
    usageLog: mocks.usageLog,
    companyUsageSummary: mocks.companyUsageSummary,
    tokenBudget: mocks.tokenBudget,
    tokenUsage: mocks.tokenUsage,
    company: mocks.company,
    companyUser: mocks.companyUser,
    user: mocks.user,
  },
}));
vi.mock('@/lib/agent-runtime', () => ({
  getExecutionEngine: () => ({ execute: mocks.execute, cancel: vi.fn().mockReturnValue(true) }),
}));
vi.mock('@/lib/memory', () => ({ getMemoryStore: () => mocks.memoryStore }));
vi.mock('@/lib/orchestrator', () => ({ getOrchestrator: () => mocks.orchestrator }));
vi.mock('@/lib/whatsapp/client', () => ({ WhatsAppBusinessClient: class {} }));
vi.mock('@/lib/whatsapp/ai-handler', () => ({ WhatsAppAIHandler: class {} }));

import * as invoices from '@/app/api/billing/invoices/route';
import * as payments from '@/app/api/billing/payments/route';
import * as subscriptions from '@/app/api/billing/subscriptions/route';
import * as subscriptionItem from '@/app/api/billing/subscriptions/[id]/route';
import * as logs from '@/app/api/logs/route';
import * as marketplaceTemplates from '@/app/api/marketplace/templates/route';
import * as marketplaceInstalls from '@/app/api/marketplace/installs/route';
import * as sync from '@/app/api/sync/route';
import * as agentRuntime from '@/app/api/agent-runtime/execute/route';
import * as memory from '@/app/api/memory/route';
import * as conversations from '@/app/api/enterprise/conversations/route';
import * as whatsappWebhook from '@/app/api/whatsapp/webhook/route';
import * as aiSecurityEvents from '@/app/api/ai-security/events/route';
import * as incidents from '@/app/api/incidents/route';
import * as companyUsage from '@/app/api/company/usage/route';
import * as tokenUsage from '@/app/api/token-usage/route';
import * as tenantAdminUsers from '@/app/api/tenant-admin/users/route';

const TENANT_A = 'company-a';
const TENANT_B = 'company-b';

function request(body?: unknown, search: Record<string, string> = {}): NextRequest {
  const params = new URLSearchParams(search);
  return {
    headers: { get: () => null },
    nextUrl: { searchParams: params },
    url: `https://alolabs.net/api/test${params.toString() ? `?${params.toString()}` : ''}`,
    json: async () => {
      if (body === undefined) throw new Error('no body');
      return body;
    },
  } as unknown as NextRequest;
}

function session(role = 'operator', companyId: string = TENANT_A) {
  mocks.getAuthUser.mockResolvedValue({
    userId: 'user-1',
    role,
    email: 'user@example.test',
    name: 'User',
    companyId,
    companyRole: 'member',
  });
  mocks.authenticateV1.mockResolvedValue(null);
}

async function call(response: Response): Promise<{ status: number; body: any }> {
  return { status: response.status, body: await response.json() };
}

function eventsOfType(type: string): any[] {
  return mocks.securityEventCreate.mock.calls
    .map((call) => (call[0] as any)?.data ?? call[0])
    .filter((event: any) => event?.type === type);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthUser.mockResolvedValue(null);
  mocks.authenticateV1.mockResolvedValue(null);
  mocks.checkRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 9,
    resetAt: new Date(Date.now() + 60_000),
    totalInWindow: 1,
  });
  mocks.securityEventCreate.mockResolvedValue({ id: 'se-1' });
  mocks.auditLogCreate.mockResolvedValue({ id: 'audit-1' });

  mocks.invoice.findMany.mockResolvedValue([]);
  mocks.payment.findMany.mockResolvedValue([]);
  mocks.subscription.findMany.mockResolvedValue([]);
  mocks.subscription.findFirst.mockResolvedValue(null);
  mocks.serverLog.create.mockResolvedValue({ id: 'log-1' });
  mocks.serverLog.deleteMany.mockResolvedValue({ count: 3 });
  mocks.errorLog.deleteMany.mockResolvedValue({ count: 2 });
  mocks.marketplaceTemplate.findMany.mockResolvedValue([]);
  mocks.marketplaceTemplate.findUnique.mockResolvedValue({ id: 'tpl-1', version: '1.0.0', configJson: '{}' });
  mocks.marketplaceTemplate.create.mockResolvedValue({ id: 'tpl-1' });
  mocks.marketplaceTemplate.update.mockResolvedValue({ id: 'tpl-1' });
  mocks.templateInstall.findMany.mockResolvedValue([]);
  mocks.templateInstall.create.mockResolvedValue({ id: 'install-1' });
  mocks.templateVersion.create.mockResolvedValue({ id: 'ver-1' });
  mocks.crossSystemSyncLog.findMany.mockResolvedValue([]);
  mocks.crossSystemSyncLog.create.mockResolvedValue({ id: 'sync-1' });
  mocks.crossSystemSyncLog.update.mockResolvedValue({ id: 'sync-1' });
  mocks.agent.findFirst.mockResolvedValue({ id: 'agent-row-1' });
  mocks.conversation.findUnique.mockResolvedValue({ id: 'conv-1', userId: 'user-1', companyId: TENANT_A });
  mocks.conversation.update.mockResolvedValue({ id: 'conv-1' });
  mocks.settings.findUnique.mockResolvedValue(null);
  mocks.securityEvent.findMany.mockResolvedValue([]);
  mocks.incident.findMany.mockResolvedValue([]);
  mocks.incident.count.mockResolvedValue(0);
  mocks.incident.findFirst.mockResolvedValue(null);
  mocks.incident.create.mockResolvedValue({ id: 'incident-1', title: 't' });
  mocks.incident.update.mockResolvedValue({ id: 'incident-1' });
  mocks.incident.delete.mockResolvedValue({ id: 'incident-1' });
  mocks.usageLog.findMany.mockResolvedValue([]);
  mocks.usageLog.aggregate.mockResolvedValue({ _sum: {}, _count: 0 });
  mocks.companyUsageSummary.findMany.mockResolvedValue([]);
  mocks.tokenBudget.findUnique.mockResolvedValue(null);
  mocks.tokenBudget.update.mockResolvedValue({ id: 'budget-1' });
  mocks.tokenUsage.findMany.mockResolvedValue([]);
  mocks.tokenUsage.findFirst.mockResolvedValue(null);
  mocks.tokenUsage.findUnique.mockResolvedValue(null);
  mocks.tokenUsage.create.mockResolvedValue({ id: 'usage-1' });
  mocks.tokenUsage.update.mockResolvedValue({ id: 'usage-1', createdAt: new Date('2026-01-01T00:00:00.000Z') });
  mocks.company.findUnique.mockResolvedValue({ id: TENANT_A, name: 'A' });
  mocks.companyUser.findMany.mockResolvedValue([]);
  mocks.companyUser.create.mockResolvedValue({ id: 'cu-1' });
  mocks.user.findMany.mockResolvedValue([]);
  mocks.execute.mockResolvedValue({ id: 'task-1', status: 'completed' });
  mocks.memoryStore.get.mockResolvedValue({ id: 'mem-1', userId: 'user-1' });
  mocks.memoryStore.delete.mockResolvedValue(true);
  mocks.orchestrator.listConversations.mockResolvedValue([]);
  mocks.orchestrator.getConversation.mockResolvedValue({ id: 'conv-1', userId: 'user-1' });
});

// ─── Billing: payment data was readable by anyone ────────────────────

describe('billing reads', () => {
  it('rejects anonymous invoice listing', async () => {
    const res = await call(await invoices.GET(request()));
    expect(res.status).toBe(401);
    expect(mocks.invoice.findMany).not.toHaveBeenCalled();
  });

  it('scopes invoice listing to the principal tenant and ignores ?companyId', async () => {
    session('operator');
    const res = await call(await invoices.GET(request(undefined, { companyId: TENANT_B })));
    expect(res.status).toBe(200);
    expect(mocks.invoice.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.invoice.findMany.mock.calls[0][0].where).toEqual({ companyId: TENANT_A });
  });

  it('rejects anonymous payment listing and scopes the authenticated one', async () => {
    const anon = await call(await payments.GET(request()));
    expect(anon.status).toBe(401);

    session('operator');
    await payments.GET(request());
    expect(mocks.payment.findMany.mock.calls[0][0].where).toEqual({ companyId: TENANT_A });
  });

  it('rejects anonymous subscription listing and scopes the authenticated one', async () => {
    const anon = await call(await subscriptions.GET(request()));
    expect(anon.status).toBe(401);

    session('operator');
    await subscriptions.GET(request());
    expect(mocks.subscription.findMany.mock.calls[0][0].where).toEqual({ companyId: TENANT_A });
  });

  it('cannot read another tenant’s subscription by id', async () => {
    session('operator');
    mocks.subscription.findFirst.mockResolvedValue(null);

    const res = await call(await subscriptionItem.GET(request(), { params: Promise.resolve({ id: 'sub-of-b' }) } as any));
    expect(res.status).toBe(404);
    expect(mocks.subscription.findFirst.mock.calls[0][0].where).toEqual({ id: 'sub-of-b', companyId: TENANT_A });
  });

  it('reads its own subscription by id', async () => {
    session('operator');
    mocks.subscription.findFirst.mockResolvedValue({ id: 'sub-1', companyId: TENANT_A, plan: { features: '[]' }, invoices: [] });

    const res = await call(await subscriptionItem.GET(request(), { params: Promise.resolve({ id: 'sub-1' }) } as any));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('sub-1');
  });
});

// ─── Logs ────────────────────────────────────────────────────────────

describe('logs', () => {
  it('rejects anonymous ingestion', async () => {
    const res = await call(await logs.POST(request({ level: 'info', message: 'hello' })));
    expect(res.status).toBe(401);
    expect(mocks.serverLog.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid level with 400', async () => {
    session('operator');
    const res = await call(await logs.POST(request({ level: 'loud', message: 'hello' })));
    expect(res.status).toBe(400);
    expect(mocks.serverLog.create).not.toHaveBeenCalled();
  });

  it('stamps the principal tenant on ingest, never the body value', async () => {
    session('operator');
    const res = await call(await logs.POST(request({ level: 'info', message: 'hello' })));
    expect(res.status).toBe(200);
    const details = JSON.parse(mocks.serverLog.create.mock.calls[0][0].data.metadata);
    expect(details.companyId).toBe(TENANT_A);
  });

  it('refuses log pruning to non-admins', async () => {
    session('operator');
    const res = await call(await logs.DELETE(request(undefined, { olderThan: '2024-01-01' })));
    expect(res.status).toBe(403);
    expect(mocks.serverLog.deleteMany).not.toHaveBeenCalled();
    expect(mocks.errorLog.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects an unparseable cutoff date', async () => {
    session('admin');
    const res = await call(await logs.DELETE(request(undefined, { olderThan: 'yesterday' })));
    expect(res.status).toBe(400);
    expect(mocks.serverLog.deleteMany).not.toHaveBeenCalled();
  });

  it('lets an admin prune by age', async () => {
    session('admin');
    const res = await call(await logs.DELETE(request(undefined, { olderThan: '2024-01-01T00:00:00.000Z' })));
    expect(res.status).toBe(200);
    expect(res.body.data.totalDeleted).toBe(5);
    expect(mocks.serverLog.deleteMany).toHaveBeenCalledTimes(1);
  });
});

// ─── Marketplace ─────────────────────────────────────────────────────

describe('marketplace', () => {
  it('keeps the public catalogue readable by anonymous callers', async () => {
    const res = await call(await marketplaceTemplates.GET(request()));
    expect(res.status).toBe(200);
  });

  it('refuses template publication to anonymous and non-admin callers', async () => {
    const anon = await call(await marketplaceTemplates.POST(request({ name: 'x', slug: 'x', type: 'agent', category: 'ops' })));
    expect(anon.status).toBe(401);

    session('operator');
    const operator = await call(await marketplaceTemplates.POST(request({ name: 'x', slug: 'x', type: 'agent', category: 'ops' })));
    expect(operator.status).toBe(403);
    expect(mocks.marketplaceTemplate.create).not.toHaveBeenCalled();
  });

  it('lets an admin publish a template', async () => {
    session('admin');
    const res = await call(await marketplaceTemplates.POST(request({ name: 'x', slug: 'x', type: 'agent', category: 'ops' })));
    expect(res.status).toBe(200);
    expect(mocks.marketplaceTemplate.create).toHaveBeenCalledTimes(1);
  });

  it('rejects anonymous install listing', async () => {
    const res = await call(await marketplaceInstalls.GET(request()));
    expect(res.status).toBe(401);
    expect(mocks.templateInstall.findMany).not.toHaveBeenCalled();
  });

  it('refuses an install that names another tenant', async () => {
    session('operator');
    const res = await call(
      await marketplaceInstalls.POST(request({ templateId: 'tpl-1', companyId: TENANT_B, userId: 'victim' })),
    );
    expect(res.status).toBe(403);
    expect(mocks.templateInstall.create).not.toHaveBeenCalled();
    expect(eventsOfType('tenant_isolation_violation')).toHaveLength(1);
  });

  it('stamps the principal tenant and user on install, ignoring client values', async () => {
    session('operator');
    const res = await call(await marketplaceInstalls.POST(request({ templateId: 'tpl-1', userId: 'victim' })));
    expect(res.status).toBe(200);
    const data = mocks.templateInstall.create.mock.calls[0][0].data;
    expect(data.companyId).toBe(TENANT_A);
    expect(data.userId).toBe('user-1');
  });
});

// ─── Sync log ────────────────────────────────────────────────────────

describe('cross-system sync log', () => {
  it('rejects anonymous reads and writes', async () => {
    expect((await call(await sync.GET(request()))).status).toBe(401);
    expect((await call(await sync.POST(request({ sourceSystem: 'a', targetSystem: 'b', syncType: 'push', entityType: 'agent' })))).status).toBe(401);
    expect(mocks.crossSystemSyncLog.findMany).not.toHaveBeenCalled();
    expect(mocks.crossSystemSyncLog.create).not.toHaveBeenCalled();
  });

  it('records a tenant mismatch as a critical isolation violation', async () => {
    session('operator');
    const res = await call(
      await sync.POST(request({ sourceSystem: 'a', targetSystem: 'b', syncType: 'push', entityType: 'agent', companyId: TENANT_B })),
    );
    expect(res.status).toBe(403);
    expect(mocks.crossSystemSyncLog.create).not.toHaveBeenCalled();

    const violation = eventsOfType('tenant_isolation_violation');
    expect(violation).toHaveLength(1);
    expect(violation[0].severity).toBe('critical');
  });

  it('stamps the principal tenant on a valid sync record', async () => {
    session('operator');
    const res = await call(await sync.POST(request({ sourceSystem: 'a', targetSystem: 'b', syncType: 'push', entityType: 'agent' })));
    expect(res.status).toBe(200);
    expect(mocks.crossSystemSyncLog.create.mock.calls[0][0].data.companyId).toBe(TENANT_A);
  });

  it('scopes sync listing to the principal tenant', async () => {
    session('operator');
    await sync.GET(request());
    expect(mocks.crossSystemSyncLog.findMany.mock.calls[0][0].where).toEqual({ companyId: TENANT_A });
  });
});

// ─── Agent execution ─────────────────────────────────────────────────

describe('agent execution', () => {
  it('rejects anonymous execution', async () => {
    const res = await call(await agentRuntime.POST(request({ agentId: 'agent-1', task: 'do it' })));
    expect(res.status).toBe(401);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('refuses execution to a viewer', async () => {
    session('viewer');
    const res = await call(await agentRuntime.POST(request({ agentId: 'agent-1', task: 'do it' })));
    expect(res.status).toBe(403);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('rejects an empty task with 400', async () => {
    session('operator');
    const res = await call(await agentRuntime.POST(request({ agentId: 'agent-1', task: '' })));
    expect(res.status).toBe(400);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('cannot execute another tenant’s agent', async () => {
    session('operator');
    mocks.agent.findFirst.mockResolvedValue(null);

    const res = await call(await agentRuntime.POST(request({ agentId: 'agent-of-b', task: 'do it' })));
    expect(res.status).toBe(404);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.agent.findFirst.mock.calls[0][0].where).toEqual({
      agentId: 'agent-of-b',
      agentCompanyAccess: { some: { companyId: TENANT_A } },
    });
  });

  it('executes under the caller’s tenant, not a hard-coded pseudo tenant', async () => {
    session('operator');
    const res = await call(await agentRuntime.POST(request({ agentId: 'agent-1', task: 'do it' })));
    expect(res.status).toBe(200);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    const params = mocks.execute.mock.calls[0][0];
    expect(params.companyId).toBe(TENANT_A);
    expect(params.companyId).not.toBe('default-company');
  });
});

// ─── Memory ──────────────────────────────────────────────────────────

describe('agent memory', () => {
  it('rejects anonymous deletes', async () => {
    const res = await call(await memory.DELETE(request(undefined, { id: 'mem-1' })));
    expect(res.status).toBe(401);
    expect(mocks.memoryStore.delete).not.toHaveBeenCalled();
  });

  it('will not delete another principal’s memory entry', async () => {
    session('operator');
    mocks.memoryStore.get.mockResolvedValue({ id: 'mem-9', userId: 'someone-else' });

    const res = await call(await memory.DELETE(request(undefined, { id: 'mem-9' })));
    expect(res.status).toBe(404);
    expect(mocks.memoryStore.delete).not.toHaveBeenCalled();
  });

  it('deletes its own memory entry', async () => {
    session('operator');
    const res = await call(await memory.DELETE(request(undefined, { id: 'mem-1' })));
    expect(res.status).toBe(200);
    expect(mocks.memoryStore.delete).toHaveBeenCalledWith('mem-1');
  });

  it('validates the memory type on create', async () => {
    session('operator');
    const res = await call(await memory.POST(request({ type: 'dream', key: 'k', content: 'c' })));
    expect(res.status).toBe(400);
  });
});

// ─── Conversations ───────────────────────────────────────────────────

describe('enterprise conversations', () => {
  it('no longer serves anonymous callers', async () => {
    const res = await call(await conversations.GET(request()));
    expect(res.status).toBe(401);
    expect(mocks.orchestrator.listConversations).not.toHaveBeenCalled();
  });

  it('will not archive a conversation owned by somebody else', async () => {
    session('operator');
    mocks.conversation.findUnique.mockResolvedValue({ id: 'conv-9', userId: 'someone-else', companyId: TENANT_B });

    const res = await call(await conversations.DELETE(request(undefined, { id: 'conv-9' })));
    expect(res.status).toBe(404);
    expect(mocks.conversation.update).not.toHaveBeenCalled();
  });

  it('archives its own conversation', async () => {
    session('operator');
    const res = await call(await conversations.DELETE(request(undefined, { id: 'conv-1' })));
    expect(res.status).toBe(200);
    expect(mocks.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: { status: 'archived' },
    });
  });

  it('refuses to read a conversation owned by another principal', async () => {
    session('operator');
    mocks.orchestrator.getConversation.mockResolvedValue({ id: 'conv-9', userId: 'someone-else' });

    const res = await call(await conversations.GET(request(undefined, { id: 'conv-9' })));
    expect(res.status).toBe(404);
  });
});

// ─── WhatsApp webhook ────────────────────────────────────────────────

describe('whatsapp webhook signature', () => {
  const secret = 'test-app-secret';
  const raw = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });

  function webhookRequest(signature?: string): NextRequest {
    return {
      headers: { get: (name: string) => (name.toLowerCase() === 'x-hub-signature-256' ? (signature ?? null) : null) },
      nextUrl: { searchParams: new URLSearchParams() },
      url: 'https://alolabs.net/api/whatsapp/webhook',
      text: async () => raw,
      json: async () => JSON.parse(raw),
    } as unknown as NextRequest;
  }

  beforeEach(() => {
    process.env.WHATSAPP_APP_SECRET = secret;
  });

  it('rejects an unsigned delivery when an app secret is configured', async () => {
    const res = await call(await whatsappWebhook.POST(webhookRequest()));
    expect(res.status).toBe(401);
    expect(eventsOfType('webhook_signature_missing')).toHaveLength(1);
  });

  it('rejects a forged signature instead of processing the message', async () => {
    const res = await call(await whatsappWebhook.POST(webhookRequest('sha256=deadbeef')));
    expect(res.status).toBe(401);
    const events = eventsOfType('webhook_signature_invalid');
    expect(events).toHaveLength(1);
    expect(events[0].severity).toBe('critical');
  });

  it('accepts a correctly signed delivery', async () => {
    const signature = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
    const res = await call(await whatsappWebhook.POST(webhookRequest(signature)));
    expect(res.status).toBe(200);
    expect(eventsOfType('webhook_signature_invalid')).toHaveLength(0);
  });

  it('never writes the secret into the recorded event', async () => {
    await whatsappWebhook.POST(webhookRequest('sha256=deadbeef'));
    const payload = JSON.stringify(mocks.securityEventCreate.mock.calls.map((c) => c[0]));
    expect(payload).not.toContain(secret);
  });
});

// ─── AI security events ─────────────────────────────────────────────

describe('ai security events', () => {
  it('rejects anonymous reads and writes', async () => {
    expect((await call(await aiSecurityEvents.GET(request()))).status).toBe(401);
    expect((await call(await aiSecurityEvents.POST(request({ type: 'prompt_injection' })))).status).toBe(401);
    expect(mocks.securityEvent.findMany).not.toHaveBeenCalled();
  });

  it('scopes the listing to the principal tenant', async () => {
    session('operator');
    await aiSecurityEvents.GET(request());
    expect(mocks.securityEvent.findMany.mock.calls[0][0].where).toEqual({ companyId: TENANT_A });
  });

  it('refuses to write an event into another tenant', async () => {
    session('operator');
    const res = await call(await aiSecurityEvents.POST(request({ type: 'prompt_injection', companyId: TENANT_B })));
    expect(res.status).toBe(403);
    expect(eventsOfType('tenant_isolation_violation')).toHaveLength(1);
    // nb. the audit trail of the refusal itself uses the same delegate.
    expect(mocks.securityEventCreate.mock.calls.filter((c: any) => c[0].data?.source !== 'ai-security')).toHaveLength(1);
  });

  it('stamps the principal tenant on a valid event and redacts payloads', async () => {
    session('operator');
    const res = await call(
      await aiSecurityEvents.POST(request({ type: 'prompt_injection', input: { password: 'hunter2' } })),
    );
    expect(res.status).toBe(200);
    const created = mocks.securityEventCreate.mock.calls.find((c: any) => c[0].data?.source === 'ai-security');
    expect(created[0].data.companyId).toBe(TENANT_A);
    expect(JSON.stringify(created[0].data.details)).not.toContain('hunter2');
  });
});

// ─── Incidents ──────────────────────────────────────────────────────

describe('incidents', () => {
  it('rejects anonymous callers', async () => {
    expect((await call(await incidents.GET(request()))).status).toBe(401);
    expect((await call(await incidents.POST(request({ title: 'x' })))).status).toBe(401);
    expect((await call(await incidents.PUT(request({ id: 'inc-1' })))).status).toBe(401);
    expect((await call(await incidents.DELETE(request(undefined, { id: 'inc-1' })))).status).toBe(401);
  });

  it('ignores a foreign companyId filter and scopes listing to the principal', async () => {
    session('operator');
    await incidents.GET(request(undefined, { companyId: TENANT_B }));
    const where = mocks.incident.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain(TENANT_A);
    expect(JSON.stringify(where)).not.toContain(TENANT_B);
  });

  it('creates under the principal tenant, not the body value', async () => {
    session('operator');
    const res = await call(await incidents.POST(request({ title: 'x', companyId: TENANT_B })));
    expect(res.status).toBe(201);
    expect(mocks.incident.create.mock.calls[0][0].data.companyId).toBe(TENANT_A);
  });

  it('refuses to update another tenant’s incident', async () => {
    session('operator');
    const res = await call(await incidents.PUT(request({ id: 'inc-of-b', severity: 'critical' })));
    expect(res.status).toBe(404);
    expect(mocks.incident.update).not.toHaveBeenCalled();
    expect(mocks.incident.findFirst.mock.calls[0][0].where).toEqual({ id: 'inc-of-b', companyId: TENANT_A });
  });

  it('refuses to delete another tenant’s incident', async () => {
    session('operator');
    const res = await call(await incidents.DELETE(request(undefined, { id: 'inc-of-b' })));
    expect(res.status).toBe(404);
    expect(mocks.incident.delete).not.toHaveBeenCalled();
  });

  it('updates and deletes its own incident', async () => {
    session('operator');
    mocks.incident.findFirst.mockResolvedValue({ id: 'inc-1', companyId: TENANT_A, title: 't' });

    expect((await call(await incidents.PUT(request({ id: 'inc-1', severity: 'critical' })))).status).toBe(200);
    expect(mocks.incident.update).toHaveBeenCalledTimes(1);

    expect((await call(await incidents.DELETE(request(undefined, { id: 'inc-1' })))).status).toBe(200);
    expect(mocks.incident.delete).toHaveBeenCalledTimes(1);
  });
});

// ─── Tenant-scoped company endpoints ─────────────────────────────────

describe('company usage', () => {
  it('rejects anonymous reads', async () => {
    const res = await call(await companyUsage.GET(request(undefined, { companyId: TENANT_B })));
    expect(res.status).toBe(401);
    expect(mocks.usageLog.findMany).not.toHaveBeenCalled();
  });

  it('refuses a query naming another tenant', async () => {
    session('operator');
    const res = await call(await companyUsage.GET(request(undefined, { companyId: TENANT_B })));
    expect(res.status).toBe(403);
    expect(mocks.usageLog.findMany).not.toHaveBeenCalled();
  });

  it('serves the caller’s own tenant', async () => {
    session('operator');
    const res = await call(await companyUsage.GET(request(undefined, { companyId: TENANT_A })));
    expect(res.status).toBe(200);
  });
});

describe('token usage', () => {
  it('rejects anonymous writes', async () => {
    const res = await call(await tokenUsage.PUT(request({ id: 'usage-1', totalTokens: 10 })));
    expect(res.status).toBe(401);
  });

  it('cannot update another tenant’s usage row', async () => {
    session('operator');
    mocks.tokenUsage.findFirst.mockResolvedValue(null);

    const res = await call(await tokenUsage.PUT(request({ id: 'usage-of-b', totalTokens: 10 })));
    expect(res.status).toBe(404);
    expect(mocks.tokenUsage.update).not.toHaveBeenCalled();
    expect(mocks.tokenUsage.findFirst.mock.calls[0][0].where).toEqual({ id: 'usage-of-b', companyId: TENANT_A });
  });

  it('updates its own usage row', async () => {
    session('operator');
    mocks.tokenUsage.findFirst.mockResolvedValue({ id: 'usage-1', companyId: TENANT_A });

    const res = await call(await tokenUsage.PUT(request({ id: 'usage-1', totalTokens: 10 })));
    expect(res.status).toBe(200);
    expect(mocks.tokenUsage.update).toHaveBeenCalledTimes(1);
  });

  it('refuses to record usage against another tenant', async () => {
    session('operator');
    const res = await call(await tokenUsage.POST(request({ companyId: TENANT_B, totalTokens: 10 })));
    expect(res.status).toBe(403);
    expect(mocks.tokenUsage.create).not.toHaveBeenCalled();
  });
});

describe('tenant admin users', () => {
  it('rejects anonymous and non-admin callers', async () => {
    expect((await call(await tenantAdminUsers.GET(request(undefined, { companyId: TENANT_A })))).status).toBe(401);

    session('operator');
    expect((await call(await tenantAdminUsers.GET(request(undefined, { companyId: TENANT_A })))).status).toBe(403);
  });

  it('lets a super admin administer another tenant', async () => {
    session('super_admin');
    const res = await call(await tenantAdminUsers.GET(request(undefined, { companyId: TENANT_B })));
    expect(res.status).toBe(200);
  });

  it('pins a tenant admin to their own tenant', async () => {
    session('admin');
    const res = await call(await tenantAdminUsers.GET(request(undefined, { companyId: TENANT_B })));
    expect(res.status).toBe(403);
    expect(mocks.companyUser.findMany).not.toHaveBeenCalled();

    const ok = await call(await tenantAdminUsers.GET(request(undefined, { companyId: TENANT_A })));
    expect(ok.status).toBe(200);
  });
});
