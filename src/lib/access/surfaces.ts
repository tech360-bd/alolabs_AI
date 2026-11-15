/**
 * ALO Labs — access surfaces.
 *
 * The platform has exactly two authenticated surfaces and they never overlap:
 *
 *   internal  The AgentOS production engine: Super Admin, AI workforce,
 *             departments, model registry, routing, gateway, orchestration,
 *             memory, monitoring, logs, audit. ALO Labs personnel only.
 *
 *   client    The service-delivery portal: services, projects, deliverables,
 *             billing, support. Customers only. Served exclusively by the
 *             `/portal/**` pages and the `/api/portal/**` route group.
 *
 * A principal belongs to exactly one surface, decided by its role. The mapping
 * is an ALLOWLIST of internal roles: every other role — including roles this
 * file has never heard of — is treated as a client. Unknown therefore means
 * least privilege, never internal access.
 *
 * This module is dependency-free on purpose: it is imported by the request
 * proxy, by server code and by tests, and must never pull in the database.
 */

export type Audience = 'internal' | 'client';

/** The role given to customer accounts. */
export const CLIENT_ROLE = 'client';

/**
 * Roles held by ALO Labs personnel. Only these may reach the internal surface.
 *
 * `super_admin` / `admin` are the legacy administrator roles; the remaining
 * entries are the scoped internal roles from the role-migration specification
 * plus `account_manager`, the service-delivery role used by staff who look
 * after client accounts.
 */
export const INTERNAL_ROLES: readonly string[] = [
  'super_admin',
  'admin',
  'platform_super_admin',
  'ai_workforce_admin',
  'ai_model_admin',
  'security_admin',
  'infrastructure_admin',
  'account_manager',
];

/**
 * Roles that may NEVER be promoted to the internal surface through
 * configuration. `viewer` is what public self-registration historically
 * created, and `api_consumer` / `tenant_admin` / `customer` are customer-facing
 * by definition.
 */
const NEVER_INTERNAL: ReadonlySet<string> = new Set([
  CLIENT_ROLE,
  'viewer',
  'api_consumer',
  'tenant_admin',
  'customer',
  'user',
  'api',
]);

/**
 * Deployment escape hatch for legacy staff roles.
 *
 * Before the surfaces were separated, some installations gave ALO Labs staff
 * the `manager` or `operator` role. Those roles are NOT internal by default
 * (the same names were also handed to customers). An operator who has reviewed
 * their user table can opt specific legacy roles in with
 * `ALO_INTERNAL_EXTRA_ROLES=manager,operator`. Customer-facing roles are
 * refused even if listed.
 */
function extraInternalRoles(): string[] {
  const raw = typeof process !== 'undefined' ? process.env?.ALO_INTERNAL_EXTRA_ROLES : undefined;
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => /^[a-z][a-z0-9_]{1,40}$/.test(entry) && !NEVER_INTERNAL.has(entry));
}

export function isInternalRole(role: string | null | undefined): boolean {
  if (typeof role !== 'string' || role.length === 0) return false;
  if (NEVER_INTERNAL.has(role)) return false;
  return INTERNAL_ROLES.includes(role) || extraInternalRoles().includes(role);
}

/** Every non-internal role is a client. Unknown roles get least privilege. */
export function audienceForRole(role: string | null | undefined): Audience {
  return isInternalRole(role) ? 'internal' : 'client';
}

// ─── Session tokens ──────────────────────────────────────────────────────────

/**
 * Client sessions are minted with this prefix; internal sessions are bare hex.
 *
 * The prefix is part of the token that gets hashed for lookup, so it cannot be
 * stripped or added by the holder without invalidating the session. That lets
 * the request proxy — which has no database — route by token class, while the
 * authoritative decision still comes from the stored session record.
 */
export const CLIENT_TOKEN_PREFIX = 'alc_';

export function audienceForToken(token: string | null | undefined): Audience {
  return typeof token === 'string' && token.startsWith(CLIENT_TOKEN_PREFIX) ? 'client' : 'internal';
}

// ─── Route groups ────────────────────────────────────────────────────────────

/** The only API route group a client session may call. */
export const CLIENT_API_PREFIX = '/api/portal';
/** The only authenticated page group a client session may open. */
export const CLIENT_PAGE_PREFIX = '/portal';
/**
 * Authenticated pages that belong to the internal surface.
 *
 * Besides the dashboard this lists ALO Labs' internal reference material:
 * pages whose whole subject is how the work is produced (platform
 * architecture, routing diagrams, workforce figures, the brand book with its
 * system flow, platform licensing and pricing, press and case-study material written
 * around those internals,
 * and the sample invoice with internal cost comparisons). They used to be
 * public; they are for internal personnel only.
 */
export const INTERNAL_PAGE_PREFIXES: readonly string[] = [
  '/dashboard',
  '/brand',
  '/design',
  '/invoice',
  '/site/platform',
  '/site/pricing',
  '/site/diagrams',
  '/site/press',
  '/site/insights',
  '/site/work',
];

/**
 * Account endpoints shared by both surfaces. Each one authenticates the caller
 * against their own session only and returns nothing but the caller's own
 * account data.
 */
export const SHARED_API_ROUTES: readonly { path: string; methods: readonly string[] }[] = [
  { path: '/api/auth/me', methods: ['GET'] },
  { path: '/api/auth/logout', methods: ['POST'] },
  { path: '/api/auth/password-change', methods: ['POST'] },
];

function under(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isClientApiPath(pathname: string): boolean {
  return under(pathname, CLIENT_API_PREFIX);
}

export function isClientPagePath(pathname: string): boolean {
  return under(pathname, CLIENT_PAGE_PREFIX);
}

export function isInternalPagePath(pathname: string): boolean {
  return INTERNAL_PAGE_PREFIXES.some((prefix) => under(pathname, prefix));
}

export function isSharedApiRoute(pathname: string, method: string): boolean {
  const verb = method.toUpperCase();
  return SHARED_API_ROUTES.some((route) => route.path === pathname && route.methods.includes(verb));
}

/**
 * May a session of this audience call this API path at all?
 *
 * Deny by default in both directions: a client session reaches the client
 * route group and the shared account endpoints and nothing else; an internal
 * session reaches everything except the client route group (staff manage
 * client work through `/api/internal/**`, never by impersonating a client).
 */
export function audienceMayCallApi(audience: Audience, pathname: string, method: string): boolean {
  if (isSharedApiRoute(pathname, method)) return true;
  const clientGroup = isClientApiPath(pathname);
  return audience === 'client' ? clientGroup : !clientGroup;
}
