/**
 * Single source of truth for the server-to-self (loopback) base URL.
 *
 * WHY THIS EXISTS
 * ---------------
 * Several server-side code paths (worker handlers, the LLM stream proxy, the
 * email-reply AI call) need to call this application's own API routes over
 * HTTP. Historically they did:
 *
 *     const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
 *
 * That is wrong on two counts:
 *
 *  1. `NEXT_PUBLIC_APP_URL` is the *public, browser-facing* origin — it is used
 *     for OAuth redirects, the sitemap and CORS `ALLOWED_ORIGINS`. In production
 *     it is the real domain (e.g. https://hosting.alolabs.net). Using it for a
 *     server-to-self call sends internal traffic out through Caddy / Cloudflare
 *     and back in again: slower, publicly observable, and it fails outright when
 *     the edge refuses internal-only routes or when no public URL is configured.
 *
 *  2. The `:3000` fallback contradicts this repository's port contract. Every
 *     runtime surface listens on **3011** (Dockerfile `ENV PORT=3011` /
 *     `EXPOSE 3011`, both compose files, the systemd unit, nginx and
 *     ecosystem.config.js). `scripts/validate-compose.mjs` gates that contract
 *     in CI, so a `:3000` default here is a latent break, not a harmless
 *     fallback — nothing is listening on 3000.
 *
 * RESOLUTION ORDER
 * ----------------
 *  1. `INTERNAL_APP_URL`     — explicit, server-only override (preferred).
 *  2. `NEXT_PUBLIC_BASE_URL` — the pre-existing variable already documented in
 *                              .env.example as "used for internal API routing";
 *                              honoured so current deployments keep working.
 *  3. `http://127.0.0.1:${PORT}` — derive from the port the server actually
 *                              listens on, so it can never disagree with it.
 *  4. `http://127.0.0.1:3011`   — the port contract default.
 *
 * Loopback (`127.0.0.1`) is used rather than `localhost` to avoid a DNS
 * round-trip and any IPv6 `::1` resolution surprise inside containers.
 */

/** The port every runtime surface in this repository listens on. */
export const DEFAULT_APP_PORT = 3011;

/**
 * The port this repository used to default to, and which nothing listens on.
 *
 * Older revisions of `.env.example` shipped `NEXT_PUBLIC_BASE_URL=
 * http://localhost:3000`, so deployments provisioned from it still carry that
 * value in their `.env`. Honouring it would reproduce the exact failure this
 * module exists to prevent — and would do so for precisely the installs that
 * need the fix. It is therefore treated as a stale default, not as intent.
 */
const STALE_PORT = '3000';

const LOOPBACK_HOST = '127.0.0.1';

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function isLoopbackOrigin(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === LOOPBACK_HOST || hostname === 'localhost' || hostname === '::1';
  } catch {
    return false;
  }
}

function portOf(url: string): string | null {
  try {
    return new URL(url).port || null;
  } catch {
    return null;
  }
}

/**
 * True when a configured origin is the stale `localhost:3000` default that old
 * `.env.example` revisions handed out. Such a value is ignored rather than
 * honoured, because nothing listens on that port. Real domains — including a
 * domain that legitimately uses port 3000 — are never treated as stale.
 */
function isStaleLoopbackDefault(url: string): boolean {
  return isLoopbackOrigin(url) && portOf(url) === STALE_PORT;
}

/**
 * Resolve the base URL this server should use to call its own API routes.
 * Always returns an absolute origin with no trailing slash.
 */
export function internalBaseUrl(): string {
  const explicit = process.env.INTERNAL_APP_URL?.trim();
  if (explicit) return stripTrailingSlash(explicit);

  // Honour the legacy variable only when it actually points at loopback. If an
  // operator set it to the public domain, using it for internal calls would
  // reintroduce exactly the hairpin this module exists to prevent. A stale
  // localhost:3000 is likewise ignored — nothing listens there.
  const legacy = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (legacy && isLoopbackOrigin(legacy) && !isStaleLoopbackDefault(legacy)) {
    return stripTrailingSlash(legacy);
  }

  const port = process.env.PORT?.trim() || String(DEFAULT_APP_PORT);
  return `http://${LOOPBACK_HOST}:${port}`;
}

/**
 * Build an absolute URL for one of this server's own API routes.
 *
 * @param path Route path, with or without a leading slash (e.g. `/api/llm/route`).
 */
export function internalUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${internalBaseUrl()}${normalized}`;
}

/**
 * Resolve the *public*, externally reachable origin of this application.
 *
 * This is the counterpart to `internalBaseUrl()` and must be used whenever the
 * URL will be dereferenced by something OUTSIDE this process:
 *   - OAuth `redirect_uri` values (the provider's server calls back to it)
 *   - `sitemap.ts` entries (crawlers fetch them)
 *   - media URLs handed to a third-party vision model as `image_url`
 *
 * Never use this for server-to-self HTTP calls — that hairpins traffic out
 * through the reverse proxy / CDN. Use `internalUrl()` for those.
 *
 * Falls back to the 3011 port contract rather than 3000, because nothing in
 * this repository listens on 3000 (see `scripts/validate-compose.mjs`).
 */
export function publicBaseUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl && !isStaleLoopbackDefault(appUrl)) return stripTrailingSlash(appUrl);

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (baseUrl && !isStaleLoopbackDefault(baseUrl)) return stripTrailingSlash(baseUrl);

  return `http://localhost:${DEFAULT_APP_PORT}`;
}
