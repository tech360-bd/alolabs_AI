// ALO Labs AIOS — Social OAuth Callback API
// Telegram bot tokens use the credential API, not this OAuth code exchange.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/api-auth';
import { createLinkState, readLinkState, pendingLink, linkCookie, linkTtlSeconds } from '@/lib/social/link-state';
import { storeSocialCredential } from '@/lib/social/credentials';
import type { SocialPlatform, OAuthConfig } from '@/lib/social/types';

// ─── Supported Platforms ───────────────────────────────────────────────────────

const SUPPORTED_PLATFORMS: SocialPlatform[] = [
  'facebook',
  'instagram',
  'linkedin',
  'twitter',
  'youtube',
  'tiktok',
  'pinterest',
  'whatsapp',
];

// ─── Platform OAuth Configurations ─────────────────────────────────────────────

function getPlatformOAuthConfig(platform: SocialPlatform): OAuthConfig | null {
  const configs: Record<string, () => OAuthConfig | null> = {
    facebook: () => {
      const id = process.env.FACEBOOK_APP_ID;
      const secret = process.env.FACEBOOK_APP_SECRET;
      if (!id || !secret) return null;
      return {
        clientId: id,
        clientSecret: secret,
        redirectUri: process.env.FACEBOOK_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/social/oauth/facebook`,
        scopes: ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement', 'instagram_basic', 'instagram_content_publish'],
        authUrl: `https://www.facebook.com/v19.0/dialog/oauth`,
        tokenUrl: `https://graph.facebook.com/v19.0/oauth/access_token`,
        apiUrl: `https://graph.facebook.com/v19.0`,
      };
    },
    instagram: () => {
      const id = process.env.INSTAGRAM_APP_ID;
      const secret = process.env.INSTAGRAM_APP_SECRET;
      if (!id || !secret) return null;
      return {
        clientId: id,
        clientSecret: secret,
        redirectUri: process.env.INSTAGRAM_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/social/oauth/instagram`,
        scopes: ['instagram_basic', 'instagram_content_publish', 'pages_show_list', 'pages_manage_posts', 'pages_read_engagement'],
        authUrl: `https://www.facebook.com/v18.0/dialog/oauth`,
        tokenUrl: `https://graph.facebook.com/v18.0/oauth/access_token`,
        apiUrl: `https://graph.facebook.com/v18.0`,
      };
    },
    linkedin: () => {
      const id = process.env.LINKEDIN_CLIENT_ID;
      const secret = process.env.LINKEDIN_CLIENT_SECRET;
      if (!id || !secret) return null;
      return {
        clientId: id,
        clientSecret: secret,
        redirectUri: process.env.LINKEDIN_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/social/oauth/linkedin`,
        scopes: ['openid', 'profile', 'email', 'w_member_social', 'r_liteprofile', 'r_organization_social'],
        authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
        tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
        apiUrl: 'https://api.linkedin.com/v2',
      };
    },
    twitter: () => {
      const id = process.env.TWITTER_CLIENT_ID;
      const secret = process.env.TWITTER_CLIENT_SECRET;
      if (!id || !secret) return null;
      return {
        clientId: id,
        clientSecret: secret,
        redirectUri: process.env.TWITTER_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/social/oauth/twitter`,
        scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
        authUrl: 'https://twitter.com/i/oauth2/authorize',
        tokenUrl: 'https://api.twitter.com/2/oauth2/token',
        apiUrl: 'https://api.twitter.com/2',
      };
    },
    youtube: () => {
      const id = process.env.YOUTUBE_CLIENT_ID;
      const secret = process.env.YOUTUBE_CLIENT_SECRET;
      if (!id || !secret) return null;
      return {
        clientId: id,
        clientSecret: secret,
        redirectUri: process.env.YOUTUBE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/social/oauth/youtube`,
        scopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly', 'https://www.googleapis.com/auth/yt-analytics.readonly'],
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        apiUrl: 'https://www.googleapis.com/youtube/v3',
      };
    },
    tiktok: () => {
      const id = process.env.TIKTOK_CLIENT_KEY;
      const secret = process.env.TIKTOK_CLIENT_SECRET;
      if (!id || !secret) return null;
      return {
        clientId: id,
        clientSecret: secret,
        redirectUri: process.env.TIKTOK_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/social/oauth/tiktok`,
        scopes: ['user.info.basic', 'video.publish', 'video.list'],
        authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
        tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
        apiUrl: 'https://open.tiktokapis.com/v2',
      };
    },
    pinterest: () => {
      const id = process.env.PINTEREST_APP_ID;
      const secret = process.env.PINTEREST_APP_SECRET;
      if (!id || !secret) return null;
      return {
        clientId: id,
        clientSecret: secret,
        redirectUri: process.env.PINTEREST_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/social/oauth/pinterest`,
        scopes: ['boards:read', 'boards:write', 'pins:read', 'pins:write'],
        authUrl: 'https://api.pinterest.com/oauth/',
        tokenUrl: 'https://api.pinterest.com/v5/oauth/token',
        apiUrl: 'https://api.pinterest.com/v5',
      };
    },
    whatsapp: () => {
      const id = process.env.WHATSAPP_APP_ID;
      const secret = process.env.WHATSAPP_APP_SECRET;
      if (!id || !secret) return null;
      return {
        clientId: id,
        clientSecret: secret,
        redirectUri: process.env.WHATSAPP_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/social/oauth/whatsapp`,
        scopes: ['whatsapp_business_management', 'whatsapp_business_messaging'],
        authUrl: `https://www.facebook.com/v21.0/dialog/oauth`,
        tokenUrl: `https://graph.facebook.com/v21.0/oauth/access_token`,
        apiUrl: `https://graph.facebook.com/v21.0`,
      };
    },
  };

  const factory = configs[platform];
  return factory ? factory() : null;
}

// ─── Token Exchange Functions per Platform ──────────────────────────────────────

async function exchangeToken(platform: SocialPlatform, code: string, config: OAuthConfig, verifier: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  platformUserId?: string;
  platformUsername?: string;
  metadata?: Record<string, unknown>;
}> {
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    code,
  });

  switch (platform) {
    case 'facebook':
    case 'instagram':
    case 'whatsapp': {
      const response = await fetch(config.tokenUrl, {
        method: 'POST', body: params,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`Token exchange failed: ${response.status}`);
      const data = (await response.json()) as { access_token: string; token_type: string; expires_in: number; error?: { message: string } };
      if (data.error) throw new Error(data.error.message);

      // Get user info
      let userId = '';
      let username = '';
      try {
        const meRes = await fetch(`${config.apiUrl}/me`, {
          headers: { Accept: 'application/json', Authorization: `Bearer ${data.access_token}` },
        });
        if (meRes.ok) {
          const meData = (await meRes.json()) as { id: string; name: string };
          userId = meData.id;
          username = meData.name;
        }
      } catch { /* ignore */ }

      return {
        accessToken: data.access_token,
        expiresIn: data.expires_in,
        platformUserId: userId,
        platformUsername: username,
      };
    }

    case 'linkedin': {
      params.set('grant_type', 'authorization_code');
      const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      if (!response.ok) throw new Error(`Token exchange failed: ${response.status}`);
      const data = (await response.json()) as { access_token: string; refresh_token?: string; expires_in: number; error?: string; error_description?: string };
      if (data.error) throw new Error(data.error_description || data.error);

      let userId = '';
      let username = '';
      try {
        const meRes = await fetch(`${config.apiUrl}/userinfo`, {
          headers: { Authorization: `Bearer ${data.access_token}` },
        });
        if (meRes.ok) {
          const meData = (await meRes.json()) as { sub: string; name?: string; given_name?: string; family_name?: string };
          userId = meData.sub;
          username = meData.name || `${meData.given_name || ''} ${meData.family_name || ''}`.trim();
        }
      } catch { /* ignore */ }

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
        platformUserId: userId,
        platformUsername: username,
      };
    }

    case 'twitter': {
      const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          code,
          redirect_uri: config.redirectUri,
          grant_type: 'authorization_code',
          code_verifier: verifier,
        }).toString(),
      });
      if (!response.ok) throw new Error(`Token exchange failed: ${response.status}`);
      const data = (await response.json()) as { access_token: string; refresh_token?: string; expires_in: number; error?: string };
      if (data.error) throw new Error(data.error);

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
      };
    }

    case 'youtube': {
      const body = new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code',
      });
      const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      if (!response.ok) throw new Error(`Token exchange failed: ${response.status}`);
      const data = (await response.json()) as { access_token: string; refresh_token?: string; expires_in: number; error?: string };
      if (data.error) throw new Error(data.error);

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
      };
    }

    case 'tiktok': {
      const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cache-Control': 'no-cache',
        },
        body: new URLSearchParams({
          client_key: config.clientId,
          client_secret: config.clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: config.redirectUri,
        }),
      });
      if (!response.ok) throw new Error(`Token exchange failed: ${response.status}`);
      const data = (await response.json()) as { access_token: string; refresh_token?: string; expires_in: number; error?: string; error_description?: string };
      if (data.error) throw new Error(data.error_description || data.error);

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
      };
    }

    case 'pinterest': {
      params.delete('client_id');
      params.delete('client_secret');
      params.set('grant_type', 'authorization_code');
      const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}` },
        body: params.toString(),
      });
      if (!response.ok) throw new Error(`Token exchange failed: ${response.status}`);
      const data = (await response.json()) as { access_token: string; refresh_token?: string; expires_in: number; error?: string; message?: string };
      if (data.error) throw new Error(data.message || data.error);

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
      };
    }

    default: {
      throw new Error(`Unsupported platform: ${platform}`);
    }
  }
}

// Start a link from an authenticated admin POST. Never send a session token to
// the provider. The short-lived, encrypted cookie binds state and PKCE to this
// browser, operator and provider. The callback revalidates the actual session.
const admin = () => requireRole('admin', 'super_admin', 'platform_super_admin');
function oauthError(error: unknown) {
  const status = error instanceof Error && error.message === 'Unauthorized' ? 401 : error instanceof Error && error.message === 'Forbidden' ? 403 : 503;
  return NextResponse.json({ error: status === 401 ? 'Unauthorized' : status === 403 ? 'Forbidden' : 'Social connection unavailable' }, { status });
}
export async function POST(_request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const user = await admin();
    const { provider } = await params;
    if (!SUPPORTED_PLATFORMS.includes(provider as SocialPlatform)) return NextResponse.json({ error: 'Unsupported provider' }, { status: 400 });
    const config = getPlatformOAuthConfig(provider as SocialPlatform);
    if (!config) return NextResponse.json({ error: 'Provider not configured' }, { status: 503 });
    const { state, challenge, cookie } = createLinkState(user.userId, provider);
    const url = new URL(config.authUrl);
    url.searchParams.set(provider === 'tiktok' ? 'client_key' : 'client_id', config.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', config.redirectUri);
    url.searchParams.set('scope', config.scopes.join(provider === 'tiktok' ? ',' : ' '));
    url.searchParams.set('state', state);
    if (provider === 'twitter') {
      url.searchParams.set('code_challenge_method', 'S256');
      url.searchParams.set('code_challenge', challenge);
    }
    const { key, value } = pendingLink(user.userId, provider, state);
    // One outstanding intent per operator/provider across all app instances.
    await db.settings.upsert({ where: { key }, update: { value }, create: { key, value, type: 'oauth-state' } });
    const res = NextResponse.json({ authorizationUrl: url.href }, { headers: { 'Cache-Control': 'no-store' } });
    res.cookies.set(linkCookie, cookie, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: linkTtlSeconds, path: `/api/social/oauth/${provider}` });
    return res;
  } catch (err) { return oauthError(err); }
}

// ─── GET Handler: OAuth Callback ───────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    const { provider: providerParam } = await params;
    const platform = providerParam as SocialPlatform;

    const { userId } = await admin();
    if (!SUPPORTED_PLATFORMS.includes(platform)) return NextResponse.json({ error: 'Unsupported provider' }, { status: 400 });
    const query = request.nextUrl.searchParams;
    const state = query.get('state');
    const verifier = readLinkState(request.cookies.get(linkCookie)?.value, state, userId, platform);
    if (!state || !verifier || (await db.settings.deleteMany({ where: pendingLink(userId, platform, state) })).count !== 1) return NextResponse.json({ error: 'Invalid or expired account-link request' }, { status: 403 });
    const code = query.get('code');
    if (!code || query.has('error')) return NextResponse.json({ error: 'Provider did not authorize this account' }, { status: 400 });
    const config = getPlatformOAuthConfig(platform);
    if (!config) return NextResponse.json({ error: 'Provider not configured' }, { status: 503 });
    const tokenData = await exchangeToken(platform, code, config, verifier);
    if (!tokenData.accessToken) return NextResponse.json({ error: 'Provider returned no credential' }, { status: 502 });

    // Store token in database
    const tokenPayload = {
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken || null,
      expiresIn: tokenData.expiresIn || null,
      platformUserId: tokenData.platformUserId || null,
      platformUsername: tokenData.platformUsername || null,
      metadata: tokenData.metadata || null,
      connectedAt: new Date().toISOString(),
    };

    const value = storeSocialCredential(tokenPayload);
    await db.settings.upsert({
      where: { key: `social:${platform}:token` },
      update: {
        value,
        type: 'encrypted',
        updatedAt: new Date(),
      },
      create: {
        key: `social:${platform}:token`,
        value,
        type: 'encrypted',
      },
    });

    // Audit log
    if (userId) {
      await db.auditLog.create({
        data: {
          userId,
          action: 'social_oauth_connect',
          resource: `social:${platform}`,
          details: JSON.stringify({
            platform,
            platformUserId: tokenData.platformUserId,
            platformUsername: tokenData.platformUsername,
          }),
        },
      });
    }

    const res = NextResponse.redirect(new URL('/dashboard', request.nextUrl.origin));
    res.cookies.set(linkCookie, '', { maxAge: 0, path: `/api/social/oauth/${platform}` });
    return res;
  } catch (err) { return oauthError(err); }
}
