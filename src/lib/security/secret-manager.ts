/**
 * Secret Manager
 * ALO Labs AIOS — Secure secret management with encryption at rest.
 * Reads from environment variables first, falls back to encrypted
 * database storage.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { db } from '@/lib/db';
import { redisGet, redisSet, redisDel } from '@/lib/redis';

// ─── Configuration ──────────────────────────────────────────────────

const SECRET_DB_PREFIX = 'secret:encrypted:';
const SECRET_CACHE_PREFIX = 'secret:cache:';
const SECRET_CACHE_TTL = 300; // 5 minutes
const ALGORITHM = 'aes-256-gcm';

// Required secrets that should always be present
const REQUIRED_SECRETS = [
  'APP_SECRET',
  'JWT_SECRET',
  'ENCRYPTION_KEY',
] as const;

// ─── Types ──────────────────────────────────────────────────────────

export interface SecretEntry {
  key: string;
  /** Whether the value comes from env vars or encrypted DB storage */
  source: 'env' | 'database';
  /** ISO timestamp of last rotation */
  lastRotatedAt?: string;
}

// ─── Encryption Helpers ─────────────────────────────────────────────

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY || process.env.APP_SECRET || '';
  if (!key) {
    throw new Error('ENCRYPTION_KEY or APP_SECRET environment variable is required');
  }
  return createHash('sha256').update(key).digest();
}

function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf-8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encrypted (all hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const parts = ciphertext.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted secret format');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString('utf-8');
}

// ─── Get Secret ─────────────────────────────────────────────────────

/**
 * Get a secret value. Checks environment variables first,
 * then falls back to encrypted database storage.
 *
 * @param key - The secret key name
 * @returns The secret value, or null if not found
 */
export async function getSecret(key: string): Promise<string | null> {
  // Check environment first
  const envValue = process.env[key];
  if (envValue !== undefined) return envValue;

  // Check Redis cache
  const cached = await redisGet(`${SECRET_CACHE_PREFIX}${key}`);
  if (cached) {
    return cached;
  }

  // Check database
  try {
    const record = await db.settings.findUnique({
      where: { key: `${SECRET_DB_PREFIX}${key}` },
    });

    if (!record) return null;

    const data = JSON.parse(record.value) as {
      encrypted: string;
      lastRotatedAt?: string;
    };

    const value = decrypt(data.encrypted);

    // Cache in Redis
    await redisSet(`${SECRET_CACHE_PREFIX}${key}`, value, SECRET_CACHE_TTL);

    return value;
  } catch (err) {
    console.error(`Failed to get secret "${key}":`, err);
    return null;
  }
}

// ─── Set Secret ─────────────────────────────────────────────────────

/**
 * Store a secret with AES-256-GCM encryption.
 * Does not overwrite environment variables — only writes to DB.
 *
 * @param key - The secret key name
 * @param value - The secret value to store
 */
export async function setSecret(key: string, value: string): Promise<void> {
  const encrypted = encrypt(value);
  const now = new Date().toISOString();

  // Read existing record to preserve rotation history
  const existing = await db.settings.findUnique({
    where: { key: `${SECRET_DB_PREFIX}${key}` },
  });

  let lastRotatedAt = now;
  if (existing) {
    try {
      const data = JSON.parse(existing.value) as { lastRotatedAt?: string };
      lastRotatedAt = now; // Always update on explicit set
    } catch {
      // Fresh set
    }
  }

  await db.settings.upsert({
    where: { key: `${SECRET_DB_PREFIX}${key}` },
    create: {
      key: `${SECRET_DB_PREFIX}${key}`,
      value: JSON.stringify({ encrypted, lastRotatedAt }),
    },
    update: {
      value: JSON.stringify({ encrypted, lastRotatedAt }),
    },
  });

  // Invalidate cache
  await redisDel(`${SECRET_CACHE_PREFIX}${key}`);
}

// ─── Rotate Secret ──────────────────────────────────────────────────

/**
 * Rotate a secret: generate a new random value and store it.
 * Returns the new secret value (only returned once).
 *
 * @param key - The secret key name
 * @param newValue - Optional explicit new value. If not provided, generates random 32 bytes.
 * @returns The new secret value
 */
export async function rotateSecret(
  key: string,
  newValue?: string,
): Promise<string> {
  const value = newValue ?? randomBytes(32).toString('hex');

  // Get old value for audit trail
  const oldValue = await getSecret(key);

  await setSecret(key, value);

  // Audit log
  try {
    await db.auditLog.create({
      data: {
        userId: 'system',
        action: 'secret_rotate',
        resource: 'secret',
        details: JSON.stringify({
          key,
          rotatedAt: new Date().toISOString(),
          hadPreviousValue: !!oldValue,
        }),
      },
    });
  } catch {
    // Ignore audit log failures
  }

  return value;
}

// ─── Validate Secrets ───────────────────────────────────────────────

/**
 * Validate that all required secrets are set.
 * Returns a map of secret key -> boolean (true if set).
 */
export async function validateSecrets(): Promise<
  Record<string, { set: boolean; source: 'env' | 'database' | 'missing' }>
> {
  const results: Record<string, { set: boolean; source: 'env' | 'database' | 'missing' }> = {};

  for (const key of REQUIRED_SECRETS) {
    const envValue = process.env[key];
    if (envValue !== undefined) {
      results[key] = { set: true, source: 'env' };
      continue;
    }

    const dbValue = await getSecret(key);
    if (dbValue) {
      results[key] = { set: true, source: 'database' };
    } else {
      results[key] = { set: false, source: 'missing' };
    }
  }

  return results;
}

// ─── List Secrets ───────────────────────────────────────────────────

/**
 * List secret keys (not values) for admin visibility.
 * Returns keys ONLY from encrypted database storage.
 * Environment variables are excluded to prevent leaking sensitive infrastructure secrets
 * (e.g., AWS credentials, database URLs, payment keys) through the admin API.
 */
export async function listSecrets(): Promise<SecretEntry[]> {
  const secrets: SecretEntry[] = [];

  // Only collect from database — never expose env vars through this API
  const dbSecrets = await db.settings.findMany({
    where: { key: { startsWith: SECRET_DB_PREFIX } },
  });

  for (const record of dbSecrets) {
    const secretKey = record.key.slice(SECRET_DB_PREFIX.length);
    try {
      const data = JSON.parse(record.value) as { lastRotatedAt?: string };
      secrets.push({
        key: secretKey,
        source: 'database',
        lastRotatedAt: data.lastRotatedAt,
      });
    } catch {
      secrets.push({ key: secretKey, source: 'database' });
    }
  }

  return secrets.sort((a, b) => a.key.localeCompare(b.key));
}