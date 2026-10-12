// ALO Labs AIOS — Social OAuth Callback API
// Handles OAuth callback for all 9 social platforms

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth';
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
  'telegram',
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
    telegram: () => {
      const id = process.env.TELEGRAM_BOT_ID;
      const secret = process.env.TELEGRAM_BOT_TOKEN;
      if (!id || !secret) return null;
      return {
        clientId: id,
        clientSecret: secret,
        redirectUri: process.env.TELEGRAM_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/social/oauth/telegram`,
        scopes: [],
        authUrl: 'https://oauth.telegram.org/auth',
        tokenUrl: 'https://oauth.telegram.org/auth/token',
        apiUrl: 'https://api.telegram.org/bot',
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

async function exchangeToken(platform: SocialPlatform, code: string, config: OAuthConfig): Promise<{
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
      const response = await fetch(`${config.tokenUrl}?${params.toString()}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`Token exchange failed: ${response.status}`);
      const data = (await response.json()) as { access_token: string; token_type: string; expires_in: number; error?: { message: string } };
      if (data.error) throw new Error(data.error.message);

      // Get user info
      let userId = '';
      let username = '';
      try {
        const meRes = await fetch(`${config.apiUrl}/me?access_token=${data.access_token}`, {
          headers: { Accept: 'application/json' },
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
          code_verifier: 'challenge', // Should be stored in session
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
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        body: JSON.stringify({
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
      params.set('grant_type', 'authorization_code');
      const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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

    case 'telegram': {
      // Telegram uses a different auth model (widget/login)
      return {
        accessToken: code,
        expiresIn: 86400,
      };
    }

    default: {
      throw new Error(`Unsupported platform: ${platform}`);
    }
  }
}

// ─── GET Handler: OAuth Callback ───────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    const { provider: providerParam } = await params;
    const platform = providerParam as SocialPlatform;

    // Validate platform
    if (!SUPPORTED_PLATFORMS.includes(platform)) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || '/';
      return NextResponse.redirect(
        `${appUrl}/settings/integrations?error=unsupported_platform&platform=${platform}`,
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Handle OAuth error
    if (error) {
      console.error(`OAuth error for ${platform}:`, error, errorDescription);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || '/';
      return NextResponse.redirect(
        `${appUrl}/settings/integrations?error=${encodeURIComponent(error)}&description=${encodeURIComponent(errorDescription || '')}&platform=${platform}`,
      );
    }

    if (!code) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || '/';
      return NextResponse.redirect(
        `${appUrl}/settings/integrations?error=no_code&platform=${platform}`,
      );
    }

    // Verify session from state if provided
    let userId = '';
    if (state) {
      try {
        const sessionData = await verifySessionToken(state);
        if (sessionData) {
          userId = sessionData.userId;
        }
      } catch {
        // State may not be a session token; try to extract userId from state
        try {
          const stateData = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
          userId = stateData.userId || '';
        } catch {
          // Continue without userId
        }
      }
    }

    // Get OAuth config for platform
    const oauthConfig = getPlatformOAuthConfig(platform);
    if (!oauthConfig) {
      console.error(`No OAuth config found for platform: ${platform}`);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || '/';
      return NextResponse.redirect(
        `${appUrl}/settings/integrations?error=config_missing&platform=${platform}`,
      );
    }

    // Exchange code for token
    const tokenData = await exchangeToken(platform, code, oauthConfig);

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

    await db.settings.upsert({
      where: { key: `social:${platform}:token` },
      update: {
        value: JSON.stringify(tokenPayload),
        type: 'json',
        updatedAt: new Date(),
      },
      create: {
        key: `social:${platform}:token`,
        value: JSON.stringify(tokenPayload),
        type: 'json',
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

    // Redirect back to app with success
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '/';
    return NextResponse.redirect(
      `${appUrl}/settings/integrations?success=true&platform=${platform}&username=${encodeURIComponent(tokenData.platformUsername || '')}`,
    );
  } catch (error: unknown) {
    console.error('Social OAuth callback error:', error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '/';
    return NextResponse.redirect(
      `${appUrl}/settings/integrations?error=internal&message=${encodeURIComponent(errorMsg)}`,
    );
  }
}