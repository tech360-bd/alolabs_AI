import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { verifyEdgeJwt } from '@/lib/access/edge-jwt';

const SECRET = 'edge-test-secret-that-is-long-enough-for-hmac';
const claims = {
  userId: 'user-123',
  jti: 'session-123',
  aud: 'internal' as const,
  role: 'admin',
};

describe('Edge JWT verification', () => {
  it('verifies an HS256 session JWT and returns only routing identity claims', async () => {
    const token = jwt.sign(claims, SECRET, { algorithm: 'HS256', expiresIn: '5m' });
    await expect(verifyEdgeJwt(token, SECRET)).resolves.toMatchObject({
      userId: 'user-123',
      sessionId: 'session-123',
      audience: 'internal',
      role: 'admin',
    });
  });

  it('rejects a signature made with a different secret', async () => {
    const token = jwt.sign(claims, 'different-secret-long-enough-for-test', { algorithm: 'HS256', expiresIn: '5m' });
    await expect(verifyEdgeJwt(token, SECRET)).resolves.toBeNull();
  });

  it('rejects unsupported algorithms and expired tokens', async () => {
    const wrongAlgorithm = jwt.sign(claims, SECRET, { algorithm: 'HS384', expiresIn: '5m' });
    await expect(verifyEdgeJwt(wrongAlgorithm, SECRET)).resolves.toBeNull();

    const expired = jwt.sign(claims, SECRET, { algorithm: 'HS256', expiresIn: -1 });
    await expect(verifyEdgeJwt(expired, SECRET)).resolves.toBeNull();
  });

  it('rejects malformed claims, short secrets and non-JWT opaque tokens', async () => {
    const withoutSessionId = jwt.sign({ userId: 'user-123', aud: 'internal' }, SECRET, { algorithm: 'HS256', expiresIn: '5m' });
    await expect(verifyEdgeJwt(withoutSessionId, SECRET)).resolves.toBeNull();
    await expect(verifyEdgeJwt('abc.def.ghi', SECRET)).resolves.toBeNull();
    await expect(verifyEdgeJwt(jwt.sign(claims, SECRET, { algorithm: 'HS256', expiresIn: '5m' }), 'short')).resolves.toBeNull();
  });
});
