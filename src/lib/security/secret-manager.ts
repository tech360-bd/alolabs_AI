/**
 * Secret Manager
 * ALO Labs AIOS — Secure secret management with encryption at rest.
 *
 * KEY DERIVATION (HKDF-SHA256):
 * - Master key material is loaded ONLY from trusted server environment
 *   variables (`ENCRYPTION_KEYS` + `ENCRYPTION_KEY_ACTIVE`, `ENCRYPTION_KEY`
 *   [+ `ENCRYPTION_KEY_PREVIOUS`], or bootstrap fallback `APP_SECRET`), never
 *   from the database or any user-controlled value.
 * - For each key version `keyId`, a dedicated 256-bit AES-GCM content key is
 *   deterministically derived via RFC 5869 `hkdfSync('sha256', ikm, salt, info, 32)`
 *   with fixed domain-separation salt (`alolabs:secret-manager:hkdf-sha256:v2`)
 *   and purpose-bound info (`aes-256-gcm|secret-at-rest|v2|key=<keyId>`).
 * - Ciphertexts are stored in `v2:<keyId>:<ivHex>:<authTagHex>:<cipherHex>`
 *   format using 96-bit random IVs and length-prefixed GCM AAD binding the
 *   ciphertext to its secret key name (`alolabs:secret:v2:<len>:<key>`).
 * - Legacy `v1` records (`<ivHex>:<authTagHex>:<cipherHex>`, 16-byte IV, SHA-256
 *   key without AAD) remain readable during key migration and can be upgraded
 *   in place via `reencryptSecrets()`.
 *
 * SECURITY ENFORCEMENT:
 * - Server-only access: All methods are server-side only (no client exposure)
 * - Separated primitives: `lookupEnvSecret`, `lookupDatabaseSecret`, and
 *   `validateSecrets` are cleanly separated with zero mutual recursion.
 * - Env-only protection: Database URLs and key-encryption secrets cannot be
 *   written to or resolved from the database.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import { db } from '@/lib/db';
import { redisGet, redisSet, redisDel } from '@/lib/redis';

// ─── Configuration ──────────────────────────────────────────────────

const SECRET_DB_PREFIX = 'secret:encrypted:';
const SECRET_CACHE_PREFIX = 'secret:cache:';
const SECRET_CACHE_TTL = 300; // 5 minutes
const ALGORITHM = 'aes-256-gcm';
const V2_PREFIX = 'v2';
const V2_IV_BYTES = 12;
const V2_TAG_BYTES = 16;
const HKDF_SALT = Buffer.from('alolabs:secret-manager:hkdf-sha256:v2', 'utf8');
const KEY_NAME_REGEX = /^[A-Z][A-Z0-9_]*$/;

// Required secrets checked by validateSecrets()
export const REQUIRED_SECRETS = [
  'APP_SECRET',
  'JWT_SECRET',
  'ENCRYPTION_KEY',
] as const;

// Bootstrap / infrastructure keys that must live ONLY in environment / KMS.
const ALWAYS_ENV_ONLY_KEYS = new Set<string>([
  'DATABASE_URL',
  'REDIS_URL',
  'POSTGRES_URL',
  'ENCRYPTION_KEY',
  'ENCRYPTION_KEYS',
  'ENCRYPTION_KEY_ACTIVE',
  'ENCRYPTION_KEY_PREVIOUS',
  'ALO_KEK',
  'ALO_KEK_KEYS',
  'ALO_KEK_ACTIVE',
]);

// Server-only access enforcement: check if running in server environment
const IS_SERVER = typeof window === 'undefined' && typeof process !== 'undefined';
if (!IS_SERVER) {
  throw new Error('Secret Manager is server-only. Access from client is blocked.');
}

// ─── Types & Errors ─────────────────────────────────────────────────

export interface SecretEntry {
  key: string;
  /** Whether the value comes from env vars or encrypted DB storage */
  source: 'env' | 'database';
  /** ISO timestamp of last rotation */
  lastRotatedAt?: string;
  /** Ciphertext format version when stored in DB */
  format?: 'v1' | 'v2';
  /** Encryption key ID used for v2 records */
  keyId?: string;
}

export interface DatabaseSecretResult {
  value: string;
  lastRotatedAt?: string;
  format: 'v1' | 'v2';
  keyId?: string;
}

export interface SecretValidationEntry {
  set: boolean;
  source: 'env' | 'database' | 'missing';
}

export interface EncryptionKeyRing {
  activeId: string;
  /** Map of keyId -> raw master secret string (sourced strictly from env) */
  secrets: Map<string, string>;
  /** Additional legacy/previous secrets tried during key rotation & v1 migration */
  fallbackSecrets: string[];
}

export class SecretManagerError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'not-configured'
      | 'invalid-key'
      | 'invalid-secret-name'
      | 'protected-key'
      | 'decrypt-failed'
      | 'invalid-record'
      | 'not-set',
  ) {
    super(message);
    this.name = 'SecretManagerError';
  }
}

// ─── Guards & Key Policy ────────────────────────────────────────────

function assertServer(): void {
  if (!IS_SERVER) {
    throw new SecretManagerError('Secret access blocked: Server-only access required', 'protected-key');
  }
}

export function isEnvOnlySecret(key: string): boolean {
  if (ALWAYS_ENV_ONLY_KEYS.has(key)) return true;
  // When APP_SECRET is acting as the master encryption fallback (no ENCRYPTION_KEY*
  // configured), disallow storing/overwriting APP_SECRET inside the DB it encrypts.
  if (
    key === 'APP_SECRET' &&
    !process.env.ENCRYPTION_KEY &&
    !process.env.ENCRYPTION_KEYS
  ) {
    return true;
  }
  return false;
}

function assertValidSecretKeyName(key: string): void {
  if (!key || typeof key !== 'string' || !KEY_NAME_REGEX.test(key)) {
    throw new SecretManagerError(
      'Secret key must be UPPER_SNAKE_CASE (e.g., API_KEY_NAME)',
      'invalid-secret-name',
    );
  }
}

// ─── Key Ring & Deterministic HKDF Derivation ───────────────────────

function validateMasterSecretStrength(secret: string, label: string): string {
  const trimmed = secret.trim();
  if (!trimmed) {
    throw new SecretManagerError(`${label} cannot be empty`, 'invalid-key');
  }
  if (process.env.NODE_ENV === 'production' && trimmed.length < 32) {
    throw new SecretManagerError(
      `${label} must be at least 32 characters in production`,
      'invalid-key',
    );
  }
  return trimmed;
}

/**
 * Load the encryption key ring strictly from trusted server environment variables.
 * Never derives or reads keys from the database or user-controlled values.
 */
export function loadEncryptionKeyRing(
  env: Readonly<Record<string, string | undefined>> = process.env,
): EncryptionKeyRing {
  const secrets = new Map<string, string>();
  const fallbackSecrets: string[] = [];

  const keysJson = env.ENCRYPTION_KEYS?.trim();
  if (keysJson) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(keysJson);
    } catch {
      throw new SecretManagerError('ENCRYPTION_KEYS is not valid JSON', 'invalid-key');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new SecretManagerError('ENCRYPTION_KEYS must be a JSON object of { keyId: secret }', 'invalid-key');
    }
    for (const [id, rawVal] of Object.entries(parsed as Record<string, unknown>)) {
      if (!/^[a-zA-Z0-9._-]+$/.test(id)) {
        throw new SecretManagerError(`Invalid keyId "${id}" in ENCRYPTION_KEYS`, 'invalid-key');
      }
      if (typeof rawVal !== 'string') {
        throw new SecretManagerError(`Key "${id}" in ENCRYPTION_KEYS must be a string`, 'invalid-key');
      }
      const validated = validateMasterSecretStrength(rawVal, `ENCRYPTION_KEYS[${id}]`);
      secrets.set(id, validated);
      fallbackSecrets.push(validated);
    }
  }

  const primaryEnv = env.ENCRYPTION_KEY?.trim();
  if (primaryEnv) {
    const validated = validateMasterSecretStrength(primaryEnv, 'ENCRYPTION_KEY');
    const explicitActive = env.ENCRYPTION_KEY_ACTIVE?.trim();
    if (secrets.size === 0) {
      const id = explicitActive || '1';
      secrets.set(id, validated);
    } else if (explicitActive && !secrets.has(explicitActive)) {
      secrets.set(explicitActive, validated);
    }
    if (!fallbackSecrets.includes(validated)) {
      fallbackSecrets.push(validated);
    }
  }

  if (env.ENCRYPTION_KEY_PREVIOUS) {
    for (const rawPrev of env.ENCRYPTION_KEY_PREVIOUS.split(',')) {
      const prev = rawPrev.trim();
      if (prev && !fallbackSecrets.includes(prev)) {
        fallbackSecrets.push(prev);
      }
    }
  }

  const appSecret = env.APP_SECRET?.trim();
  if (secrets.size === 0 && appSecret) {
    const validated = validateMasterSecretStrength(appSecret, 'APP_SECRET');
    secrets.set('app-1', validated);
    fallbackSecrets.push(validated);
  } else if (appSecret && !fallbackSecrets.includes(appSecret)) {
    // Keep APP_SECRET available as a legacy fallback when upgrading to ENCRYPTION_KEY
    fallbackSecrets.push(appSecret);
  }

  if (secrets.size === 0) {
    throw new SecretManagerError(
      'ENCRYPTION_KEY, ENCRYPTION_KEYS, or APP_SECRET environment variable is required for server-side secret management',
      'not-configured',
    );
  }

  const requestedActive = env.ENCRYPTION_KEY_ACTIVE?.trim();
  const activeId = requestedActive || [...secrets.keys()].at(-1)!;
  if (!secrets.has(activeId)) {
    throw new SecretManagerError(
      `ENCRYPTION_KEY_ACTIVE="${activeId}" does not exist in configured encryption keys`,
      'not-configured',
    );
  }

  return { activeId, secrets, fallbackSecrets };
}

/**
 * Derive a deterministic 256-bit AES-GCM content key using RFC 5869 HKDF-SHA256.
 * Domain-separated by algorithm, version, and server-configured keyId only.
 */
export function deriveHkdfKey(masterSecret: string, keyId: string): Buffer {
  const ikm = Buffer.from(masterSecret, 'utf8');
  const info = Buffer.from(`aes-256-gcm|secret-at-rest|v2|key=${keyId}`, 'utf8');
  return Buffer.from(hkdfSync('sha256', ikm, HKDF_SALT, info, 32));
}

function deriveLegacySha256Key(masterSecret: string): Buffer {
  return createHash('sha256').update(masterSecret).digest();
}

function buildSecretAad(secretKey: string): Buffer {
  const keyBytes = Buffer.from(secretKey, 'utf8');
  return Buffer.from(`alolabs:secret:v2:${keyBytes.length}:${secretKey}`, 'utf8');
}

function encryptWithRing(
  plaintext: string,
  secretKey: string,
  ring: EncryptionKeyRing = loadEncryptionKeyRing(),
): { ciphertext: string; keyId: string } {
  const activeSecret = ring.secrets.get(ring.activeId);
  if (!activeSecret) {
    throw new SecretManagerError(`Active encryption key "${ring.activeId}" is unavailable`, 'not-configured');
  }
  const derivedKey = deriveHkdfKey(activeSecret, ring.activeId);
  const iv = randomBytes(V2_IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, derivedKey, iv, { authTagLength: V2_TAG_BYTES });
  cipher.setAAD(buildSecretAad(secretKey));

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  derivedKey.fill(0);

  return {
    keyId: ring.activeId,
    ciphertext: `${V2_PREFIX}:${ring.activeId}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`,
  };
}

function decryptWithSecret(
  keyBuf: Buffer,
  iv: Buffer,
  authTag: Buffer,
  encrypted: Buffer,
  aad?: Buffer,
): string {
  const decipher = createDecipheriv(ALGORITHM, keyBuf, iv, { authTagLength: authTag.length });
  if (aad) {
    decipher.setAAD(aad);
  }
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function parseHexBuffer(hex: string, label: string, expectedBytes?: number): Buffer {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) {
    throw new SecretManagerError(`Malformed ${label} in encrypted secret`, 'invalid-record');
  }
  const buf = Buffer.from(hex, 'hex');
  if (expectedBytes !== undefined && buf.length !== expectedBytes) {
    throw new SecretManagerError(`Invalid ${label} length in encrypted secret`, 'invalid-record');
  }
  return buf;
}

function decryptStoredPayload(
  ciphertext: string,
  secretKey: string,
  ring: EncryptionKeyRing = loadEncryptionKeyRing(),
): { value: string; format: 'v1' | 'v2'; keyId?: string } {
  if (!ciphertext || typeof ciphertext !== 'string') {
    throw new SecretManagerError('Invalid encrypted secret format', 'invalid-record');
  }

  // v2 HKDF-SHA256 format: v2:<keyId>:<ivHex>:<authTagHex>:<encryptedHex>
  if (ciphertext.startsWith(`${V2_PREFIX}:`)) {
    const parts = ciphertext.split(':');
    if (parts.length !== 5) {
      throw new SecretManagerError('Invalid v2 encrypted secret format', 'invalid-record');
    }
    const [, keyId, ivHex, authTagHex, encryptedHex] = parts;
    if (!keyId) {
      throw new SecretManagerError('Missing keyId in v2 encrypted secret', 'invalid-record');
    }
    const iv = parseHexBuffer(ivHex, 'IV', V2_IV_BYTES);
    const authTag = parseHexBuffer(authTagHex, 'authTag', V2_TAG_BYTES);
    const encrypted = encryptedHex ? parseHexBuffer(encryptedHex, 'ciphertext') : Buffer.alloc(0);
    const aad = buildSecretAad(secretKey);

    const candidateSecrets: string[] = [];
    const exactSecret = ring.secrets.get(keyId);
    if (exactSecret) candidateSecrets.push(exactSecret);
    for (const secret of ring.secrets.values()) {
      if (!candidateSecrets.includes(secret)) candidateSecrets.push(secret);
    }
    for (const fallback of ring.fallbackSecrets) {
      if (!candidateSecrets.includes(fallback)) candidateSecrets.push(fallback);
    }

    for (const masterSecret of candidateSecrets) {
      const derivedKey = deriveHkdfKey(masterSecret, keyId);
      try {
        const value = decryptWithSecret(derivedKey, iv, authTag, encrypted, aad);
        return { value, format: 'v2', keyId };
      } catch {
        // Try next candidate key in ring
      } finally {
        derivedKey.fill(0);
      }
    }

    throw new SecretManagerError(
      `Failed to decrypt v2 secret "${secretKey}" (keyId="${keyId}")`,
      'decrypt-failed',
    );
  }

  // Legacy v1 SHA-256 format: <ivHex>:<authTagHex>:<encryptedHex>
  const legacyParts = ciphertext.split(':');
  if (legacyParts.length !== 3) {
    throw new SecretManagerError('Invalid encrypted secret format', 'invalid-record');
  }
  const [ivHex, authTagHex, encryptedHex] = legacyParts;
  const iv = parseHexBuffer(ivHex, 'IV');
  const authTag = parseHexBuffer(authTagHex, 'authTag', V2_TAG_BYTES);
  const encrypted = encryptedHex ? parseHexBuffer(encryptedHex, 'ciphertext') : Buffer.alloc(0);
  if (iv.length !== 16 && iv.length !== 12) {
    throw new SecretManagerError('Invalid legacy IV length', 'invalid-record');
  }

  const legacyCandidates: string[] = [
    ...(ring.secrets.get(ring.activeId) ? [ring.secrets.get(ring.activeId)!] : []),
    ...ring.secrets.values(),
    ...ring.fallbackSecrets,
  ];
  const seen = new Set<string>();

  for (const masterSecret of legacyCandidates) {
    if (seen.has(masterSecret)) continue;
    seen.add(masterSecret);
    const legacyKey = deriveLegacySha256Key(masterSecret);
    try {
      const value = decryptWithSecret(legacyKey, iv, authTag, encrypted);
      return { value, format: 'v1' };
    } catch {
      // Try next historical key
    } finally {
      legacyKey.fill(0);
    }
  }

  throw new SecretManagerError(
    `Failed to decrypt legacy v1 secret "${secretKey}"`,
    'decrypt-failed',
  );
}

// ─── Separated Lookup Primitives ────────────────────────────────────

/**
 * Look up a secret strictly from process environment variables.
 * Never touches the database, Redis, or validation logic.
 */
export function lookupEnvSecret(key: string): string | null {
  assertServer();
  const value = process.env[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Look up and decrypt a secret strictly from database / encrypted Redis cache.
 * Never reads environment variables and never invokes `validateSecrets()`.
 */
export async function lookupDatabaseSecret(key: string): Promise<DatabaseSecretResult | null> {
  assertServer();

  if (isEnvOnlySecret(key)) {
    return null;
  }

  let cachedRaw: string | null = null;
  try {
    cachedRaw = await redisGet(`${SECRET_CACHE_PREFIX}${key}`);
  } catch {
    cachedRaw = null;
  }

  if (cachedRaw) {
    try {
      const parsed = JSON.parse(cachedRaw) as { encrypted?: string; lastRotatedAt?: string };
      if (parsed && typeof parsed.encrypted === 'string') {
        const decrypted = decryptStoredPayload(parsed.encrypted, key);
        return {
          value: decrypted.value,
          lastRotatedAt: parsed.lastRotatedAt,
          format: decrypted.format,
          keyId: decrypted.keyId,
        };
      }
    } catch {
      // Ignore stale/legacy plaintext or corrupt cache entry and reload from DB
    }
  }

  const record = await db.settings.findUnique({
    where: { key: `${SECRET_DB_PREFIX}${key}` },
  });
  if (!record) return null;

  let data: { encrypted: string; lastRotatedAt?: string };
  try {
    data = JSON.parse(record.value) as { encrypted: string; lastRotatedAt?: string };
  } catch {
    throw new SecretManagerError(`Corrupt database envelope for secret "${key}"`, 'invalid-record');
  }

  if (!data || typeof data.encrypted !== 'string') {
    throw new SecretManagerError(`Missing ciphertext payload for secret "${key}"`, 'invalid-record');
  }

  try {
    const decrypted = decryptStoredPayload(data.encrypted, key);

    // Cache ONLY the encrypted envelope in Redis — never store plaintext secrets in Redis.
    try {
      await redisSet(
        `${SECRET_CACHE_PREFIX}${key}`,
        JSON.stringify({ encrypted: data.encrypted, lastRotatedAt: data.lastRotatedAt }),
        SECRET_CACHE_TTL,
      );
    } catch {
      // Cache write failure is non-fatal
    }

    return {
      value: decrypted.value,
      lastRotatedAt: data.lastRotatedAt,
      format: decrypted.format,
      keyId: decrypted.keyId,
    };
  } catch (err) {
    try {
      await db.auditLog.create({
        data: {
          userId: null,
          action: 'secret_access_failed',
          resource: 'secret',
          details: JSON.stringify({
            key,
            code: err instanceof SecretManagerError ? err.code : 'decrypt-failed',
          }),
        },
      });
    } catch {
      // Best-effort audit logging
    }
    throw err;
  }
}

// ─── Public Secret Resolution ───────────────────────────────────────

/**
 * Resolve a secret value cleanly without mutual recursion:
 * - Env-only infrastructure & key-encryption secrets resolve strictly from env.
 * - Application secrets check encrypted database storage first (so rotations
 *   and explicit API/admin DB updates take effect immediately), then fall back
 *   to environment variables.
 */
export async function getSecret(key: string): Promise<string | null> {
  assertServer();

  if (isEnvOnlySecret(key)) {
    return lookupEnvSecret(key);
  }

  const dbSecret = await lookupDatabaseSecret(key);
  if (dbSecret) {
    return dbSecret.value;
  }

  return lookupEnvSecret(key);
}

// ─── Set Secret ─────────────────────────────────────────────────────

/**
 * Store a secret in the database using deterministic HKDF-derived AES-256-GCM
 * encryption. Refuses env-only infrastructure and encryption key names.
 */
export async function setSecret(key: string, value: string): Promise<void> {
  assertServer();
  assertValidSecretKeyName(key);

  if (isEnvOnlySecret(key)) {
    throw new SecretManagerError(
      `Cannot store or overwrite env-only secret "${key}" in the database`,
      'protected-key',
    );
  }

  if (!value || typeof value !== 'string') {
    throw new SecretManagerError('Secret value must be a non-empty string', 'invalid-record');
  }

  const ring = loadEncryptionKeyRing();
  const { ciphertext, keyId } = encryptWithRing(value, key, ring);
  const now = new Date().toISOString();
  const envelope = JSON.stringify({
    encrypted: ciphertext,
    lastRotatedAt: now,
    keyId,
  });

  await db.settings.upsert({
    where: { key: `${SECRET_DB_PREFIX}${key}` },
    create: {
      key: `${SECRET_DB_PREFIX}${key}`,
      value: envelope,
    },
    update: {
      value: envelope,
    },
  });

  try {
    await redisDel(`${SECRET_CACHE_PREFIX}${key}`);
  } catch {
    // Cache invalidation is best-effort
  }

  try {
    await db.auditLog.create({
      data: {
        userId: null,
        action: 'secret_set',
        resource: 'secret',
        details: JSON.stringify({ key, keyId, rotatedAt: now, serverOnly: true }),
      },
    });
  } catch {
    // Ignore audit log failures
  }
}

// ─── Rotate Secret & Key Rotation ───────────────────────────────────

/**
 * Rotate a secret value in encrypted database storage.
 * Note: Callers exposing this over HTTP must never return the raw secret value.
 */
export async function rotateSecret(
  key: string,
  newValue?: string,
): Promise<string> {
  assertServer();
  assertValidSecretKeyName(key);

  if (isEnvOnlySecret(key)) {
    throw new SecretManagerError(
      `Cannot rotate env-only secret "${key}" via database secret store`,
      'protected-key',
    );
  }

  const existingDb = await lookupDatabaseSecret(key);
  const existingEnv = lookupEnvSecret(key);
  const hadPreviousValue = Boolean(existingDb || existingEnv);

  if (
    REQUIRED_SECRETS.includes(key as (typeof REQUIRED_SECRETS)[number]) &&
    !hadPreviousValue
  ) {
    throw new SecretManagerError(
      `Cannot rotate required secret "${key}": not currently set`,
      'not-set',
    );
  }

  const value = newValue ?? randomBytes(32).toString('hex');
  await setSecret(key, value);

  try {
    await db.auditLog.create({
      data: {
        userId: null,
        action: 'secret_rotate',
        resource: 'secret',
        details: JSON.stringify({
          key,
          rotatedAt: new Date().toISOString(),
          hadPreviousValue,
          serverOnly: true,
        }),
      },
    });
  } catch {
    // Ignore audit log failures
  }

  return value;
}

/**
 * True if an encrypted DB payload is legacy v1 or uses a non-active v2 keyId.
 */
export function needsReencryption(
  encryptedPayload: string,
  ring: EncryptionKeyRing = loadEncryptionKeyRing(),
): boolean {
  if (!encryptedPayload.startsWith(`${V2_PREFIX}:`)) {
    return true;
  }
  const parts = encryptedPayload.split(':');
  return parts.length !== 5 || parts[1] !== ring.activeId;
}

/**
 * Re-encrypt all legacy `v1` or older-`keyId` `v2` secret rows under the
 * currently active HKDF encryption key without breaking live reads.
 */
export async function reencryptSecrets(): Promise<{
  total: number;
  migrated: number;
  failed: string[];
}> {
  assertServer();
  const ring = loadEncryptionKeyRing();
  const rows = await db.settings.findMany({
    where: { key: { startsWith: SECRET_DB_PREFIX } },
  });

  let migrated = 0;
  const failed: string[] = [];

  for (const row of rows) {
    const secretKey = row.key.slice(SECRET_DB_PREFIX.length);
    try {
      const parsed = JSON.parse(row.value) as { encrypted?: string; lastRotatedAt?: string };
      if (!parsed?.encrypted) {
        failed.push(secretKey);
        continue;
      }
      if (!needsReencryption(parsed.encrypted, ring)) {
        continue;
      }
      const decrypted = decryptStoredPayload(parsed.encrypted, secretKey, ring);
      const { ciphertext, keyId } = encryptWithRing(decrypted.value, secretKey, ring);
      await db.settings.update({
        where: { key: row.key },
        data: {
          value: JSON.stringify({
            encrypted: ciphertext,
            lastRotatedAt: parsed.lastRotatedAt ?? new Date().toISOString(),
            keyId,
          }),
        },
      });
      try {
        await redisDel(`${SECRET_CACHE_PREFIX}${secretKey}`);
      } catch {
        // Ignore cache error
      }
      migrated += 1;
    } catch {
      failed.push(secretKey);
    }
  }

  try {
    await db.auditLog.create({
      data: {
        userId: null,
        action: 'secret_key_rotation',
        resource: 'secret',
        details: JSON.stringify({
          activeKeyId: ring.activeId,
          total: rows.length,
          migrated,
          failedCount: failed.length,
        }),
      },
    });
  } catch {
    // Ignore audit log failures
  }

  return { total: rows.length, migrated, failed };
}

// ─── Validate Secrets ───────────────────────────────────────────────

/**
 * Validate required secrets directly using separated env & DB lookups.
 * Never calls `getSecret()` — impossible to recurse even when all secrets are missing.
 */
export async function validateSecrets(): Promise<Record<string, SecretValidationEntry>> {
  assertServer();

  const results: Record<string, SecretValidationEntry> = {};

  for (const key of REQUIRED_SECRETS) {
    if (!isEnvOnlySecret(key)) {
      try {
        const dbSecret = await lookupDatabaseSecret(key);
        if (dbSecret) {
          results[key] = { set: true, source: 'database' };
          continue;
        }
      } catch {
        // Unreadable DB record falls through to env / missing status
      }
    }

    const envValue = lookupEnvSecret(key);
    if (envValue !== null) {
      results[key] = { set: true, source: 'env' };
    } else {
      results[key] = { set: false, source: 'missing' };
    }
  }

  try {
    await db.auditLog.create({
      data: {
        userId: null,
        action: 'secret_validation',
        resource: 'secret',
        details: JSON.stringify({ results }),
      },
    });
  } catch {
    // Ignore audit log failures
  }

  return results;
}

// ─── List Secrets & Safe Masking ────────────────────────────────────

/**
 * List secret metadata (never values) from encrypted database storage only.
 */
export async function listSecrets(): Promise<SecretEntry[]> {
  assertServer();

  const secrets: SecretEntry[] = [];
  const dbSecrets = await db.settings.findMany({
    where: { key: { startsWith: SECRET_DB_PREFIX } },
  });

  for (const record of dbSecrets) {
    const secretKey = record.key.slice(SECRET_DB_PREFIX.length);
    try {
      const data = JSON.parse(record.value) as {
        encrypted?: string;
        lastRotatedAt?: string;
        keyId?: string;
      };
      const isV2 = typeof data.encrypted === 'string' && data.encrypted.startsWith(`${V2_PREFIX}:`);
      const parsedKeyId = isV2 ? data.encrypted!.split(':')[1] : data.keyId;
      secrets.push({
        key: secretKey,
        source: 'database',
        lastRotatedAt: data.lastRotatedAt,
        format: isV2 ? 'v2' : 'v1',
        ...(parsedKeyId ? { keyId: parsedKeyId } : {}),
      });
    } catch {
      secrets.push({ key: secretKey, source: 'database' });
    }
  }

  try {
    await db.auditLog.create({
      data: {
        userId: null,
        action: 'secret_list',
        resource: 'secret',
        details: JSON.stringify({ count: secrets.length }),
      },
    });
  } catch {
    // Ignore audit log failures
  }

  return secrets.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Produce a safe display mask that NEVER exposes prefixes on any secret and
 * NEVER reveals characters of short (< 16 char) secrets.
 */
export function maskSecretValue(secret: string): string {
  if (!secret) return '****************';
  if (secret.length < 16) return '****************';
  return `************${secret.slice(-4)}`;
}

/**
 * Produce a non-reversible cryptographic fingerprint for change detection.
 */
export function secretFingerprint(secret: string): string {
  const digest = createHash('sha256').update(secret).digest('hex').slice(0, 12);
  return `sha256:${digest}`;
}
