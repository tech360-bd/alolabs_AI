import { getPlatformToken } from '@/lib/social/platform-token';
import { canManageSocial } from '@/lib/social/credentials';
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

// ─── Platform-specific analytics fetchers ──────────────────────────────────────

async function fetchFacebookAnalytics(
  accessToken: string,
  pageId: string,
  since: number,
  until: number,
): Promise<Record<string, unknown>> {
  const metrics = 'page_fans,page_follows,page_impressions,page_post_engagements,page_views_total';
  const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(pageId)}/insights?metric=${metrics}&period=day&since=${since}&until=${until}`;

  const res = await fetch(url, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
  });
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
  const url = `https://graph.facebook.com/v18.0/${encodeURIComponent(igUserId)}/insights?metric=${metrics}&period=day&since=${since}&until=${until}`;

  const res = await fetch(url, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
  });
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
      `https://graph.facebook.com/v18.0/${encodeURIComponent(igUserId)}?fields=username,name,account_type,followers_count,media_count`,
      { headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` } },
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

type AnalyticsFetcher = (
  platform: SocialPlatform,
  accessToken: string,
  metadata: Record<string, unknown> | undefined,
  since: number,
  until: number,
) => Promise<Record<string, unknown>>;

/**
 * Exported so the provider error-mapping contract can be tested with a
 * stub fetcher (no live provider account or outbound network needed).
 */
async function getHeaderStore(request: NextRequest) {
  try {
    return await (await import('next/headers')).headers();
  } catch {
    return request.headers;
  }
}

export async function handleSocialAnalytics(
  request: NextRequest,
  fetchForPlatform: AnalyticsFetcher = fetchAnalyticsForPlatform,
) {
  try {
    const authHeader = await getHeaderStore(request);
    const authorization = authHeader.get('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authorization.substring(7);
    const session = await verifySessionToken(token);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!canManageSocial(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform') as SocialPlatform | null;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    // `fetchAll` is the documented query parameter; `all` is kept as an
    // alias so existing bookmarks from the API reference keep working.
    const fetchAll =
      searchParams.get('fetchAll') === 'true' || searchParams.get('all') === 'true';

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
          if (!tokenData) {
            results.push({
              platform: p,
              period,
              data: { error: 'No connected account' },
              fetchedAt: new Date().toISOString(),
            });
            continue;
          }

          const data = await fetchForPlatform(p, tokenData.accessToken, tokenData.metadata, since, until);
          results.push({ platform: p, period, data, fetchedAt: new Date().toISOString() });
        } catch (error: unknown) {
          let status = 500;
          let errorMessage = 'Internal server error';
          
          if (error instanceof Error) {
            const msg = error.message.toLowerCase();
            if (msg.includes('authentication failure')) { status = 401; errorMessage = 'Authentication failure'; }
            else if (msg.includes('permission failure')) { status = 403; errorMessage = 'Permission failure'; }
            else if (msg.includes('rate limit')) { status = 429; errorMessage = 'Rate limit exceeded'; }
            else if (msg.includes('provider unavailable')) { status = 503; errorMessage = 'Provider unavailable'; }
            else if (msg.includes('timeout')) { status = 504; errorMessage = 'Request timeout'; }
            else if (msg.includes('invalid json') || msg.includes('invalid response shape')) { status = 400; errorMessage = 'Invalid provider response'; }
            else if (msg.includes('network error') || msg.includes('unknown')) { status = 502; errorMessage = 'Provider network error'; }
          }

          results.push({
            platform: p,
            period,
            data: { error: errorMessage, code: status },
            fetchedAt: new Date().toISOString(),
          });
        }
      }

      // Audit log
      try {
        await db.auditLog.create({
        data: {
          userId: session.userId,
          action: 'social_analytics_fetch',
          resource: 'social:analytics',
          details: JSON.stringify({ platforms: results.map((r) => r.platform), period }),
        },
      });
      } catch { /* audit write is best-effort; never fail the request */ }

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

    let data: Record<string, unknown>;
    try {
      data = await fetchForPlatform(platform, tokenData.accessToken, tokenData.metadata, since, until);
    } catch (error: unknown) {
      let status = 500;
      let errorMessage = 'Internal server error';
      
      if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('authentication failure')) { status = 401; errorMessage = 'Authentication failure'; }
        else if (msg.includes('permission failure')) { status = 403; errorMessage = 'Permission failure'; }
        else if (msg.includes('rate limit')) { status = 429; errorMessage = 'Rate limit exceeded'; }
        else if (msg.includes('provider unavailable')) { status = 503; errorMessage = 'Provider unavailable'; }
        else if (msg.includes('timeout')) { status = 504; errorMessage = 'Request timeout'; }
        else if (msg.includes('invalid json') || msg.includes('invalid response shape')) { status = 400; errorMessage = 'Invalid provider response'; }
        else if (msg.includes('network error') || msg.includes('unknown')) { status = 502; errorMessage = 'Provider network error'; }
      }

      // Audit log
      try {
        await db.auditLog.create({
        data: {
          userId: session.userId,
          action: 'social_analytics_fetch',
          resource: `social:${platform}`,
          details: JSON.stringify({ platform, period, error: errorMessage }),
        },
      });
      } catch { /* audit write is best-effort; never fail the request */ }

      return NextResponse.json({ error: errorMessage }, { status });
    }

    // Audit log
    try {
      await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'social_analytics_fetch',
        resource: `social:${platform}`,
        details: JSON.stringify({ platform, period }),
      },
    });
    } catch { /* audit write is best-effort; never fail the request */ }

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

/** GET /api/social/analytics — thin route entry point. */
export async function GET(request: NextRequest) {
  return handleSocialAnalytics(request);
}

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
