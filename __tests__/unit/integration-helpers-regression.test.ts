import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { guardedFetch, runConnectorOp, requireApiKey, IntegrationError, joinUrl } from '@/lib/integrations';

/**
 * Regression guard for the integrations helper block.
 *
 * These helpers used to be unreachable: the whole block had been collapsed into
 * a single line beginning with `//`, so the comment swallowed the code and every
 * import resolved to `undefined` at runtime. The SSRF guard in `guardedFetch`
 * therefore never ran while the module still type-checked loosely enough to ship.
 *
 * Two things are asserted here:
 *  1. The helpers exist as real functions (the regression itself).
 *  2. `guardedFetch` fails closed on private targets without making a request.
 */

describe('integrations helper block is exported and executable', () => {
  it('exposes guardedFetch / runConnectorOp / requireApiKey as functions', () => {
    expect(typeof guardedFetch).toBe('function');
    expect(typeof runConnectorOp).toBe('function');
    expect(typeof requireApiKey).toBe('function');
    expect(typeof joinUrl).toBe('function');
  });

  it('joinUrl joins without doubling slashes', () => {
    expect(joinUrl('https://a.example/', '/x/y')).toBe('https://a.example/x/y');
    expect(joinUrl('https://a.example', 'x/y')).toBe('https://a.example/x/y');
  });

  it('guardedFetch refuses a loopback target before any network call', async () => {
    await expect(guardedFetch('test-adapter', 'http://127.0.0.1/secret')).rejects.toBeInstanceOf(IntegrationError);
  });

  it('guardedFetch refuses the cloud metadata address', async () => {
    await expect(
      guardedFetch('test-adapter', 'https://169.254.169.254/latest/meta-data/'),
    ).rejects.toBeInstanceOf(IntegrationError);
  });

  it('requireApiKey throws a typed error when the credential is empty', () => {
    expect(() =>
      requireApiKey({ companyId: 'c1', credential: { baseUrl: 'https://x.example' } } as never, 'test-adapter'),
    ).toThrow(IntegrationError);
  });

  it('runConnectorOp normalizes a thrown error into a failed result', async () => {
    const result = await runConnectorOp(
      { id: 'test-adapter' } as never,
      { companyId: 'c1', credential: { baseUrl: 'https://x.example' } } as never,
      'op',
      async () => {
        throw new Error('boom');
      },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe('boom');
    expect(result.audit?.companyId).toBe('c1');
  });
});

describe('source integrity: helper block is not collapsed into a comment line', () => {
  it('src/lib/integrations/types.ts contains no line that swallows code in a comment', () => {
    const path = join(process.cwd(), 'src/lib/integrations/types.ts');
    const source = readFileSync(path, 'utf8');
    for (const line of source.split('\n')) {
      if (line.trimStart().startsWith('//')) {
        // A legitimate comment line must not carry export/function declarations.
        expect(line).not.toMatch(/\\n\s*export /);
        expect(line.length).toBeLessThan(400);
      }
    }
  });
});
