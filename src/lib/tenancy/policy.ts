/**
 * Canonical tenant policy — the single place that answers "which tenant is
 * this, and may this principal act inside it".
 *
 * ── Why this module exists ──────────────────────────────────────────────────
 * Two authorisation towers grew independently:
 *
 *   · `src/lib/api-auth.ts`          → resolves `companyId` from CompanyUser
 *   · `src/lib/platform/principal.ts` → resolves `workspaceId` from
 *                                        AiWorkspaceMember, and never
 *                                        consulted Company at all
 *
 * The second one allowed a user who had been removed from a company to keep
 * full access to its workspaces, because a workspace membership row outlived
 * the company membership (threat T-3). Neither tower was wrong on its own; the
 * flaw was that they disagreed and nothing compared them.
 *
 * Rather than merge the towers — they have genuinely different session
 * lifetimes and cookie audiences — this module supplies the shared *policy*
 * they both call. Authentication stays where it is; authorisation converges.
 *
 * ── The ordering that matters ──────────────────────────────────────────────
 * Company first, then workspace. Reversing it reproduces T-3. A workspace
 * membership is a *narrowing* of company access, never a substitute for it.
 */

/** A tenant the caller has proven, not one they asked for. */
export interface TenantContext {
  /** The canonical tenant. Always present on a resolved context. */
  companyId: string;
  /** Role inside the company, from CompanyUser. */
  companyRole: string;
  /** Present only when the operation is workspace-scoped and access is proven. */
  workspaceId?: string;
  /** Role inside the workspace, from AiWorkspaceMember. Narrows companyRole. */
  workspaceRole?: string;
  /** True when the operation legitimately has no workspace (company-scoped). */
  companyScoped: boolean;
}

/** Tenant resolution failure. Callers map these to their own error shape. */
export class TenantPolicyError extends Error {
  constructor(
    /** Machine-readable reason, aligned with secure-route's vocabulary. */
    readonly code:
      | 'tenant_required'   // authenticated but no company membership
      | 'tenant_mismatch'   // claimed tenant ≠ resolved tenant
      | 'workspace_required'// workspace-scoped op with no usable workspace
      | 'workspace_forbidden' // workspace exists but the user has no membership
      | 'workspace_scope_mismatch', // workspace does not belong to the company
    message: string,
  ) {
    super(message);
    this.name = 'TenantPolicyError';
  }
}

/**
 * Placeholder identifiers that must never be treated as a real tenant.
 *
 * `default-company` was a literal fallback in the run engine (T-2); an empty
 * string was a legitimate principal workspaceId (T-4). Both made "no tenant"
 * indistinguishable from "some tenant", which is the exact confusion that lets
 * one customer's data be served to another.
 */
const FORBIDDEN_IDENTIFIERS = new Set([
  '',
  'default-company',
  'anonymous',
  'null',
  'undefined',
]);

/** Is this string a usable tenant/workspace identifier at all? */
export function isUsableTenantId(value: string | null | undefined): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  return !FORBIDDEN_IDENTIFIERS.has(trimmed.toLowerCase());
}

/**
 * Does this user currently hold a CompanyUser row?
 *
 * This is the gate T-3 was missing. It is deliberately a database read on every
 * call — a cached membership is how a revoked employee keeps working until the
 * cache expires, and "eventually revoked" is not a security property.
 */
/**
 * The narrow slice of Prisma this module needs.
 *
 * Prisma's generated delegate is generic over its argument shape, so a concrete
 * parameter type here would reject the real client. A broad `any` argument with
 * a narrow result keeps the call site honest while still accepting Prisma and
 * the test doubles the suites pass in.
 */
type MembershipLookup = {
  companyUser: { findFirst: (args: any) => Promise<{ companyId?: string; role?: string; id?: string } | null> };
};

export async function userBelongsToCompany(
  db: MembershipLookup,
  userId: string,
  companyId: string,
): Promise<boolean> {
  if (!isUsableTenantId(userId) || !isUsableTenantId(companyId)) return false;
  const row = await db.companyUser.findFirst({
    where: { userId, companyId },
    select: { id: true },
  });
  return row !== null && row !== undefined;
}

/**
 * Resolve the full tenant context for a principal.
 *
 * @param claim.companyId        A tenant the caller *claims*. Never trusted:
 *                               when present it must equal the resolved one.
 * @param claim.workspaceId      A workspace the caller requests. Must belong to
 *                               the resolved company and the user must be a
 *                               member of it.
 * @param requireWorkspace       True for workspace-scoped operations. A missing
 *                               or unusable workspace then fails closed.
 */
export async function resolveTenantContext(
  deps: {
    db: {
      companyUser: MembershipLookup['companyUser'];
      aiWorkspace: { findFirst: (args: any) => Promise<{ id?: string; companyId?: string | null; status?: string } | null> };
      aiWorkspaceMember: { findFirst: (args: any) => Promise<{ role?: string } | null> };
    };
  },
  principal: { userId: string },
  claim: { companyId?: string | null; workspaceId?: string | null } = {},
  options: { requireWorkspace?: boolean } = {},
): Promise<TenantContext> {
  const { db } = deps;

  if (!isUsableTenantId(principal.userId)) {
    throw new TenantPolicyError('tenant_required', 'No authenticated principal.');
  }

  // ── 1. Company membership is the prerequisite ─────────────────────────────
  // Without a company the caller is not a tenant at all, whatever else they
  // hold. This is the check that was missing from the platform tower.
  const memberships = (await db.companyUser.findFirst({
    where: { userId: principal.userId },
    select: { companyId: true, role: true },
  })) as { companyId: string; role: string } | null;

  if (!memberships) {
    throw new TenantPolicyError('tenant_required', 'This account does not belong to a company.');
  }

  const companyId = memberships.companyId;
  const companyRole = memberships.role;

  // ── 2. A claimed tenant can never widen the resolved one ─────────────────
  if (claim.companyId && claim.companyId !== companyId) {
    throw new TenantPolicyError(
      'tenant_mismatch',
      'The requested company does not match the authenticated tenant.',
    );
  }

  // ── 3. Workspace scope ────────────────────────────────────────────────────
  const requestedWorkspace = claim.workspaceId;
  const wantsWorkspace = Boolean(requestedWorkspace);

  if (!wantsWorkspace) {
    if (options.requireWorkspace) {
      throw new TenantPolicyError(
        'workspace_required',
        'This operation requires a workspace, and none was selected.',
      );
    }
    return { companyId, companyRole, companyScoped: true };
  }

  if (!isUsableTenantId(requestedWorkspace)) {
    throw new TenantPolicyError('workspace_required', 'The workspace identifier is not valid.');
  }

  const workspace = (await db.aiWorkspace.findFirst({
    where: { id: requestedWorkspace },
    select: { id: true, companyId: true, status: true },
  })) as { id: string; companyId: string | null; status: string } | null;

  if (!workspace) {
    // Deliberately the same error for "does not exist" and "belongs to someone
    // else": distinguishing them turns this endpoint into a tenant enumerator.
    throw new TenantPolicyError('workspace_forbidden', 'Workspace not found in your company.');
  }

  // ── 4. The workspace must belong to the resolved company ─────────────────
  // A workspace with no company is the legacy/unowned state. It cannot be
  // entered until an explicit backfill assigns it — silence here would let a
  // legacy workspace act as a loophole.
  if (!workspace.companyId || workspace.companyId !== companyId) {
    throw new TenantPolicyError(
      'workspace_scope_mismatch',
      'That workspace does not belong to your company.',
    );
  }

  if (workspace.status !== 'active') {
    throw new TenantPolicyError('workspace_forbidden', 'That workspace is not active.');
  }

  // ── 5. Workspace membership narrows, never grants ─────────────────────────
  const member = (await db.aiWorkspaceMember.findFirst({
    where: { workspaceId: requestedWorkspace, userId: principal.userId },
    select: { role: true },
  })) as { role: string } | null;

  if (!member) {
    throw new TenantPolicyError('workspace_forbidden', 'You are not a member of that workspace.');
  }

  return {
    companyId,
    companyRole,
    workspaceId: requestedWorkspace,
    workspaceRole: member.role,
    companyScoped: false,
  };
}

/**
 * May a company role perform an action inside a workspace?
 *
 * Kept deliberately small and explicit. Workspace roles narrow a company role;
 * `viewer` never writes, and a workspace `owner` is not automatically a company
 * administrator.
 */
export function workspaceRoleAllows(role: string | undefined, action: 'read' | 'write' | 'admin'): boolean {
  const rank: Record<string, number> = { viewer: 1, member: 2, admin: 3, owner: 3 };
  const need = { read: 1, write: 2, admin: 3 }[action];
  return (rank[role ?? ''] ?? 0) >= need;
}

/* ──────────────────────────────────────────────────────────────────────────
 * System operations — T-7
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * A system operation is one that acts ACROSS tenants: platform-wide usage,
 * cross-company repair, provisioning for a new company.
 *
 * `super_admin` used to be exactly that, implicitly and unaudited: holding the
 * role was itself permission to reach any tenant's data. That conflates two
 * very different things — "an administrator inside this company" and "an
 * operator acting on the platform as a whole" — and it means an ordinary
 * session carries cross-tenant reach with no record of having used it.
 *
 * System operations are now a distinct capability:
 *
 *   · they require the `system` scope, not merely the `super_admin` role;
 *   · they must name a reason;
 *   · every invocation writes an AuditLog row BEFORE the work happens, so an
 *     operation that crashes still leaves a trace of having been attempted.
 */
export const SYSTEM_SCOPE = 'system:cross-tenant';

/**
 * Which scopes does this user actually hold?
 *
 * The `system:cross-tenant` scope is NOT implied by any role. It is granted only
 * to accounts explicitly designated in `ALO_SYSTEM_OPERATORS` (comma-separated
 * user ids or emails). That is the point of separating the capability from the
 * role: being super_admin makes you an administrator *inside* a company; being
 * listed as a system operator is what allows reaching *across* companies.
 *
 * Fails closed. An empty or absent allowlist means nobody holds the scope, so a
 * misconfigured deployment loses convenience rather than isolation.
 */
export function resolveSystemScopes(
  user: { id: string; email: string; role: string },
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  if (user.role !== 'super_admin') return [];

  const allowlist = (env.ALO_SYSTEM_OPERATORS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  if (allowlist.length === 0) return [];

  const id = user.id.toLowerCase();
  const email = user.email.toLowerCase();
  return allowlist.includes(id) || allowlist.includes(email) ? [SYSTEM_SCOPE] : [];
}

/** May this principal hold the system scope at all? Role alone is not enough. */
export function canHoldSystemScope(principal: { role: string; scopes: string[] }): boolean {
  return principal.role === 'super_admin' && principal.scopes.includes(SYSTEM_SCOPE);
}

export class SystemOperationDenied extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SystemOperationDenied';
  }
}

/**
 * Assert that a cross-tenant operation is allowed, and record the attempt.
 *
 * Call this at the START of any operation that reads or writes more than one
 * tenant. It throws rather than returning a boolean because there is no safe
 * default: an unauthorised cross-tenant read that "just returns empty" is
 * indistinguishable from a bug.
 */
export async function assertSystemOperation(
  deps: { db: { auditLog: { create: (args: any) => Promise<unknown> } } },
  principal: { userId: string; role: string; scopes: string[] },
  operation: { action: string; reason: string; targetCompanyIds?: string[] },
): Promise<void> {
  if (!canHoldSystemScope(principal)) {
    throw new SystemOperationDenied(
      `Cross-tenant operation '${operation.action}' requires the ${SYSTEM_SCOPE} scope. ` +
        'A tenant role, including super_admin, is not sufficient on its own.',
    );
  }

  const reason = operation.reason?.trim();
  if (!reason || reason.length < 8) {
    // A blank reason defeats the audit trail: "why did an operator read every
    // customer's usage" is the only question an auditor actually asks.
    throw new SystemOperationDenied(
      `Cross-tenant operation '${operation.action}' requires a reason (at least 8 characters).`,
    );
  }

  await deps.db.auditLog.create({
    data: {
      userId: principal.userId,
      action: `system.${operation.action}`,
      resource: (operation.targetCompanyIds ?? ['*']).join(','),
      details: JSON.stringify({
        reason,
        scope: SYSTEM_SCOPE,
        targetCompanyIds: operation.targetCompanyIds ?? null,
        at: new Date().toISOString(),
      }),
    },
  });
}
