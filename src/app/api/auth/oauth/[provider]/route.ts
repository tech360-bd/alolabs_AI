import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { createSessionToken, hashPassword } from '@/lib/auth';
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
 *   Exchanges the code, creates the session, sets the httpOnly
 *   `session-token` cookie, and redirects to the sanitized `next` path.
 *   Without this branch the provider round-trip was a dead loop.
 *
 * POST → JSON callback API for programmatic clients (unchanged contract:
 *   `{ code, state }` in, `{ user, token }` out).
 */

/** Server-side state lifetime. A state older than this is rejected. */
const STATE_TTL_MS = 10 * 60 * 1000;

/** Cookie name + options mirror `src/app/api/auth/login/route.ts`. */
const SESSION_COOKIE = 'session-token';
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24; // matches SESSION_TTL_HOURS default of 24h

interface OAuthStatePayload {
  provider: string;
  next?: string;
}

/**
 * Parse a persisted state value. Current format is JSON `{provider, next}`;
 * rows written by the legacy format (a bare provider string) are still
 * accepted for flows initiated before this change.
 */
function parseStateValue(raw: string, provider: string): OAuthStatePayload | null {
  if (raw === provider) {
    // Legacy format: state row value is the bare provider name.
    return { provider };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<OAuthStatePayload>;
    if (parsed && typeof parsed.provider === 'string' && parsed.provider === provider) {
      return { provider, next: typeof parsed.next === 'string' ? parsed.next : undefined };
    }
  } catch {
    // fall through — malformed or foreign state
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

/**
 * Single-use state consumption. The row is deleted BEFORE it is acted on
 * (even on validation failure) so a state can never be replayed, and an
 * expired or foreign state is rejected.
 */
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

/**
 * Exchange authorization code for OAuth tokens with the provider.
 * When real provider credentials are configured, performs actual HTTP token exchange.
 * Falls back to generating cryptographic tokens for self-hosted/custom providers.
 */
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
    throw new Error('OAuth provider is not fully configured (missing tokenUrl or clientSecret).');
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
    throw new Error(`Failed to reach OAuth provider token endpoint: ${err instanceof Error ? err.message : 'Network error'}`);
  }

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text().catch(() => '');
    throw new Error(`OAuth token exchange failed with status ${tokenResponse.status}: ${errorBody}`);
  }

  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) {
    throw new Error('OAuth provider did not return an access_token in the token response.');
  }

  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || '',
    expiresIn: tokenData.expires_in || 3600,
  };
}

/**
 * Fetch user profile from the provider's userinfo endpoint.
 * When real provider configuration includes a userinfo URL, performs actual HTTP request.
 */
async function fetchProviderUserInfo(
  providerConfig: { userInfoUrl?: string; clientId: string; clientSecret?: string },
  accessToken: string
): Promise<{
  id: string;
  email: string;
  name: string;
  avatar?: string;
}> {
  if (!providerConfig.userInfoUrl) {
    throw new Error('OAuth provider is not fully configured (missing userInfoUrl).');
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
    throw new Error(`Failed to reach OAuth provider userinfo endpoint: ${err instanceof Error ? err.message : 'Network error'}`);
  }

  if (!userInfoResponse.ok) {
    const errorBody = await userInfoResponse.text().catch(() => '');
    throw new Error(`OAuth userinfo request failed with status ${userInfoResponse.status}: ${errorBody}`);
  }

  const userData = await userInfoResponse.json();
  const userId = String(userData.id || userData.sub || '');
  const email = userData.email || '';

  if (!userId) {
    throw new Error('OAuth provider did not return a user ID in the userinfo response.');
  }

  return {
    id: userId,
    email,
    name: userData.name || userData.display_name || userData.login || '',
    avatar: userData.avatar_url || userData.picture || userData.image,
  };
}

/**
 * Shared core of the callback: validate the provider, exchange the code
 * (using the SAME absolute redirect_uri that was sent at initiation),
 * upsert the user + OAuth account, and mint a session token.
 */
async function completeOAuthCallback(
  provider: string,
  code: string,
  requestOrigin: string
): Promise<{
  user: { id: string; email: string; name: string; role: string };
  sessionToken: string;
}> {
  const providerConfig = await db.oAuthProvider.findUnique({
    where: { provider },
  });

  if (!providerConfig) {
    throw new Error(`OAuth provider '${provider}' is not configured`);
  }

  const redirectUri = buildOAuthCallbackUrl(provider, requestOrigin);
  const tokens = await exchangeAuthorizationCode(providerConfig, code, redirectUri);
  const providerUser = await fetchProviderUserInfo(providerConfig, tokens.accessToken);

  // Validate that we got usable user info
  if (!providerUser.email) {
    throw new Error('OAuth provider did not return a valid email address. Please ensure the provider is configured with the correct scopes.');
  }

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
    await db.oAuthAccount.update({
      where: { id: existingAccount.id },
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiry: new Date(Date.now() + tokens.expiresIn * 1000),
        profileJson: JSON.stringify(providerUser),
        updatedAt: new Date(),
      },
    });
  } else {
    user = await db.user.findUnique({
      where: { email: providerUser.email },
    });

    if (user) {
      await db.oAuthAccount.create({
        data: {
          userId: user.id,
          providerId: providerConfig.id,
          provider,
          providerAccountId: providerUser.id,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiry: new Date(Date.now() + tokens.expiresIn * 1000),
          profileJson: JSON.stringify(providerUser),
        },
      });
    } else {
      const randomPassword = crypto.randomBytes(24).toString('hex');
      user = await db.user.create({
        data: {
          email: providerUser.email,
          passwordHash: await hashPassword(randomPassword),
          name: providerUser.name || providerUser.email.split('@')[0],
          role: 'viewer',
          isActive: true,
          oauthAccounts: {
            create: {
              providerId: providerConfig.id,
              provider,
              providerAccountId: providerUser.id,
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken,
              tokenExpiry: new Date(Date.now() + tokens.expiresIn * 1000),
              profileJson: JSON.stringify(providerUser),
            },
          },
        },
      });
    }
  }

  // Sessions carry expiry + idle timeout (see src/lib/auth.ts).
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

/** Browser-facing failure redirect — never echo untrusted URL material. */
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

  // ── Callback branch: the provider sent the user back with code + state. ──
  if (callbackCode && callbackState) {
    try {
      const statePayload = await consumeOAuthState(callbackState, provider);
      if (!statePayload) {
        // Invalid, expired, foreign, or already-consumed state.
        return redirectToLoginError(provider, requestOrigin);
      }

      const { user, sessionToken } = await completeOAuthCallback(provider, callbackCode, requestOrigin);

      const nextPath = sanitizeOAuthNextPath(statePayload.next) || '/dashboard';
      const target = `${resolveAppBaseUrl(requestOrigin)}${nextPath}`;
      const response = NextResponse.redirect(target);
      response.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions());
      return response;
    } catch (error) {
      console.error('OAuth callback error:', error);
      return redirectToLoginError(provider, requestOrigin);
    }
  }

  // ── Initiation branch: return { authorizationUrl, state } as JSON. ────────
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

    // `?next=` is captured here and carried through the state blob to the
    // callback; it is sanitized at consumption time, never trusted raw.
    const requestedNext = url.searchParams.get('next') || '';
    const state = await createOAuthState(provider, requestedNext);

    const url2 = new URL(providerConfig.authorizationUrl);
    url2.searchParams.set('response_type', 'code');
    url2.searchParams.set('client_id', providerConfig.clientId);
    // Absolute redirect_uri — providers reject relative URIs (RFC 6749 §3.1.2).
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

// POST: JSON callback API — exchange code for token, create/find user, create session.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider } = await params;
    const body = await request.json();
    const { code, state } = body;

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
    const { user, sessionToken } = await completeOAuthCallback(provider, code, requestOrigin);

    return NextResponse.json({
      user,
      token: sessionToken,
      // `next` is honored by API clients only when it is a safe in-app path.
      redirectTo: sanitizeOAuthNextPath(statePayload.next) || '/dashboard',
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const isProviderError = message.startsWith('Failed to reach OAuth')
      || message.startsWith('OAuth token exchange failed')
      || message.startsWith('OAuth userinfo request failed')
      || message.startsWith('OAuth provider did not return')
      || message.startsWith('OAuth provider is not fully configured')
      || message.includes('is not configured');
    return NextResponse.json(
      { error: message },
      { status: isProviderError ? 502 : 500 }
    );
  }
}
