/**
 * Envelope encryption for environment secrets.
 *
 * Design (established pattern, not an invention):
 *
 *   value ──AES-256-GCM(data key)──▶ ciphertext
 *   data key ──AES-256-GCM(KEK)────▶ wrapped data key
 *   KEK ──lives in the process environment, never in the database──
 *
 * Every secret gets its own 256-bit data key, so compromising one row does not
 * compromise the rest, and rotating the key-encryption key re-wraps data keys
 * without re-encrypting payloads.
 *
 * Properties this module guarantees:
 *
 *  * **Authenticated encryption.** GCM tags are verified; a modified ciphertext,
 *    tag, IV or associated-data value fails closed instead of returning garbage.
 *  * **Unique nonces.** 96-bit random IVs, generated per encryption, never reused
 *    across a key — the failure mode of GCM is catastrophic when they repeat.
 *  * **Bound context.** The associated data binds a secret to its tenant, project,
 *    environment and key name. A ciphertext copied into another row will not
 *    decrypt, which turns a database-level mix-up into an explicit error.
 *  * **Key versioning.** Each wrapped key records which KEK wrapped it, so a
 *    rotation can introduce `KEK v2` while `v1` rows stay readable, and
 *    `needsRewrap()` tells an operator exactly what remains.
 *  * **No plaintext anywhere but memory.** Nothing here logs, stringifies or
 *    returns a value; callers receive a sealed record or an error.
 *
 * The KEK comes from `ALO_KEK_KEYS`, a JSON object of `{ "1": "<base64 32 bytes>",
 * "2": ... }`, with `ALO_KEK_ACTIVE` naming the id used for new wraps. A single
 * string is also accepted for a first deployment (`ALO_KEK`, treated as key `1`).
 * Missing or malformed configuration throws: an unconfigured secret store must not
 * silently write plaintext.
 */

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

export const ALGORITHM = 'aes-256-gcm';
export const KEY_BYTES = 32;
export const IV_BYTES = 12;
export const TAG_BYTES = 16;

export interface SealedSecret {
  /** Which key-encryption key wrapped the data key. */
  kekId: string;
  /** The data key, encrypted under the KEK. */
  dekCiphertext: string;
  dekIv: string;
  dekTag: string;
  /** The value, encrypted under the data key. */
  ciphertext: string;
  iv: string;
  tag: string;
  /** Recorded so a rotation can be audited: which algorithm produced this row. */
  algorithm: string;
}

export class SecretStoreError extends Error {
  constructor(message: string, readonly code: 'not-configured' | 'invalid-key' | 'decrypt-failed' | 'invalid-record') {
    super(message);
    this.name = 'SecretStoreError';
  }
}

export interface SecretContext {
  companyId: string;
  projectSlug: string;
  environment: string;
  key: string;
}

/**
 * Associated data: everything a ciphertext is bound to.
 *
 * Each field is length-prefixed. Joining with a separator alone is ambiguous —
 * `("a|b", "c")` and `("a", "b|c")` produce the same string, so a value sealed for one
 * row would open in another. The first version of this function had exactly that
 * flaw; the test that caught it is `is unambiguous across field boundaries`.
 */
export function contextAad(context: SecretContext): Buffer {
  const fields = [context.companyId, context.projectSlug, context.environment, context.key];
  const encoded = fields
    .map((field) => {
      const bytes = Buffer.from(field, 'utf8');
      return `${bytes.length}:${field}`;
    })
    .join('|');
  return Buffer.from(`alo.env.v2|${encoded}`, 'utf8');
}

interface KeyRing {
  keys: Map<string, Buffer>;
  activeId: string;
}

function decodeKey(raw: string, id: string): Buffer {
  const candidate = raw.trim();
  if (candidate.length < 32) throw new SecretStoreError(`KEK ${id} is too short`, 'invalid-key');
  let buffer: Buffer;
  try {
    buffer = Buffer.from(candidate, 'base64');
  } catch {
    throw new SecretStoreError(`KEK ${id} is not valid base64`, 'invalid-key');
  }
  if (buffer.length !== KEY_BYTES) {
    throw new SecretStoreError(`KEK ${id} must decode to ${KEY_BYTES} bytes (got ${buffer.length})`, 'invalid-key');
  }
  return buffer;
}

/**
 * Read the key ring from the environment.
 *
 * Deliberately throws rather than falling back to a default key: a default key is
 * a public key, and a secret store that works without configuration is a secret
 * store that has already leaked.
 */
/**
 * Accepts any string map rather than `NodeJS.ProcessEnv`: Next.js types `ProcessEnv`
 * with a mandatory `NODE_ENV`, which makes a hand-built environment map in a test a
 * type error for no reason.
 */
export type KeyRingEnv = Readonly<Record<string, string | undefined>>;

export function loadKeyRing(env: KeyRingEnv = process.env): KeyRing {
  const ring = new Map<string, Buffer>();

  const multi = env.ALO_KEK_KEYS;
  if (multi && multi.trim().startsWith('{')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(multi);
    } catch {
      throw new SecretStoreError('ALO_KEK_KEYS is not valid JSON', 'invalid-key');
    }
    if (!parsed || typeof parsed !== 'object') throw new SecretStoreError('ALO_KEK_KEYS must be an object', 'invalid-key');
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value !== 'string') throw new SecretStoreError(`KEK ${id} must be a string`, 'invalid-key');
      ring.set(id, decodeKey(value, id));
    }
  } else if (env.ALO_KEK) {
    ring.set('1', decodeKey(env.ALO_KEK, '1'));
  }

  if (ring.size === 0) {
    throw new SecretStoreError(
      'No key-encryption key is configured. Set ALO_KEK_KEYS (JSON of {id: base64-32-bytes}) and ALO_KEK_ACTIVE.',
      'not-configured',
    );
  }

  const activeId = env.ALO_KEK_ACTIVE?.trim() || [...ring.keys()].sort().at(-1)!;
  if (!ring.has(activeId)) {
    throw new SecretStoreError(`ALO_KEK_ACTIVE=${activeId} is not present in ALO_KEK_KEYS`, 'not-configured');
  }

  return { keys: ring, activeId };
}

/** Generate a key suitable for `ALO_KEK_KEYS` (used by the setup docs and tests). */
export function generateKek(): string {
  return randomBytes(KEY_BYTES).toString('base64');
}

function gcmEncrypt(key: Buffer, plaintext: Buffer, aad: Buffer): { ciphertext: Buffer; iv: Buffer; tag: Buffer } {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext, iv, tag: cipher.getAuthTag() };
}

function gcmDecrypt(key: Buffer, ciphertext: Buffer, iv: Buffer, tag: Buffer, aad: Buffer): Buffer {
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new SecretStoreError('Sealed record has a malformed IV or tag', 'invalid-record');
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    // A wrong key, a wrong context, or tampering. All are refusals, never output.
    throw new SecretStoreError('Secret could not be decrypted', 'decrypt-failed');
  }
}

/** Seal one secret value. Returns only ciphertext and key-wrapping metadata. */
export function sealSecret(
  plaintext: string,
  context: SecretContext,
  options: { ring?: KeyRing; env?: KeyRingEnv } = {},
): SealedSecret {
  if (!plaintext) throw new SecretStoreError('Refusing to seal an empty value', 'invalid-record');
  const ring = options.ring ?? loadKeyRing(options.env);
  const kekId = ring.activeId;
  const kek = ring.keys.get(kekId);
  if (!kek) throw new SecretStoreError(`Active KEK ${kekId} is missing`, 'invalid-key');

  const aad = contextAad(context);
  const dek = randomBytes(KEY_BYTES);
  const value = gcmEncrypt(dek, Buffer.from(plaintext, 'utf8'), aad);
  // The wrapped data key is bound to the same context, so a sealed record cannot be
  // moved between rows even if both rows share a KEK.
  const wrapped = gcmEncrypt(kek, dek, Buffer.concat([Buffer.from(`wrap:${kekId}|`), aad]));
  dek.fill(0);

  return {
    kekId,
    dekCiphertext: wrapped.ciphertext.toString('base64'),
    dekIv: wrapped.iv.toString('base64'),
    dekTag: wrapped.tag.toString('base64'),
    ciphertext: value.ciphertext.toString('base64'),
    iv: value.iv.toString('base64'),
    tag: value.tag.toString('base64'),
    algorithm: ALGORITHM,
  };
}

/**
 * Open one sealed secret.
 *
 * Callers must be the apply path (or a test). This is never reachable from a route
 * that returns JSON: the API only ever returns masks.
 */
export function openSecret(
  sealed: SealedSecret,
  context: SecretContext,
  options: { ring?: KeyRing; env?: KeyRingEnv } = {},
): string {
  const ring = options.ring ?? loadKeyRing(options.env);
  const kek = ring.keys.get(sealed.kekId);
  if (!kek) {
    throw new SecretStoreError(
      `Secret was sealed with KEK ${sealed.kekId}, which is not configured. Restore that key before rotating.`,
      'not-configured',
    );
  }
  const aad = contextAad(context);
  const dek = gcmDecrypt(
    kek,
    Buffer.from(sealed.dekCiphertext, 'base64'),
    Buffer.from(sealed.dekIv, 'base64'),
    Buffer.from(sealed.dekTag, 'base64'),
    Buffer.concat([Buffer.from(`wrap:${sealed.kekId}|`), aad]),
  );
  const value = gcmDecrypt(
    dek,
    Buffer.from(sealed.ciphertext, 'base64'),
    Buffer.from(sealed.iv, 'base64'),
    Buffer.from(sealed.tag, 'base64'),
    aad,
  );
  dek.fill(0);
  return value.toString('utf8');
}

/** True when a row was sealed under an older KEK and should be re-wrapped. */
export function needsRewrap(sealed: Pick<SealedSecret, 'kekId'>, ring?: KeyRing): boolean {
  const active = (ring ?? loadKeyRing()).activeId;
  return sealed.kekId !== active;
}

/**
 * A stable, non-reversible preview for the UI.
 *
 * Shows the last four characters only when the value is long enough for that to be
 * a small fraction of it; otherwise shows nothing. Four characters of a 6-character
 * password is most of the password.
 */
export function maskValue(plaintext: string): string {
  if (!plaintext) return '';
  if (plaintext.length <= 8) return '••••••••';
  return `${'•'.repeat(8)}${plaintext.slice(-4)}`;
}

/**
 * Constant-time comparison for "is this the same secret value?" checks, used to
 * decide whether a value changed without storing the old one in cleartext.
 */
export function secretEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
