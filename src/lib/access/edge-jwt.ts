export interface EdgeJwtClaims {
  userId: string;
  sessionId: string;
  audience: 'internal' | 'client';
  role?: string;
}

function decodeBase64Url(value: string): Uint8Array | null {
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function parseJsonPart<T>(value: string): T | null {
  const bytes = decodeBase64Url(value);
  if (!bytes) return null;
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

/**
 * Verify a session JWT in Next's request proxy without importing Node-only
 * Prisma/jsonwebtoken modules. This verifies the HS256 signature and mandatory
 * claims; route handlers still check the DB row, revocation and current role.
 */
export async function verifyEdgeJwt(
  token: string,
  secret: string,
  nowMs = Date.now(),
): Promise<EdgeJwtClaims | null> {
  if (!secret || secret.length < 32) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = parseJsonPart<{ alg?: unknown; typ?: unknown }>(encodedHeader);
  const payload = parseJsonPart<{
    userId?: unknown;
    sub?: unknown;
    jti?: unknown;
    aud?: unknown;
    role?: unknown;
    exp?: unknown;
    nbf?: unknown;
  }>(encodedPayload);
  const signature = decodeBase64Url(encodedSignature);
  if (!header || header.alg !== 'HS256' || (header.typ !== undefined && header.typ !== 'JWT')) return null;
  if (!payload || !signature || typeof payload.jti !== 'string' || payload.jti.length === 0) return null;

  const userId = typeof payload.userId === 'string'
    ? payload.userId
    : typeof payload.sub === 'string'
      ? payload.sub
      : null;
  if (!userId || userId.length > 191) return null;
  if (payload.aud !== 'internal' && payload.aud !== 'client') return null;
  if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(nowMs / 1000)) return null;
  if (typeof payload.nbf === 'number' && payload.nbf > Math.floor(nowMs / 1000)) return null;

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const signatureBuffer = new ArrayBuffer(signature.byteLength);
    new Uint8Array(signatureBuffer).set(signature);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBuffer,
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    );
    if (!valid) return null;
  } catch {
    return null;
  }

  return {
    userId,
    sessionId: payload.jti,
    audience: payload.aud,
    ...(typeof payload.role === 'string' ? { role: payload.role } : {}),
  };
}
