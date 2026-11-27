// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  contextAad,
  generateKek,
  loadKeyRing,
  maskValue,
  needsRewrap,
  openSecret,
  sealSecret,
  SecretStoreError,
  type SecretContext,
} from '@/lib/secrets/envelope';

/**
 * The credential boundary.
 *
 * Every assertion here is about a failure mode that would be a real incident:
 * a ciphertext moved to another tenant, a rotated key that cannot read old rows, a
 * nonce reused, a tampered tag that decrypts anyway, or an unconfigured store that
 * writes plaintext instead of refusing.
 */

const CONTEXT: SecretContext = {
  companyId: 'company-1',
  projectSlug: 'agentos',
  environment: 'production',
  key: 'OPENAI_API_KEY',
};

function envWith(keys: Record<string, string>, active?: string): Record<string, string | undefined> {
  return { ALO_KEK_KEYS: JSON.stringify(keys), ...(active ? { ALO_KEK_ACTIVE: active } : {}) };
}

const KEK_1 = generateKek();
const KEK_2 = generateKek();

describe('key ring configuration', () => {
  it('refuses to operate without a configured key', () => {
    expect(() => loadKeyRing({})).toThrow(SecretStoreError);
    try {
      loadKeyRing({});
    } catch (error) {
      expect((error as SecretStoreError).code).toBe('not-configured');
    }
  });

  it('refuses a key that is not 32 bytes', () => {
    expect(() => loadKeyRing(envWith({ "1": randomBytes(16).toString("base64") }))).toThrow(/too short|32 bytes/);
  });

  it('accepts the single-key shorthand and picks the highest id as active', () => {
    const single = loadKeyRing({ ALO_KEK: KEK_1 });
    expect(single.activeId).toBe('1');

    const multi = loadKeyRing(envWith({ '1': KEK_1, '2': KEK_2 }));
    expect(multi.activeId).toBe('2');
  });

  it('refuses an active id that is not in the ring', () => {
    expect(() => loadKeyRing(envWith({ '1': KEK_1 }, '9'))).toThrow(/ALO_KEK_ACTIVE/);
  });
});

describe('sealing and opening', () => {
  const env = envWith({ '1': KEK_1 });

  it('round-trips a value without storing it anywhere in the record', () => {
    const secret = 'sk-live-abcdefghijklmnopqrstuvwxyz0123456789';
    const sealed = sealSecret(secret, CONTEXT, { env });

    expect(JSON.stringify(sealed)).not.toContain(secret);
    expect(JSON.stringify(sealed)).not.toContain('sk-live');
    expect(sealed.algorithm).toBe('aes-256-gcm');
    expect(sealed.kekId).toBe('1');
    expect(openSecret(sealed, CONTEXT, { env })).toBe(secret);
  });

  it('uses a fresh data key and IV for every seal', () => {
    const first = sealSecret('same-value', CONTEXT, { env });
    const second = sealSecret('same-value', CONTEXT, { env });

    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(first.iv).not.toBe(second.iv);
    expect(first.dekCiphertext).not.toBe(second.dekCiphertext);
  });

  it('binds the ciphertext to its tenant, project, environment and key', () => {
    const sealed = sealSecret('tenant-a-value', CONTEXT, { env });

    for (const changed of [
      { ...CONTEXT, companyId: 'company-2' },
      { ...CONTEXT, projectSlug: 'another-project' },
      { ...CONTEXT, environment: 'staging' },
      { ...CONTEXT, key: 'OTHER_KEY' },
    ]) {
      expect(() => openSecret(sealed, changed, { env })).toThrow(/could not be decrypted/i);
    }
    expect(openSecret(sealed, CONTEXT, { env })).toBe('tenant-a-value');
  });

  it('rejects a tampered ciphertext, tag or IV', () => {
    const sealed = sealSecret('do-not-tamper', CONTEXT, { env });
    const flip = (value: string) => {
      const buffer = Buffer.from(value, 'base64');
      buffer[0] ^= 0xff;
      return buffer.toString('base64');
    };

    expect(() => openSecret({ ...sealed, ciphertext: flip(sealed.ciphertext) }, CONTEXT, { env })).toThrow(/could not be decrypted/i);
    expect(() => openSecret({ ...sealed, tag: flip(sealed.tag) }, CONTEXT, { env })).toThrow(/could not be decrypted/i);
    expect(() => openSecret({ ...sealed, iv: flip(sealed.iv) }, CONTEXT, { env })).toThrow();
    expect(() => openSecret({ ...sealed, dekTag: flip(sealed.dekTag) }, CONTEXT, { env })).toThrow();
  });

  it('refuses an empty value and a malformed record', () => {
    expect(() => sealSecret('', CONTEXT, { env })).toThrow(/empty/i);
    const sealed = sealSecret('value', CONTEXT, { env });
    expect(() => openSecret({ ...sealed, tag: 'AAAA' }, CONTEXT, { env })).toThrow(/malformed/i);
  });
});

describe('key rotation', () => {
  it('keeps old rows readable after a new key becomes active', () => {
    const oldEnv = envWith({ '1': KEK_1 });
    const sealed = sealSecret('rotate-me', CONTEXT, { env: oldEnv });
    expect(sealed.kekId).toBe('1');

    const rotatedEnv = envWith({ '1': KEK_1, '2': KEK_2 });
    expect(openSecret(sealed, CONTEXT, { env: rotatedEnv })).toBe('rotate-me');
    expect(needsRewrap(sealed, loadKeyRing(rotatedEnv))).toBe(true);

    const resealed = sealSecret('rotate-me', CONTEXT, { env: rotatedEnv });
    expect(resealed.kekId).toBe('2');
    expect(needsRewrap(resealed, loadKeyRing(rotatedEnv))).toBe(false);
  });

  it('refuses to decrypt when the key that wrapped a row has been dropped', () => {
    const sealed = sealSecret('orphan', CONTEXT, { env: envWith({ '1': KEK_1 }) });
    // Removing KEK 1 before re-wrapping its rows makes them unreadable — which is
    // why `needsRewrap` exists and the error names the missing key.
    expect(() => openSecret(sealed, CONTEXT, { env: envWith({ '2': KEK_2 }) })).toThrow(/KEK 1/);
  });

  it('cannot open a secret sealed under a different key even at the same id', () => {
    const sealed = sealSecret('wrong-ring', CONTEXT, { env: envWith({ '1': KEK_1 }) });
    expect(() => openSecret(sealed, CONTEXT, { env: envWith({ '1': KEK_2 }) })).toThrow(/could not be decrypted/i);
  });
});

describe('masking', () => {
  it('never reveals a short value', () => {
    expect(maskValue('abc')).toBe('••••••••');
    expect(maskValue('12345678')).toBe('••••••••');
  });

  it('shows only the last four characters of a long value', () => {
    const mask = maskValue('sk-live-0123456789abcd');
    expect(mask).toBe('••••••••abcd');
    expect(mask).not.toContain('sk-live');
  });
});

describe('associated data', () => {
  it('is unambiguous across field boundaries', () => {
    const a = contextAad({ companyId: 'a|b', projectSlug: 'c', environment: 'production', key: 'K' });
    const b = contextAad({ companyId: 'a', projectSlug: 'b|c', environment: 'production', key: 'K' });
    expect(a.equals(b)).toBe(false);
  });
});
