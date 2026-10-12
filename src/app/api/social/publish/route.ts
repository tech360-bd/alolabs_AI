// ALO Labs AIOS — Social Publish API
// Publish content to one or more social platforms, with scheduling support

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth';
import type { SocialPlatform } from '@/lib/social/types';

// ─── Constants ─────────────────────────────────────────────────────────────────

const PUBLISHABLE_PLATFORMS = new Set<SocialPlatform>([
  'facebook',
  'instagram',
  'linkedin',
  'twitter',
  'youtube',
  'tiktok',
  'pinterest',
]);

const QUEUE_PREFIX = 'social:publish:queue:';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PublishRequest {
  content: string;
  platforms: SocialPlatform[];
  mediaUrls?: string[];
  mediaType?: 'image' | 'video';
  scheduledAt?: string; // ISO date string
  targeting?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

interface QueuedPost {
  id: string;
  content: string;
  platforms: SocialPlatform[];
  mediaUrls: string[];
  mediaType: string;
  scheduledAt: string | null;
  targeting: Record<string, string> | null;
  metadata: Record<string, unknown> | null;
  status: 'queued' | 'publishing' | 'completed' | 'failed';
  results: Array<{ platform: string; success: boolean; postId?: string; error?: string }>;
  createdAt: string;
  userId: string;
}

// ─── Helper: Get stored token data for a platform ──────────────────────────────

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

// ─── Helper: Publish to a single platform via API ──────────────────────────────

async function publishToPlatform(
  platform: SocialPlatform,
  accessToken: string,
  content: string,
  mediaUrls: string[],
  metadata?: Record<string, unknown>,
): Promise<{ success: boolean; postId?: string; error?: string }> {
  try {
    switch (platform) {
      case 'facebook': {
        const igUserId = metadata?.instagramBusinessAccount as string | undefined;
        const targetId = igUserId || metadata?.pageId as string | undefined;
        if (!targetId) {
          return { success: false, error: 'No page or IG account ID found' };
        }

        if (igUserId && mediaUrls.length > 0) {
          // Publish via Instagram container
          const isVideo = /\.mp4|\.mov/i.test(mediaUrls[0]);
          const containerBody: Record<string, unknown> = {
            access_token: accessToken,
            caption: content,
          };
          if (isVideo) {
            containerBody.media_type = 'REELS';
            containerBody.video_url = mediaUrls[0];
          } else {
            containerBody.image_url = mediaUrls[0];
          }

          const containerRes = await fetch(
            `https://graph.facebook.com/v18.0/${igUserId}/media`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(containerBody) },
          );
          const containerData = (await containerRes.json()) as { id?: string; error?: { message: string } };
          if (containerData.error) {
            return { success: false, error: containerData.error.message };
          }
          if (!containerData.id) {
            return { success: false, error: 'No container ID returned' };
          }

          const publishRes = await fetch(
            `https://graph.facebook.com/v18.0/${igUserId}/media_publish`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ creation_id: containerData.id, access_token: accessToken }),
            },
          );
          const publishData = (await publishRes.json()) as { id?: string; error?: { message: string } };
          if (publishData.error) {
            return { success: false, error: publishData.error.message };
          }
          return { success: true, postId: publishData.id };
        }

        // Regular Facebook post
        const fbRes = await fetch(
          `https://graph.facebook.com/v19.0/${targetId}/feed`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: content, access_token: accessToken }),
          },
        );
        const fbData = (await fbRes.json()) as { id?: string; error?: { message: string } };
        if (fbData.error) {
          return { success: false, error: fbData.error.message };
        }
        return { success: true, postId: fbData.id };
      }

      case 'instagram': {
        const igUserId = metadata?.igUserId as string | undefined;
        if (!igUserId) {
          return { success: false, error: 'No Instagram user ID found' };
        }
        if (mediaUrls.length === 0) {
          return { success: false, error: 'Instagram requires at least one media URL' };
        }

        const isVideo = /\.mp4|\.mov/i.test(mediaUrls[0]);
        const containerBody: Record<string, unknown> = {
          access_token: accessToken,
          caption: content,
        };
        if (isVideo) {
          containerBody.media_type = 'REELS';
          containerBody.video_url = mediaUrls[0];
        } else {
          containerBody.image_url = mediaUrls[0];
        }

        const containerRes = await fetch(
          `https://graph.facebook.com/v18.0/${igUserId}/media`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(containerBody) },
        );
        const containerData = (await containerRes.json()) as { id?: string; error?: { message: string } };
        if (containerData.error) {
          return { success: false, error: containerData.error.message };
        }
        if (!containerData.id) {
          return { success: false, error: 'No container ID returned' };
        }

        const publishRes = await fetch(
          `https://graph.facebook.com/v18.0/${igUserId}/media_publish`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ creation_id: containerData.id, access_token: accessToken }),
          },
        );
        const publishData = (await publishRes.json()) as { id?: string; error?: { message: string } };
        if (publishData.error) {
          return { success: false, error: publishData.error.message };
        }
        return { success: true, postId: publishData.id };
      }

      case 'linkedin': {
        const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            author: `urn:li:person:${metadata?.personId || ''}`,
            lifecycleState: 'PUBLISHED',
            specificContent: {
              'com.linkedin.ugc.ShareContent': {
                shareCommentary: { text: content },
                shareMediaCategory: mediaUrls.length > 0 ? 'IMAGE' : 'NONE',
                ...(mediaUrls.length > 0
                  ? { media: [{ status: 'READY', media: 'urn:li:digitalmediaAsset:' + mediaUrls[0] }] }
                  : {}),
              },
            },
            visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
          }),
        });
        if (!res.ok) {
          return { success: false, error: `LinkedIn API error: ${res.status}` };
        }
        const data = (await res.json()) as { id?: string };
        return { success: true, postId: data.id };
      }

      case 'twitter': {
        const tweetBody: Record<string, unknown> = { text: content };
        const res = await fetch('https://api.twitter.com/2/tweets', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(tweetBody),
        });
        const data = (await res.json()) as { data?: { id?: string }; error?: string };
        if (data.error) {
          return { success: false, error: data.error };
        }
        return { success: true, postId: data.data?.id };
      }

      case 'tiktok': {
        const res = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            post_info: {
              title: content.substring(0, 150),
              privacy_level: 'PUBLIC_TO_EVERYONE',
            },
            source_info: {
              source: 'PULL_FROM_URL',
              video_url: mediaUrls[0] || '',
            },
          }),
        });
        const data = (await res.json()) as { data?: { publish_id?: string }; error?: { code: string; message: string } };
        if (data.error) {
          return { success: false, error: `${data.error.code}: ${data.error.message}` };
        }
        return { success: true, postId: data.data?.publish_id };
      }

      case 'pinterest': {
        const res = await fetch('https://api.pinterest.com/v5/pins', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            board_id: metadata?.boardId || '',
            title: content.substring(0, 100),
            description: content,
            media_source: {
              source_type: 'image_url',
              url: mediaUrls[0] || '',
            },
          }),
        });
        if (!res.ok) {
          const err = (await res.json()) as { message?: string };
          return { success: false, error: err.message || `Pinterest API error: ${res.status}` };
        }
        const data = (await res.json()) as { id?: string };
        return { success: true, postId: data.id };
      }

      case 'youtube': {
        // YouTube upload requires multipart — store for async processing
        return {
          success: false,
          error: 'YouTube video upload requires async processing. Use the media upload endpoint.',
        };
      }

      default:
        return { success: false, error: `Platform ${platform} is not directly publishable` };
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: msg };
  }
}

// ─── POST: Publish content ─────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
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

    const body = (await request.json()) as PublishRequest;

    if (!body.content && (!body.mediaUrls || body.mediaUrls.length === 0)) {
      return NextResponse.json(
        { error: 'content or mediaUrls is required' },
        { status: 400 },
      );
    }

    if (!body.platforms || body.platforms.length === 0) {
      return NextResponse.json(
        { error: 'At least one platform is required' },
        { status: 400 },
      );
    }

    // Validate all platforms are publishable
    for (const p of body.platforms) {
      if (!PUBLISHABLE_PLATFORMS.has(p)) {
        return NextResponse.json(
          { error: `Platform ${p} is not supported for publishing` },
          { status: 400 },
        );
      }
    }

    // If scheduled, queue for later
    if (body.scheduledAt) {
      const scheduledDate = new Date(body.scheduledAt);
      if (scheduledDate <= new Date()) {
        return NextResponse.json({ error: 'scheduledAt must be in the future' }, { status: 400 });
      }

      const queueId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).substring(2)}`;
      const queuedPost: QueuedPost = {
        id: queueId,
        content: body.content,
        platforms: body.platforms,
        mediaUrls: body.mediaUrls || [],
        mediaType: body.mediaType || 'image',
        scheduledAt: body.scheduledAt,
        targeting: body.targeting || null,
        metadata: body.metadata || null,
        status: 'queued',
        results: [],
        createdAt: new Date().toISOString(),
        userId: session.userId,
      };

      await db.settings.create({
        data: {
          key: `${QUEUE_PREFIX}${queueId}`,
          value: JSON.stringify(queuedPost),
          type: 'json',
        },
      });

      // Audit log
      await db.auditLog.create({
        data: {
          userId: session.userId,
          action: 'social_post_scheduled',
          resource: 'social:publish',
          details: JSON.stringify({
            queueId,
            platforms: body.platforms,
            scheduledAt: body.scheduledAt,
          }),
        },
      });

      return NextResponse.json({
        success: true,
        scheduled: true,
        queueId,
        scheduledAt: body.scheduledAt,
        platforms: body.platforms,
      });
    }

    // Immediate publishing
    const results: Array<{ platform: string; success: boolean; postId?: string; error?: string }> = [];

    for (const platform of body.platforms) {
      const tokenData = await getPlatformToken(platform);
      if (!tokenData) {
        results.push({ platform, success: false, error: 'No token found. Connect account first.' });
        continue;
      }

      const result = await publishToPlatform(
        platform,
        tokenData.accessToken,
        body.content,
        body.mediaUrls || [],
        tokenData.metadata,
      );
      results.push({ platform, ...result });
    }

    const successCount = results.filter((r) => r.success).length;

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'social_post_publish',
        resource: 'social:publish',
        details: JSON.stringify({
          platforms: body.platforms,
          results: results.map((r) => ({ platform: r.platform, success: r.success })),
          mediaCount: (body.mediaUrls || []).length,
        }),
      },
    });

    return NextResponse.json({
      success: successCount > 0,
      results,
      published: successCount,
      failed: results.length - successCount,
      total: results.length,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Social publish POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── GET: List queued/scheduled posts ───────────────────────────────────────────

export async function GET() {
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

    const allSettings = await db.settings.findMany({
      where: { key: { startsWith: QUEUE_PREFIX } },
      orderBy: { createdAt: 'desc' },
    });

    const posts: QueuedPost[] = [];
    for (const setting of allSettings) {
      try {
        const post = JSON.parse(setting.value) as QueuedPost;
        posts.push(post);
      } catch {
        // Skip malformed entries
      }
    }

    return NextResponse.json({
      data: posts,
      total: posts.length,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Social publish GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}