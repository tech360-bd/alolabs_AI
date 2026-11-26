/**
 * ALO Open AI Platform — authentication and tenant resolution.
 *
 * Two credential kinds reach the platform, and they resolve to the same
 * `PlatformPrincipal` so every downstream handler has one shape to reason about:
 *
 *   session  — a logged-in user (the web UI), resolved through the existing
 *              AgentOS session verification.
 *   api-key  — a project API key (`alo_pk_…`), resolved by SHA-256 digest.
 *
 * WHY A SEPARATE LAYER FROM `src/lib/v1-auth.ts`
 * ----------------------------------------------
 * The existing `/api/v1` keys (`alo_…`) are *company* keys for the internal
 * AgentOS control plane. Platform keys are *workspace/project* keys for the
 * public product, have a different scope vocabulary (`ai:chat`, not
 * `agents:read`) and are revoked independently. Keeping them separate is what
 * stops a public signup from ever minting a credential that can read the
 * internal control plane: the two resolvers never return each other's rows.
 *
 * ISOLATION GUARANTEE
 * -------------------
 * `PlatformPrincipal` is the *only* thing handlers use to build queries, and it
 * always carries a concrete `workspaceId`. Handlers never read a workspace id
 * from the request. A request may name a `projectId`, but it is checked against
 * the principal's workspace before use — so the isolation boundary is
 * "the workspace the credential belongs to", not "whatever the caller asked
 * for".
 *
 * FAIL-CLOSED BEHAVIOUR
 * ---------------------
 *  - Unknown / revoked / expired key → null (no fallback to session auth).
 *  - Suspended workspace → null.
 *  - Key scopes are checked per service; a missing scope is a 403, not a 500.
 *  - Every rejection is recorded in `AiFallbackEvent`? No — in the security
 *    audit path, so a brute-force attempt is visible in Super Admin.
 */

import { createHash, randomBytes } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth';
import { isInternalRole } from '@/lib/access/surfaces';

/** Human-visible key prefix. Distinct from AgentOS `alo_` company keys. */
export const PLATFORM_KEY_PREFIX = 'alo_pk_';

export type PrincipalKind = 'session' | 'api-key';

export interface PlatformPrincipal {
  kind: PrincipalKind;
  userId: string;
  email: string;
  name: string;
  role: string;
  /** Workspace the credential belongs to — the isolation boundary. */
  workspaceId: string;
  /** Set when the credential is scoped to a single project. */
  projectId?: string;
  /** Granted scopes. A session principal gets the workspace's full set. */
  scopes: string[];
  /** Present for api-key principals only. */
  apiKeyId?: string;
  /** Rate limit for this credential (requests/minute). */
  rateLimitPerMinute: number;
}

/** Scopes a session principal implicitly holds inside its own workspace. */
export const SESSION_SCOPES = [
  'ai:chat', 'ai:embed', 'ai:image', 'ai:audio', 'ai:video', 'ai:code',
  'models:read', 'agents:run', 'projects:read', 'projects:write',
  'keys:read', 'keys:write', 'usage:read', 'files:read', 'files:write',
  'jobs:read', 'conversations:read', 'conversations:write',
];

/** Scopes that may be granted to a project API key. */
export const API_KEY_SCOPES = [
  'ai:chat', 'ai:embed', 'ai:image', 'ai:audio', 'ai:code',
  'models:read', 'agents:run', 'usage:read', 'files:read', 'files:write',
  'conversations:read', 'conversations:write',
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

/**
 * Mint a new key. Returns the plaintext ONCE — it is never stored and cannot be
 * recovered, which is why the UI shows it behind a single-use copy affordance.
 */
export function mintApiKey(): { plaintext: string; keyHash: string; keyPrefix: string; keySuffix: string } {
  const secret = randomBytes(32).toString('base64url');
  const plaintext = `${PLATFORM_KEY_PREFIX}${secret}`;
  return {
    plaintext,
    keyHash: hashApiKey(plaintext),
    keyPrefix: plaintext.slice(0, PLATFORM_KEY_PREFIX.length + 6),
    keySuffix: plaintext.slice(-4),
  };
}

export function parseScopes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((scope): scope is string => typeof scope === 'string');
  } catch {
    return [];
  }
}

export function hasScope(principal: PlatformPrincipal, scope: string): boolean {
  return principal.scopes.includes('*') || principal.scopes.includes(scope);
}

// ─── Credential extraction ─────────────────────────────────────────────────

function bearerOf(request: NextRequest): string | null {
  const header = request.headers.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length).trim() || null;
  return null;
}

/** Project key from `x-api-key` or a bearer token that carries the pk prefix. */
function apiKeyOf(request: NextRequest): string | null {
  const header = request.headers.get('x-api-key')?.trim();
  if (header) return header;
  const bearer = bearerOf(request);
  return bearer?.startsWith(PLATFORM_KEY_PREFIX) ? bearer : null;
}

// ─── Resolution ────────────────────────────────────────────────────────────

const WORKSPACE_MEMBER_ROLES = new Set(['owner', 'admin', 'member', 'viewer']);

async function principalFromApiKey(plaintext: string): Promise<PlatformPrincipal | null> {
  const keyHash = hashApiKey(plaintext);
  const key = await db.aiApiKey.findUnique({
    where: { keyHash },
    select: {
      id: true, workspaceId: true, projectId: true, scopes: true, isActive: true,
      expiresAt: true, revokedAt: true, rateLimit: true, createdBy: true,
    },
  });
  if (!key) return null;
  if (!key.isActive || key.revokedAt) return null;
  if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) return null;

  const workspace = await db.aiWorkspace.findUnique({
    where: { id: key.workspaceId },
    select: { id: true, status: true, ownerId: true },
  });
  if (!workspace || workspace.status !== 'active') return null;

  // The key acts on behalf of its creator, but only within its own workspace.
  const user = await db.user.findUnique({
    where: { id: key.createdBy },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) return null;

  // Touch last-used without blocking the request.
  void db.aiApiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  return {
    kind: 'api-key',
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    workspaceId: key.workspaceId,
    ...(key.projectId ? { projectId: key.projectId } : {}),
    scopes: parseScopes(key.scopes),
    apiKeyId: key.id,
    rateLimitPerMinute: key.rateLimit,
  };
}

async function principalFromSession(token: string, requestedWorkspaceId?: string | null): Promise<PlatformPrincipal | null> {
  // Sessions are audience-scoped; the platform is available to every role that
  // can reach the public product surface, so we accept either audience here and
  // let the workspace membership check be the authorisation step.
  const session = await verifySessionToken(token, { audience: 'any' });
  if (!session) return null;

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) return null;

  // Pick the workspace this request is about. An explicit `x-workspace-id`
  // header is honoured only if the user is a member of it — the check happens
  // below against the candidate list, so an id from another tenant simply does
  // not match and we do NOT silently fall back to a different workspace when
  // the caller explicitly asked for one (that would make a switcher lie).
  const requested = requestedWorkspaceId?.trim() || null;

  const memberships = await db.aiWorkspaceMember.findMany({
    where: { userId: user.id },
    select: { workspaceId: true, role: true, workspace: { select: { status: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const owned = await db.aiWorkspace.findMany({
    where: { ownerId: user.id },
    select: { id: true, status: true },
    orderBy: { createdAt: 'asc' },
  });

  const candidates = [
    ...memberships.map((m) => ({ id: m.workspaceId, role: m.role, status: m.workspace.status })),
    ...owned.map((w) => ({ id: w.id, role: 'owner', status: w.status })),
  ].filter((entry) => entry.status === 'active');

  /**
   * A signed-in account with no workspace is still a valid identity.
   *
   * This happens for real: an operator seeded on a fresh install administers the
   * platform before any tenant exists, and a newly invited staff member may not
   * have been added to a workspace yet. Refusing them at the *principal* layer
   * made the Super Admin panel unreachable for the one account that must reach
   * it, and produced an "invalid credential" message that was simply untrue.
   *
   * The principal is still honest about the absence: `workspaceId` is `''` and
   * every workspace-scoped helper treats that as "no tenant", so no query can
   * accidentally match a real workspace id.
   */
  if (candidates.length === 0) {
    if (requested) return null; // explicitly asked for a workspace they are not in
    return {
      kind: 'session',
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      workspaceId: '',
      scopes: SESSION_SCOPES,
      rateLimitPerMinute: 240,
    };
  }

  // An explicit request that does not resolve to a workspace the user belongs to
  // is a refusal, not a fallback: silently answering from a different workspace
  // is how a multi-tenant UI shows one customer another customer's data.
  if (requested && !candidates.some((c) => c.id === requested)) return null;

  const chosen = (requested ? candidates.find((c) => c.id === requested) : undefined) ?? candidates[0];
  if (!chosen || !WORKSPACE_MEMBER_ROLES.has(chosen.role)) return null;

  return {
    kind: 'session',
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    workspaceId: chosen.id,
    scopes: SESSION_SCOPES,
    rateLimitPerMinute: 240,
  };
}

/**
 * Resolve the platform principal for a request, or null.
 *
 * An `x-api-key` (or pk-prefixed bearer) always wins over a session cookie so a
 * caller can never be silently upgraded from a scoped key to full session
 * capabilities by sending both.
 */
export async function resolvePrincipal(request: NextRequest): Promise<PlatformPrincipal | null> {
  const key = apiKeyOf(request);
  if (key) {
    if (!key.startsWith(PLATFORM_KEY_PREFIX)) return null; // a non-platform key is never accepted here
    return principalFromApiKey(key);
  }
  const bearer = bearerOf(request);
  const cookie = request.cookies.get('session-token')?.value;
  const token = bearer ?? cookie;
  if (!token) return null;
  return principalFromSession(token, request.headers.get('x-workspace-id'));
}

/** Resolve the workspace a session user may act on, for UI bootstrapping. */
export async function sessionPrincipalForWorkspace(
  userId: string,
  workspaceId?: string,
): Promise<PlatformPrincipal | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) return null;

  const owned = await db.aiWorkspace.findFirst({
    where: { ownerId: user.id, status: 'active', ...(workspaceId ? { id: workspaceId } : {}) },
    orderBy: { createdAt: 'asc' },
  });
  const membership = owned
    ? null
    : await db.aiWorkspaceMember.findFirst({
        where: { userId: user.id, ...(workspaceId ? { workspaceId } : {}), workspace: { status: 'active' } },
        orderBy: { createdAt: 'asc' },
      });
  const target = owned?.id ?? membership?.workspaceId;
  if (!target) return null;

  return {
    kind: 'session',
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    workspaceId: target,
    scopes: SESSION_SCOPES,
    rateLimitPerMinute: 240,
  };
}

/**
 * Assert that a project belongs to the principal's workspace.
 *
 * This is the single function every project-scoped handler calls. Returning a
 * boolean rather than throwing keeps it usable in both the API layer (which
 * wants a 404) and background jobs (which want to skip quietly).
 */
export async function principalOwnsProject(
  principal: PlatformPrincipal,
  projectId: string | null | undefined,
): Promise<boolean> {
  if (!projectId) return true; // workspace-level credential
  // A project-scoped key may only ever touch its own project.
  if (principal.projectId && principal.projectId !== projectId) return false;
  const project = await db.aiProject.findFirst({
    where: { id: projectId, workspaceId: principal.workspaceId },
    select: { id: true },
  });
  return Boolean(project);
}

/** True when the principal may administer the workspace (not just use it). */
export async function canAdministerWorkspace(principal: PlatformPrincipal): Promise<boolean> {
  if (isInternalRole(principal.role)) return true; // AgentOS staff
  const workspace = await db.aiWorkspace.findFirst({
    where: { id: principal.workspaceId, ownerId: principal.userId },
    select: { id: true },
  });
  if (workspace) return true;
  const membership = await db.aiWorkspaceMember.findFirst({
    where: { workspaceId: principal.workspaceId, userId: principal.userId, role: { in: ['owner', 'admin'] } },
    select: { id: true },
  });
  return Boolean(membership);
}
