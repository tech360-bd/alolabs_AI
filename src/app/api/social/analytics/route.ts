// ALO Labs AIOS — Social Analytics API
// Fetch analytics for connected social platforms with date range filtering

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth';
import type { SocialPlatform } from '@/lib/social/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnalyticsResponse {
  platform: SocialPlatform;
  period: { start: string; end: string };
  data: Record<string, unknown>;
  fetchedAt: string;
}

// ─── Helper: Get stored token data ─────────────────────────────────────────────

async function getPlatformToken(platform: SocialPlatform): Promise<{
  accessToken: string;
  refreshToken?: string;
  metadata?: Record<string, unknown>;
} | null> {
  const setting = await db.settings.findUnique({
    where: { key: `social:${platform}:token` },
  });

  if (!setting) return null;

  try {
    const data = JSON.parse(setting.value);
    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken || undefined,
      metadata: data.metadata || undefined,
    };
  } catch {
    return null;
  }
}

// ─── Platform-specific analytics fetchers ──────────────────────────────────────

async function fetchFacebookAnalytics(
  accessToken: string,
  pageId: string,
  since: number,
  until: number,
): Promise<Record<string, unknown>> {
  const metrics = 'page_fans,page_follows,page_impressions,page_post_engagements,page_views_total';
  const url = `https://graph.facebook.com/v19.0/${pageId}/insights?metric=${metrics}&period=day&since=${since}&until=${until}&access_token=${accessToken}`;

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Facebook insights API error: ${res.status}`);
  const data = (await res.json()) as { data: Array<{ name: string; values: Array<{ value: number; end_time: string }> }> };

  const result: Record<string, unknown> = {};
  for (const insight of data.data) {
    const latest = insight.values[insight.values.length - 1];
    if (latest) {
      result[insight.name] = latest.value;
    }
  }
  return result;
}

async function fetchInstagramAnalytics(
  accessToken: string,
  igUserId: string,
  since: number,
  until: number,
): Promise<Record<string, unknown>> {
  const metrics = 'impressions,reach,engagement,follower_count,comments,likes,saves,shares';
  const url = `https://graph.facebook.com/v18.0/${igUserId}/insights?metric=${metrics}&period=day&since=${since}&until=${until}&access_token=${accessToken}`;

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Instagram insights API error: ${res.status}`);
  const data = (await res.json()) as { data: Array<{ name: string; values: Array<{ value: number; end_time: string }> }> };

  const result: Record<string, unknown> = {};
  for (const insight of data.data) {
    const total = insight.values.reduce((sum, v) => sum + (typeof v.value === 'number' ? v.value : 0), 0);
    result[insight.name] = total;
  }

  // Also fetch user info
  try {
    const userRes = await fetch(
      `https://graph.facebook.com/v18.0/${igUserId}?fields=username,name,account_type,followers_count,media_count&access_token=${accessToken}`,
      { headers: { Accept: 'application/json' } },
    );
    if (userRes.ok) {
      const userData = (await userRes.json()) as Record<string, unknown>;
      result.user = userData;
    }
  } catch { /* ignore */ }

  return result;
}

async function fetchTwitterAnalytics(
  accessToken: string,
  userId: string,
  _since: number,
  _until: number,
): Promise<Record<string, unknown>> {
  const url = `https://api.twitter.com/2/users/${userId}?user.fields=public_metrics,profile_image_url,description,created_at`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Twitter API error: ${res.status}`);
  const data = (await res.json()) as { data?: { public_metrics?: Record<string, number> } };

  return data.data?.public_metrics || {};
}

async function fetchLinkedInAnalytics(
  accessToken: string,
  organizationId: string,
  _since: number,
  _until: number,
): Promise<Record<string, unknown>> {
  const url = `https://api.linkedin.com/v2/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${organizationId}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`LinkedIn API error: ${res.status}`);

  const data = (await res.json()) as Record<string, unknown>;
  return data;
}

async function fetchYouTubeAnalytics(
  accessToken: string,
  _since: number,
  _until: number,
): Promise<Record<string, unknown>> {
  // Channel statistics
  const channelRes = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&mine=true',
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!channelRes.ok) throw new Error(`YouTube API error: ${channelRes.status}`);
  const channelData = (await channelRes.json()) as { items: Array<{ statistics: Record<string, string | number>; snippet: Record<string, string> }> };

  return channelData.items?.[0]?.statistics || {};
}

async function fetchTikTokAnalytics(
  accessToken: string,
  _since: number,
  _until: number,
): Promise<Record<string, unknown>> {
  const res = await fetch('https://open.tiktokapis.com/v2/user/info/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ fields: ['display_name', 'follower_count', 'following_count', 'likes_count', 'video_count'] }),
  });

  if (!res.ok) throw new Error(`TikTok API error: ${res.status}`);
  const data = (await res.json()) as { data?: { user?: Record<string, unknown> } };
  return data.data?.user || {};
}

async function fetchPinterestAnalytics(
  accessToken: string,
  _since: number,
  _until: number,
): Promise<Record<string, unknown>> {
  const res = await fetch('https://api.pinterest.com/v5/user_account', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Pinterest API error: ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;
  return data;
}

// ─── GET: Fetch analytics ──────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const authHeader = await (await import('next/headers')).headers();
    const authorization = authHeader.get('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authorization.substring(7);
    const session = await verifySessionToken(token);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform') as SocialPlatform | null;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const fetchAll = searchParams.get('all') === 'true';

    // Parse date range
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000); // Default 30 days

    if (start > end) {
      return NextResponse.json({ error: 'startDate must be before endDate' }, { status: 400 });
    }

    const since = Math.floor(start.getTime() / 1000);
    const until = Math.floor(end.getTime() / 1000);

    const period = { start: start.toISOString(), end: end.toISOString() };

    // If fetching all connected platforms
    if (fetchAll || !platform) {
      const allPlatforms: SocialPlatform[] = ['facebook', 'instagram', 'twitter', 'linkedin', 'youtube', 'tiktok', 'pinterest'];
      const results: AnalyticsResponse[] = [];

      for (const p of allPlatforms) {
        try {
          const tokenData = await getPlatformToken(p);
          if (!tokenData) continue;

          const data = await fetchAnalyticsForPlatform(p, tokenData.accessToken, tokenData.metadata, since, until);
          results.push({ platform: p, period, data, fetchedAt: new Date().toISOString() });
        } catch (error: unknown) {
          results.push({
            platform: p,
            period,
            data: { error: error instanceof Error ? error.message : 'Failed to fetch' },
            fetchedAt: new Date().toISOString(),
          });
        }
      }

      // Audit log
      await db.auditLog.create({
        data: {
          userId: session.userId,
          action: 'social_analytics_fetch',
          resource: 'social:analytics',
          details: JSON.stringify({ platforms: results.map((r) => r.platform), period }),
        },
      });

      return NextResponse.json({
        data: results,
        period,
        total: results.length,
      });
    }

    // Fetch for specific platform
    const validPlatforms: SocialPlatform[] = ['facebook', 'instagram', 'twitter', 'linkedin', 'youtube', 'tiktok', 'pinterest'];
    if (!validPlatforms.includes(platform)) {
      return NextResponse.json(
        { error: `Invalid platform. Supported: ${validPlatforms.join(', ')}` },
        { status: 400 },
      );
    }

    const tokenData = await getPlatformToken(platform);
    if (!tokenData) {
      return NextResponse.json({ error: `No connected account for ${platform}` }, { status: 404 });
    }

    const data = await fetchAnalyticsForPlatform(platform, tokenData.accessToken, tokenData.metadata, since, until);

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'social_analytics_fetch',
        resource: `social:${platform}`,
        details: JSON.stringify({ platform, period }),
      },
    });

    return NextResponse.json({
      platform,
      period,
      data,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Social analytics GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── Analytics dispatcher ──────────────────────────────────────────────────────

async function fetchAnalyticsForPlatform(
  platform: SocialPlatform,
  accessToken: string,
  metadata: Record<string, unknown> | undefined,
  since: number,
  until: number,
): Promise<Record<string, unknown>> {
  switch (platform) {
    case 'facebook': {
      const pageId = metadata?.pageId as string | undefined;
      if (!pageId) throw new Error('No Facebook page ID found in account metadata');
      return fetchFacebookAnalytics(accessToken, pageId, since, until);
    }

    case 'instagram': {
      const igUserId = metadata?.igUserId as string | undefined;
      if (!igUserId) throw new Error('No Instagram user ID found in account metadata');
      return fetchInstagramAnalytics(accessToken, igUserId, since, until);
    }

    case 'twitter': {
      const userId = metadata?.userId as string | undefined;
      if (!userId) throw new Error('No Twitter user ID found in account metadata');
      return fetchTwitterAnalytics(accessToken, userId, since, until);
    }

    case 'linkedin': {
      const orgId = metadata?.organizationId as string | undefined;
      if (!orgId) throw new Error('No LinkedIn organization ID found in account metadata');
      return fetchLinkedInAnalytics(accessToken, orgId, since, until);
    }

    case 'youtube': {
      return fetchYouTubeAnalytics(accessToken, since, until);
    }

    case 'tiktok': {
      return fetchTikTokAnalytics(accessToken, since, until);
    }

    case 'pinterest': {
      return fetchPinterestAnalytics(accessToken, since, until);
    }

    default:
      throw new Error(`Analytics not supported for platform: ${platform}`);
  }
}