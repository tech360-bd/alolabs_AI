import { NextRequest, NextResponse } from 'next/server';
import {
  audienceForToken,
  audienceMayCallApi,
  isClientPagePath,
  isInternalPagePath,
} from '@/lib/access/surfaces';

// ─── Public API routes (no Bearer token required) ────────────────────────────
// Each entry specifies the path prefix and the allowed HTTP methods.
// Routes not listed here require a Bearer token.

const PUBLIC_API_ROUTES: { path: string; methods: string[] }[] = [
  { path: '/api/auth/login', methods: ['POST'] },
  { path: '/api/auth/register', methods: ['POST'] },
  { path: '/api/auth/mfa/verify', methods: ['POST'] },
  { path: '/api/auth/sso', methods: ['GET', 'POST'] },
  { path: '/api/auth/oauth', methods: ['GET', 'POST'] },
  { path: '/api/health/live', methods: ['GET'] },
  { path: '/api/health/ready', methods: ['GET'] },
  // Listed explicitly rather than relying on the '/api/health' prefix match
  // below. Returns only { status: 'pong' }. Being public by accident of a
  // startsWith() on a broader entry is how a future /api/health/<sensitive>
  // route would get exposed without anyone deciding to expose it;
  // scripts/validate-route-auth.mjs gates that in CI.
  { path: '/api/health/ping', methods: ['GET'] },
  { path: '/api/health', methods: ['GET'] },
  { path: '/api/v1/health', methods: ['GET'] },   // AgentOS liveness (public)
  // AI service-plane liveness (PR #30). Returns only { status: 'ok',
  //   service, version, timestamp } — no infrastructure or tenant details.
  // Listed explicitly (GET only) so a future /api/v1/ai/<sensitive> route
  // cannot become public by accident of a prefix match; gated by
  // scripts/validate-route-auth.mjs in CI.
  { path: '/api/v1/ai/health', methods: ['GET'] },
  { path: '/api/ping', methods: ['GET'] },
  { path: '/api/infra/ping', methods: ['GET'] },
  // NOTE: /api/enterprise/agents and /api/enterprise/overview used to be listed
  // here, which made the dashboard's own data endpoints readable by anyone who
  // found the URL. They now require credentials like every other private route.
  // NOTE: /api/webhooks/ (the management CRUD surface — not inbound receivers)
  // was previously listed here too. Its handlers self-verify sessions, but a
  // future handler that forgot to verify would be silently public. Removed:
  // inbound receivers verify their own platform signatures and are listed
  // individually below.
  { path: '/api/whatsapp/webhook', methods: ['GET', 'POST'] },
  { path: '/api/voice/telephony/webhook', methods: ['GET', 'POST'] },
  { path: '/api/public/', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
];

/**
 * There used to be a `PUBLIC_QUERY_PARAMS` list here containing `health=true`,
 * which made ANY api route public simply by appending `?health=true` to the URL.
 * That is an authentication bypass and has been removed; liveness lives at the
 * explicit `/api/health*` entries above.
 */
function isPublicApiRoute(pathname: string, method: string): boolean {
  return PUBLIC_API_ROUTES.some(
    (r) =>
      (pathname === r.path || pathname.startsWith(r.path)) &&
      r.methods.includes(method.toUpperCase()),
  );
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

// ─── Brute Force Protection (in-memory, per-IP, lazy cleanup) ────────────────

const authAttempts = new Map<string, { count: number; lockedUntil: number }>();

const BRUTE_FORCE_MAX_ATTEMPTS = 5;
const BRUTE_FORCE_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

function checkBruteForce(ip: string): {
  allowed: boolean;
  remainingAttempts: number;
} {
  const now = Date.now();
  const entry = authAttempts.get(ip);

  if (!entry || now > entry.lockedUntil) {
    // No active lockout – reset / initialise
    authAttempts.set(ip, { count: 0, lockedUntil: 0 });
    return { allowed: true, remainingAttempts: BRUTE_FORCE_MAX_ATTEMPTS };
  }

  if (entry.count >= BRUTE_FORCE_MAX_ATTEMPTS && now < entry.lockedUntil) {
    return { allowed: false, remainingAttempts: 0 };
  }

  return {
    allowed: true,
    remainingAttempts: BRUTE_FORCE_MAX_ATTEMPTS - entry.count,
  };
}

function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const entry = authAttempts.get(ip) || { count: 0, lockedUntil: 0 };
  entry.count++;
  if (entry.count >= BRUTE_FORCE_MAX_ATTEMPTS) {
    entry.lockedUntil = now + BRUTE_FORCE_LOCKOUT_MS;
  }
  authAttempts.set(ip, entry);
}

// ─── Lazy Cleanup (replaces setInterval – not supported in Edge Runtime) ─────
// Every ~100 requests we sweep both Maps and evict expired entries to bound
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

  for (const [key, entry] of authAttempts) {
    if (now > entry.lockedUntil) authAttempts.delete(key);
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
// portal (`/portal/**`). Client session tokens carry a fixed prefix that is
// part of the hashed token, so this layer can tell the two classes apart
// without a database and turn a client away from an internal page — or an
// internal API — before any handler runs. The token class is NOT trusted as
// proof of anything: `verifySessionToken` re-derives the surface from the
// stored session and the user's current role on every request.
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

export function proxy(request: NextRequest) {
  // Lazy cleanup of stale in-memory entries (replaces setInterval)
  lazyCleanup();

  const { pathname, search } = request.nextUrl;
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

  // ── Security headers (applied to every matched route) ────────────────────
  const response = NextResponse.next({ request: { headers: forwardedHeaders } });
  response.headers.set('X-Request-Id', crypto.randomUUID());
  response.headers.set('X-Content-Type-Options', 'nosniff');
  // The dev preview embeds the app in the sandbox frame; every other
  // environment keeps the full framing lockdown.
  response.headers.set('X-Frame-Options', process.env.NODE_ENV === 'development' ? 'SAMEORIGIN' : 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000');
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

  // ── API auth enforcement (Bearer token presence check) ─────────────────
  // Full DB-based session verification happens in per-route handlers
  // via requireAuth() from @/lib/api-auth.
  if (isApi && !isPublicApiRoute(pathname, method)) {
    const authHeader = request.headers.get('authorization');
    // Versioned API clients may use a company-scoped X-API-Key. The handler
    // verifies its hash, status, expiry, tenant and scopes; proxy only checks
    // that credentials are present (as it does for Bearer sessions).
    const hasV1Key = pathname.startsWith('/api/v1/') && Boolean(request.headers.get('x-api-key')?.trim());
    if (!hasV1Key && (!authHeader || !authHeader.startsWith('Bearer '))) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Missing or invalid Authorization header' },
        { status: 401 },
      );
    }
    if (!hasV1Key && !authHeader!.substring(7)) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Empty bearer token' },
        { status: 401 },
      );
    }

    // ── Route-group separation ────────────────────────────────────────────
    // A client session may call `/api/portal/**` and the shared account
    // endpoints — nothing else. An internal session may call everything except
    // the client route group. The refused request never reaches its handler:
    // it is rewritten to the audit endpoint, which records the attempt and
    // answers every client probe with the same 404, so the shape of the
    // internal API cannot be mapped by guessing URLs.
    if (!hasV1Key && pathname !== ACCESS_DENIED_ROUTE) {
      const bearerAudience = audienceForToken(authHeader!.substring(7).trim());
      if (!audienceMayCallApi(bearerAudience, pathname, method)) {
        const denied = NextResponse.rewrite(new URL(ACCESS_DENIED_ROUTE, request.url), {
          request: { headers: forwardedHeaders },
        });
        denied.headers.set('Cache-Control', 'private, no-store');
        denied.headers.set('X-Content-Type-Options', 'nosniff');
        return denied;
      }
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
    const rateResult = checkRateLimit(ip, RATE_LIMIT_AI_CHAT_MAX, RATE_LIMIT_AI_CHAT_WINDOW_MS);
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
    const rateResult = checkRateLimit(ip, RATE_LIMIT_AGENT_RUN_MAX, RATE_LIMIT_AGENT_RUN_WINDOW_MS);
    if (!rateResult.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', message: '30 requests per minute allowed on /api/enterprise/agents/run' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }
    response.headers.set('X-RateLimit-Remaining', String(rateResult.remaining));
  }

  // ── Rate limiting for login endpoint — 10 req/min + brute force ────────
  if (pathname.startsWith('/api/auth/login')) {
    const rateResult = checkRateLimit(ip, RATE_LIMIT_LOGIN_MAX, RATE_LIMIT_LOGIN_WINDOW_MS);
    if (!rateResult.allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts' },
        { status: 429 },
      );
    }

    const bruteCheck = checkBruteForce(ip);
    if (!bruteCheck.allowed) {
      return NextResponse.json(
        { error: 'Account temporarily locked. Try again later.' },
        { status: 429, headers: { 'Retry-After': '900' } },
      );
    }

    response.headers.set(
      'X-RateLimit-Remaining',
      String(Math.min(rateResult.remaining, bruteCheck.remainingAttempts)),
    );
  }

  // ── Rate limiting for public API routes (general) ───────────────────────
  if (
    isApi &&
    !pathname.startsWith('/api/auth/login') &&
    !pathname.startsWith('/api/ai/chat') &&
    !pathname.startsWith('/api/enterprise/agents/run')
  ) {
    const rateResult = checkRateLimit(ip, RATE_LIMIT_PUBLIC_MAX, RATE_LIMIT_PUBLIC_WINDOW_MS);
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
