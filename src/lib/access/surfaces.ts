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

/** Prefix retained only to classify opaque client tokens during migration. */
export const CLIENT_TOKEN_PREFIX = 'alc_';

/**
 * Read the audience claim from a compact JWT without treating it as verified.
 * This is only a routing hint for the request proxy; API handlers verify the
 * signature and database session. A forged claim can at most reach a handler
 * that will reject the token.
 */
function jwtAudience(token: string): Audience | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as { aud?: unknown };
    return payload.aud === 'client' || payload.aud === 'internal' ? payload.aud : null;
  } catch {
    return null;
  }
}

export function audienceForToken(token: string | null | undefined): Audience {
  if (typeof token !== 'string') return 'internal';
  return jwtAudience(token) ?? (token.startsWith(CLIENT_TOKEN_PREFIX) ? 'client' : 'internal');
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

/**
 * File extensions that identify a static asset rather than a page.
 *
 * `/brand` is an authenticated page group (the brand book), but public assets
 * are also served from `/brand/...` — favicons, the OG image and the logo files
 * under `/brand/*.svg|png`. Without this exemption the auth guard answers an
 * <img src="/brand/alo-icon.svg"> with a redirect to /login, so the corporate
 * mark and every favicon silently break for anonymous visitors.
 */
const STATIC_ASSET_EXTENSIONS = /\.(?:svg|png|jpe?g|webp|avif|gif|ico|css|js|mjs|map|json|txt|xml|woff2?|ttf|otf|mp4|webm|mp3|wav|pdf)$/i;

/**
 * Public pages that render their own document chrome.
 *
 * The root layout wraps every route in the shared header/footer used by the
 * authenticated app, and /site/layout.tsx adds the light publication chrome.
 * The dark marketing pages bring their own header and footer, so they are marked
 * here and the proxy skips those shared wrappers for them. Without this the
 * services index rendered two navigation bars stacked on top of each other.
 *
 * These paths are public, so nothing is being exposed by listing them.
 */
export const SELF_CHROMED_PAGES: readonly string[] = [
  '/site/services',
  '/site/platform-overview',
  '/site/contact',
  // Rebuilt as dark pages carrying their own header and footer.
  '/site/solutions',
  '/site/projects',
  // The conversion flows. Each is its own conversion page with a dark header,
  // not a section of the light publication.
  '/site/start-a-project',
  '/site/request-a-solution',
  '/site/book-a-consultation',
];

/**
 * True when the path renders its own header and footer.
 *
 * `/site/platform-overview` is the awkward case: it must be self-chromed, but
 * `/site/platform` (an internal engineering reference) shares its prefix and
 * must never be treated as a public page. `under()` matches a path boundary, so
 * `/site/platform` is not under `/site/platform-overview` — the internal page
 * stays on the shared chrome and behind authentication either way.
 */
export function isSelfChromePage(pathname: string): boolean {
  return SELF_CHROMED_PAGES.some((prefix) => under(pathname, prefix));
}

/** True when the path is a static asset file, never a page. */
export function isStaticAssetPath(pathname: string): boolean {
  return STATIC_ASSET_EXTENSIONS.test(pathname);
}

export function isInternalPagePath(pathname: string): boolean {
  // An asset request is not a page request, even when it shares a prefix with
  // a private page group.
  if (isStaticAssetPath(pathname)) return false;
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
