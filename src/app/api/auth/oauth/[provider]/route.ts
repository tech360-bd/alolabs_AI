import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { createSessionToken, hashPassword } from '@/lib/auth';

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

// GET: Initiate OAuth flow — return { authorizationUrl, state }
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider } = await params;

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

    const state = crypto.randomBytes(24).toString('hex');

    let scopes: string[] = [];
    try {
      scopes = JSON.parse(providerConfig.scopes);
    } catch {
      scopes = [];
    }

    const url = new URL(providerConfig.authorizationUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', providerConfig.clientId);
    url.searchParams.set('redirect_uri', `/api/auth/oauth/${provider}`);
    url.searchParams.set('scope', scopes.join(' '));
    url.searchParams.set('state', state);

    await db.settings.upsert({
      where: { key: `oauth_state:${state}` },
      update: { value: provider, updatedAt: new Date() },
      create: { key: `oauth_state:${state}`, value: provider, type: 'string' },
    });

    return NextResponse.json({
      authorizationUrl: url.toString(),
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

// POST: Handle OAuth callback — exchange code for token, create/find user, create session
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

    const stateRecord = await db.settings.findUnique({
      where: { key: `oauth_state:${state}` },
    });

    if (!stateRecord || stateRecord.value !== provider) {
      return NextResponse.json(
        { error: 'Invalid or expired OAuth state. Please restart the OAuth flow.' },
        { status: 400 }
      );
    }

    await db.settings.delete({
      where: { key: `oauth_state:${state}` },
    });

    const providerConfig = await db.oAuthProvider.findUnique({
      where: { provider },
    });

    if (!providerConfig) {
      return NextResponse.json(
        { error: `OAuth provider '${provider}' is not configured` },
        { status: 404 }
      );
    }

    const redirectUri = `/api/auth/oauth/${provider}`;
    const tokens = await exchangeAuthorizationCode(providerConfig, code, redirectUri);
    const providerUser = await fetchProviderUserInfo(providerConfig, tokens.accessToken);

    // Validate that we got usable user info
    if (!providerUser.email) {
      return NextResponse.json(
        { error: 'OAuth provider did not return a valid email address. Please ensure the provider is configured with the correct scopes.' },
        { status: 400 }
      );
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

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      token: sessionToken,
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const isProviderError = message.startsWith('Failed to reach OAuth')
      || message.startsWith('OAuth token exchange failed')
      || message.startsWith('OAuth userinfo request failed')
      || message.startsWith('OAuth provider did not return')
      || message.startsWith('OAuth provider is not fully configured');
    return NextResponse.json(
      { error: message },
      { status: isProviderError ? 502 : 500 }
    );
  }
}
