/**
 * Field-level encryption for secrets stored in the database
 * (AIProviderConfig.encryptedApiKey, IntegrationCredential.encryptedSecret,
 * EmailAccount, SocialAccount, Webhook secret, etc.).
 *
 * Format:
 * - `v2:<keyId>:<iv b64>:<auth tag b64>:<ciphertext b64>` — AES-256-GCM with
 *   a 256-bit key derived deterministically via RFC 5869 HKDF-SHA256 from
 *   trusted server environment secrets (`ENCRYPTION_KEYS` / `ENCRYPTION_KEY` /
 *   fallback `APP_SECRET`).
 * - Legacy `v1:<iv b64>:<auth tag b64>:<ciphertext b64>` — remains readable
 *   across key rotations using `ENCRYPTION_KEY_PREVIOUS` / historical keys.
 *
 * Plaintext secrets must never be logged or returned by any API; callers
 * expose `fingerprint()` instead so operators can tell keys apart.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const V1_VERSION = 'v1';
const V2_VERSION = 'v2';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HKDF_SALT = Buffer.from('alolabs:field-encryption:hkdf-sha256:v2', 'utf8');

export class FieldEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FieldEncryptionError';
  }
}

export function isFieldEncryptionConfigured(): boolean {
  return Boolean(
    process.env.ENCRYPTION_KEYS?.trim() ||
      process.env.ENCRYPTION_KEY?.trim() ||
      process.env.APP_SECRET?.trim(),
  );
}

interface FieldKeyRing {
  activeId: string;
  secrets: Map<string, string>;
  fallbackSecrets: string[];
}

function validateStrength(raw: string, label: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new FieldEncryptionError(`${label} cannot be empty.`);
  }
  if (process.env.NODE_ENV === 'production' && trimmed.length < 32) {
    throw new FieldEncryptionError(`${label} must be at least 32 characters in production.`);
  }
  return trimmed;
}

function loadFieldKeyRing(): FieldKeyRing {
  const secrets = new Map<string, string>();
  const fallbackSecrets: string[] = [];

  const keysJson = process.env.ENCRYPTION_KEYS?.trim();
  if (keysJson) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(keysJson);
    } catch {
      throw new FieldEncryptionError('ENCRYPTION_KEYS is not valid JSON.');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new FieldEncryptionError('ENCRYPTION_KEYS must be a JSON object.');
    }
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value !== 'string') {
        throw new FieldEncryptionError(`ENCRYPTION_KEYS[${id}] must be a string.`);
      }
      const validated = validateStrength(value, `ENCRYPTION_KEYS[${id}]`);
      secrets.set(id, validated);
      fallbackSecrets.push(validated);
    }
  }

  const primary = process.env.ENCRYPTION_KEY?.trim();
  if (primary) {
    const validated = validateStrength(primary, 'ENCRYPTION_KEY');
    const explicitActive = process.env.ENCRYPTION_KEY_ACTIVE?.trim();
    if (secrets.size === 0) {
      secrets.set(explicitActive || '1', validated);
    } else if (explicitActive && !secrets.has(explicitActive)) {
      secrets.set(explicitActive, validated);
    }
    if (!fallbackSecrets.includes(validated)) {
      fallbackSecrets.push(validated);
    }
  }

  if (process.env.ENCRYPTION_KEY_PREVIOUS) {
    for (const rawPrev of process.env.ENCRYPTION_KEY_PREVIOUS.split(',')) {
      const prev = rawPrev.trim();
      if (prev && !fallbackSecrets.includes(prev)) {
        fallbackSecrets.push(prev);
      }
    }
  }

  const appSecret = process.env.APP_SECRET?.trim();
  if (secrets.size === 0 && appSecret) {
    const validated = validateStrength(appSecret, 'APP_SECRET');
    secrets.set('app-1', validated);
    fallbackSecrets.push(validated);
  } else if (appSecret && !fallbackSecrets.includes(appSecret)) {
    fallbackSecrets.push(appSecret);
  }

  if (secrets.size === 0) {
    throw new FieldEncryptionError(
      'ENCRYPTION_KEY is required to store or read encrypted secrets (set it in the environment).',
    );
  }

  const requestedActive = process.env.ENCRYPTION_KEY_ACTIVE?.trim();
  const activeId = requestedActive || [...secrets.keys()].at(-1)!;
  if (!secrets.has(activeId)) {
    throw new FieldEncryptionError(
      `ENCRYPTION_KEY_ACTIVE="${activeId}" is not present in configured encryption keys.`,
    );
  }

  return { activeId, secrets, fallbackSecrets };
}

function deriveFieldHkdfKey(masterSecret: string, keyId: string): Buffer {
  const info = Buffer.from(`aes-256-gcm|field-at-rest|v2|key=${keyId}`, 'utf8');
  return Buffer.from(hkdfSync('sha256', Buffer.from(masterSecret, 'utf8'), HKDF_SALT, info, 32));
}

function deriveLegacyFieldKey(masterSecret: string): Buffer {
  return createHash('sha256').update(masterSecret).digest();
}

export function encryptField(plaintext: string): string {
  const ring = loadFieldKeyRing();
  const activeSecret = ring.secrets.get(ring.activeId)!;
  const key = deriveFieldHkdfKey(activeSecret, ring.activeId);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  key.fill(0);
  return [
    V2_VERSION,
    ring.activeId,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

export function decryptField(payload: string): string {
  const parts = payload.split(':');
  const ring = loadFieldKeyRing();

  if (parts.length === 5 && parts[0] === V2_VERSION) {
    const [, keyId, ivB64, tagB64, ctB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const ct = Buffer.from(ctB64, 'base64');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
      throw new FieldEncryptionError('Unrecognised encrypted field format.');
    }

    const candidates: string[] = [];
    const exact = ring.secrets.get(keyId);
    if (exact) candidates.push(exact);
    for (const s of ring.secrets.values()) {
      if (!candidates.includes(s)) candidates.push(s);
    }
    for (const f of ring.fallbackSecrets) {
      if (!candidates.includes(f)) candidates.push(f);
    }

    for (const masterSecret of candidates) {
      const key = deriveFieldHkdfKey(masterSecret, keyId);
      try {
        const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
      } catch {
        // Try next candidate key
      } finally {
        key.fill(0);
      }
    }
    throw new FieldEncryptionError(
      'Encrypted field could not be decrypted (wrong ENCRYPTION_KEY or corrupted value).',
    );
  }

  if (parts.length === 4 && parts[0] === V1_VERSION) {
    const [, ivB64, tagB64, ctB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const ct = Buffer.from(ctB64, 'base64');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
      throw new FieldEncryptionError('Unrecognised encrypted field format.');
    }

    const candidates = [
      ...(ring.secrets.get(ring.activeId) ? [ring.secrets.get(ring.activeId)!] : []),
      ...ring.secrets.values(),
      ...ring.fallbackSecrets,
    ];
    const seen = new Set<string>();
    for (const masterSecret of candidates) {
      if (seen.has(masterSecret)) continue;
      seen.add(masterSecret);
      const key = deriveLegacyFieldKey(masterSecret);
      try {
        const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
      } catch {
        // Try next candidate key
      } finally {
        key.fill(0);
      }
    }
    throw new FieldEncryptionError(
      'Encrypted field could not be decrypted (wrong ENCRYPTION_KEY or corrupted value).',
    );
  }

  throw new FieldEncryptionError('Unrecognised encrypted field format.');
}

export function isEncryptedField(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return false;
  const parts = value.split(':');
  return (
    (parts[0] === V1_VERSION && parts.length === 4) ||
    (parts[0] === V2_VERSION && parts.length === 5)
  );
}

export function needsFieldReencryption(value: string): boolean {
  const parts = value.split(':');
  if (parts.length !== 5 || parts[0] !== V2_VERSION) return true;
  return parts[1] !== loadFieldKeyRing().activeId;
}

/**
 * Short, non-reversible identifier for a secret: `…abcd (sha256:1f2e3d)`.
 * Enough for an operator to recognise which key is configured, useless to an
 * attacker.
 */
export function fingerprint(secret: string): string {
  const digest = createHash('sha256').update(secret).digest('hex').slice(0, 12);
  const tail = secret.length >= 8 ? secret.slice(-4) : '';
  return tail ? `…${tail} (sha256:${digest})` : `sha256:${digest}`;
}
