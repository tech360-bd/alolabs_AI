// @vitest-environment node
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRealDb, type RealDb } from '../../helpers/real-db';

const ENV_BACKUP: Record<string, string | undefined> = {};
const TRACKED_ENV_KEYS = [
  'ENCRYPTION_KEY',
  'ENCRYPTION_KEYS',
  'ENCRYPTION_KEY_ACTIVE',
  'ENCRYPTION_KEY_PREVIOUS',
  'APP_SECRET',
  'JWT_SECRET',
  'TEST_OVERRIDE_SECRET',
  'NODE_ENV',
];

function snapshotEnv() {
  for (const k of TRACKED_ENV_KEYS) {
    ENV_BACKUP[k] = process.env[k];
  }
}

function restoreEnv() {
  for (const k of TRACKED_ENV_KEYS) {
    if (ENV_BACKUP[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = ENV_BACKUP[k];
    }
  }
}

describe('secret-manager & field-encryption (real DB & real HKDF crypto)', () => {
  let real: RealDb;

  beforeAll(async () => {
    snapshotEnv();
    real = await createRealDb('secret-mgr');
  });

  afterAll(async () => {
    restoreEnv();
    await real.cleanup();
  });

  beforeEach(async () => {
    restoreEnv();
    delete process.env.ENCRYPTION_KEYS;
    delete process.env.ENCRYPTION_KEY_ACTIVE;
    delete process.env.ENCRYPTION_KEY_PREVIOUS;
    delete process.env.TEST_OVERRIDE_SECRET;
    process.env.ENCRYPTION_KEY = 'master-key-v1-32-bytes-minimum-ok!';
    process.env.APP_SECRET = 'app-secret-32-bytes-minimum-test!!';
    process.env.JWT_SECRET = 'jwt-secret-32-bytes-minimum-test!!';
    await real.db.settings.deleteMany({ where: { key: { startsWith: 'secret:' } } });
  });

  it('does not recurse infinitely when all REQUIRED_SECRETS are unset', async () => {
    delete process.env.APP_SECRET;
    delete process.env.JWT_SECRET;
    delete process.env.ENCRYPTION_KEY;

    const sm = await import('@/lib/security/secret-manager');
    await expect(sm.getSecret('APP_SECRET')).resolves.toBeNull();
    await expect(sm.getSecret('JWT_SECRET')).resolves.toBeNull();
    await expect(sm.getSecret('ENCRYPTION_KEY')).resolves.toBeNull();

    const validation = await sm.validateSecrets();
    expect(validation).toEqual({
      APP_SECRET: { set: false, source: 'missing' },
      JWT_SECRET: { set: false, source: 'missing' },
      ENCRYPTION_KEY: { set: false, source: 'missing' },
    });
  });

  it('separates env lookup, DB lookup, and validation without recursion', async () => {
    const sm = await import('@/lib/security/secret-manager');
    delete process.env.JWT_SECRET;

    expect(sm.lookupEnvSecret('ENCRYPTION_KEY')).toBe('master-key-v1-32-bytes-minimum-ok!');
    expect(sm.lookupEnvSecret('JWT_SECRET')).toBeNull();
    expect(await sm.lookupDatabaseSecret('JWT_SECRET')).toBeNull();

    await sm.setSecret('JWT_SECRET', 'db-stored-jwt-secret-1234567890');
    expect(sm.lookupEnvSecret('JWT_SECRET')).toBeNull();
    const dbOnly = await sm.lookupDatabaseSecret('JWT_SECRET');
    expect(dbOnly?.value).toBe('db-stored-jwt-secret-1234567890');
    expect(dbOnly?.format).toBe('v2');

    const validation = await sm.validateSecrets();
    expect(validation.JWT_SECRET).toEqual({ set: true, source: 'database' });
    expect(validation.ENCRYPTION_KEY).toEqual({ set: true, source: 'env' });
  });

  it('derives deterministic HKDF keys per keyId and stores v2 AAD-bound ciphertexts', async () => {
    const sm = await import('@/lib/security/secret-manager');

    const k1a = sm.deriveHkdfKey('master-secret', '1');
    const k1b = sm.deriveHkdfKey('master-secret', '1');
    const k2 = sm.deriveHkdfKey('master-secret', '2');
    expect(k1a).toEqual(k1b);
    expect(k1a).not.toEqual(k2);
    expect(k1a.length).toBe(32);

    await sm.setSecret('BILLING_WEBHOOK_KEY', 'super-secret-webhook-token-1234');
    const row = await real.db.settings.findUnique({
      where: { key: 'secret:encrypted:BILLING_WEBHOOK_KEY' },
    });
    expect(row).not.toBeNull();
    const envelope = JSON.parse(row!.value) as { encrypted: string; keyId: string };
    expect(envelope.encrypted.startsWith('v2:1:')).toBe(true);
    expect(envelope.keyId).toBe('1');

    // Moving the ciphertext to another secret key name must fail AAD verification
    await real.db.settings.upsert({
      where: { key: 'secret:encrypted:SWAPPED_KEY' },
      create: { key: 'secret:encrypted:SWAPPED_KEY', value: row!.value },
      update: { value: row!.value },
    });
    await expect(sm.getSecret('SWAPPED_KEY')).rejects.toThrow(sm.SecretManagerError);
  });

  it('reads legacy v1 SHA-256 encrypted secrets and safely rotates & migrates keys to v2 HKDF', async () => {
    const sm = await import('@/lib/security/secret-manager');

    // Simulate a legacy v1 DB row (16-byte IV, SHA-256 of master secret, no AAD)
    const legacyKey = createHash('sha256').update(process.env.ENCRYPTION_KEY!).digest();
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', legacyKey, iv);
    const enc = Buffer.concat([cipher.update('legacy-plaintext-secret-xyz', 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const legacyPayload = `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;

    await real.db.settings.create({
      data: {
        key: 'secret:encrypted:LEGACY_SECRET',
        value: JSON.stringify({ encrypted: legacyPayload, lastRotatedAt: '2025-01-01T00:00:00.000Z' }),
      },
    });
    await sm.setSecret('V1_KEYRING_SECRET', 'value-under-v1-key');

    // Legacy v1 row must still be readable
    expect(await sm.getSecret('LEGACY_SECRET')).toBe('legacy-plaintext-secret-xyz');

    // Rotate master encryption key to keyId "2" while retaining key "1" in ENCRYPTION_KEYS
    process.env.ENCRYPTION_KEYS = JSON.stringify({
      '1': 'master-key-v1-32-bytes-minimum-ok!',
      '2': 'master-key-v2-32-bytes-rotated-!!',
    });
    process.env.ENCRYPTION_KEY_ACTIVE = '2';
    delete process.env.ENCRYPTION_KEY;

    // Both legacy v1 and v2(key=1) remain readable BEFORE migration
    expect(await sm.getSecret('LEGACY_SECRET')).toBe('legacy-plaintext-secret-xyz');
    expect(await sm.getSecret('V1_KEYRING_SECRET')).toBe('value-under-v1-key');

    // Re-encrypt all stored secrets to active key "2"
    const migration = await sm.reencryptSecrets();
    expect(migration.failed).toEqual([]);
    expect(migration.migrated).toBe(2);

    // After removing key "1", migrated secrets still decrypt under key "2"
    process.env.ENCRYPTION_KEYS = JSON.stringify({
      '2': 'master-key-v2-32-bytes-rotated-!!',
    });
    process.env.ENCRYPTION_KEY_ACTIVE = '2';

    const row = await real.db.settings.findUnique({ where: { key: 'secret:encrypted:LEGACY_SECRET' } });
    expect(JSON.parse(row!.value).encrypted.startsWith('v2:2:')).toBe(true);
    expect(await sm.getSecret('LEGACY_SECRET')).toBe('legacy-plaintext-secret-xyz');
    expect(await sm.getSecret('V1_KEYRING_SECRET')).toBe('value-under-v1-key');
  });

  it('reflects DB updates and rotations even when an older env value exists', async () => {
    const sm = await import('@/lib/security/secret-manager');
    process.env.TEST_OVERRIDE_SECRET = 'initial-env-value-123456';

    expect(await sm.getSecret('TEST_OVERRIDE_SECRET')).toBe('initial-env-value-123456');

    await sm.setSecret('TEST_OVERRIDE_SECRET', 'updated-db-value-789012');
    expect(await sm.getSecret('TEST_OVERRIDE_SECRET')).toBe('updated-db-value-789012');

    const rotated = await sm.rotateSecret('TEST_OVERRIDE_SECRET');
    expect(rotated).not.toBe('updated-db-value-789012');
    expect(await sm.getSecret('TEST_OVERRIDE_SECRET')).toBe(rotated);
  });

  it('blocks env-only encryption and database keys from being stored or overwritten in DB', async () => {
    const sm = await import('@/lib/security/secret-manager');
    await expect(sm.setSecret('ENCRYPTION_KEY', 'attacker-override-123456')).rejects.toThrow(sm.SecretManagerError);
    await expect(sm.rotateSecret('ENCRYPTION_KEY')).rejects.toThrow(sm.SecretManagerError);
    await expect(sm.setSecret('DATABASE_URL', 'mysql://attacker')).rejects.toThrow(sm.SecretManagerError);
    await expect(sm.setSecret('ALO_KEK_KEYS', '{}')).rejects.toThrow(sm.SecretManagerError);
  });

  it('masks short secrets completely and never reveals 4-char prefix/suffix', async () => {
    const sm = await import('@/lib/security/secret-manager');
    expect(sm.maskSecretValue('12345678')).toBe('****************');
    expect(sm.maskSecretValue('shortsecret123')).toBe('****************');
    const longMask = sm.maskSecretValue('abcdefghijklmnopqrstuvwx');
    expect(longMask).toBe('************uvwx');
    expect(longMask.startsWith('abcd')).toBe(false);
  });

  it('field-encryption supports v2 HKDF encryption, key rotation, and legacy v1 decryption', async () => {
    const fe = await import('@/lib/security/field-encryption');

    // Build a legacy v1 field ciphertext under key 1
    const v1Key = createHash('sha256').update(process.env.ENCRYPTION_KEY!).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', v1Key, iv);
    const ct = Buffer.concat([cipher.update('sk-legacy-api-key', 'utf8'), cipher.final()]);
    const v1Payload = `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ct.toString('base64')}`;

    const v2Payload = fe.encryptField('sk-modern-api-key');
    expect(v2Payload.startsWith('v2:1:')).toBe(true);
    expect(fe.isEncryptedField(v1Payload)).toBe(true);
    expect(fe.isEncryptedField(v2Payload)).toBe(true);
    expect(fe.decryptField(v1Payload)).toBe('sk-legacy-api-key');
    expect(fe.decryptField(v2Payload)).toBe('sk-modern-api-key');

    // Rotate field key via ENCRYPTION_KEY + ENCRYPTION_KEY_PREVIOUS
    process.env.ENCRYPTION_KEY_PREVIOUS = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = 'new-rotated-field-key-32-bytes!!';
    expect(fe.decryptField(v1Payload)).toBe('sk-legacy-api-key');
    expect(fe.decryptField(v2Payload)).toBe('sk-modern-api-key');
    expect(fe.needsFieldReencryption(v1Payload)).toBe(true);

    const freshPayload = fe.encryptField('sk-fresh-key');
    expect(fe.needsFieldReencryption(freshPayload)).toBe(false);
    expect(fe.decryptField(freshPayload)).toBe('sk-fresh-key');
  });

  it('POST /api/security/secrets never leaks raw secret values and reflects DB writes immediately', async () => {
    await real.db.user.upsert({
      where: { id: 'super-admin-1' },
      create: {
        id: 'super-admin-1',
        email: 'super-admin-secrets@test.local',
        name: 'Super Admin',
        passwordHash: 'not-used',
        role: 'super_admin',
        isActive: true,
      },
      update: {},
    });
    // Provide super_admin auth only for this route integration check
    vi.doMock('@/lib/api-auth', () => ({
      requireRole: vi.fn().mockResolvedValue({ userId: 'super-admin-1', role: 'super_admin' }),
    }));
    const route = await import('@/app/api/security/secrets/route');
    const sm = await import('@/lib/security/secret-manager');

    process.env.TEST_OVERRIDE_SECRET = 'stale-env-value-12345678';

    const setRes = await route.POST(
      new Request('http://localhost/api/security/secrets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: 'TEST_OVERRIDE_SECRET', value: 'abcd1234' }),
      }),
    );
    expect(setRes.status).toBe(200);
    const setJson = await setRes.json();
    expect(setJson.value).toBeUndefined();
    expect(setJson.maskedValue).toBe('****************');
    expect(JSON.stringify(setJson)).not.toContain('abcd1234');
    expect(await sm.getSecret('TEST_OVERRIDE_SECRET')).toBe('abcd1234');

    const rotRes = await route.POST(
      new Request('http://localhost/api/security/secrets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: 'TEST_OVERRIDE_SECRET', rotate: true }),
      }),
    );
    expect(rotRes.status).toBe(200);
    const rotJson = await rotRes.json();
    const resolvedAfterRotate = await sm.getSecret('TEST_OVERRIDE_SECRET');
    expect(rotJson.rotated).toBe(true);
    expect(rotJson.value).toBeUndefined();
    expect(resolvedAfterRotate).toBeTruthy();
    expect(resolvedAfterRotate).not.toBe('abcd1234');
    expect(JSON.stringify(rotJson)).not.toContain(resolvedAfterRotate!);

    vi.doUnmock('@/lib/api-auth');
  });
});
