import crypto from 'crypto';

/**
 * Shared session-token hashing and legacy Settings-key helpers.
 *
 * New sessions are signed JWTs whose SHA-256 digest is stored in
 * `Prisma.Session.tokenHash`; they do not use Settings keys. The `session:`
 * key helpers below exist only for opaque Settings-backed sessions created by
 * older releases and are retained to support the rolling migration and cleanup.
 *
 * Bearer tokens are never persisted in plaintext. A fast SHA-256 digest is
 * appropriate for the high-entropy signed token and avoids a password-hashing
 * cost on every authenticated request. The digest is the lookup value in both
 * the Prisma model and the legacy Settings-key bridge.
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
