import { describe, it, expect } from 'vitest';
import { _isBlockedIPForTests } from '@/lib/webhooks/ssrf-guard';

/**
 * F5: SSRF — IPv4-mapped IPv6 normalization regression tests.
 *
 * Verifies that ::ffff:127.0.0.1 and other IPv4-mapped IPv6 addresses are
 * blocked (they bypass the IPv4 blocklist without normalization).
 */

describe('F5: IPv4-mapped IPv6 normalization', () => {
  it('blocks ::ffff:127.0.0.1 (mapped loopback)', () => {
    const result = _isBlockedIPForTests('::ffff:127.0.0.1');
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/IPv4-mapped/);
  });

  it('blocks ::ffff:10.0.0.1 (mapped private)', () => {
    const result = _isBlockedIPForTests('::ffff:10.0.0.1');
    expect(result.blocked).toBe(true);
  });

  it('blocks ::ffff:192.168.1.1 (mapped private)', () => {
    const result = _isBlockedIPForTests('::ffff:192.168.1.1');
    expect(result.blocked).toBe(true);
  });

  it('blocks ::ffff:169.254.169.254 (mapped link-local / cloud metadata)', () => {
    const result = _isBlockedIPForTests('::ffff:169.254.169.254');
    expect(result.blocked).toBe(true);
  });

  it('blocks ::ffff:172.16.0.1 (mapped private 172.16)', () => {
    const result = _isBlockedIPForTests('::ffff:172.16.0.1');
    expect(result.blocked).toBe(true);
  });

  it('blocks the long form ::ffff:0:127.0.0.1', () => {
    const result = _isBlockedIPForTests('::ffff:0:127.0.0.1');
    expect(result.blocked).toBe(true);
  });

  it('allows a mapped PUBLIC IPv4 (e.g. ::ffff:8.8.8.8)', () => {
    const result = _isBlockedIPForTests('::ffff:8.8.8.8');
    expect(result.blocked).toBe(false);
  });

  it('still blocks IPv6 loopback ::1', () => {
    expect(_isBlockedIPForTests('::1').blocked).toBe(true);
  });

  it('still blocks IPv6 link-local fe80::1', () => {
    expect(_isBlockedIPForTests('fe80::1').blocked).toBe(true);
  });

  it('still blocks IPv6 unique-local fc00::1', () => {
    expect(_isBlockedIPForTests('fc00::1').blocked).toBe(true);
  });

  it('still blocks IPv6 unique-local fd12::1', () => {
    expect(_isBlockedIPForTests('fd12::1').blocked).toBe(true);
  });

  it('allows a public IPv6 address (e.g. 2606:4700:4700::1111)', () => {
    expect(_isBlockedIPForTests('2606:4700:4700::1111').blocked).toBe(false);
  });
});
