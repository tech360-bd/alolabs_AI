/**
 * Typed client for `/api/v1/platform/**`.
 *
 * The browser holds only its session cookie — never an API key. Project API
 * keys exist for *external* callers and machines; putting one in browser
 * JavaScript would mean every visitor's key is readable by any script on the
 * page and survives in local storage.
 *
 * Every function returns a discriminated result instead of throwing, so a
 * component can render an error state without a try/catch in render and without
 * accidentally showing `undefined` as data.
 */

export interface PlatformUser {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

export interface PlatformWorkspace {
  id: string;
  name: string;
  slug: string;
  kind: string;
  plan: string;
  ownerId: string;
  createdAt: string;
}

export interface MeResponse {
  principal: {
    kind: 'session' | 'api-key';
    userId: string;
    workspaceId: string;
    projectId: string | null;
    apiKeyId: string | null;
    scopes: string[];
    rateLimitPerMinute: number;
  };
  user: PlatformUser | null;
  workspace: PlatformWorkspace | null;
  permissions: {
    canAdministerWorkspace: boolean;
    canCreateKeys: boolean;
    canManageProviders: boolean;
  };
  summary: {
    projects: number;
    keys: number;
    activeKeys: number;
    conversations: number;
    files: number;
    requests30d: number;
    tokens30d: number;
  };
  inference: { anyProviderConfigured: boolean };
}

export interface ModelEntry {
  id: string;
  model: string;
  provider: string;
  providerKind: string;
  family: string;
  displayName: string;
  hostingType: 'local' | 'free-cloud' | 'remote';
  capabilities: string[];
  contextLength: number;
  approxSizeGb: number;
  priority: number;
  selectable: boolean;
  reachable: boolean;
  blockedReason?: string;
  notes?: string;
}

export interface ModelsResponse {
  models: ModelEntry[];
  counts: { total: number; selectable: number; byHostingType: Record<string, number> };
  tasks: string[];
}

export interface ChatAttempt {
  deployment: string;
  provider: string;
  model: string;
  ok: boolean;
  errorClass?: string;
}

export interface ChatResponse {
  content: string;
  model: string;
  provider: string;
  hostingType: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  latencyMs: number;
  finishReason: string;
  routing: { requested: string; task: string; usedFallback: boolean; attempts: ChatAttempt[] };
  conversationId?: string;
  requestId: string;
}

export interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  keySuffix: string;
  scopes: string[];
  projectId: string | null;
  status: 'active' | 'revoked' | 'expired' | 'inactive';
  maskedKey: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  rateLimit: number;
  createdAt: string;
  rotatedFrom: string | null;
}

export interface ConversationRow {
  id: string;
  title: string;
  model: string | null;
  provider: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  counts: { apiKeys: number; conversations: number; files: number };
}

export interface UsageResponse {
  window: { days: number; since: string };
  groupBy: string;
  totals: {
    requests: number;
    tokens: number;
    costUsd: number;
    failures: number;
    fallbacks: number;
    fallbackRate: number;
    avgLatencyMs: number;
  };
  rows: Array<{ key: string; requests: number; tokens: number; costUsd: number; failures: number; avgLatencyMs: number }>;
}

export interface HealthResponse {
  deployments: Array<{
    id: string;
    provider: string;
    model: string;
    hostingType: string;
    selectable: boolean;
    reachable: boolean;
    health: {
      status: string;
      consecutiveFailures: number;
      successRate: number;
      avgLatencyMs: number;
      lastErrorClass?: string;
      lastSuccessAt?: string;
    } | null;
    blockedReason?: string;
  }>;
  cooldowns: Array<{ provider: string; model: string; until: number; reason?: string }>;
}

export type Result<T> = { ok: true; data: T } | { ok: false; status: number; message: string; remediation?: string };

async function call<T>(path: string, init?: RequestInit): Promise<Result<T>> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/platform${path}`, {
      ...init,
      credentials: 'same-origin',
      headers: {
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
      cache: 'no-store',
    });
  } catch (error) {
    return { ok: false, status: 0, message: error instanceof Error ? error.message : 'Network error' };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const body = payload as { error?: { message?: string; remediation?: string } } | null;
    return {
      ok: false,
      status: response.status,
      message: body?.error?.message ?? `Request failed (${response.status})`,
      ...(body?.error?.remediation ? { remediation: body.error.remediation } : {}),
    };
  }
  return { ok: true, data: payload as T };
}

export const platformApi = {
  me: () => call<MeResponse>('/me'),

  models: (params?: { task?: string; only?: 'all' | 'selectable' }) => {
    const search = new URLSearchParams();
    if (params?.task) search.set('task', params.task);
    if (params?.only) search.set('only', params.only);
    const query = search.toString();
    return call<ModelsResponse>(`/models${query ? `?${query}` : ''}`);
  },

  chat: (body: {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    model?: string;
    mode?: 'auto' | 'manual';
    task?: string;
    temperature?: number;
    maxTokens?: number;
    conversationId?: string;
    projectId?: string;
  }) => call<ChatResponse>('/chat', { method: 'POST', body: JSON.stringify(body) }),

  keys: () => call<{ keys: ApiKeyRow[] }>('/keys'),
  createKey: (body: { name: string; scopes?: string[]; projectId?: string; expiresInDays?: number | null; rateLimit?: number }) =>
    call<{ key: ApiKeyRow; plaintext: string; warning: string }>('/keys', { method: 'POST', body: JSON.stringify(body) }),
  revokeKey: (keyId: string) => call<{ revoked: boolean }>(`/keys/${keyId}`, { method: 'DELETE' }),
  rotateKey: (keyId: string) =>
    call<{ key: ApiKeyRow; plaintext: string; revokedKeyId: string; warning: string }>(`/keys/${keyId}`, { method: 'POST' }),

  projects: () => call<{ projects: ProjectRow[] }>('/projects'),
  createProject: (body: { name: string; description?: string }) =>
    call<{ project: ProjectRow }>('/projects', { method: 'POST', body: JSON.stringify(body) }),

  conversations: () => call<{ conversations: ConversationRow[] }>('/conversations'),
  conversation: (id: string) =>
    call<{ conversation: ConversationRow; messages: Array<{ id: string; role: string; content: string; model: string | null; provider: string | null; createdAt: string }> }>(`/conversations/${id}`),
  archiveConversation: (id: string) => call<{ archived: boolean }>(`/conversations/${id}`, { method: 'DELETE' }),

  usage: (days = 30, groupBy: 'model' | 'provider' | 'project' | 'day' = 'model') =>
    call<UsageResponse>(`/usage?days=${days}&groupBy=${groupBy}`),

  health: (scope: 'workspace' | 'platform' = 'workspace') => call<HealthResponse>(`/health?scope=${scope}`),

  embeddings: (input: string | string[]) =>
    call<{ embeddings: number[][]; model: string; provider: string; dimensions: number; normalized: boolean }>('/embeddings', {
      method: 'POST',
      body: JSON.stringify({ input }),
    }),
};

/** Human label for a hosting tier. */
export function hostingLabel(hostingType: string): string {
  switch (hostingType) {
    case 'local': return 'Local';
    case 'free-cloud': return 'Free cloud';
    case 'remote': return 'Remote (paid)';
    default: return hostingType;
  }
}

/** Why a failed attempt failed, in words a user can act on. */
export function attemptReason(errorClass?: string): string {
  switch (errorClass) {
    case 'rate_limit': return 'rate limited';
    case 'quota_exhausted': return 'quota exhausted';
    case 'overloaded': return 'busy';
    case 'timeout': return 'timed out';
    case 'network': return 'unreachable';
    case 'auth': return 'credentials rejected';
    case 'not_found': return 'model missing';
    case 'cooldown': return 'cooling down';
    case 'context_overflow': return 'context too long';
    case 'invalid_request': return 'bad request';
    case 'content_policy': return 'content policy';
    case 'cancelled': return 'cancelled';
    default: return errorClass ?? 'failed';
  }
}
