/**
 * Provider registry
 * ALO Labs AgentOS — builds concrete provider instances from configuration
 * and keeps the process-wide AIRouter in sync with it.
 *
 * Sources, in order:
 *   1. Environment variables (operator-level, shared by all tenants).
 *   2. `AIProviderConfig` rows — shared when `companyId` is NULL, otherwise
 *      visible only to that tenant (the router enforces this).
 *
 * Secrets are decrypted here, handed to the provider instance in memory and
 * never returned to callers: `describeProviderConfig()` is the only
 * serialisation and it exposes the key fingerprint at most.
 */

import type { AIRouter } from './router';
import type { AIProvider, AICapability } from './types';
import { BaseAIProvider } from './provider-base';
import { OpenAICompatibleProvider, openAICompatibleProviderName } from './openai-compatible-provider';
import type { OpenAICompatibleModelConfig } from './openai-compatible-provider';
import { GroqProvider } from './groq-provider';
import { DeepSeekProvider } from './deepseek-provider';
import { MistralProvider } from './mistral-provider';
import { QwenProvider } from './qwen-provider';
import { OpenRouterProvider } from './openrouter-provider';
import { OllamaProvider } from './ollama-provider';
import { ZAIProvider } from './zai-provider';
import { decryptField, encryptField, fingerprint, isEncryptedField } from '../security/field-encryption';

// ─── Types ──────────────────────────────────────────────────────────

/** Provider kinds an operator can configure (AIProviderConfig.provider). */
export const CONFIGURABLE_PROVIDER_KINDS = [
  'openai-compatible',
  'groq',
  'deepseek',
  'mistral',
  'qwen',
  'openrouter',
  'ollama',
  'zai-sdk',
] as const;
export type ConfigurableProviderKind = (typeof CONFIGURABLE_PROVIDER_KINDS)[number];

/** Shape of an AIProviderConfig row as the registry needs it. */
export interface ProviderConfigRecord {
  id: string;
  companyId: string | null;
  provider: string;
  name: string;
  baseUrl: string | null;
  encryptedApiKey: string | null;
  keyFingerprint: string | null;
  models: string;
  isEnabled: boolean;
  priority: number;
  timeoutMs: number;
  maxRetries: number;
  lastHealthStatus: string | null;
  lastHealthAt: Date | null;
  lastHealthLatencyMs: number | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProviderConfigView {
  id: string;
  companyId: string | null;
  provider: string;
  name: string;
  routerName: string;
  baseUrl: string | null;
  hasApiKey: boolean;
  keyFingerprint: string | null;
  models: OpenAICompatibleModelConfig[];
  isEnabled: boolean;
  priority: number;
  timeoutMs: number;
  maxRetries: number;
  lastHealthStatus: string | null;
  lastHealthAt: string | null;
  lastHealthLatencyMs: number | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderConfigDb {
  aIProviderConfig: {
    findMany: (args: unknown) => Promise<ProviderConfigRecord[]>;
  };
}

const VALID_CAPABILITIES: AICapability[] = [
  'chat', 'streaming', 'function-calling', 'vision', 'json-mode', 'embedding', 'code-generation', 'reasoning', 'audio',
];

// ─── Model catalogue parsing ────────────────────────────────────────

export function parseModelCatalogue(raw: unknown): OpenAICompatibleModelConfig[] {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const out: OpenAICompatibleModelConfig[] = [];
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) {
      out.push({ id: item.trim() });
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const m = item as Record<string, unknown>;
    if (typeof m.id !== 'string' || !m.id.trim()) continue;
    const caps = Array.isArray(m.capabilities)
      ? (m.capabilities.filter((c): c is AICapability => typeof c === 'string' && (VALID_CAPABILITIES as string[]).includes(c)))
      : undefined;
    out.push({
      id: m.id.trim(),
      name: typeof m.name === 'string' ? m.name : undefined,
      contextLength: typeof m.contextLength === 'number' && m.contextLength > 0 ? Math.floor(m.contextLength) : undefined,
      capabilities: caps && caps.length > 0 ? caps : undefined,
      costPerMillionTokens:
        typeof m.costPerMillionTokens === 'number' && m.costPerMillionTokens >= 0 ? m.costPerMillionTokens : undefined,
    });
  }
  return out;
}

// ─── Secret handling ────────────────────────────────────────────────

export function sealApiKey(apiKey: string): { encryptedApiKey: string; keyFingerprint: string } {
  return { encryptedApiKey: encryptField(apiKey), keyFingerprint: fingerprint(apiKey) };
}

function openApiKey(record: Pick<ProviderConfigRecord, 'encryptedApiKey' | 'name'>): string | undefined {
  if (!record.encryptedApiKey) return undefined;
  if (!isEncryptedField(record.encryptedApiKey)) {
    throw new Error(`Provider config "${record.name}" holds an unencrypted key; refusing to use it.`);
  }
  return decryptField(record.encryptedApiKey);
}

// ─── Router names ───────────────────────────────────────────────────

/** Router-facing name for a config row: unique per (tenant, name) for OpenAI-compatible endpoints. */
export function routerNameForConfig(record: Pick<ProviderConfigRecord, 'provider' | 'name' | 'companyId'>): AIProvider {
  if (record.provider === 'openai-compatible') {
    const scope = record.companyId ? `${record.companyId}.${record.name}` : record.name;
    return openAICompatibleProviderName(scope);
  }
  return record.provider as AIProvider;
}

// ─── Instance construction ──────────────────────────────────────────

export function buildProviderFromConfig(record: ProviderConfigRecord): BaseAIProvider {
  const apiKey = openApiKey(record);
  const models = parseModelCatalogue(record.models);
  const endpoint = record.baseUrl ?? undefined;

  switch (record.provider as ConfigurableProviderKind) {
    case 'openai-compatible': {
      if (!endpoint) throw new Error(`Provider config "${record.name}" needs a baseUrl.`);
      const scope = record.companyId ? `${record.companyId}.${record.name}` : record.name;
      return new OpenAICompatibleProvider({
        id: scope,
        label: record.name,
        baseUrl: endpoint,
        apiKey,
        models,
        timeoutMs: record.timeoutMs,
      });
    }
    case 'groq':
      return new GroqProvider({ endpoint, apiKey });
    case 'deepseek':
      return new DeepSeekProvider({ endpoint, apiKey });
    case 'mistral':
      return new MistralProvider({ endpoint, apiKey });
    case 'qwen':
      return new QwenProvider({ endpoint, apiKey });
    case 'openrouter':
      return new OpenRouterProvider({ endpoint, apiKey });
    case 'ollama':
      return new OllamaProvider(endpoint);
    case 'zai-sdk':
      return new ZAIProvider();
    default:
      throw new Error(`Unknown provider kind "${record.provider}".`);
  }
}

/** Secret-free serialisation for APIs and UI. */
export function describeProviderConfig(record: ProviderConfigRecord): ProviderConfigView {
  return {
    id: record.id,
    companyId: record.companyId,
    provider: record.provider,
    name: record.name,
    routerName: routerNameForConfig(record),
    baseUrl: record.baseUrl,
    hasApiKey: Boolean(record.encryptedApiKey),
    keyFingerprint: record.keyFingerprint,
    models: parseModelCatalogue(record.models),
    isEnabled: record.isEnabled,
    priority: record.priority,
    timeoutMs: record.timeoutMs,
    maxRetries: record.maxRetries,
    lastHealthStatus: record.lastHealthStatus,
    lastHealthAt: record.lastHealthAt ? record.lastHealthAt.toISOString() : null,
    lastHealthLatencyMs: record.lastHealthLatencyMs,
    lastError: record.lastError,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

// ─── Environment-based providers ────────────────────────────────────

export interface EnvironmentProviderSpec {
  name: AIProvider;
  create: () => BaseAIProvider;
  source: string;
}

function csv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Providers implied by environment variables. Only providers whose
 * credentials are actually present are returned — nothing is "assumed".
 */
export function providersFromEnvironment(env: NodeJS.ProcessEnv = process.env): EnvironmentProviderSpec[] {
  const specs: EnvironmentProviderSpec[] = [];

  if (env.OPENAI_API_KEY || env.OPENAI_BASE_URL) {
    const models = csv(env.OPENAI_MODELS);
    specs.push({
      name: 'openai-compatible',
      source: 'OPENAI_API_KEY / OPENAI_BASE_URL',
      create: () =>
        new OpenAICompatibleProvider({
          id: 'default',
          label: 'openai-compatible',
          baseUrl: env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
          apiKey: env.OPENAI_API_KEY,
          models: (models.length > 0 ? models : ['gpt-4o-mini']).map((id) => ({ id })),
          timeoutMs: Number(env.OPENAI_TIMEOUT_MS) || undefined,
        }),
    });
  }
  if (env.GROQ_API_KEY) specs.push({ name: 'groq', source: 'GROQ_API_KEY', create: () => new GroqProvider() });
  if (env.DEEPSEEK_API_KEY) specs.push({ name: 'deepseek', source: 'DEEPSEEK_API_KEY', create: () => new DeepSeekProvider() });
  if (env.MISTRAL_API_KEY) specs.push({ name: 'mistral', source: 'MISTRAL_API_KEY', create: () => new MistralProvider() });
  if (env.QWEN_API_KEY) specs.push({ name: 'qwen', source: 'QWEN_API_KEY', create: () => new QwenProvider() });
  if (env.OPENROUTER_API_KEY) specs.push({ name: 'openrouter', source: 'OPENROUTER_API_KEY', create: () => new OpenRouterProvider() });
  if (env.OLLAMA_BASE_URL || env.OLLAMA_HOST) {
    specs.push({
      name: 'ollama',
      source: 'OLLAMA_BASE_URL',
      create: () => new OllamaProvider(env.OLLAMA_BASE_URL || env.OLLAMA_HOST),
    });
  }
  // The Z-AI SDK reads its own `.z-ai-config`; keep the historical default
  // unless the operator explicitly disables it.
  if (env.ZAI_SDK_ENABLED !== 'false') {
    specs.push({ name: 'zai-sdk', source: '.z-ai-config', create: () => new ZAIProvider() });
  }
  return specs;
}

// ─── Router synchronisation ─────────────────────────────────────────

export interface SyncResult {
  registered: string[];
  removed: string[];
  skipped: Array<{ name: string; reason: string }>;
}

const managedByDb = new Set<string>();
let lastSignature = '';

function signatureOf(records: ProviderConfigRecord[]): string {
  return records
    .map((r) => `${r.id}:${r.updatedAt.getTime()}:${r.isEnabled ? 1 : 0}`)
    .sort()
    .join('|');
}

/** Register env-derived providers once (idempotent). */
export function registerEnvironmentProviders(router: AIRouter, env: NodeJS.ProcessEnv = process.env): string[] {
  const added: string[] = [];
  for (const spec of providersFromEnvironment(env)) {
    if (router.getProvider(spec.name)) continue;
    try {
      router.registerProvider(spec.create());
      added.push(spec.name);
    } catch {
      // constructor failures (bad URL etc.) are surfaced by health endpoints
    }
  }
  return added;
}

/**
 * Reconcile the router with `AIProviderConfig`. Rows win over environment
 * providers of the same name (an operator who stored a key in the UI expects
 * it to be used). Disabled/deleted rows are unregistered.
 */
export async function syncRouterWithProviderConfigs(
  router: AIRouter,
  db: ProviderConfigDb,
  options: { force?: boolean } = {},
): Promise<SyncResult> {
  const result: SyncResult = { registered: [], removed: [], skipped: [] };
  const rows = await db.aIProviderConfig.findMany({ orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] });
  const signature = signatureOf(rows);
  if (!options.force && signature === lastSignature) return result;
  lastSignature = signature;

  const wanted = new Map<string, ProviderConfigRecord>();
  for (const row of rows) {
    if (!row.isEnabled) continue;
    const name = routerNameForConfig(row);
    if (wanted.has(name)) {
      result.skipped.push({ name: row.name, reason: `router name ${name} already used by a higher-priority config` });
      continue;
    }
    wanted.set(name, row);
  }

  // Remove DB-managed providers that are gone/disabled.
  for (const name of Array.from(managedByDb)) {
    if (!wanted.has(name)) {
      router.removeProvider(name as AIProvider);
      managedByDb.delete(name);
      result.removed.push(name);
    }
  }

  // (Re)register the wanted ones.
  for (const [name, row] of wanted) {
    try {
      const instance = buildProviderFromConfig(row);
      if (router.getProvider(name as AIProvider)) {
        router.removeProvider(name as AIProvider); // replace env/previous instance with the configured one
      }
      router.registerProvider(instance, { weight: Math.max(1, 1000 - row.priority), companyId: row.companyId ?? undefined });
      managedByDb.add(name);
      result.registered.push(name);
    } catch (err) {
      result.skipped.push({ name: row.name, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return result;
}

/** Test hook: forget the sync signature so the next sync re-reads everything. */
export function resetProviderRegistryState(): void {
  managedByDb.clear();
  lastSignature = '';
}
