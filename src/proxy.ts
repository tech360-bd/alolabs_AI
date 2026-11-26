import { NextRequest, NextResponse } from 'next/server';
import {
  audienceForToken,
  audienceMayCallApi,
  isClientPagePath,
  isInternalPagePath,
} from '@/lib/access/surfaces';
import { isMetricsScrape } from '@/lib/access/metrics-scrape';
import { matchesPublicApiRoute, type PublicApiRoute } from '@/lib/access/public-api-routes';
import { verifyEdgeJwt, type EdgeJwtClaims } from '@/lib/access/edge-jwt';

// ─── Public API routes (no Bearer token required) ────────────────────────────
// Exact entries match only that pathname. A trailing slash is required to
// create an intentional prefix, preventing paths such as /api/auth/login-debug
// from becoming public accidentally. Do not duplicate this table; the validator
// parses this source, and query parameters never bypass authentication.
export const PUBLIC_API_ROUTES: readonly PublicApiRoute[] = [
  { path: '/api/auth/login', methods: ['POST'] },
  { path: '/api/auth/register', methods: ['POST'] },
  { path: '/api/auth/password-reset', methods: ['POST'] },
  { path: '/api/auth/mfa/verify', methods: ['POST'] },
  { path: '/api/auth/mfa/resend', methods: ['POST'] },
  { path: '/api/auth/sso', methods: ['GET', 'POST'] },
  { path: '/api/auth/oauth', methods: ['GET', 'POST'] },
  { path: '/api/auth/oauth/', methods: ['GET', 'POST'] },
  { path: '/api/health/live', methods: ['GET'] },
  { path: '/api/health/ready', methods: ['GET'] },
  // The detailed diagnostics endpoint (/api/health/deep) remains private.
  { path: '/api/health/ping', methods: ['GET'] },
  { path: '/api/health', methods: ['GET'] },
  { path: '/api/v1/health', methods: ['GET'] },
  { path: '/api/v1/ai/health', methods: ['GET'] },
  { path: '/api/ping', methods: ['GET'] },
  { path: '/api/infra/ping', methods: ['GET'] },
  // Enterprise and webhook management APIs are private. Inbound webhooks
  // authenticate provider signatures in their individual handlers.
  { path: '/api/whatsapp/webhook', methods: ['GET', 'POST'] },
  { path: '/api/voice/telephony/webhook', methods: ['GET', 'POST'] },
  { path: '/api/public/', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
];

export function isPublicApiRoute(pathname: string, method: string): boolean {
  return matchesPublicApiRoute(PUBLIC_API_ROUTES, pathname, method);
}

// ─── CSRF Protection ─────────────────────────────────────────────────────────

function generateCsrfToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Constant-time string comparison to prevent timing attacks.
 * Uses only plain JS – no Node.js crypto module, safe for Edge Runtime.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function validateCsrfToken(request: NextRequest): boolean {
  const cookieToken = request.cookies.get('csrf-token')?.value;
  const headerToken = request.headers.get('x-csrf-token');
  if (!cookieToken || !headerToken) return false;
  return timingSafeEqual(cookieToken, headerToken);
}

// ─── Rate Limiting (in-memory, per-IP, lazy cleanup) ─────────────────────────

const rateLimiter = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT_LOGIN_MAX = 10;
const RATE_LIMIT_LOGIN_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_PUBLIC_MAX = 100;
const RATE_LIMIT_PUBLIC_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_AI_CHAT_MAX = 60;             // 60 req/min
const RATE_LIMIT_AI_CHAT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_AGENT_RUN_MAX = 30;           // 30 req/min
const RATE_LIMIT_AGENT_RUN_WINDOW_MS = 60 * 1000;

function checkRateLimit(
  ip: string,
  maxRequests: number,
  windowMs: number,
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimiter.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimiter.set(ip, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  entry.count++;
  const remaining = Math.max(0, maxRequests - entry.count);
  return { allowed: entry.count <= maxRequests, remaining };
}

// ─── Lazy Cleanup (replaces setInterval – not supported in Edge Runtime) ─────
// Every ~100 requests we sweep the limiter and evict expired entries to bound
// memory growth. This avoids setInterval which crashes at runtime in Edge.

let cleanupCounter = 0;
const CLEANUP_EVERY_N_REQUESTS = 100;

function lazyCleanup(): void {
  cleanupCounter++;
  if (cleanupCounter < CLEANUP_EVERY_N_REQUESTS) return;
  cleanupCounter = 0;

  const now = Date.now();

  for (const [key, entry] of rateLimiter) {
    if (now > entry.resetAt) rateLimiter.delete(key);
  }


}

// ─── Bot Protection (specific known bot user-agents only) ────────────────────
// Only the most specific, well-known bot patterns are blocked on page routes.
// This avoids false positives on curl, Postman, health-checkers, and API tools.

const BLOCKED_BOT_PATTERNS: RegExp[] = [
  /googlebot/i,
  /bingbot/i,
  /slurp/i, // Yahoo!
  /duckduckbot/i,
  /baiduspider/i,
  /yandexbot/i,
  /semrushbot/i,
  /ahrefsbot/i,
  /mj12bot/i,
];

function isBlockedBot(request: NextRequest): boolean {
  const ua = request.headers.get('user-agent') || '';
  return BLOCKED_BOT_PATTERNS.some((pattern) => pattern.test(ua));
}

// ─── Private Page Routes ─────────────────────────────────────────────────────
// The dashboard is a private application. This is the edge half of the gate:
// a request for a private page with no session cookie is redirected to /login
// before the route handler runs, so the dashboard HTML is never generated for an
// anonymous visitor.
//
// This check deliberately only tests for the cookie's PRESENCE. It cannot
// validate it — the Edge runtime cannot reach Prisma — so the authoritative
// check lives in `src/lib/server-session.ts`, which the /dashboard page awaits
// before rendering. A forged cookie therefore gets past this line and is then
// rejected by the server component.
//
// SURFACE SEPARATION
// ------------------
// There are two private page groups and they never mix: the internal AgentOS
// pages (`INTERNAL_PAGE_PREFIXES` in src/lib/access/surfaces.ts) and the client
// portal (`/portal/**`). Session JWTs carry an `aud` claim. The proxy uses it
// only as a page-routing hint; the server page gate verifies the JWT against
// the database before rendering. For private APIs, HS256 Bearer JWTs are
// verified here with Web Crypto, then each handler rechecks the Session row
// and current role. The old `alc_` opaque-token prefix is only a temporary
// rollout hint and is never proof of identity.
const SESSION_COOKIE_NAME = 'session-token';

function isPrivatePageRoute(pathname: string): boolean {
  return isInternalPagePath(pathname) || isClientPagePath(pathname);
}

/** Where the proxy sends a refused cross-surface API call to be audited. */
const ACCESS_DENIED_ROUTE = '/api/access-denied';
/** Request headers stamped here for the audit trail; inbound values are discarded. */
const REQUEST_PATH_HEADER = 'x-alo-request-path';
const REQUEST_METHOD_HEADER = 'x-alo-request-method';

// ─── IP Extraction ────────────────────────────────────────────────────────────

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]!.trim();
  }
  return 'unknown';
}

// ─── Proxy ──────────────────────────────────────────────────────────────────

export async function proxy(request: NextRequest) {
  // Lazy cleanup of stale in-memory entries (replaces setInterval)
  lazyCleanup();

  const { pathname, search } = request.nextUrl;
  // Socket.IO handshakes and polling carry their own session authentication.
  if (/^\/(?:queue\/)?socket\.io(?:\/|$)/.test(pathname)) return NextResponse.next();
  const ip = getClientIp(request);
  const method = request.method.toUpperCase();
  const isApi = pathname.startsWith('/api/');
  const isPageRoute = !isApi && !pathname.startsWith('/_next/');
  const isMutatingMethod =
    method === 'POST' ||
    method === 'PUT' ||
    method === 'PATCH' ||
    method === 'DELETE';

  // ── Trusted request metadata ─────────────────────────────────────────────
  // Overwrite (never append to) the audit headers so a caller cannot forge the
  // path that gets recorded against a denied request.
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set(REQUEST_PATH_HEADER, pathname);
  forwardedHeaders.set(REQUEST_METHOD_HEADER, method);
  // This is an internal assertion produced only after signature verification;
  // never let a caller supply it themselves.
  forwardedHeaders.delete('x-alo-authenticated-user-id');

  // Verify private API Bearer JWTs before forwarding the request. The database
  // row, revocation state and current account role are checked again by the
  // route-level auth helper. Old opaque tokens are temporarily passed through
  // to those helpers during the rolling migration, but are never stamped as
  // proxy-verified identities.
  const scrape = isMetricsScrape(pathname, method, request.headers.get('authorization'));
  let hasV1Key = false;
  let edgeClaims: EdgeJwtClaims | null = null;
  if (isApi && !isPublicApiRoute(pathname, method)) {
    // A provider redirect is a browser navigation and cannot set Authorization.
    // Only this GET callback may reuse the mirrored cookie. The route still
    // verifies the DB session, admin role and browser-bound account-link state.
    if (method === 'GET' && /^\/api\/social\/oauth\/[a-z]+$/.test(pathname) && !forwardedHeaders.has('authorization')) {
      const session = request.cookies.get(SESSION_COOKIE_NAME)?.value;
      if (session) forwardedHeaders.set('authorization', `Bearer ${session}`);
    }
    /**
     * The browser talks to `/api/v1/platform/**` with its own session cookie;
     * it has no reason to hold an API key, and asking it to would mean every
     * page has to mint and store a long-lived credential in JS — exactly the
     * pattern project API keys exist to avoid.
     *
     * So for the v1 service plane a `session-token` cookie is a first-class
     * credential here: it is mirrored into an Authorization header (this proxy
     * runs at the edge and cannot verify a Node session token itself) and the
     * route-level resolver performs the real verification, revocation and
     * workspace-membership checks. Nothing is trusted because of this header;
     * it only carries the cookie forward.
     */
    const isV1 = pathname.startsWith('/api/v1/');
    const sessionCookie = isV1 ? request.cookies.get(SESSION_COOKIE_NAME)?.value : undefined;
    if (sessionCookie && !forwardedHeaders.get('authorization')) {
      forwardedHeaders.set('authorization', `Bearer ${sessionCookie}`);
    }
    const authHeader = forwardedHeaders.get('authorization');
    hasV1Key = isV1 && Boolean(request.headers.get('x-api-key')?.trim());
    // A browser session on the v1 plane is handled by the route resolver; the
    // edge only needs to confirm a credential is present.
    const hasV1Session = isV1 && Boolean(sessionCookie) && !hasV1Key;
    if (!hasV1Key && !hasV1Session && !scrape) {
      if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json(
          { error: 'Unauthorized', message: 'Missing or invalid Authorization header' },
          { status: 401 },
        );
      }
      const token = authHeader.slice('Bearer '.length).trim();
      if (!token) {
        return NextResponse.json(
          { error: 'Unauthorized', message: 'Empty bearer token' },
          { status: 401 },
        );
      }

      if (token.split('.').length === 3) {
        const secret = process.env.JWT_SECRET;
        if (secret && secret.length >= 32) {
          edgeClaims = await verifyEdgeJwt(token, secret);
          if (!edgeClaims) {
            return NextResponse.json({ error: 'Unauthorized', message: 'Invalid or expired Bearer JWT' }, { status: 401 });
          }
          forwardedHeaders.set('x-alo-authenticated-user-id', edgeClaims.userId);
        } else if (process.env.NODE_ENV === 'production') {
          return NextResponse.json({ error: 'Unauthorized', message: 'JWT verification is not configured' }, { status: 401 });
        }
        // In development without JWT_SECRET, the Node route auth helper still
        // verifies using its per-process development key.
      } else if (!/^(?:alc_)?[a-f0-9]{96}$/.test(token)) {
        return NextResponse.json({ error: 'Unauthorized', message: 'Unsupported Bearer credential' }, { status: 401 });
      }
    }
  }

  // ── Security headers (applied to every matched route) ────────────────────
  const response = NextResponse.next({ request: { headers: forwardedHeaders } });
  response.headers.set('X-Request-Id', crypto.randomUUID());
  response.headers.set('X-Content-Type-Options', 'nosniff');
  // The dev preview embeds the app in the sandbox frame; every other
  // environment keeps the full framing lockdown.
  if (process.env.NODE_ENV !== 'development') response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  // HSTS is only meaningful (and only safe) over HTTPS. Emitting it on a plain
  // HTTP response — a local preview, a non-TLS staging host — makes the browser
  // pin HTTPS for a year for that hostname and breaks the site. The static
  // header in next.config.ts covers the TLS-terminating proxy path; this one
  // must stay conditional.
  if (request.nextUrl.protocol === 'https:') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000');
  }
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // ── Page auth enforcement: private routes require a session cookie ──────
  if (isPageRoute && isPrivatePageRoute(pathname)) {
    const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
    if (!hasSession) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('next', pathname + search);
      const redirectResponse = NextResponse.redirect(loginUrl);
      redirectResponse.headers.set('Cache-Control', 'private, no-store');
      return redirectResponse;
    }
    // Each surface has its own pages. A client cookie on an internal page, or
    // an internal cookie on the portal, is sent to its own home. The server
    // components repeat this check against the database before rendering.
    const cookieAudience = audienceForToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
    const wantsClientPage = isClientPagePath(pathname);
    if ((cookieAudience === 'client') !== wantsClientPage) {
      const home = new URL(cookieAudience === 'client' ? '/portal' : '/dashboard', request.url);
      const redirectResponse = NextResponse.redirect(home);
      redirectResponse.headers.set('Cache-Control', 'private, no-store');
      return redirectResponse;
    }
    // Do not let intermediaries or browsers cache authenticated page HTML.
    response.headers.set('Cache-Control', 'private, no-store');
  }

  // ── API audience separation ──────────────────────────────────────────────
  // Bearer JWT signatures were verified before the downstream request headers
  // were built. The route-level helper revalidates the session against Prisma.
  if (isApi && !isPublicApiRoute(pathname, method) && !hasV1Key && !scrape && pathname !== ACCESS_DENIED_ROUTE) {
    const bearer = forwardedHeaders.get('authorization')!.slice('Bearer '.length).trim();
    const bearerAudience = edgeClaims?.audience ?? audienceForToken(bearer);
    if (!audienceMayCallApi(bearerAudience, pathname, method)) {
      const denied = NextResponse.rewrite(new URL(ACCESS_DENIED_ROUTE, request.url), {
        request: { headers: forwardedHeaders },
      });
      denied.headers.set('Cache-Control', 'private, no-store');
      denied.headers.set('X-Content-Type-Options', 'nosniff');
      return denied;
    }
  }

  // ── CSRF protection for non-API mutating requests ────────────────────────
  // API routes use Bearer token auth and handle CSRF independently.
  if (isMutatingMethod && isPageRoute) {
    if (!validateCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }
  }

  // ── Issue CSRF token on page GET requests ────────────────────────────────
  if (method === 'GET' && isPageRoute) {
    const token = generateCsrfToken();
    response.cookies.set('csrf-token', token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 3600,
    });
    response.headers.set('X-CSRF-Token', token);
  }

  // ── Rate limiting: /api/ai/chat — 60 req/min ────────────────────────────
  if (pathname === '/api/ai/chat' || pathname.startsWith('/api/ai/chat/')) {
    const rateResult = checkRateLimit(`ai_chat:${ip}`, RATE_LIMIT_AI_CHAT_MAX, RATE_LIMIT_AI_CHAT_WINDOW_MS);
    if (!rateResult.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', message: '60 requests per minute allowed on /api/ai/chat' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }
    response.headers.set('X-RateLimit-Remaining', String(rateResult.remaining));
  }

  // ── Rate limiting: /api/enterprise/agents/run — 30 req/min ──────────────
  if (pathname === '/api/enterprise/agents/run' || pathname.startsWith('/api/enterprise/agents/run/')) {
    const rateResult = checkRateLimit(`agent_run:${ip}`, RATE_LIMIT_AGENT_RUN_MAX, RATE_LIMIT_AGENT_RUN_WINDOW_MS);
    if (!rateResult.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', message: '30 requests per minute allowed on /api/enterprise/agents/run' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }
    response.headers.set('X-RateLimit-Remaining', String(rateResult.remaining));
  }

  // ── Rate limiting for login endpoint — separate from general API traffic ────────
  if (pathname.startsWith('/api/auth/login')) {
    const rateResult = checkRateLimit(`login:${ip}`, RATE_LIMIT_LOGIN_MAX, RATE_LIMIT_LOGIN_WINDOW_MS);
    if (!rateResult.allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts' },
        { status: 429 },
      );
    }

    response.headers.set('X-RateLimit-Remaining', String(rateResult.remaining));
  }

  // ── Rate limits for public recovery/MFA endpoints ───────────────────────
  if (
    method === 'POST' &&
    (pathname === '/api/auth/password-reset' || pathname === '/api/auth/mfa/resend')
  ) {
    const rateResult = checkRateLimit(`${ip}:${pathname}`, 10, 15 * 60 * 1000);
    if (!rateResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': '900' } },
      );
    }
  }

  // ── Rate limiting for public API routes (general) ───────────────────────
  if (
    isApi &&
    !pathname.startsWith('/api/auth/login') &&
    !pathname.startsWith('/api/ai/chat') &&
    !pathname.startsWith('/api/enterprise/agents/run')
  ) {
    const rateResult = checkRateLimit(`public:${ip}`, RATE_LIMIT_PUBLIC_MAX, RATE_LIMIT_PUBLIC_WINDOW_MS);
    if (!rateResult.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 },
      );
    }
    response.headers.set('X-RateLimit-Remaining', String(rateResult.remaining));
  }

  // ── Bot protection – page routes ONLY ────────────────────────────────────
  // Skip /api/* and /_next/* entirely. Only check page routes.
  if (isPageRoute && isBlockedBot(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return response;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|logo.svg|manifest.json|robots.txt|sw.js|icons/).*)',
  ],
};
