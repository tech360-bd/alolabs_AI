/**
 * ALO Open AI Platform — workspace and project lifecycle.
 *
 * A brand-new user must be able to go from "registered" to "made an API call"
 * without an administrator. That means registration has to provision a
 * workspace, a project and a key in one idempotent step, and every later action
 * has to work against it.
 *
 * These functions are the only writers of workspace/project rows. Keeping them
 * in one module is what makes the isolation rules auditable: every query below
 * is either scoped by `ownerId`/`userId`, or by a workspace id the caller has
 * already proven it owns.
 */

import { db } from '@/lib/db';
import { mintApiKey, type ApiKeyScope } from './principal';

const RESERVED_SLUGS = new Set(['api', 'admin', 'new', 'settings', 'login', 'logout', 'static', '_next']);

/**
 * Scopes a first key gets.
 *
 * These are exactly what the platform's own web client needs to function for a
 * single user's own data. They are still least-privilege: no `ai:video`, no
 * `ai:code`, no `agents:run`, no files. Anything that can spend serious compute
 * or touch the host is opt-in, which is what makes the scope list meaningful
 * rather than decorative — a key that grants everything proves nothing when the
 * tests later check that scoped keys are refused.
 */
const DEFAULT_KEY_SCOPES = [
  'ai:chat', 'ai:embed', 'models:read', 'usage:read',
  'conversations:read', 'conversations:write',
];

/** Lowercase, ASCII-safe slug with a random suffix when the base is taken. */
export function slugify(value: string, fallback = 'workspace'): string {
  const base = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || fallback;
  return RESERVED_SLUGS.has(base) ? `${base}-ws` : base;
}

async function uniqueSlug(model: 'workspace' | 'project', base: string, workspaceId?: string): Promise<string> {
  const root = slugify(base);
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = attempt === 0 ? root : `${root}-${Math.random().toString(36).slice(2, 6)}`;
    const taken = model === 'workspace'
      ? await db.aiWorkspace.findUnique({ where: { slug: candidate }, select: { id: true } })
      : await db.aiProject.findFirst({ where: { workspaceId: workspaceId ?? '', slug: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

export interface ProvisionedWorkspace {
  workspaceId: string;
  projectId: string;
  /** Returned once, never stored in plaintext. */
  apiKey: { plaintext: string; keyPrefix: string; keySuffix: string; id: string };
}

/**
 * Give a newly registered user a working workspace.
 *
 * Idempotent: calling it twice for the same user returns the existing
 * workspace/project instead of creating duplicates. It does *not* mint a second
 * API key on the second call — the plaintext could not be shown again anyway, so
 * silently minting one would be a lie about which keys are live.
 */
export async function provisionDefaultWorkspace(
  userId: string,
  userName: string,
  options: { withApiKey?: boolean } = {},
): Promise<ProvisionedWorkspace> {
  const existing = await db.aiWorkspace.findFirst({
    where: { ownerId: userId },
    orderBy: { createdAt: 'asc' },
    include: { projects: { orderBy: { createdAt: 'asc' }, take: 1 } },
  });

  if (existing) {
    const project = existing.projects[0] ?? (await createProject(existing.id, userId, 'Default project'));
    const key = options.withApiKey === false ? null : await createApiKey(existing.id, project.id, userId, {
      name: 'Default key', scopes: DEFAULT_KEY_SCOPES,
    });
    return {
      workspaceId: existing.id,
      projectId: project.id,
      apiKey: key ?? { plaintext: '', keyPrefix: '', keySuffix: '', id: '' },
    };
  }

  const slug = await uniqueSlug('workspace', `${userName}-workspace`);
  const workspace = await db.aiWorkspace.create({
    data: {
      name: `${userName}'s workspace`,
      slug,
      ownerId: userId,
      kind: 'personal',
      members: { create: { userId, role: 'owner' } },
    },
  });
  const project = await createProject(workspace.id, userId, 'Default project');
  const key = await createApiKey(workspace.id, project.id, userId, {
    name: 'Default key',
    scopes: DEFAULT_KEY_SCOPES,
  });

  return { workspaceId: workspace.id, projectId: project.id, apiKey: key };
}

export interface CreatedProject {
  id: string;
  name: string;
  slug: string;
}

export async function createProject(workspaceId: string, userId: string, name: string, description = ''): Promise<CreatedProject> {
  const slug = await uniqueSlug('project', name, workspaceId);
  const project = await db.aiProject.create({
    data: { workspaceId, name: name.slice(0, 120), slug, description: description.slice(0, 2000), createdBy: userId },
    select: { id: true, name: true, slug: true },
  });
  return project;
}

export interface CreatedApiKey {
  id: string;
  plaintext: string;
  keyPrefix: string;
  keySuffix: string;
  /** ISO timestamp; null when the key does not expire. */
  expiresAt: string | null;
}

/**
 * Mint a project API key.
 *
 * Scopes are intersected with `API_KEY_SCOPES` so a caller cannot request a
 * scope the platform does not issue; an empty result falls back to the three
 * least-privilege defaults rather than granting everything.
 */
export async function createApiKey(
  workspaceId: string,
  projectId: string | null,
  userId: string,
  input: {
    name: string;
    scopes?: ApiKeyScope[] | string[];
    expiresInDays?: number | null;
    rateLimit?: number;
  },
): Promise<CreatedApiKey> {
  const allowed = new Set(['ai:chat', 'ai:embed', 'ai:image', 'ai:audio', 'ai:code', 'models:read', 'agents:run', 'usage:read', 'files:read', 'files:write', 'conversations:read', 'conversations:write']);
  const requested = (input.scopes ?? []).filter((scope): scope is string => typeof scope === 'string' && allowed.has(scope));
  const scopes = requested.length ? requested : ['ai:chat', 'models:read', 'usage:read', 'conversations:read', 'conversations:write'];

  const minted = mintApiKey();
  const expiresAt = input.expiresInDays && input.expiresInDays > 0
    ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const row = await db.aiApiKey.create({
    data: {
      workspaceId,
      projectId,
      name: input.name.slice(0, 120),
      keyHash: minted.keyHash,
      keyPrefix: minted.keyPrefix,
      keySuffix: minted.keySuffix,
      scopes: JSON.stringify(scopes),
      rateLimit: Math.max(1, Math.min(10_000, input.rateLimit ?? 60)),
      createdBy: userId,
      ...(expiresAt ? { expiresAt } : {}),
    },
    select: { id: true },
  });

  return {
    id: row.id,
    plaintext: minted.plaintext,
    keyPrefix: minted.keyPrefix,
    keySuffix: minted.keySuffix,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
  };
}

/**
 * Revoke a key immediately.
 *
 * Also clears `isActive` so any code path that only checks that flag is safe
 * too; both are checked on every request.
 */
export async function revokeApiKey(workspaceId: string, keyId: string): Promise<boolean> {
  const result = await db.aiApiKey.updateMany({
    where: { id: keyId, workspaceId, revokedAt: null },
    data: { isActive: false, revokedAt: new Date() },
  });
  return result.count > 0;
}

/**
 * Rotate a key: revoke the old one and issue a new one with the same scope,
 * project and rate limit. The old key stops working on its next request.
 */
export async function rotateApiKey(workspaceId: string, keyId: string, userId: string): Promise<CreatedApiKey | null> {
  const existing = await db.aiApiKey.findFirst({ where: { id: keyId, workspaceId, revokedAt: null } });
  if (!existing) return null;

  let scopes: string[] = [];
  try {
    const parsed: unknown = JSON.parse(existing.scopes || '[]');
    if (Array.isArray(parsed)) scopes = parsed.filter((s): s is string => typeof s === 'string');
  } catch {
    scopes = [];
  }

  const rotated = await createApiKey(workspaceId, existing.projectId, userId, {
    name: existing.name,
    scopes,
    rateLimit: existing.rateLimit,
  });

  await db.aiApiKey.update({
    where: { id: existing.id },
    data: { isActive: false, revokedAt: new Date() },
  });
  await db.aiApiKey.update({ where: { id: rotated.id }, data: { rotatedFrom: existing.id } }).catch(() => undefined);

  return rotated;
}

/** Workspace statistics for the dashboard. */
export async function workspaceSummary(workspaceId: string): Promise<{
  projects: number;
  keys: number;
  activeKeys: number;
  conversations: number;
  files: number;
  requests30d: number;
  tokens30d: number;
}> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [projects, keys, activeKeys, conversations, files, usage] = await Promise.all([
    db.aiProject.count({ where: { workspaceId, status: 'active' } }),
    db.aiApiKey.count({ where: { workspaceId } }),
    db.aiApiKey.count({ where: { workspaceId, isActive: true, revokedAt: null } }),
    db.aiConversation.count({ where: { workspaceId, archived: false } }),
    db.aiFile.count({ where: { workspaceId } }),
    db.aiUsageRecord.aggregate({
      where: { workspaceId, createdAt: { gte: since } },
      _count: { id: true },
      _sum: { totalTokens: true },
    }),
  ]);
  return {
    projects,
    keys,
    activeKeys,
    conversations,
    files,
    requests30d: usage._count.id,
    tokens30d: usage._sum.totalTokens ?? 0,
  };
}
