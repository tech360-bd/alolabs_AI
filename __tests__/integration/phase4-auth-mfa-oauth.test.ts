// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createRealDb, type RealDb } from '../helpers/real-db';

describe('Phase 4 integration — MFA (Base32 + hashed backup codes + retries), OAuth hardening, password-change revocation, portal sessions', () => {
  let real: RealDb;
  let clientUserId = '';
  let clientToken = '';

  beforeAll(async () => {
    real = await createRealDb('phase4-auth');
    process.env.ENCRYPTION_KEY = 'phase4-test-encryption-key-at-least-32-chars!';
    process.env.JWT_SECRET = 'phase4-test-jwt-secret-at-least-32-characters!';

    const { createSessionToken, hashPassword } = await import('@/lib/auth');
    const pw = await hashPassword('CorrectHorseBattery!1');

    const company = await real.db.company.create({
      data: { name: 'Portal Client Co', slug: 'portal-client-co', status: 'active', accountType: 'client' },
    });
    const client = await real.db.user.create({
      data: {
        email: 'portal-mfa@test.local',
        name: 'Portal Client',
        passwordHash: pw,
        role: 'viewer',
        isActive: true,
      },
    });
    await real.db.companyUser.create({ data: { userId: client.id, companyId: company.id, role: 'member' } });
    clientUserId = client.id;
    clientToken = await createSessionToken(client.id);
  });

  afterAll(async () => {
    await real.cleanup();
  });

  it('MFA setup emits Base32 secret, encrypts otpSecret, hashes backup codes, tolerates wrong code retries, consumes backup code once', async () => {
    const setupRoute = await import('@/app/api/auth/mfa/setup/route');
    const verifyRoute = await import('@/app/api/auth/mfa/verify/route');
    const disableRoute = await import('@/app/api/auth/mfa/disable/route');
    const loginRoute = await import('@/app/api/auth/login/route');
    const { decodeBase32, generateTotpCode } = await import('@/lib/auth/totp');

    // Portal user calls MFA setup with empty body (UI pattern)
    const setupRes = await setupRoute.POST(
      new NextRequest('http://localhost/api/auth/mfa/setup', {
        method: 'POST',
        headers: { authorization: `Bearer ${clientToken}` },
      }),
    );
    expect(setupRes.status).toBe(200);
    const setupData = await setupRes.json();

    // Base32 secret (32 chars [A-Z2-7]) and standard otpauth URI
    expect(setupData.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(setupData.qrCodeUrl).toContain(`secret=${setupData.secret}`);
    expect(setupData.backupCodes).toHaveLength(6);

    // Stored otpSecret is AES-256-GCM encrypted (not plaintext)
    const dbUserBefore = await real.db.user.findUniqueOrThrow({ where: { id: clientUserId } });
    expect(dbUserBefore.otpSecret).toMatch(/^v2:/);
    expect(dbUserBefore.otpSecret).not.toContain(setupData.secret);

    // Stored backup codes are hashed (plaintext codes never appear in DB)
    const backupRow = await real.db.settings.findUniqueOrThrow({ where: { key: `mfa_backup:${clientUserId}` } });
    for (const code of setupData.backupCodes as string[]) {
      expect(backupRow.value).not.toContain(code);
    }

    // Complete MFA setup with a valid 6-digit Base32 TOTP code
    const secretBytes = decodeBase32(setupData.secret);
    const totpCode = generateTotpCode(secretBytes);
    const verifySetupRes = await verifyRoute.POST(
      new NextRequest('http://localhost/api/auth/mfa/verify', {
        method: 'POST',
        headers: { authorization: `Bearer ${clientToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ code: totpCode, context: 'setup' }),
      }),
    );
    expect(verifySetupRes.status).toBe(200);
    expect((await real.db.user.findUniqueOrThrow({ where: { id: clientUserId } })).otpEnabled).toBe(true);

    // Login produces mfaPending challenge
    const loginRes = await loginRoute.POST(
      new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-real-ip': '198.51.100.10' },
        body: JSON.stringify({ email: 'portal-mfa@test.local', password: 'CorrectHorseBattery!1' }),
      }),
    );
    const loginBody = await loginRes.json();
    expect(loginBody.mfaPending).toBe(true);
    const tempToken = loginBody.tempToken as string;

    // Wrong code returns 401 with retryAllowed: true and preserves tempToken!
    const badRes = await verifyRoute.POST(
      new NextRequest('http://localhost/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-real-ip': '198.51.100.11' },
        body: JSON.stringify({ tempToken, code: '000000', context: 'login' }),
      }),
    );
    expect(badRes.status).toBe(401);
    const badBody = await badRes.json();
    expect(badBody.retryAllowed).toBe(true);
    expect(await real.db.settings.findUnique({ where: { key: `mfa_temp:${tempToken}` } })).not.toBeNull();

    // Valid single-use backup code succeeds on retry with the SAME tempToken!
    const backupCode = setupData.backupCodes[0] as string;
    const backupLoginRes = await verifyRoute.POST(
      new NextRequest('http://localhost/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-real-ip': '198.51.100.12' },
        body: JSON.stringify({ tempToken, code: backupCode, context: 'login' }),
      }),
    );
    expect(backupLoginRes.status).toBe(200);
    const backupLoginBody = await backupLoginRes.json();
    expect(typeof backupLoginBody.token).toBe('string');

    // Reusing the same backup code on a fresh challenge must fail!
    const loginRes2 = await loginRoute.POST(
      new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-real-ip': '198.51.100.13' },
        body: JSON.stringify({ email: 'portal-mfa@test.local', password: 'CorrectHorseBattery!1' }),
      }),
    );
    const tempToken2 = (await loginRes2.json()).tempToken as string;
    const replayBackupRes = await verifyRoute.POST(
      new NextRequest('http://localhost/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-real-ip': '198.51.100.14' },
        body: JSON.stringify({ tempToken: tempToken2, code: backupCode, context: 'login' }),
      }),
    );
    expect(replayBackupRes.status).toBe(401);

    // Disable MFA cleanly
    const disableRes = await disableRoute.POST(
      new NextRequest('http://localhost/api/auth/mfa/disable', {
        method: 'POST',
        headers: { authorization: `Bearer ${backupLoginBody.token}` },
      }),
    );
    expect(disableRes.status).toBe(200);
  });

  it('OAuth normalizes email casing, encrypts stored tokens, and enforces MFA if enabled', async () => {
    const oauthRoute = await import('@/app/api/auth/oauth/[provider]/route');
    const { hashPassword } = await import('@/lib/auth');

    await real.db.oAuthProvider.create({
      data: {
        provider: 'oidc-test',
        clientId: 'cid-1',
        clientSecret: 'csec-1',
        authorizationUrl: 'https://idp.example.test/authorize',
        tokenUrl: 'https://idp.example.test/token',
        userInfoUrl: 'https://idp.example.test/userinfo',
        scopes: JSON.stringify(['openid', 'email', 'profile']),
        isActive: true,
      },
    });

    const user = await real.db.user.create({
      data: {
        email: 'case.user@test.local',
        name: 'Case User',
        passwordHash: await hashPassword('CorrectHorseBattery!2'),
        role: 'viewer',
        isActive: true,
        otpEnabled: false,
      },
    });

    const originalFetch = global.fetch;
    global.fetch = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes('/token')) {
        return {
          ok: true,
          status: 200,
          text: async () => 'ok',
          json: async () => ({
            access_token: 'super-secret-oauth-access-token',
            refresh_token: 'super-secret-oauth-refresh-token',
            expires_in: 3600,
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => 'ok',
        json: async () => ({
          sub: 'oidc-sub-1',
          email: '  CASE.USER@TEST.LOCAL ',
          email_verified: true,
          name: 'Case User',
        }),
      };
    }) as unknown as typeof fetch;

    try {
      const initRes = await oauthRoute.GET(
        new NextRequest('http://localhost/api/auth/oauth/oidc-test'),
        { params: Promise.resolve({ provider: 'oidc-test' }) },
      );
      const { state } = await initRes.json();

      const cbRes = await oauthRoute.POST(
        new NextRequest('http://localhost/api/auth/oauth/oidc-test', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code: 'auth-code-1', state }),
        }),
        { params: Promise.resolve({ provider: 'oidc-test' }) },
      );
      expect(cbRes.status).toBe(200);
      const cbData = await cbRes.json();
      expect(cbData.user.id).toBe(user.id);
      expect(typeof cbData.token).toBe('string');

      // Stored OAuth tokens must be AES-256-GCM encrypted (v2:...)
      const account = await real.db.oAuthAccount.findFirstOrThrow({
        where: { provider: 'oidc-test', providerAccountId: 'oidc-sub-1' },
      });
      expect(account.accessToken).toMatch(/^v2:/);
      expect(account.refreshToken).toMatch(/^v2:/);
      expect(account.accessToken).not.toContain('super-secret-oauth-access-token');
      expect(account.refreshToken).not.toContain('super-secret-oauth-refresh-token');

      // Enabling MFA on the user forces browser OAuth callback through mfaPending with NO session cookie
      await real.db.user.update({ where: { id: user.id }, data: { otpEnabled: true } });
      const initRes2 = await oauthRoute.GET(
        new NextRequest('http://localhost/api/auth/oauth/oidc-test'),
        { params: Promise.resolve({ provider: 'oidc-test' }) },
      );
      const { state: state2 } = await initRes2.json();
      const cbMfaRes = await oauthRoute.GET(
        new NextRequest(`http://localhost/api/auth/oauth/oidc-test?code=auth-code-2&state=${state2}`),
        { params: Promise.resolve({ provider: 'oidc-test' }) },
      );
      expect(cbMfaRes.status).toBe(307);
      expect(cbMfaRes.headers.get('location')).toContain('/login?mfaPending=1&tempToken=');
      expect(cbMfaRes.cookies.get('session-token')?.value).toBeUndefined();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('password-change revokes all sessions, register enforces 12-char passwords, and portal users can manage sessions', async () => {
    const pwChangeRoute = await import('@/app/api/auth/password-change/route');
    const registerRoute = await import('@/app/api/auth/register/route');
    const sessionsRoute = await import('@/app/api/auth/sessions/route');
    const { createSessionToken, hashPassword, verifySessionToken } = await import('@/lib/auth');

    // Registration rejects < 12 character password
    const weakReg = await registerRoute.POST(
      new NextRequest('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'weak@test.local', name: 'Weak', password: 'shortpass1' }),
      }),
    );
    expect(weakReg.status).toBe(400);

    // Portal user can list and refresh their own sessions
    const sessionUser = await real.db.user.create({
      data: {
        email: 'sess-portal@test.local',
        name: 'Session Portal User',
        passwordHash: await hashPassword('InitialStrongPass!123'),
        role: 'viewer',
        isActive: true,
      },
    });
    const tok1 = await createSessionToken(sessionUser.id);
    const tok2 = await createSessionToken(sessionUser.id);

    const listRes = await sessionsRoute.GET(
      new NextRequest('http://localhost/api/auth/sessions', {
        headers: { authorization: `Bearer ${tok1}` },
      }),
    );
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(listData.sessions.length).toBeGreaterThanOrEqual(2);

    const refreshRes = await sessionsRoute.POST(
      new NextRequest('http://localhost/api/auth/sessions', {
        method: 'POST',
        headers: { authorization: `Bearer ${tok1}`, 'content-type': 'application/json' },
        body: '{}',
      }),
    );
    expect(refreshRes.status).toBe(200);
    const rotatedTok = (await refreshRes.json()).token as string;
    expect(await verifySessionToken(tok1, { audience: 'any' })).toBeNull();
    expect(await verifySessionToken(rotatedTok, { audience: 'any' })).not.toBeNull();

    // Password change revokes ALL sessions (both rotatedTok and tok2)
    const pwRes = await pwChangeRoute.POST(
      new NextRequest('http://localhost/api/auth/password-change', {
        method: 'POST',
        headers: { authorization: `Bearer ${rotatedTok}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          currentPassword: 'InitialStrongPass!123',
          newPassword: 'RotatedStrongPass!456',
        }),
      }),
    );
    expect(pwRes.status).toBe(200);
    expect(await verifySessionToken(rotatedTok, { audience: 'any' })).toBeNull();
    expect(await verifySessionToken(tok2, { audience: 'any' })).toBeNull();
  });

  it('proxy permits portal sessions on MFA/session shared endpoints and blocks unauthenticated /api/auth/sso', async () => {
    const { proxy } = await import('@/proxy');
    const { createSessionToken } = await import('@/lib/auth');

    const freshClientToken = await createSessionToken(clientUserId);

    for (const [method, path] of [
      ['POST', '/api/auth/mfa/setup'],
      ['POST', '/api/auth/mfa/disable'],
      ['GET', '/api/auth/sessions'],
    ] as const) {
      const res = await proxy(
        new NextRequest(`http://localhost${path}`, {
          method,
          headers: { authorization: `Bearer ${freshClientToken}` },
        }),
      );
      expect(res.headers.get('x-middleware-next'), `${method} ${path}`).toBe('1');
    }

    const ssoRes = await proxy(new NextRequest('http://localhost/api/auth/sso'));
    expect(ssoRes.status).toBe(401);
  });
});
