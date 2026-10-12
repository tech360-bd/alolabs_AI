/**
 * Field-level encryption for secrets stored in the database
 * (AIProviderConfig.encryptedApiKey, …).
 *
 * Format: `v1:<iv b64>:<auth tag b64>:<ciphertext b64>` — AES-256-GCM with a
 * key derived from ENCRYPTION_KEY (same master secret the secret-manager
 * uses, so operators rotate one value). The version prefix lets a future
 * key/algorithm rotation decrypt old rows while writing new ones.
 *
 * Plaintext secrets must never be logged or returned by any API; callers
 * expose `fingerprint()` instead so operators can tell keys apart.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';

export class FieldEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FieldEncryptionError';
  }
}

export function isFieldEncryptionConfigured(): boolean {
  return Boolean(process.env.ENCRYPTION_KEY || process.env.APP_SECRET);
}

function masterKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY || process.env.APP_SECRET || '';
  if (!raw) {
    throw new FieldEncryptionError(
      'ENCRYPTION_KEY is required to store or read encrypted secrets (set it in the environment).',
    );
  }
  if (process.env.NODE_ENV === 'production' && raw.length < 32) {
    throw new FieldEncryptionError('ENCRYPTION_KEY must be at least 32 characters in production.');
  }
  return createHash('sha256').update(raw).digest();
}

export function encryptField(plaintext: string): string {
  const key = masterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

export function decryptField(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new FieldEncryptionError('Unrecognised encrypted field format.');
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv(ALGORITHM, masterKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  try {
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    throw new FieldEncryptionError('Encrypted field could not be decrypted (wrong ENCRYPTION_KEY or corrupted value).');
  }
}

export function isEncryptedField(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(`${VERSION}:`) && value.split(':').length === 4;
}

/**
 * Short, non-reversible identifier for a secret: `sk-…abcd (sha256:1f2e3d)`.
 * Enough for an operator to recognise which key is configured, useless to an
 * attacker.
 */
export function fingerprint(secret: string): string {
  const digest = createHash('sha256').update(secret).digest('hex').slice(0, 12);
  const tail = secret.length >= 8 ? secret.slice(-4) : '';
  return tail ? `…${tail} (sha256:${digest})` : `sha256:${digest}`;
}
