/**
 * Provider administration
 * ALO Labs AgentOS — create/update/test AIProviderConfig rows with the
 * secret handling rules enforced in one place:
 *
 *   • API keys are encrypted at rest (field-encryption) and never read back
 *     through any API — only `hasApiKey` + `keyFingerprint` are exposed.
 *   • Tenant admins manage their own tenant's providers; shared (global)
 *     providers require a super_admin.
 *   • "Test" performs a real health check (and optionally a one-token chat)
 *     against the configured endpoint and records the outcome on the row.
 */

import { z } from 'zod';
import { db } from '../db';
import {
  CONFIGURABLE_PROVIDER_KINDS,
  buildProviderFromConfig,
  describeProviderConfig,
  parseModelCatalogue,
  sealApiKey,
  type ProviderConfigRecord,
  type ProviderConfigView,
} from './provider-registry';
import { ensureRouterSynced } from './index';
import { isFieldEncryptionConfigured } from '../security/field-encryption';

// ─── Validation ─────────────────────────────────────────────────────

const ModelSchema = z.union([
  z.string().min(1).max(200),
  z.object({
    id: z.string().min(1).max(200),
    name: z.string().max(200).optional(),
    contextLength: z.number().int().positive().max(10_000_000).optional(),
    capabilities: z.array(z.string().max(40)).max(20).optional(),
    costPerMillionTokens: z.number().min(0).max(100_000).optional(),
  }),
]);

const BaseUrlSchema = z
  .string()
  .url()
  .max(500)
  .refine((u) => /^https?:\/\//i.test(u), 'baseUrl must be http(s)')
  .refine((u) => {
    // Block obvious SSRF targets; operators that really need link-local
    // addresses can run a reverse proxy. Loopback stays allowed for local
    // runtimes such as Ollama / LM Studio / vLLM.
    try {
      const host = new URL(u).hostname;
      return !/^169\.254\./.test(host) && host !== 'metadata.google.internal';
    } catch {
      return false;
    }
  }, 'baseUrl host is not allowed');

export const ProviderCreateSchema = z.object({
  provider: z.enum(CONFIGURABLE_PROVIDER_KINDS),
  name: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9 _.-]*$/, 'name may contain letters, digits, space, _ . -'),
  baseUrl: BaseUrlSchema.optional(),
  apiKey: z.string().min(8).max(4000).optional(),
  models: z.array(ModelSchema).max(100).optional(),
  isEnabled: z.boolean().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  timeoutMs: z.number().int().min(1000).max(600_000).optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  /** `company` (default) = this tenant only; `global` = shared, super_admin only. */
  scope: z.enum(['company', 'global']).optional(),
});
export type ProviderCreateInput = z.infer<typeof ProviderCreateSchema>;

export const ProviderUpdateSchema = ProviderCreateSchema.partial().omit({ scope: true }).extend({
  /** Explicitly remove the stored key. */
  clearApiKey: z.boolean().optional(),
});
export type ProviderUpdateInput = z.infer<typeof ProviderUpdateSchema>;

export interface ProviderActor {
  userId: string;
  role: string;
  companyId: string;
}

export class ProviderAdminError extends Error {
  constructor(message: string, public status: number, public code: string) {
    super(message);
    this.name = 'ProviderAdminError';
  }
}

const ADMIN_ROLES = new Set(['admin', 'super_admin']);

function requireAdmin(actor: ProviderActor): void {
  if (!ADMIN_ROLES.has(actor.role)) {
    throw new ProviderAdminError('Managing AI providers requires an administrator', 403, 'FORBIDDEN');
  }
}

function requireKeyStorage(): void {
  if (!isFieldEncryptionConfigured()) {
    throw new ProviderAdminError(
      'ENCRYPTION_KEY is not configured; API keys cannot be stored securely.',
      503,
      'ENCRYPTION_NOT_CONFIGURED',
    );
  }
}

function needsBaseUrl(provider: string): boolean {
  return provider === 'openai-compatible';
}

function needsApiKey(provider: string): boolean {
  return !['ollama', 'zai-sdk'].includes(provider);
}

// ─── Queries ────────────────────────────────────────────────────────

/** Configs the tenant may use: its own plus shared ones. */
export async function listProviderConfigs(actor: ProviderActor): Promise<ProviderConfigView[]> {
  const rows = (await db.aIProviderConfig.findMany({
    where: { OR: [{ companyId: actor.companyId }, { companyId: null }] },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  })) as ProviderConfigRecord[];
  return rows.map(describeProviderConfig);
}

async function loadOwned(id: string, actor: ProviderActor): Promise<ProviderConfigRecord> {
  const row = (await db.aIProviderConfig.findUnique({ where: { id } })) as ProviderConfigRecord | null;
  if (!row) throw new ProviderAdminError('Provider config not found', 404, 'NOT_FOUND');
  if (row.companyId === null) {
    if (actor.role !== 'super_admin') {
      // Tenants can see shared providers but never change them.
      throw new ProviderAdminError('Shared providers are managed by a super administrator', 403, 'FORBIDDEN');
    }
    return row;
  }
  if (row.companyId !== actor.companyId) {
    // Do not reveal existence across tenants.
    throw new ProviderAdminError('Provider config not found', 404, 'NOT_FOUND');
  }
  return row;
}

// ─── Mutations ──────────────────────────────────────────────────────

export async function createProviderConfig(actor: ProviderActor, input: ProviderCreateInput): Promise<ProviderConfigView> {
  requireAdmin(actor);
  const scope = input.scope ?? 'company';
  if (scope === 'global' && actor.role !== 'super_admin') {
    throw new ProviderAdminError('Only a super administrator can create shared providers', 403, 'FORBIDDEN');
  }
  if (needsBaseUrl(input.provider) && !input.baseUrl) {
    throw new ProviderAdminError(`${input.provider} requires a baseUrl`, 400, 'VALIDATION_ERROR');
  }
  if (needsApiKey(input.provider) && !input.apiKey) {
    throw new ProviderAdminError(`${input.provider} requires an apiKey`, 400, 'VALIDATION_ERROR');
  }
  let sealed: { encryptedApiKey: string; keyFingerprint: string } | null = null;
  if (input.apiKey) {
    requireKeyStorage();
    sealed = sealApiKey(input.apiKey);
  }
  const companyId = scope === 'global' ? null : actor.companyId;
  const existing = await db.aIProviderConfig.findFirst({ where: { companyId, name: input.name }, select: { id: true } });
  if (existing) throw new ProviderAdminError(`A provider named "${input.name}" already exists`, 409, 'CONFLICT');

  const row = (await db.aIProviderConfig.create({
    data: {
      companyId,
      provider: input.provider,
      name: input.name,
      baseUrl: input.baseUrl ?? null,
      encryptedApiKey: sealed?.encryptedApiKey ?? null,
      keyFingerprint: sealed?.keyFingerprint ?? null,
      models: JSON.stringify(parseModelCatalogue(input.models ?? [])),
      isEnabled: input.isEnabled ?? true,
      priority: input.priority ?? 100,
      timeoutMs: input.timeoutMs ?? 60_000,
      maxRetries: input.maxRetries ?? 2,
      createdBy: actor.userId,
    },
  })) as ProviderConfigRecord;

  await audit(actor, 'provider.create', { id: row.id, provider: row.provider, name: row.name, scope });
  await ensureRouterSynced({ force: true });
  return describeProviderConfig(row);
}

export async function updateProviderConfig(
  actor: ProviderActor,
  id: string,
  input: ProviderUpdateInput,
): Promise<ProviderConfigView> {
  requireAdmin(actor);
  const row = await loadOwned(id, actor);
  const data: Record<string, unknown> = {};

  if (input.provider !== undefined) data.provider = input.provider;
  if (input.name !== undefined && input.name !== row.name) {
    const clash = await db.aIProviderConfig.findFirst({
      where: { companyId: row.companyId, name: input.name, NOT: { id } },
      select: { id: true },
    });
    if (clash) throw new ProviderAdminError(`A provider named "${input.name}" already exists`, 409, 'CONFLICT');
    data.name = input.name;
  }
  if (input.baseUrl !== undefined) data.baseUrl = input.baseUrl;
  if (input.models !== undefined) data.models = JSON.stringify(parseModelCatalogue(input.models));
  if (input.isEnabled !== undefined) data.isEnabled = input.isEnabled;
  if (input.priority !== undefined) data.priority = input.priority;
  if (input.timeoutMs !== undefined) data.timeoutMs = input.timeoutMs;
  if (input.maxRetries !== undefined) data.maxRetries = input.maxRetries;
  if (input.clearApiKey) {
    data.encryptedApiKey = null;
    data.keyFingerprint = null;
  } else if (input.apiKey) {
    requireKeyStorage();
    const sealed = sealApiKey(input.apiKey);
    data.encryptedApiKey = sealed.encryptedApiKey;
    data.keyFingerprint = sealed.keyFingerprint;
  }

  const provider = (data.provider as string | undefined) ?? row.provider;
  const baseUrl = (data.baseUrl as string | null | undefined) ?? row.baseUrl;
  const hasKey = 'encryptedApiKey' in data ? Boolean(data.encryptedApiKey) : Boolean(row.encryptedApiKey);
  if (needsBaseUrl(provider) && !baseUrl) {
    throw new ProviderAdminError(`${provider} requires a baseUrl`, 400, 'VALIDATION_ERROR');
  }
  if (needsApiKey(provider) && !hasKey) {
    throw new ProviderAdminError(`${provider} requires an apiKey`, 400, 'VALIDATION_ERROR');
  }

  // A material change invalidates the last health verdict.
  if ('baseUrl' in data || 'encryptedApiKey' in data || 'provider' in data) {
    data.lastHealthStatus = null;
    data.lastHealthAt = null;
    data.lastHealthLatencyMs = null;
    data.lastError = null;
  }

  const updated = (await db.aIProviderConfig.update({ where: { id }, data })) as ProviderConfigRecord;
  await audit(actor, 'provider.update', {
    id,
    fields: Object.keys(data).filter((k) => k !== 'encryptedApiKey'),
    keyRotated: Boolean(input.apiKey),
    keyCleared: Boolean(input.clearApiKey),
  });
  await ensureRouterSynced({ force: true });
  return describeProviderConfig(updated);
}

export async function deleteProviderConfig(actor: ProviderActor, id: string): Promise<void> {
  requireAdmin(actor);
  const row = await loadOwned(id, actor);
  await db.aIProviderConfig.delete({ where: { id: row.id } });
  await audit(actor, 'provider.delete', { id, provider: row.provider, name: row.name });
  await ensureRouterSynced({ force: true });
}

// ─── Connectivity test ──────────────────────────────────────────────

export interface ProviderTestResult {
  id: string;
  status: 'healthy' | 'degraded' | 'unreachable' | 'unauthorized' | 'misconfigured';
  latencyMs: number;
  models: string[];
  chat?: { ok: boolean; model: string; latencyMs: number; error?: string };
  error?: string;
  testedAt: string;
}

/**
 * Real connectivity test. Reads the key only inside this process, performs
 * `/models` (health) and, when `withChat`, a minimal chat completion.
 */
export async function testProviderConfig(
  actor: ProviderActor,
  id: string,
  options: { withChat?: boolean } = {},
): Promise<ProviderTestResult> {
  requireAdmin(actor);
  const row = await loadOwned(id, actor);
  const testedAt = new Date();
  let result: ProviderTestResult;

  try {
    const instance = buildProviderFromConfig(row);
    const health = await instance.healthCheck();
    const lastError = (instance as { lastError?: string | null }).lastError ?? null;
    let status: ProviderTestResult['status'] = health.isHealthy ? 'healthy' : 'unreachable';
    if (!health.isHealthy && lastError && /unauthorized|401|403/i.test(lastError)) status = 'unauthorized';

    let chat: ProviderTestResult['chat'];
    if (health.isHealthy && options.withChat) {
      const started = Date.now();
      try {
        await instance.initialize();
        const model = instance.supportedModels[0]?.id;
        if (!model) throw new Error('no model available for a chat test');
        const response = await instance.chatCompletion({
          model,
          messages: [{ role: 'user', content: 'Reply with the single word: pong' }],
          maxTokens: 5,
          temperature: 0,
        });
        chat = { ok: Boolean(response.content), model: response.model, latencyMs: Date.now() - started };
        if (!chat.ok) status = 'degraded';
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        chat = { ok: false, model: instance.supportedModels[0]?.id ?? '', latencyMs: Date.now() - started, error: message };
        status = /401|403|unauthorized/i.test(message) ? 'unauthorized' : 'degraded';
      }
    }

    result = {
      id,
      status,
      latencyMs: health.latencyMs,
      models: instance.supportedModels.map((m) => m.id),
      chat,
      error: status === 'healthy' ? undefined : (chat?.error ?? lastError ?? undefined),
      testedAt: testedAt.toISOString(),
    };
  } catch (err) {
    result = {
      id,
      status: 'misconfigured',
      latencyMs: 0,
      models: [],
      error: err instanceof Error ? err.message : String(err),
      testedAt: testedAt.toISOString(),
    };
  }

  await db.aIProviderConfig.update({
    where: { id },
    data: {
      lastHealthStatus: result.status,
      lastHealthAt: testedAt,
      lastHealthLatencyMs: result.latencyMs,
      lastError: result.error ? result.error.slice(0, 1000) : null,
    },
  });
  await audit(actor, 'provider.test', { id, status: result.status, latencyMs: result.latencyMs, chat: result.chat?.ok ?? null });
  return result;
}

// ─── Routing decisions (observability) ──────────────────────────────

export async function listRoutingDecisions(
  actor: ProviderActor,
  options: { limit?: number; runId?: string; success?: boolean } = {},
) {
  const take = Math.min(Math.max(options.limit ?? 50, 1), 500);
  const where: Record<string, unknown> = { companyId: actor.companyId };
  if (options.runId) where.runId = options.runId;
  if (options.success !== undefined) where.success = options.success;
  return db.modelRoutingDecision.findMany({ where, orderBy: { createdAt: 'desc' }, take });
}

export async function routingDecisionSummary(actor: ProviderActor, sinceHours = 24) {
  const since = new Date(Date.now() - sinceHours * 3600_000);
  const rows = await db.modelRoutingDecision.findMany({
    where: { companyId: actor.companyId, createdAt: { gte: since } },
    select: { selectedProvider: true, success: true, latencyMs: true, costUsd: true, fallbackFrom: true, errorCode: true },
  });
  const byProvider = new Map<string, { total: number; failed: number; fallbacks: number; latencyMs: number[]; costUsd: number }>();
  for (const r of rows) {
    const key = r.selectedProvider ?? '(none)';
    const agg = byProvider.get(key) ?? { total: 0, failed: 0, fallbacks: 0, latencyMs: [], costUsd: 0 };
    agg.total++;
    if (!r.success) agg.failed++;
    if (r.fallbackFrom) agg.fallbacks++;
    if (typeof r.latencyMs === 'number') agg.latencyMs.push(r.latencyMs);
    agg.costUsd += r.costUsd ?? 0;
    byProvider.set(key, agg);
  }
  const p = (arr: number[], q: number) => {
    if (arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  };
  return {
    sinceHours,
    total: rows.length,
    failed: rows.filter((r) => !r.success).length,
    providers: Array.from(byProvider.entries()).map(([provider, agg]) => ({
      provider,
      total: agg.total,
      failed: agg.failed,
      fallbacks: agg.fallbacks,
      p50LatencyMs: p(agg.latencyMs, 0.5),
      p95LatencyMs: p(agg.latencyMs, 0.95),
      costUsd: Number(agg.costUsd.toFixed(6)),
    })),
  };
}

// ─── Audit ──────────────────────────────────────────────────────────

async function audit(actor: ProviderActor, action: string, details: Record<string, unknown>): Promise<void> {
  await db.auditLog
    .create({
      data: {
        userId: actor.userId,
        action,
        resource: 'ai-providers',
        details: JSON.stringify({ ...details, companyId: actor.companyId }),
      },
    })
    .catch(() => undefined);
}
