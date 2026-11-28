import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { createSessionToken, hashPassword } from '@/lib/auth';
import { CLIENT_ROLE, audienceForToken } from '@/lib/access/surfaces';
import { provisionClientAccount } from '@/lib/client-services/operations';
import { encryptField, isFieldEncryptionConfigured } from '@/lib/security/field-encryption';
import {
  buildOAuthCallbackUrl,
  resolveAppBaseUrl,
  sanitizeOAuthNextPath,
} from '@/lib/oauth-next-path';

/**
 * OAuth provider flow.
 *
 * GET (no `code`/`state` params) → initiation JSON API:
 *   returns { authorizationUrl, state } with an ABSOLUTE redirect_uri
 *   (RFC 6749 §3.1.2 — providers reject relative URIs) and a single-use
 *   state blob (JSON `{ provider, next }`) persisted server-side.
 *
 * GET (with `code`/`state` params) → browser callback:
 *   this is where the provider sends the user back to `redirect_uri`.
 *   Exchanges the code, enforces verified email + isActive + MFA,
 *   creates the session (or MFA temp challenge), sets the httpOnly
 *   `session-token` cookie, and redirects to the sanitized `next` path.
 *
 * POST → JSON callback API for programmatic clients (`{ code, state }` in,
 *   `{ user, token }` or `{ user, token: null, mfaPending: true, tempToken }` out).
 */

const STATE_TTL_MS = 10 * 60 * 1000;
const SESSION_COOKIE = 'session-token';
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24;

class OAuthFlowError extends Error {
  constructor(
    message: string,
    public readonly status: number = 500,
  ) {
    super(message);
    this.name = 'OAuthFlowError';
  }
}

interface OAuthStatePayload {
  provider: string;
  next?: string;
}

function parseStateValue(raw: string, provider: string): OAuthStatePayload | null {
  if (raw === provider) {
    return { provider };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<OAuthStatePayload>;
    if (parsed && typeof parsed.provider === 'string' && parsed.provider === provider) {
      return { provider, next: typeof parsed.next === 'string' ? parsed.next : undefined };
    }
  } catch {
    // malformed or foreign state
  }
  return null;
}

function isStateFresh(updatedAt: Date | null | undefined): boolean {
  if (!updatedAt) return false;
  return Date.now() - updatedAt.getTime() < STATE_TTL_MS;
}

async function createOAuthState(provider: string, next: string): Promise<string> {
  const state = crypto.randomBytes(24).toString('hex');
  const value = JSON.stringify({ provider, next });
  await db.settings.upsert({
    where: { key: `oauth_state:${state}` },
    update: { value, updatedAt: new Date() },
    create: { key: `oauth_state:${state}`, value, type: 'string' },
  });
  return state;
}

async function consumeOAuthState(
  state: string,
  provider: string
): Promise<OAuthStatePayload | null> {
  const record = await db.settings.findUnique({
    where: { key: `oauth_state:${state}` },
  });
  if (!record) return null;
  await db.settings.delete({ where: { key: `oauth_state:${state}` } });
  if (!isStateFresh(record.updatedAt)) return null;
  return parseStateValue(record.value, provider);
}

function protectProviderToken(token: string): string {
  if (!token) return '';
  if (isFieldEncryptionConfigured()) {
    return encryptField(token);
  }
  if (process.env.NODE_ENV === 'production') {
    throw new OAuthFlowError(
      'ENCRYPTION_KEY must be configured in production to store OAuth provider tokens.',
      500,
    );
  }
  // Never store raw plaintext OAuth bearer tokens in the database even when encryption is unconfigured.
  return '';
}

async function exchangeAuthorizationCode(
  providerConfig: { tokenUrl?: string; clientId: string; clientSecret?: string },
  code: string,
  redirectUri: string
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  if (!providerConfig.tokenUrl || !providerConfig.clientSecret) {
    throw new OAuthFlowError(
      'OAuth provider is not fully configured (missing tokenUrl or clientSecret).',
      502,
    );
  }

  let tokenResponse: Response;
  try {
    tokenResponse = await fetch(providerConfig.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: providerConfig.clientId,
        client_secret: providerConfig.clientSecret,
        redirect_uri: redirectUri,
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    throw new OAuthFlowError(
      `Failed to reach OAuth provider token endpoint: ${err instanceof Error ? err.message : 'Network error'}`,
      502,
    );
  }

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text().catch(() => '');
    throw new OAuthFlowError(
      `OAuth token exchange failed with status ${tokenResponse.status}: ${errorBody}`,
      502,
    );
  }

  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) {
    throw new OAuthFlowError(
      'OAuth provider did not return an access_token in the token response.',
      502,
    );
  }

  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || '',
    expiresIn: tokenData.expires_in || 3600,
  };
}

async function fetchGitHubVerifiedEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const entries = (await res.json()) as Array<{
      email?: unknown;
      verified?: unknown;
      primary?: unknown;
    }>;
    if (!Array.isArray(entries)) return null;
    const primaryVerified = entries.find(
      (entry) => entry.verified === true && entry.primary === true && typeof entry.email === 'string',
    );
    if (primaryVerified && typeof primaryVerified.email === 'string') {
      return primaryVerified.email.trim().toLowerCase();
    }
    const anyVerified = entries.find(
      (entry) => entry.verified === true && typeof entry.email === 'string',
    );
    return anyVerified && typeof anyVerified.email === 'string'
      ? anyVerified.email.trim().toLowerCase()
      : null;
  } catch {
    return null;
  }
}

async function fetchProviderUserInfo(
  provider: string,
  providerConfig: { userInfoUrl?: string; clientId: string; clientSecret?: string },
  accessToken: string
): Promise<{
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  avatar?: string;
}> {
  if (!providerConfig.userInfoUrl) {
    throw new OAuthFlowError(
      'OAuth provider is not fully configured (missing userInfoUrl).',
      502,
    );
  }

  let userInfoResponse: Response;
  try {
    userInfoResponse = await fetch(providerConfig.userInfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    throw new OAuthFlowError(
      `Failed to reach OAuth provider userinfo endpoint: ${err instanceof Error ? err.message : 'Network error'}`,
      502,
    );
  }

  if (!userInfoResponse.ok) {
    const errorBody = await userInfoResponse.text().catch(() => '');
    throw new OAuthFlowError(
      `OAuth userinfo request failed with status ${userInfoResponse.status}: ${errorBody}`,
      502,
    );
  }

  const userData = await userInfoResponse.json();
  const userId = String(userData.id || userData.sub || '');
  let email = typeof userData.email === 'string' ? userData.email.trim().toLowerCase() : '';
  let emailVerified =
    userData.email_verified === true ||
    userData.verified_email === true ||
    userData.verified === true;

  if (!userId) {
    throw new OAuthFlowError(
      'OAuth provider did not return a user ID in the userinfo response.',
      502,
    );
  }

  // GitHub's /user endpoint omits email verification unless /user/emails is queried.
  const isGitHub =
    provider === 'github' || providerConfig.userInfoUrl.includes('api.github.com');
  if (!emailVerified && isGitHub && userData.email_verified === undefined) {
    const verifiedGitHubEmail = await fetchGitHubVerifiedEmail(accessToken);
    if (verifiedGitHubEmail) {
      email = verifiedGitHubEmail;
      emailVerified = true;
    }
  }

  if (!email) {
    throw new OAuthFlowError(
      'OAuth provider did not return a valid email address. Please ensure the provider is configured with the correct scopes.',
      502,
    );
  }

  if (!emailVerified) {
    throw new OAuthFlowError(
      'OAuth provider email address is not verified.',
      403,
    );
  }

  return {
    id: userId,
    email,
    emailVerified,
    name: userData.name || userData.display_name || userData.login || '',
    avatar: userData.avatar_url || userData.picture || userData.image,
  };
}

async function completeOAuthCallback(
  provider: string,
  code: string,
  requestOrigin: string
): Promise<{
  user: { id: string; email: string; name: string; role: string; mfaRequired?: boolean };
  sessionToken: string | null;
  mfaPending: boolean;
  tempToken?: string;
}> {
  const providerConfig = await db.oAuthProvider.findUnique({
    where: { provider },
  });

  if (!providerConfig) {
    throw new OAuthFlowError(`OAuth provider '${provider}' is not configured`, 502);
  }

  if (!providerConfig.isActive) {
    throw new OAuthFlowError(`OAuth provider '${provider}' is currently disabled`, 400);
  }

  const redirectUri = buildOAuthCallbackUrl(provider, requestOrigin);
  const tokens = await exchangeAuthorizationCode(providerConfig, code, redirectUri);
  const providerUser = await fetchProviderUserInfo(provider, providerConfig, tokens.accessToken);
  const normalizedEmail = providerUser.email.trim().toLowerCase();

  const encryptedAccessToken = protectProviderToken(tokens.accessToken);
  const encryptedRefreshToken = protectProviderToken(tokens.refreshToken);

  const existingAccount = await db.oAuthAccount.findFirst({
    where: {
      provider,
      providerAccountId: providerUser.id,
    },
    include: { user: true },
  });

  let user;

  if (existingAccount) {
    user = existingAccount.user;
    if (user.isActive === false) {
      throw new OAuthFlowError('Account is disabled', 403);
    }
    await db.oAuthAccount.update({
      where: { id: existingAccount.id },
      data: {
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiry: new Date(Date.now() + tokens.expiresIn * 1000),
        profileJson: JSON.stringify({
          id: providerUser.id,
          email: normalizedEmail,
          name: providerUser.name,
          avatar: providerUser.avatar,
          emailVerified: providerUser.emailVerified,
        }),
        updatedAt: new Date(),
      },
    });
  } else {
    user = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (user) {
      if (user.isActive === false) {
        throw new OAuthFlowError('Account is disabled', 403);
      }
      // Safe to link because fetchProviderUserInfo already verified email ownership.
      await db.oAuthAccount.create({
        data: {
          userId: user.id,
          providerId: providerConfig.id,
          provider,
          providerAccountId: providerUser.id,
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          tokenExpiry: new Date(Date.now() + tokens.expiresIn * 1000),
          profileJson: JSON.stringify({
            id: providerUser.id,
            email: normalizedEmail,
            name: providerUser.name,
            avatar: providerUser.avatar,
            emailVerified: providerUser.emailVerified,
          }),
        },
      });
    } else {
      const randomPassword = crypto.randomBytes(24).toString('hex');
      user = await db.user.create({
        data: {
          email: normalizedEmail,
          passwordHash: await hashPassword(randomPassword),
          name: providerUser.name || normalizedEmail.split('@')[0],
          role: CLIENT_ROLE,
          isActive: true,
          oauthAccounts: {
            create: {
              providerId: providerConfig.id,
              provider,
              providerAccountId: providerUser.id,
              accessToken: encryptedAccessToken,
              refreshToken: encryptedRefreshToken,
              tokenExpiry: new Date(Date.now() + tokens.expiresIn * 1000),
              profileJson: JSON.stringify({
                id: providerUser.id,
                email: normalizedEmail,
                name: providerUser.name,
                avatar: providerUser.avatar,
                emailVerified: providerUser.emailVerified,
              }),
            },
          },
        },
      });
      await provisionClientAccount({
        userId: user.id,
        companyName: `${user.name}'s organisation`,
        billingEmail: user.email,
      });
    }
  }

  if (user.otpEnabled) {
    const tempToken = crypto.randomBytes(24).toString('hex');
    await db.settings.upsert({
      where: { key: `mfa_temp:${tempToken}` },
      create: {
        key: `mfa_temp:${tempToken}`,
        value: JSON.stringify({ userId: user.id, rememberMe: false, createdAt: Date.now() }),
        type: 'json',
      },
      update: {
        value: JSON.stringify({ userId: user.id, rememberMe: false, createdAt: Date.now() }),
        type: 'json',
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        mfaRequired: true,
      },
      sessionToken: null,
      mfaPending: true,
      tempToken,
    };
  }

  const sessionToken = await createSessionToken(user.id, { method: `oauth:${provider}` });

  await db.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    sessionToken,
    mfaPending: false,
  };
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_COOKIE_MAX_AGE,
  };
}

function redirectToLoginError(provider: string, requestOrigin: string): NextResponse {
  const base = resolveAppBaseUrl(requestOrigin);
  const target = `${base}/login?error=oauth_failed&provider=${encodeURIComponent(provider)}`;
  return NextResponse.redirect(target);
}

// GET: Initiate OAuth flow (JSON) OR handle the provider's browser callback.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const requestOrigin = new URL(request.url).origin;
  const url = new URL(request.url);
  const callbackCode = url.searchParams.get('code');
  const callbackState = url.searchParams.get('state');

  // ── Callback branch ──────────────────────────────────────────────────────
  if (callbackCode && callbackState) {
    try {
      const statePayload = await consumeOAuthState(callbackState, provider);
      if (!statePayload) {
        return redirectToLoginError(provider, requestOrigin);
      }

      const result = await completeOAuthCallback(provider, callbackCode, requestOrigin);

      if (result.mfaPending && result.tempToken) {
        const base = resolveAppBaseUrl(requestOrigin);
        const mfaTarget = `${base}/login?mfaPending=1&tempToken=${encodeURIComponent(result.tempToken)}&provider=${encodeURIComponent(provider)}`;
        return NextResponse.redirect(mfaTarget);
      }

      const sessionToken = result.sessionToken!;
      const isClient = audienceForToken(sessionToken) === 'client';
      const home = isClient ? '/portal' : '/dashboard';
      const requestedNext = sanitizeOAuthNextPath(statePayload.next);
      const nextPath =
        requestedNext && requestedNext.startsWith('/portal') === isClient ? requestedNext : home;
      const target = `${resolveAppBaseUrl(requestOrigin)}${nextPath}`;
      const response = NextResponse.redirect(target);
      response.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions());
      return response;
    } catch (error) {
      console.error('OAuth callback error:', error);
      return redirectToLoginError(provider, requestOrigin);
    }
  }

  // ── Initiation branch ────────────────────────────────────────────────────
  try {
    const providerConfig = await db.oAuthProvider.findUnique({
      where: { provider },
    });

    if (!providerConfig) {
      return NextResponse.json(
        { error: `OAuth provider '${provider}' is not configured` },
        { status: 404 }
      );
    }

    if (!providerConfig.isActive) {
      return NextResponse.json(
        { error: `OAuth provider '${provider}' is currently disabled` },
        { status: 400 }
      );
    }

    const requestedNext = url.searchParams.get('next') || '';
    const state = await createOAuthState(provider, requestedNext);

    const url2 = new URL(providerConfig.authorizationUrl);
    url2.searchParams.set('response_type', 'code');
    url2.searchParams.set('client_id', providerConfig.clientId);
    url2.searchParams.set('redirect_uri', buildOAuthCallbackUrl(provider, requestOrigin));
    let scopes: string[] = [];
    try {
      scopes = JSON.parse(providerConfig.scopes);
    } catch {
      scopes = [];
    }
    url2.searchParams.set('scope', scopes.join(' '));
    url2.searchParams.set('state', state);

    return NextResponse.json({
      authorizationUrl: url2.toString(),
      state,
    });
  } catch (error) {
    console.error('OAuth initiate error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: JSON callback API
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider } = await params;
    const body = await request.json().catch(() => null);
    const code = typeof body?.code === 'string' ? body.code : '';
    const state = typeof body?.state === 'string' ? body.state : '';

    if (!code || !state) {
      return NextResponse.json(
        { error: 'Authorization code and state are required' },
        { status: 400 }
      );
    }

    const statePayload = await consumeOAuthState(state, provider);
    if (!statePayload) {
      return NextResponse.json(
        { error: 'Invalid or expired OAuth state. Please restart the OAuth flow.' },
        { status: 400 }
      );
    }

    const requestOrigin = new URL(request.url).origin;
    const result = await completeOAuthCallback(provider, code, requestOrigin);

    if (result.mfaPending) {
      return NextResponse.json({
        user: result.user,
        token: null,
        mfaPending: true,
        tempToken: result.tempToken,
      });
    }

    const sessionToken = result.sessionToken!;
    return NextResponse.json({
      user: result.user,
      token: sessionToken,
      redirectTo:
        audienceForToken(sessionToken) === 'client'
          ? '/portal'
          : sanitizeOAuthNextPath(statePayload.next) || '/dashboard',
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    if (error instanceof OAuthFlowError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
