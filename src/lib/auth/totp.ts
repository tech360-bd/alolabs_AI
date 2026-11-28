import crypto from 'node:crypto';
import {
  decryptField,
  encryptField,
  isEncryptedField,
  isFieldEncryptionConfigured,
} from '@/lib/security/field-encryption';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encode raw bytes to unpadded RFC 4648 uppercase Base32.
 */
export function encodeBase32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }

  return output;
}

/**
 * Decode RFC 4648 Base32 (ignoring spaces and trailing '=' padding).
 */
export function decodeBase32(input: string): Buffer {
  const cleaned = input.trim().toUpperCase().replace(/[\s=]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];

  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) {
      throw new Error('Invalid Base32 TOTP secret character');
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(out);
}

/**
 * Generate a 160-bit (20-byte) TOTP shared secret encoded as 32 uppercase Base32 chars.
 */
export function generateTotpSecret(): string {
  return encodeBase32(crypto.randomBytes(20));
}

/**
 * Protect an MFA TOTP secret before persisting to User.otpSecret.
 * Always AES-256-GCM encrypted in production or whenever encryption keys are configured.
 */
export function protectTotpSecret(secret: string): string {
  if (isFieldEncryptionConfigured()) {
    return encryptField(secret);
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ENCRYPTION_KEY must be configured in production to store MFA secrets');
  }
  return secret;
}

/**
 * Decode a stored TOTP secret (encrypted or plaintext, Base32 or legacy hex) into raw HMAC key bytes.
 */
export function decodeTotpSecret(stored: string): Buffer {
  const raw = isEncryptedField(stored) ? decryptField(stored) : stored;
  const trimmed = raw.trim();

  // Standard uppercase Base32 (A-Z, 2-7, optional padding).
  // Note: legacy secrets were lowercase 32+ char hex (`crypto.randomBytes(16).toString('hex')`).
  if (/^[A-Z2-7]{16,}=*$/.test(trimmed)) {
    return decodeBase32(trimmed);
  }

  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0) {
    return Buffer.from(trimmed, 'hex');
  }

  return decodeBase32(trimmed);
}

export function buildTotpUri(email: string, secret: string, issuer = 'ALO Labs'): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedEmail = encodeURIComponent(email);
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

export function generateTotpCode(secretBytes: Buffer, timeStep = 30, slotOffset = 0): string {
  const timeSlot = Math.floor(Date.now() / 1000 / timeStep) + slotOffset;
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigUInt64BE(BigInt(timeSlot), 0);

  const hmac = crypto.createHmac('sha1', secretBytes);
  hmac.update(timeBuffer);
  const hmacResult = hmac.digest();

  const offset = hmacResult[hmacResult.length - 1] & 0x0f;
  const binary =
    ((hmacResult[offset] & 0x7f) << 24) |
    ((hmacResult[offset + 1] & 0xff) << 16) |
    ((hmacResult[offset + 2] & 0xff) << 8) |
    (hmacResult[offset + 3] & 0xff);

  const otp = binary % 1_000_000;
  return otp.toString().padStart(6, '0');
}

/**
 * Verify a 6-digit TOTP code against a stored (encrypted or plaintext, Base32 or legacy hex) secret.
 * Tolerates current slot and previous 30s slot.
 */
export function verifyTotpCode(storedSecret: string, code: string): boolean {
  const normalizedCode = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalizedCode)) return false;

  let secretBytes: Buffer;
  try {
    secretBytes = decodeTotpSecret(storedSecret);
  } catch {
    return false;
  }
  if (secretBytes.length === 0) return false;

  const candidateBuf = Buffer.from(normalizedCode, 'utf8');
  for (const slotOffset of [0, -1]) {
    const otp = generateTotpCode(secretBytes, 30, slotOffset);
    const otpBuf = Buffer.from(otp, 'utf8');
    if (otpBuf.length === candidateBuf.length && crypto.timingSafeEqual(otpBuf, candidateBuf)) {
      return true;
    }
  }
  return false;
}

export interface StoredBackupCodeEntry {
  id: string;
  hash: string;
}

export interface StoredBackupCodesV2 {
  version: 2;
  codes: StoredBackupCodeEntry[];
}

export function normalizeBackupCode(code: string): string {
  return code.trim().replace(/[-\s]/g, '').toLowerCase();
}

export function hashBackupCode(userId: string, code: string): string {
  const normalized = normalizeBackupCode(code);
  return crypto
    .createHash('sha256')
    .update(`mfa-backup:v2:${userId}:${normalized}`)
    .digest('hex');
}

export function serializeHashedBackupCodes(userId: string, plaintextCodes: string[]): string {
  const payload: StoredBackupCodesV2 = {
    version: 2,
    codes: plaintextCodes.map((code) => ({
      id: crypto.randomBytes(4).toString('hex'),
      hash: hashBackupCode(userId, code),
    })),
  };
  return JSON.stringify(payload);
}

/**
 * Verify a single-use backup code against stored hashes (or legacy string array),
 * returning the updated serialized settings value with that code removed.
 */
export function verifyAndConsumeBackupCode(
  rawStoredValue: string,
  userId: string,
  candidateCode: string,
): { valid: boolean; nextValue: string | null; remaining: number } {
  const normalized = normalizeBackupCode(candidateCode);
  if (normalized.length < 6 || normalized.length > 32) {
    return { valid: false, nextValue: rawStoredValue, remaining: 0 };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawStoredValue);
  } catch {
    return { valid: false, nextValue: rawStoredValue, remaining: 0 };
  }

  // Current v2 hashed format
  if (
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    (parsed as Partial<StoredBackupCodesV2>).version === 2 &&
    Array.isArray((parsed as Partial<StoredBackupCodesV2>).codes)
  ) {
    const entries = (parsed as StoredBackupCodesV2).codes;
    const candidateDigestBuf = Buffer.from(hashBackupCode(userId, candidateCode), 'hex');
    let matchIdx = -1;
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      if (!entry || typeof entry.hash !== 'string' || entry.hash.length !== 64) continue;
      const entryBuf = Buffer.from(entry.hash, 'hex');
      if (entryBuf.length === candidateDigestBuf.length && crypto.timingSafeEqual(entryBuf, candidateDigestBuf)) {
        matchIdx = i;
        break;
      }
    }

    if (matchIdx === -1) {
      return { valid: false, nextValue: rawStoredValue, remaining: entries.length };
    }

    const remainingEntries = entries.filter((_, idx) => idx !== matchIdx);
    return {
      valid: true,
      nextValue: remainingEntries.length > 0
        ? JSON.stringify({ version: 2, codes: remainingEntries } satisfies StoredBackupCodesV2)
        : null,
      remaining: remainingEntries.length,
    };
  }

  // Legacy plaintext array fallback (consume & migrate remaining to hashed v2)
  if (Array.isArray(parsed)) {
    const legacyCodes = parsed.filter((c): c is string => typeof c === 'string');
    const candidateBuf = Buffer.from(normalized, 'utf8');
    let matchIdx = -1;
    for (let i = 0; i < legacyCodes.length; i += 1) {
      const itemNorm = normalizeBackupCode(legacyCodes[i]);
      const itemBuf = Buffer.from(itemNorm, 'utf8');
      if (itemBuf.length === candidateBuf.length && crypto.timingSafeEqual(itemBuf, candidateBuf)) {
        matchIdx = i;
        break;
      }
    }
    if (matchIdx === -1) {
      return { valid: false, nextValue: rawStoredValue, remaining: legacyCodes.length };
    }
    const remaining = legacyCodes.filter((_, idx) => idx !== matchIdx);
    return {
      valid: true,
      nextValue: remaining.length > 0 ? serializeHashedBackupCodes(userId, remaining) : null,
      remaining: remaining.length,
    };
  }

  return { valid: false, nextValue: rawStoredValue, remaining: 0 };
}
