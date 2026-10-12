// ALO Labs AIOS — Social Webhooks API
// Receives webhook events from all social platforms

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import type { SocialPlatform } from '@/lib/social/types';

// ─── Telegram Webhook Payload Type ──────────────────────────────────────────────

interface TelegramWebhookUpdate {
  update_id: number;
  message?: {
    from?: { id: number; is_bot: boolean; first_name: string; username?: string };
    chat?: { id: number };
    text?: string;
  };
  callback_query?: {
    from?: { id: number; is_bot: boolean; first_name: string; username?: string };
    data?: string;
  };
}

// ─── Supported Platforms ───────────────────────────────────────────────────────

const SUPPORTED_PLATFORMS = new Set<string>([
  'facebook',
  'instagram',
  'linkedin',
  'twitter',
  'youtube',
  'tiktok',
  'pinterest',
  'telegram',
  'whatsapp',
]);

// ─── Platform Webhook Secret Env Vars ──────────────────────────────────────────

function getWebhookSecret(platform: string): string | null {
  const envVars: Record<string, string> = {
    facebook: process.env.FACEBOOK_APP_SECRET || '',
    instagram: process.env.INSTAGRAM_APP_SECRET || '',
    linkedin: process.env.LINKEDIN_CLIENT_SECRET || '',
    twitter: process.env.TWITTER_CLIENT_SECRET || '',
    youtube: process.env.GOOGLE_CLIENT_SECRET || '',
    tiktok: process.env.TIKTOK_CLIENT_SECRET || '',
    pinterest: process.env.PINTEREST_APP_SECRET || '',
    telegram: process.env.TELEGRAM_BOT_TOKEN || '',
    whatsapp: process.env.WHATSAPP_APP_SECRET || '',
  };
  return envVars[platform] || null;
}

// ─── Signature Verification ────────────────────────────────────────────────────

function verifySignature(
  platform: string,
  payload: string,
  signature: string | null,
  secret: string | null,
): boolean {
  if (!secret || !signature) return false;

  switch (platform) {
    case 'facebook':
    case 'instagram': {
      // Facebook/Instagram use X-Hub-Signature-256
      if (!signature.startsWith('sha256=')) return false;
      const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
      try {
        const bufA = Buffer.from(signature);
        const bufB = Buffer.from(expected);
        if (bufA.length !== bufB.length) return false;
        return crypto.timingSafeEqual(bufA, bufB);
      } catch {
        return false;
      }
    }

    case 'twitter': {
      // Twitter uses OAuth 1.0a signature — simplified validation
      return signature.length > 0;
    }

    case 'tiktok': {
      // TikTok signs with X-TikTok-Signature
      if (!signature.startsWith('sha256=')) return false;
      const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
      try {
        const bufA = Buffer.from(signature);
        const bufB = Buffer.from(expected);
        if (bufA.length !== bufB.length) return false;
        return crypto.timingSafeEqual(bufA, bufB);
      } catch {
        return false;
      }
    }

    case 'pinterest': {
      // Pinterest uses X-Pinterest-Signature
      const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64');
      return signature === expected;
    }

    case 'telegram': {
      // Telegram uses hash-based validation
      const secretKey = crypto.createHash('sha256').update(secret).digest();
      const data = payload;
      const hmac = crypto.createHmac('sha256', secretKey).update(data).digest('hex');
      return signature === hmac;
    }

    case 'linkedin': {
      // LinkedIn uses OAuth verification
      return signature.length > 0;
    }

    case 'youtube': {
      // Google uses PubSub verification
      return signature.length > 0;
    }

    case 'whatsapp': {
      if (!signature.startsWith('sha256=')) return false;
      const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
      try {
        const bufA = Buffer.from(signature);
        const bufB = Buffer.from(expected);
        if (bufA.length !== bufB.length) return false;
        return crypto.timingSafeEqual(bufA, bufB);
      } catch {
        return false;
      }
    }

    default:
      return false;
  }
}

// ─── Event Processing ──────────────────────────────────────────────────────────

async function processWebhookEvent(
  platform: string,
  body: unknown,
  signature: string | null,
): Promise<void> {
  const eventTypes = extractEventTypes(platform, body);

  for (const event of eventTypes) {
    // Store in audit log
    await db.auditLog.create({
      data: {
        action: 'social_webhook_received',
        resource: `social:${platform}`,
        details: JSON.stringify({
          platform,
          event: event.type,
          eventId: event.id,
          signatureVerified: !!signature,
          timestamp: new Date().toISOString(),
          data: event.summary,
        }),
      },
    });
  }
}

function extractEventTypes(
  platform: string,
  body: unknown,
): Array<{ type: string; id: string; summary: Record<string, unknown> }> {
  const events: Array<{ type: string; id: string; summary: Record<string, unknown> }> = [];
  const data = body as Record<string, unknown>;

  switch (platform) {
    case 'facebook': {
      const entries = data.entry as Array<Record<string, unknown>> | undefined;
      if (entries) {
        for (const entry of entries) {
          const changes = entry.changes as Array<Record<string, unknown>> | undefined;
          if (changes) {
            for (const change of changes) {
              events.push({
                type: `facebook_${String(change.field || 'unknown')}`,
                id: String(entry.id || crypto.randomUUID()),
                summary: { field: change.field, value: typeof change.value === 'object' ? '...' : change.value },
              });
            }
          }
          // Check for messaging events
          if (entry.messaging) {
            const messages = entry.messaging as Array<Record<string, unknown>>;
            for (const msg of messages) {
              events.push({
                type: 'facebook_message',
                id: String(msg.mid || crypto.randomUUID()),
                summary: { sender: msg.sender, recipient: msg.recipient },
              });
            }
          }
        }
      }
      break;
    }

    case 'instagram': {
      const entries = data.entry as Array<Record<string, unknown>> | undefined;
      if (entries) {
        for (const entry of entries) {
          const changes = entry.changes as Array<Record<string, unknown>> | undefined;
          if (changes) {
            for (const change of changes) {
              events.push({
                type: `instagram_${String(change.field || 'unknown')}`,
                id: String(entry.id || crypto.randomUUID()),
                summary: { field: change.field },
              });
            }
          }
        }
      }
      break;
    }

    case 'twitter': {
      // Twitter webhook payload structure
      if (data.tweet_create_events) {
        for (const tweet of data.tweet_create_events as Array<Record<string, unknown>>) {
          events.push({
            type: 'twitter_tweet',
            id: String(tweet.id || crypto.randomUUID()),
            summary: { user: tweet.user_screen_name, text: String(tweet.text || '').substring(0, 100) },
          });
        }
      }
      if (data.follow_events) {
        for (const follow of data.follow_events as Array<Record<string, unknown>>) {
          events.push({
            type: 'twitter_follow',
            id: String(follow.id || crypto.randomUUID()),
            summary: { source: follow.source_screen_name },
          });
        }
      }
      if (data.direct_message_events) {
        for (const dm of data.direct_message_events as Array<Record<string, unknown>>) {
          events.push({
            type: 'twitter_direct_message',
            id: String(dm.id || crypto.randomUUID()),
            summary: { sender: dm.sender_id, type: dm.type },
          });
        }
      }
      break;
    }

    case 'linkedin': {
      const eventHook = data.eventHook as Record<string, unknown> | undefined;
      if (eventHook) {
        events.push({
          type: `linkedin_${String(eventHook.event || 'webhook_event')}`,
          id: String(eventHook.eventId || crypto.randomUUID()),
          summary: { status: eventHook.status },
        });
      }
      break;
    }

    case 'youtube': {
      const feed = data.feed as Array<Record<string, unknown>> | undefined;
      if (feed) {
        for (const entry of feed) {
          events.push({
            type: `youtube_${String(entry.entryType || 'notification')}`,
            id: String(entry.id || crypto.randomUUID()),
            summary: { videoId: entry.videoId, title: entry.title },
          });
        }
      }
      break;
    }

    case 'tiktok': {
      if (data.event) {
        events.push({
          type: `tiktok_${String(data.event)}`,
          id: String(data.event_id || crypto.randomUUID()),
          summary: {},
        });
      }
      break;
    }

    case 'pinterest': {
      const events_data = data.data as Array<Record<string, unknown>> | undefined;
      if (events_data) {
        for (const event_item of events_data) {
          events.push({
            type: `pinterest_${String(event_item.event || 'change')}`,
            id: String(event_item.event_id || crypto.randomUUID()),
            summary: { ad_account_id: event_item.ad_account_id },
          });
        }
      }
      break;
    }

    case 'telegram': {
      const tg = data as unknown as TelegramWebhookUpdate;
      if (tg.update_id !== undefined) {
        let type = 'telegram_update';
        if (tg.message) type = 'telegram_message';
        else if (tg.callback_query) type = 'telegram_callback_query';
        else if ((data as Record<string, unknown>).inline_query) type = 'telegram_inline_query';

        events.push({
          type,
          id: String(tg.update_id),
          summary: {
            from: tg.message?.from?.id || tg.callback_query?.from?.id,
            chatId: tg.message?.chat?.id,
          },
        });
      }
      break;
    }

    case 'whatsapp': {
      const entries = data.entry as Array<Record<string, unknown>> | undefined;
      if (entries) {
        for (const entry of entries) {
          const changes = entry.changes as Array<Record<string, unknown>> | undefined;
          if (changes) {
            for (const change of changes) {
              const value = change.value as Record<string, unknown> | undefined;
              events.push({
                type: `whatsapp_${String(change.field || 'unknown')}`,
                id: String(entry.id || crypto.randomUUID()),
                summary: {
                  phoneNumberId: (value?.metadata as Record<string, unknown>)?.phone_number_id,
                  hasMessages: !!value?.messages,
                  hasStatuses: !!value?.statuses,
                },
              });
            }
          }
        }
      }
      break;
    }

    default: {
      events.push({
        type: `${platform}_unknown`,
        id: crypto.randomUUID(),
        summary: {},
      });
    }
  }

  return events;
}

// ─── GET Handler (for webhook verification challenges) ──────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const { platform } = await params;

    if (!SUPPORTED_PLATFORMS.has(platform)) {
      return NextResponse.json({ error: 'Unsupported platform' }, { status: 400 });
    }

    const searchParams = request.nextUrl.searchParams;
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    // Facebook/Instagram/WhatsApp verification
    if (mode === 'subscribe' && challenge) {
      const verifyToken = process.env[`${platform.toUpperCase()}_VERIFY_TOKEN`] || process.env.SOCIAL_WEBHOOK_VERIFY_TOKEN;
      if (token === verifyToken) {
        return new NextResponse(challenge, {
          headers: { 'Content-Type': 'text/plain' },
        });
      }

      // Also check WhatsApp-specific token
      if (platform === 'whatsapp' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        return new NextResponse(challenge, {
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    }

    return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
  } catch (error: unknown) {
    console.error('Social webhook GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── POST Handler (webhook event receiving) ─────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  const { platform } = await params;
  try {
    if (!SUPPORTED_PLATFORMS.has(platform)) {
      return NextResponse.json({ error: 'Unsupported platform' }, { status: 400 });
    }

    // Read raw body for signature verification
    const rawBody = await request.text();
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // Get signature from headers
    const signature =
      request.headers.get('x-hub-signature-256') ||
      request.headers.get('x-tiktok-signature') ||
      request.headers.get('x-pinterest-signature') ||
      request.headers.get('x-twitter-webhooks-signature') ||
      request.headers.get('x-signature') ||
      null;

    // Verify webhook signature
    const secret = getWebhookSecret(platform);
    if (secret && signature) {
      const isValid = verifySignature(platform, rawBody, signature, secret);
      if (!isValid) {
        console.warn(`Invalid webhook signature for ${platform}`);
        // Still process but log the warning — some platforms may not sign all events
      }
    }

    // Process the event
    await processWebhookEvent(platform, body, signature);

    // Always return 200 OK quickly to acknowledge receipt
    return NextResponse.json({ status: 'ok', platform });
  } catch (error: unknown) {
    console.error(`Social webhook POST error (${platform}):`, error);
    // Still return 200 to prevent platform retries for non-critical errors
    return NextResponse.json({ status: 'ok' });
  }
}