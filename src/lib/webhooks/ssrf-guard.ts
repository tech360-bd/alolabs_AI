/**
 * SSRF guard for outbound webhook delivery.
 *
 * Blocks requests to loopback, private, link-local, reserved, and other
 * prohibited internal destinations. Validates DNS resolution and rechecks
 * redirects. Prevents DNS rebinding where feasible.
 *
 * Per Decision 6 security requirements.
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

// Blocked IPv4 ranges as [startIp, endIp] string pairs (avoids BigInt which
// requires ES2020+; the repo's tsconfig targets ES2017).
const BLOCKED_RANGES: ReadonlyArray<{ start: number; end: number; label: string }> = [
  { start: ipToInt('0.0.0.0'), end: ipToInt('0.255.255.255'), label: '0.0.0.0/8 (this network)' },
  { start: ipToInt('10.0.0.0'), end: ipToInt('10.255.255.255'), label: '10.0.0.0/8 (private)' },
  { start: ipToInt('127.0.0.0'), end: ipToInt('127.255.255.255'), label: '127.0.0.0/8 (loopback)' },
  { start: ipToInt('169.254.0.0'), end: ipToInt('169.254.255.255'), label: '169.254.0.0/16 (link-local)' },
  { start: ipToInt('172.16.0.0'), end: ipToInt('172.31.255.255'), label: '172.16.0.0/12 (private)' },
  { start: ipToInt('192.0.0.0'), end: ipToInt('192.0.0.255'), label: '192.0.0.0/24 (reserved)' },
  { start: ipToInt('192.0.2.0'), end: ipToInt('192.0.2.255'), label: '192.0.2.0/24 (TEST-NET-1)' },
  { start: ipToInt('192.168.0.0'), end: ipToInt('192.168.255.255'), label: '192.168.0.0/16 (private)' },
  { start: ipToInt('198.18.0.0'), end: ipToInt('198.19.255.255'), label: '198.18.0.0/15 (benchmark)' },
  { start: ipToInt('198.51.100.0'), end: ipToInt('198.51.100.255'), label: '198.51.100.0/24 (TEST-NET-2)' },
  { start: ipToInt('203.0.113.0'), end: ipToInt('203.0.113.255'), label: '203.0.113.0/24 (TEST-NET-3)' },
  { start: ipToInt('224.0.0.0'), end: ipToInt('239.255.255.255'), label: '224.0.0.0/4 (multicast)' },
  { start: ipToInt('240.0.0.0'), end: ipToInt('255.255.255.255'), label: '240.0.0.0/4 (reserved)' },
];

function ipToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return -1;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function isBlockedIP(ip: string): { blocked: boolean; reason?: string } {
  const family = isIP(ip);
  if (family === 0) return { blocked: true, reason: 'invalid IP' };

  // F5: Normalize IPv4-mapped IPv6 addresses (::ffff:a.b.c.d) and apply IPv4
  // private/reserved exclusions to them. Without this, ::ffff:127.0.0.1 would
  // bypass the IPv4 blocklist because isIP() reports it as IPv6.
  if (family === 6) {
    const lower = ip.toLowerCase();
    // Strip the IPv4-mapped prefix ::ffff: (and the long form ::ffff:0:) so
    // the embedded IPv4 address is checked against the IPv4 blocklist.
    const mappedMatch = lower.match(/^::ffff:(?:0:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mappedMatch) {
      const ipv4 = mappedMatch[1];
      const ipv4Check = isBlockedIP(ipv4);
      if (ipv4Check.blocked) {
        return { blocked: true, reason: `IPv4-mapped IPv6 → ${ipv4}: ${ipv4Check.reason}` };
      }
      return { blocked: false };
    }
    if (lower === '::1' || lower === '::') return { blocked: true, reason: 'loopback/unspecified IPv6' };
    if (lower.startsWith('fc') || lower.startsWith('fd')) return { blocked: true, reason: 'unique-local IPv6' };
    if (lower.startsWith('fe80')) return { blocked: true, reason: 'link-local IPv6' };
    return { blocked: false };
  }
  const val = ipToInt(ip);
  if (val < 0) return { blocked: true, reason: 'invalid IPv4' };
  for (const range of BLOCKED_RANGES) {
    if (val >= range.start && val <= range.end) return { blocked: true, reason: range.label };
  }
  return { blocked: false };
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost', 'localhost.localdomain', 'ip6-localhost', 'ip6-loopback',
  'broadcasthost', 'metadata.google.internal',
]);

export interface SsrfCheckResult {
  allowed: boolean;
  reason?: string;
  resolvedIp?: string;
}

export async function checkSsrf(targetUrl: string): Promise<SsrfCheckResult> {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return { allowed: false, reason: 'invalid URL' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { allowed: false, reason: `blocked protocol: ${parsed.protocol}` };
  }
  const hostname = parsed.hostname;
  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) {
    return { allowed: false, reason: `blocked hostname: ${hostname}` };
  }
  if (isIP(hostname)) {
    const check = isBlockedIP(hostname);
    if (check.blocked) return { allowed: false, reason: `blocked IP: ${check.reason}` };
    return { allowed: true, resolvedIp: hostname };
  }
  let records;
  try {
    records = await lookup(hostname, { all: true });
  } catch {
    return { allowed: false, reason: 'DNS resolution failed' };
  }
  if (records.length === 0) return { allowed: false, reason: 'no DNS records' };
  for (const record of records) {
    const check = isBlockedIP(record.address);
    if (check.blocked) return { allowed: false, reason: `resolved to blocked IP ${record.address}: ${check.reason}` };
  }
  return { allowed: true, resolvedIp: records[0].address };
}

export async function checkRedirectSsrf(redirectUrl: string): Promise<SsrfCheckResult> {
  return checkSsrf(redirectUrl);
}

/** Test helper: expose the in-process IP check for unit tests (no DNS). */
export function _isBlockedIPForTests(ip: string): { blocked: boolean; reason?: string } {
  return isBlockedIP(ip);
}
