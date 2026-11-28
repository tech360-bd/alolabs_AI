import { describe, expect, it } from 'vitest';
import { isPublicApiRoute } from '@/proxy';

describe('public API route matching', () => {
  it('matches public endpoints exactly by default', () => {
    expect(isPublicApiRoute('/api/auth/login', 'POST')).toBe(true);
    expect(isPublicApiRoute('/api/auth/login', 'GET')).toBe(false);
    expect(isPublicApiRoute('/api/auth/password-reset', 'POST')).toBe(true);
    expect(isPublicApiRoute('/api/auth/password-reset-debug', 'POST')).toBe(false);
    expect(isPublicApiRoute('/api/auth/mfa/resend', 'POST')).toBe(true);
    expect(isPublicApiRoute('/api/auth/mfa/resend', 'GET')).toBe(false);
    expect(isPublicApiRoute('/api/auth/login-debug', 'POST')).toBe(false);
    expect(isPublicApiRoute('/api/infra/ping-secret', 'GET')).toBe(false);
  });

  it('keeps detailed health diagnostics private', () => {
    expect(isPublicApiRoute('/api/health', 'GET')).toBe(true);
    expect(isPublicApiRoute('/api/health/live', 'GET')).toBe(true);
    expect(isPublicApiRoute('/api/health/deep', 'GET')).toBe(false);
    expect(isPublicApiRoute('/api/health/unknown', 'GET')).toBe(false);
  });

  it('allows only explicitly slash-scoped public prefixes', () => {
    expect(isPublicApiRoute('/api/public/contact', 'POST')).toBe(true);
    expect(isPublicApiRoute('/api/publicity/contact', 'POST')).toBe(false);
    expect(isPublicApiRoute('/api/auth/oauth/google', 'GET')).toBe(true);
    expect(isPublicApiRoute('/api/auth/oauthish/google', 'GET')).toBe(false);
    expect(isPublicApiRoute('/api/email/track/open/deadbeef.gif', 'GET')).toBe(true);
    expect(isPublicApiRoute('/api/email/track/open/deadbeef.gif', 'POST')).toBe(false);
    expect(isPublicApiRoute('/api/email/track/click/deadbeef', 'GET')).toBe(false);
  });
});
