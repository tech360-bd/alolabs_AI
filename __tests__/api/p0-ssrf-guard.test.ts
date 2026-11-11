import { describe, it, expect } from 'vitest';
import { _isBlockedIPForTests } from '@/lib/webhooks/ssrf-guard';

/**
 * Decision 6: Outbound webhook SSRF prevention — unit tests.
 *
 * Verifies that the SSRF guard blocks loopback, private, link-local, reserved,
 * cloud metadata, and prohibited internal destinations. These are pure IP
 * checks (no DNS), so they're deterministic and fast.
 */

describe('SSRF guard — IP blocking', () => {
  it('blocks loopback IPv4', () => {
    expect(_isBlockedIPForTests('127.0.0.1').blocked).toBe(true);
    expect(_isBlockedIPForTests('127.255.255.255').blocked).toBe(true);
  });

  it('blocks private 10.x range', () => {
    expect(_isBlockedIPForTests('10.0.0.1').blocked).toBe(true);
    expect(_isBlockedIPForTests('10.255.255.255').blocked).toBe(true);
  });

  it('blocks private 172.16-31.x range', () => {
    expect(_isBlockedIPForTests('172.16.0.1').blocked).toBe(true);
    expect(_isBlockedIPForTests('172.31.255.255').blocked).toBe(true);
  });

  it('blocks private 192.168.x range', () => {
    expect(_isBlockedIPForTests('192.168.0.1').blocked).toBe(true);
    expect(_isBlockedIPForTests('192.168.1.1').blocked).toBe(true);
  });

  it('blocks link-local 169.254.x range (incl. cloud metadata)', () => {
    expect(_isBlockedIPForTests('169.254.169.254').blocked).toBe(true);
  });

  it('blocks TEST-NET ranges', () => {
    expect(_isBlockedIPForTests('192.0.2.1').blocked).toBe(true);
    expect(_isBlockedIPForTests('198.51.100.1').blocked).toBe(true);
    expect(_isBlockedIPForTests('203.0.113.1').blocked).toBe(true);
  });

  it('blocks multicast and reserved', () => {
    expect(_isBlockedIPForTests('224.0.0.1').blocked).toBe(true);
    expect(_isBlockedIPForTests('240.0.0.1').blocked).toBe(true);
  });

  it('blocks 0.0.0.0', () => {
    expect(_isBlockedIPForTests('0.0.0.0').blocked).toBe(true);
  });

  it('blocks loopback IPv6', () => {
    expect(_isBlockedIPForTests('::1').blocked).toBe(true);
  });

  it('blocks unique-local IPv6', () => {
    expect(_isBlockedIPForTests('fc00::1').blocked).toBe(true);
    expect(_isBlockedIPForTests('fd12::1').blocked).toBe(true);
  });

  it('blocks link-local IPv6', () => {
    expect(_isBlockedIPForTests('fe80::1').blocked).toBe(true);
  });

  it('allows public IPs', () => {
    expect(_isBlockedIPForTests('8.8.8.8').blocked).toBe(false);
    expect(_isBlockedIPForTests('1.1.1.1').blocked).toBe(false);
    expect(_isBlockedIPForTests('203.0.113.1').blocked).toBe(true); // TEST-NET-3, blocked
    expect(_isBlockedIPForTests('104.16.0.1').blocked).toBe(false);
  });

  it('rejects invalid IPs', () => {
    expect(_isBlockedIPForTests('not-an-ip').blocked).toBe(true);
    expect(_isBlockedIPForTests('999.999.999.999').blocked).toBe(true);
  });
});
