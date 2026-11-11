import { describe, it, expect } from 'vitest';
import { hasScope, type V1Identity } from '@/lib/v1-auth';

/**
 * F2: API scope authorization — documented service scopes.
 *
 * Verifies that the scope check is consistent: a key with `ai:tasks` can
 * access ai-tasks, a key without it cannot, an invalid/revoked key scenario
 * is handled, and the scope check does not weaken authentication.
 */

function makeIdentity(scopes: string[], kind: 'apiKey' | 'session' = 'apiKey'): V1Identity {
  return {
    kind,
    userId: 'u-test',
    role: 'api',
    email: 'test@example.com',
    name: 'Test Key',
    companyId: 'company-test',
    scopes,
    keyId: 'key-test',
  };
}

describe('F2: hasScope — documented service scopes', () => {
  it('allows a key with the exact ai:tasks scope', () => {
    const id = makeIdentity(['ai:tasks']);
    expect(hasScope(id, 'ai:tasks')).toBe(true);
  });

  it('allows a key with the wildcard * scope', () => {
    const id = makeIdentity(['*']);
    expect(hasScope(id, 'ai:tasks')).toBe(true);
  });

  it('rejects a key with a different scope (ai:chat cannot do ai:tasks)', () => {
    const id = makeIdentity(['ai:chat']);
    expect(hasScope(id, 'ai:tasks')).toBe(false);
  });

  it('rejects a key with no scopes', () => {
    const id = makeIdentity([]);
    expect(hasScope(id, 'ai:tasks')).toBe(false);
  });

  it('rejects a key with an unrelated scope (agents:read cannot do ai:tasks)', () => {
    const id = makeIdentity(['agents:read']);
    expect(hasScope(id, 'ai:tasks')).toBe(false);
  });

  it('does not weaken: a session user with [] scopes is NOT granted ai:tasks', () => {
    // Sessions have scopes: ['*'] by design (they authenticate via session,
    // not API key). But if a session somehow had empty scopes, hasScope
    // must still return false — it never grants implicit scopes.
    const id = makeIdentity([], 'session');
    expect(hasScope(id, 'ai:tasks')).toBe(false);
  });

  it('does not permit broader scopes: ai:tasks does not grant ai:chat', () => {
    const id = makeIdentity(['ai:tasks']);
    expect(hasScope(id, 'ai:chat')).toBe(false);
  });

  it('does not permit broader scopes: ai:tasks does not grant ai:knowledge:search', () => {
    const id = makeIdentity(['ai:tasks']);
    expect(hasScope(id, 'ai:knowledge:search')).toBe(false);
  });

  it('case-sensitive: AI:Tasks is not the same as ai:tasks', () => {
    const id = makeIdentity(['AI:Tasks']);
    expect(hasScope(id, 'ai:tasks')).toBe(false);
  });
});
