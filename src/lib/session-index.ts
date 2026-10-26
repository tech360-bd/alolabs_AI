import { db } from '@/lib/db';
import { hashSessionToken } from '@/lib/session-token';

/**
 * The per-user session index: `user:sessions:<userId>` -> JSON array of token
 * DIGESTS.
 *
 * WHY THIS IS A SEPARATE MODULE
 * -----------------------------
 * `src/lib/auth.ts` mints session tokens on login and `src/lib/session-manager.ts`
 * lists and revokes them. Both need this index. It used to be private to
 * session-manager.ts, which meant auth.ts never populated it — so
 * `listActiveSessions()` always returned `[]` for real logins and
 * `revokeAllSessions()` always revoked nothing, while `DELETE
 * /api/auth/sessions?all=true` reported success. The "active devices" screen
 * and "sign out all other devices" were both non-functional.
 *
 * Extracting the index to a leaf module lets both callers share one
 * implementation. Keeping it here rather than in either caller also avoids
 * inverting the layering (auth.ts is the lower-level module) and prevents a
 * third divergent copy — the same failure mode that broke logout when key
 * derivation was duplicated. See src/lib/session-token.ts.
 *
 * Only DIGESTS are stored. This array is a second copy of every live
 * credential, so plaintext here would undo the hashing of the session rows.
 */

const USER_SESSIONS_KEY_PREFIX = 'user:sessions:';

export function userSessionsKey(userId: string): string {
  return `${USER_SESSIONS_KEY_PREFIX}${userId}`;
}

/** Read the raw index entries (digests, possibly legacy plaintext). */
export async function readSessionIndex(userId: string): Promise<string[]> {
  const record = await db.settings.findUnique({ where: { key: userSessionsKey(userId) } });
  if (!record) return [];
  try {
    const parsed = JSON.parse(record.value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

async function writeSessionIndex(userId: string, entries: string[]): Promise<void> {
  const key = userSessionsKey(userId);
  if (entries.length === 0) {
    await db.settings.delete({ where: { key } }).catch(() => {});
    return;
  }
  await db.settings.upsert({
    where: { key },
    update: { value: JSON.stringify(entries), updatedAt: new Date() },
    create: { key, value: JSON.stringify(entries), type: 'json' },
  });
}

async function filterSessionIndex(
  userId: string,
  keep: (entry: string) => boolean,
): Promise<void> {
  const entries = await readSessionIndex(userId);
  if (entries.length === 0) return;
  const filtered = entries.filter(keep);
  if (filtered.length === entries.length) return; // nothing to do
  await writeSessionIndex(userId, filtered);
}

/** Record a newly issued token against its user. Stores the digest. */
export async function addSessionToIndex(userId: string, token: string): Promise<void> {
  const entries = await readSessionIndex(userId);
  const digest = hashSessionToken(token);
  if (entries.includes(digest)) return;
  await writeSessionIndex(userId, [...entries, digest]);
}

/**
 * Remove a token from the index. Matches the digest and any legacy plaintext
 * entry for the same token, so an index written before hashing is cleaned up on
 * first use.
 */
export async function removeSessionFromIndex(userId: string, token: string): Promise<void> {
  const digest = hashSessionToken(token);
  await filterSessionIndex(userId, (entry) => entry !== digest && entry !== token);
}

/**
 * Remove one index entry by EXACT match, for callers that already hold a stored
 * entry (read back out of a row key). Such a value must never be re-hashed:
 * passing a digest to `removeSessionFromIndex` would hash twice and match
 * nothing, leaving the index permanently stale.
 */
export async function removeSessionIndexEntry(userId: string, entry: string): Promise<void> {
  await filterSessionIndex(userId, (e) => e !== entry);
}

/** Drop a user's index entirely (e.g. after revoking all their sessions). */
export async function clearSessionIndex(userId: string): Promise<void> {
  await db.settings.delete({ where: { key: userSessionsKey(userId) } }).catch(() => {});
}
