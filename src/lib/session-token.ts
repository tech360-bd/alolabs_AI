import crypto from 'crypto';

/**
 * Shared session-token key derivation.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * Session rows live in the `Settings` table under a single shared `session:`
 * keyspace, but two independent modules read and write it:
 *
 *   - `src/lib/auth.ts`              — mints tokens on login (the live path:
 *                                      `POST /api/auth/login` → createSessionToken)
 *   - `src/lib/session-manager.ts`   — verifies, lists, refreshes and revokes
 *                                      them (`/api/auth/sessions`, cron cleanup)
 *
 * Each used to define its own private `sessionKey()`. That is only safe for as
 * long as the two implementations stay byte-identical. When token hashing was
 * added to `auth.ts` alone, `revokeSession()` kept looking up the unhashed key,
 * silently missed the row, and **logout stopped invalidating the session** —
 * the bearer token remained valid after the user signed out.
 *
 * Deriving the key in exactly one place makes that class of bug impossible:
 * neither module can drift from the other.
 *
 * THREAT MODEL
 * ------------
 * The bearer token is returned to the client and never persisted. Only its
 * SHA-256 digest is stored, as the row key. A read of the Settings table — SQL
 * injection, a stolen backup, an over-broad admin export — therefore yields
 * digests that cannot be replayed.
 *
 * SHA-256 rather than bcrypt/argon2 is the correct choice here: the token is
 * 48 bytes of CSPRNG output, so there is no low-entropy secret for an attacker
 * to brute-force offline, and a fast digest avoids a key-derivation cost on
 * every authenticated request.
 */

export const SESSION_KEY_PREFIX = 'session:';

/** SHA-256 digest of a bearer token. This is what gets persisted. */
export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Storage key for a token. The raw token never appears in it. */
export function sessionKey(token: string): string {
  return `${SESSION_KEY_PREFIX}${hashSessionToken(token)}`;
}

/**
 * Storage key used before tokens were hashed at rest.
 *
 * Rows written by earlier revisions are keyed by the raw token. They are still
 * honoured on read and migrated in place, so enabling hashing is not a mass
 * logout. New writes always use `sessionKey()`.
 */
export function legacySessionKey(token: string): string {
  return `${SESSION_KEY_PREFIX}${token}`;
}

/**
 * Build a storage key from an already-hashed digest, as found in the
 * `user:sessions:<userId>` index. Unlike `sessionKey()` this does not hash
 * again, so index entries must never be passed to `sessionKey()`.
 */
export function sessionKeyFromHash(tokenHash: string): string {
  return `${SESSION_KEY_PREFIX}${tokenHash}`;
}

/** True when a value looks like a SHA-256 hex digest rather than a raw token. */
export function isTokenHash(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

/**
 * Candidate storage keys for one index entry, most-specific first.
 *
 * The per-user index may contain digests (current) or raw tokens (written
 * before hashing). Returning both lets readers resolve either without a
 * migration pass, and is a no-op once every entry is a digest.
 */
export function candidateKeysForIndexEntry(entry: string): string[] {
  return isTokenHash(entry)
    ? [sessionKeyFromHash(entry)]
    : [sessionKeyFromHash(hashSessionToken(entry)), legacySessionKey(entry)];
}
