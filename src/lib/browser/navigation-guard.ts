/**
 * Browser navigation policy — the SSRF guard for agent-driven browsing.
 *
 * An "open this URL in a browser" tool is a request to make an outbound HTTP
 * request from inside the infrastructure, with the response rendered and its
 * console/network activity reported back. That makes it a server-side request
 * forgery primitive unless every destination is checked *before* navigation:
 *
 *   http://169.254.169.254/latest/meta-data/iam/security-credentials/   ← cloud metadata
 *   http://2130706433/                                                   ← 127.0.0.1, decimal
 *   http://[::ffff:127.0.0.1]/                                           ← IPv4-mapped IPv6 loopback
 *   http://redis.internal:6379/                                          ← service DNS on the host network
 *
 * This module is the single place that decides whether a URL may be navigated,
 * and it is deliberately pure and dependency-free so the same policy can be
 * enforced in the route, in the agent tool, and in a unit test with no browser.
 *
 * Redirects are re-checked by the caller: a public URL that 302s to
 * `http://127.0.0.1/` is the classic bypass, so `verifyPage()` guards every hop
 * with the same function used for the first one.
 */

export interface BrowserPolicy {
  /** Allow loopback/private/link-local destinations. Never enable in production. */
  allowPrivateNetworks: boolean;
  /** Extra hostnames to allow (exact, case-insensitive). */
  allowedHosts?: readonly string[];
  /** Extra hostnames to block on top of the built-in rules. */
  blockedHosts?: readonly string[];
}

export const DEFAULT_BROWSER_POLICY: BrowserPolicy = { allowPrivateNetworks: false };

export type NavigationRejection =
  | 'invalid_url'
  | 'unsupported_scheme'
  | 'credentials_in_url'
  | 'blocked_host'
  | 'private_network'
  | 'cloud_metadata';

export type NavigationDecision =
  | { ok: true; url: string; hostname: string }
  | { ok: false; code: NavigationRejection; reason: string; hostname: string | null };

/** Hostnames that are infrastructure, not the public web. */
const BLOCKED_HOSTNAMES = [
  'localhost',
  'localhost.localdomain',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
  'kubernetes.default',
  'kubernetes.default.svc',
];

/** Suffixes that only resolve inside a cluster, a LAN or a container network. */
const BLOCKED_SUFFIXES = ['.internal', '.local', '.localdomain', '.lan', '.home.arpa', '.cluster.local', '.svc'];

/**
 * Parse the IPv4 form of a hostname, tolerating the encodings browsers accept.
 *
 * `inet_aton` semantics: one to four dot-separated parts, each decimal, octal
 * (`0177`) or hex (`0x7f`), with the last part absorbing the remaining bytes.
 * Returns null when the host is not an IPv4 literal.
 */
export function parseIpv4(hostname: string): [number, number, number, number] | null {
  const host = hostname.trim().toLowerCase();
  if (!host) return null;

  // Single integer form: http://2130706433/ == 127.0.0.1
  if (/^0x[0-9a-f]+$/.test(host)) {
    const value = Number.parseInt(host, 16);
    return Number.isFinite(value) && value >= 0 && value <= 0xffffffff ? fromUint32(value) : null;
  }
  if (/^[0-9]+$/.test(host)) {
    const value = Number.parseInt(host, 10);
    return Number.isFinite(value) && value >= 0 && value <= 0xffffffff ? fromUint32(value) : null;
  }

  const parts = host.split('.');
  if (parts.length < 2 || parts.length > 4) return null;
  const numbers: number[] = [];
  for (const part of parts) {
    if (!/^(0x[0-9a-f]+|0[0-7]+|[0-9]+)$/.test(part)) return null;
    // inet_aton accepts three bases. A leading zero means octal, and browsers
    // follow it: `http://0177.0.0.1/` reaches loopback, so parsing it as decimal
    // 177 would hand the guard a public address for a private destination.
    const value = part.startsWith('0x')
      ? Number.parseInt(part, 16)
      : part.length > 1 && part.startsWith('0')
        ? Number.parseInt(part, 8)
        : Number.parseInt(part, 10);
    if (!Number.isFinite(value)) return null;
    numbers.push(value);
  }

  // inet_aton: every part except the last is one byte; the last part fills the rest.
  const last = numbers[numbers.length - 1];
  const head = numbers.slice(0, -1);
  if (head.some((value) => value > 255)) return null;
  const remainingBytes = 4 - head.length;
  if (last < 0 || last >= 256 ** remainingBytes) return null;

  // Big-endian bytes of the last part; `inet_aton` fills the *remaining* bytes,
  // so `192.168.1` is 192.168.0.1 and `0x7f.1` is 127.0.0.1.
  const tail = [(last >>> 24) & 0xff, (last >>> 16) & 0xff, (last >>> 8) & 0xff, last & 0xff].slice(4 - remainingBytes);
  const octets = [...head, ...tail];
  return [octets[0], octets[1], octets[2], octets[3]] as [number, number, number, number];
}

function fromUint32(value: number): [number, number, number, number] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function isPrivateIpv4([a, b]: [number, number, number, number]): boolean {
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local (incl. 169.254.169.254 metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

/** Normalise an IPv6 literal (brackets and zone id removed, lower-cased). */
function normaliseIpv6(hostname: string): string | null {
  const host = hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase().split('%')[0];
  if (!host.includes(':')) return null;
  return host;
}

function isPrivateIpv6(host: string): boolean {
  if (host === '::' || host === '::1') return true;
  if (host.startsWith('fe80')) return true; // link-local
  if (/^f[cd][0-9a-f]{2}:/.test(host)) return true; // unique local fc00::/7
  if (host.startsWith('ff')) return true; // multicast
  // IPv4-mapped/compatible: ::ffff:127.0.0.1 and ::ffff:7f00:1
  const mapped = host.match(/^::(?:ffff:)?(?:\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) {
    const dotted = host.slice(host.lastIndexOf(':') + 1);
    const ipv4 = parseIpv4(dotted);
    if (ipv4) return isPrivateIpv4(ipv4);
    return true;
  }
  if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(host)) return true; // hex-mapped
  return false;
}

function isCloudMetadataHostname(hostname: string): boolean {
  return (
    hostname === '169.254.169.254' ||
    hostname === 'metadata.google.internal' ||
    hostname === 'metadata' ||
    hostname === 'instance-data' ||
    hostname.endsWith('.metadata')
  );
}

/**
 * Decide whether a URL may be navigated.
 *
 * Every rejection carries a machine-readable `code` and a reason written for the
 * operator, because "blocked" without a reason is indistinguishable from a bug.
 */
export function assertNavigableUrl(raw: string, policy: BrowserPolicy = DEFAULT_BROWSER_POLICY): NavigationDecision {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, code: 'invalid_url', reason: 'The URL is empty.', hostname: null };
  if (trimmed.length > 2_048) {
    return { ok: false, code: 'invalid_url', reason: 'The URL is longer than 2048 characters.', hostname: null };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, code: 'invalid_url', reason: `"${trimmed.slice(0, 120)}" is not a valid absolute URL.`, hostname: null };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      ok: false,
      code: 'unsupported_scheme',
      reason: `Only http and https can be browsed (received "${parsed.protocol}").`,
      hostname: parsed.hostname || null,
    };
  }

  if (parsed.username || parsed.password) {
    return {
      ok: false,
      code: 'credentials_in_url',
      reason: 'URLs carrying embedded credentials are refused: the browser must not inherit them.',
      hostname: parsed.hostname,
    };
  }

  // `hostname` drops the trailing dot inconsistently across runtimes; strip it so
  // `http://localhost./` cannot slip past a `localhost` comparison.
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');

  if (policy.allowedHosts?.some((entry) => entry.toLowerCase() === hostname)) {
    return { ok: true, url: parsed.toString(), hostname };
  }
  if (policy.blockedHosts?.some((entry) => entry.toLowerCase() === hostname)) {
    return { ok: false, code: 'blocked_host', reason: `"${hostname}" is on the operator's block list.`, hostname };
  }

  if (isCloudMetadataHostname(hostname)) {
    return {
      ok: false,
      code: 'cloud_metadata',
      reason: 'Cloud metadata endpoints are never browsable: they hand out instance credentials.',
      hostname,
    };
  }

  const ipv6 = normaliseIpv6(hostname);
  const ipv4 = ipv6 ? null : parseIpv4(hostname);
  const isPrivate = ipv6 ? isPrivateIpv6(ipv6) : ipv4 ? isPrivateIpv4(ipv4) : false;

  if (isPrivate && !policy.allowPrivateNetworks) {
    return {
      ok: false,
      code: 'private_network',
      reason:
        `"${hostname}" resolves to a loopback, private, link-local or CGNAT address. ` +
        'Browsing it would let an agent reach the host network, the container network or cloud metadata.',
      hostname,
    };
  }

  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    return { ok: false, code: 'blocked_host', reason: `"${hostname}" is a local or cluster hostname.`, hostname };
  }
  if (BLOCKED_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    return {
      ok: false,
      code: 'blocked_host',
      reason: `"${hostname}" is an internal-only hostname (${BLOCKED_SUFFIXES.join(', ')}).`,
      hostname,
    };
  }

  return { ok: true, url: parsed.toString(), hostname };
}

/** Convenience predicate for link auditing. */
export function isNavigable(raw: string, policy: BrowserPolicy = DEFAULT_BROWSER_POLICY): boolean {
  return assertNavigableUrl(raw, policy).ok;
}

/**
 * Resolve a possibly-relative link against a page URL, then guard it.
 *
 * A page's own `href="javascript:alert(1)"` or `href="/admin"` must be classified
 * the same way as an absolute URL; this returns the decision for the *resolved*
 * target and never throws.
 */
export function resolveAndGuardLink(
  base: string,
  href: string,
  policy: BrowserPolicy = DEFAULT_BROWSER_POLICY,
): { href: string; decision: NavigationDecision } {
  try {
    const resolved = new URL(href, base).toString();
    return { href: resolved, decision: assertNavigableUrl(resolved, policy) };
  } catch {
    return {
      href,
      decision: { ok: false, code: 'invalid_url', reason: 'The link is not a resolvable URL.', hostname: null },
    };
  }
}
