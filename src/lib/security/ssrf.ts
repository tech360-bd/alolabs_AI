import dns from 'node:dns/promises';
import net from 'node:net';

export interface ExternalUrlOptions {
  /** Allow plain `http://` in addition to `https://`. Defaults to false in production. */
  allowHttp?: boolean;
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'ip6-localhost',
  'ip6-loopback',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'metadata.aws',
  'instance-data',
]);

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function inCidr4(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

/**
 * Return true if an IPv4 or IPv6 literal falls into loopback, private RFC1918/ULA,
 * link-local, metadata, CGNAT, or multicast/reserved space.
 */
export function isPrivateOrReservedIp(rawIp: string): boolean {
  const ip = rawIp.trim().replace(/^\[|\]$/g, '').split('%')[0].toLowerCase();

  const version = net.isIP(ip);
  if (version === 4) {
    return (
      inCidr4(ip, '0.0.0.0', 8) ||
      inCidr4(ip, '10.0.0.0', 8) ||
      inCidr4(ip, '100.64.0.0', 10) ||
      inCidr4(ip, '127.0.0.0', 8) ||
      inCidr4(ip, '169.254.0.0', 16) ||
      inCidr4(ip, '172.16.0.0', 12) ||
      inCidr4(ip, '192.0.0.0', 24) ||
      inCidr4(ip, '192.0.2.0', 24) ||
      inCidr4(ip, '192.168.0.0', 16) ||
      inCidr4(ip, '198.18.0.0', 15) ||
      inCidr4(ip, '198.51.100.0', 24) ||
      inCidr4(ip, '203.0.113.0', 24) ||
      inCidr4(ip, '224.0.0.0', 4) ||
      inCidr4(ip, '240.0.0.0', 4)
    );
  }

  if (version === 6) {
    if (ip === '::' || ip === '::1') return true;
    // IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1)
    if (ip.startsWith('::ffff:')) {
      const rest = ip.slice('::ffff:'.length);
      if (net.isIPv4(rest)) return isPrivateOrReservedIp(rest);
      const hexMatch = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(rest);
      if (hexMatch) {
        const hi = parseInt(hexMatch[1], 16);
        const lo = parseInt(hexMatch[2], 16);
        const dotted = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
        return isPrivateOrReservedIp(dotted);
      }
      return true;
    }
    // Unique local (fc00::/7), link-local (fe80::/10), multicast (ff00::/8)
    if (/^(fc|fd|fe[89ab]|ff)/i.test(ip)) return true;
    return false;
  }

  return true;
}

/**
 * Synchronous validation of URL scheme, credentials, hostname, and IP literals
 * (including octal/hex/integer-encoded IPv4 forms).
 */
export function validateExternalUrlSyntax(rawUrl: string, options: ExternalUrlOptions = {}): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  const allowHttp = options.allowHttp ?? false;
  if (parsed.protocol !== 'https:' && !(allowHttp && parsed.protocol === 'http:')) {
    throw new Error(
      allowHttp
        ? `Protocol '${parsed.protocol}' is not allowed. Only http:// and https:// are permitted.`
        : `Protocol '${parsed.protocol}' is not allowed. Only https:// is permitted.`,
    );
  }

  if (parsed.username || parsed.password) {
    throw new Error('Credentials in URL are not allowed.');
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) {
    throw new Error('URL hostname is required.');
  }

  if (
    BLOCKED_HOSTNAMES.has(host) ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    throw new Error('Requests to internal/localhost/metadata hostnames are not allowed.');
  }

  // Reject single-integer / hex / octal / shorthand IPv4 encodings (e.g. 2130706433, 0x7f000001, 0177.0.0.1)
  if (/^\d+$/.test(host) || /^0x[0-9a-f.]+$/i.test(host) || /^0\d+(\.|$)/.test(host)) {
    throw new Error('Numeric/octal/hex host encodings are not allowed.');
  }

  if (net.isIP(host)) {
    if (isPrivateOrReservedIp(host)) {
      throw new Error('Requests to private, loopback, or reserved IP addresses are not allowed.');
    }
  }

  return parsed;
}

/**
 * Full SSRF check: runs syntactic validation AND resolves DNS to ensure a domain
 * does not resolve to a private, loopback, link-local, or reserved IP.
 */
export async function assertSafeExternalUrl(rawUrl: string, options: ExternalUrlOptions = {}): Promise<URL> {
  const parsed = validateExternalUrlSyntax(rawUrl, options);
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (!net.isIP(host)) {
    try {
      const records = await dns.lookup(host, { all: true, verbatim: true });
      for (const rec of records) {
        if (isPrivateOrReservedIp(rec.address)) {
          throw new Error('Resolved target IP is in a private or reserved network range.');
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('private or reserved')) {
        throw err;
      }
      // DNS resolution failure (e.g. ENOTFOUND) will fail safely at fetch() time or can be handled there.
    }
  }

  return parsed;
}
