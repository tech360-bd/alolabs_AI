/**
 * Machine-to-machine authentication.
 *
 * A host workflow is not a browser: it has no session cookie, and it must not need
 * one. The alternative — adding the route to `PUBLIC_API_ROUTES` — would make it
 * genuinely public, which is the opposite of what a backup status endpoint needs.
 *
 * So this is an explicit, narrow auth helper: a single shared bearer token, compared
 * in constant time, with a fail-closed configuration check. It is recognised by
 * `scripts/validate-route-auth.mjs` as an auth helper alongside `requireAuth`.
 *
 * Rules:
 *   * No token configured → 503. An unconfigured deployment must not accept an
 *     anonymous bearer, and "no token" must never mean "any token".
 *   * Tokens shorter than 24 characters are refused at configuration time: a
 *     guessable secret is worse than no endpoint.
 *   * The comparison is constant time even for wrong lengths (length mismatch is
 *     folded into the comparison instead of returning early on a length check that
 *     leaks... nothing, but the code is simpler to keep uniform).
 */

import { NextRequest, NextResponse } from 'next/server';

export const MIN_TOKEN_LENGTH = 24;

export interface MachineAuthResult {
  ok: boolean;
  response?: NextResponse;
  reason?: 'not-configured' | 'unauthorized';
}

export function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return diff === 0;
}

function bearerOf(request: NextRequest): string | null {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/**
 * Verify the request carries the configured machine token.
 *
 * Returns `{ ok: true }` or a ready-made error response; callers must return it.
 */
export function requireMachineToken(
  request: NextRequest,
  options: { envVar?: string; unconfiguredMessage?: string } = {},
): MachineAuthResult {
  const name = options.envVar ?? 'BACKUP_INGEST_TOKEN';
  const configured = process.env[name];

  if (!configured || configured.length < MIN_TOKEN_LENGTH) {
    return {
      ok: false,
      reason: 'not-configured',
      response: NextResponse.json(
        {
          error: options.unconfiguredMessage ?? 'Machine access is not configured',
          detail: `Set ${name} (${MIN_TOKEN_LENGTH}+ characters) in the application environment, and the same value as a repository secret for the caller.`,
        },
        { status: 503 },
      ),
    };
  }

  const provided = bearerOf(request);
  if (!provided || !constantTimeEqual(provided, configured)) {
    // Deliberately no detail: an attacker learns nothing about length or prefix.
    return { ok: false, reason: 'unauthorized', response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  return { ok: true };
}
