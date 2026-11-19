import { createHash, randomBytes } from 'node:crypto';
import { encryptField, decryptField } from '@/lib/security/field-encryption';

export const linkTtlSeconds = 600;
export const linkCookie = 'alo-social-link';
export function createLinkState(userId: string, provider: string) {
  const state = randomBytes(32).toString('hex');
  const verifier = randomBytes(48).toString('base64url');
  const cookie = encryptField(JSON.stringify({ state, verifier, userId, provider, until: Date.now() + linkTtlSeconds * 1000 }));
  return { state, cookie, challenge: createHash('sha256').update(verifier).digest('base64url') };
}
export function readLinkState(cookie: string | undefined, state: string | null, userId: string, provider: string): string | null {
  if (!cookie || !state) return null;
  try {
    const record = JSON.parse(decryptField(cookie));
    if (record.state !== state || record.userId !== userId || record.provider !== provider || record.until <= Date.now()) return null;
    return typeof record.verifier === 'string' ? record.verifier : null;
  } catch { return null; }
}

/** Only digests go in Settings. deleteMany(key AND value) atomically consumes the intent. */
export function pendingLink(userId: string, provider: string, state: string) {
  const digest = (value: string) => createHash('sha256').update(value).digest('hex');
  return { key: `oauth-link:${provider}:${digest(userId)}`, value: digest(state) };
}
