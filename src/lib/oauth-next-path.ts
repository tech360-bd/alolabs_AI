/**
 * OAuth redirect-target helpers.
 *
 * Two jobs, both security-relevant:
 *
 * 1. `sanitizeOAuthNextPath` — an OAuth flow ends with a redirect to a
 *    user-influenced path (`?next=...` carried through the state blob).
 *    An unsanitized value is an open redirect: `//evil.com` is a
 *    protocol-relative URL that browsers treat as `https://evil.com`,
 *    `/\evil.com` is equivalent in several clients, and `javascript:`,
 *    `data:`, or absolute `https://` URLs must never be assigned via
 *    `location.assign` or `NextResponse.redirect` from user input.
 *    We accept ONLY same-origin absolute paths (`/...`, not `//...`),
 *    with no control characters or backslashes, bounded in length.
 *    Anything else returns `''` and the caller redirects to a fixed default.
 *
 * 2. `resolveAppBaseUrl` — OAuth `redirect_uri` MUST be absolute
 *    (RFC 6749 §3.1.2); providers reject relative URIs. The authoritative
 *    base is `NEXT_PUBLIC_APP_URL` because the provider's registered
 *    callback matches the public domain, not whatever internal origin the
 *    request arrived on (tunnel / localhost / cluster-internal address).
 *    When unset we fall back to the incoming request origin so local
 *    development still works.
 */

/** Maximum accepted redirect path length — real in-app paths are far shorter. */
const MAX_NEXT_PATH_LENGTH = 2048;

/** Control characters (C0, DEL, C1) — never legitimate in an in-app path. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

/**
 * Return a safe same-origin absolute path, or `''` when the input cannot be
 * trusted. An empty return (rather than a default) lets callers choose their
 * own fallback target (`/dashboard` for success, `/login` for errors).
 */
export function sanitizeOAuthNextPath(raw: string | null | undefined): string {
  if (!raw) return '';
  if (raw.length > MAX_NEXT_PATH_LENGTH) return '';
  if (CONTROL_CHARS.test(raw)) return '';
  if (raw.includes('\\')) return '';
  // Must be an absolute path on this origin.
  if (!raw.startsWith('/')) return '';
  // `//host`, `///host` are protocol-relative open redirects.
  if (raw.startsWith('//')) return '';
  // Encoded variants that some clients decode into `//` — reject defensively.
  if (/%2f/i.test(raw) && /%5c|%2e/i.test(raw)) return '';
  return raw;
}

/**
 * Absolute base URL for building provider-facing `redirect_uri` and
 * `NextResponse.redirect` targets (both require absolute URLs).
 */
export function resolveAppBaseUrl(requestOrigin?: string | null): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '');
  if (configured) return configured;
  return (requestOrigin || '').trim().replace(/\/+$/, '');
}

/**
 * Canonical absolute OAuth callback URL for a provider.
 */
export function buildOAuthCallbackUrl(provider: string, requestOrigin?: string | null): string {
  return `${resolveAppBaseUrl(requestOrigin)}/api/auth/oauth/${encodeURIComponent(provider)}`;
}
