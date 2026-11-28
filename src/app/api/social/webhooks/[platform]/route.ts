// ALO Labs AIOS — Social Webhooks API
// Receives and cryptographically verifies webhook events from social platforms

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';

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

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function timingSafeEqualDigests(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hashB = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function getWebhookSecret(platform: string): string | null {
  const envVars: Record<string, string> = {
    facebook: process.env.FACEBOOK_APP_SECRET || '',
    instagram: process.env.INSTAGRAM_APP_SECRET || '',
    linkedin: process.env.LINKEDIN_CLIENT_SECRET || '',
    twitter: process.env.TWITTER_CLIENT_SECRET || '',
    youtube: process.env.YOUTUBE_WEBHOOK_SECRET || process.env.GOOGLE_CLIENT_SECRET || '',
    tiktok: process.env.TIKTOK_CLIENT_SECRET || '',
    pinterest: process.env.PINTEREST_APP_SECRET || '',
    telegram: process.env.TELEGRAM_WEBHOOK_SECRET || process.env.TELEGRAM_BOT_TOKEN || '',
    whatsapp: process.env.WHATSAPP_APP_SECRET || '',
  };
  return envVars[platform] || null;
}

function verifySignature(
  platform: string,
  payload: string,
  signature: string | null,
  secret: string | null,
  telegramSecretHeader: string | null,
): boolean {
  if (!secret) return false;

  switch (platform) {
    case 'facebook':
    case 'instagram':
    case 'whatsapp': {
      if (!signature || !signature.startsWith('sha256=')) return false;
      const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
      return timingSafeEqualStrings(signature, expected);
    }

    case 'twitter': {
      // Twitter Account Activity API signs x-twitter-webhooks-signature: sha256=<base64>
      if (!signature || !signature.startsWith('sha256=')) return false;
      const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('base64');
      return timingSafeEqualStrings(signature, expected);
    }

    case 'tiktok': {
      if (!signature) return false;
      if (signature.startsWith('sha256=')) {
        const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
        return timingSafeEqualStrings(signature, expected);
      }
      // TikTok timestamped signature format: t=<unix_ts>,s=<hex_hmac>
      const parts = Object.fromEntries(
        signature.split(',').map((seg) => {
          const [k, ...rest] = seg.trim().split('=');
          return [k, rest.join('=')];
        }),
      );
      if (parts.t && parts.s) {
        const ts = Number(parts.t);
        if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
        const expected = crypto
          .createHmac('sha256', secret)
          .update(`${parts.t}.${payload}`)
          .digest('hex');
        return timingSafeEqualStrings(parts.s, expected);
      }
      return false;
    }

    case 'pinterest': {
      if (!signature) return false;
      const expectedBase64 = crypto.createHmac('sha256', secret).update(payload).digest('base64');
      if (timingSafeEqualStrings(signature, expectedBase64)) return true;
      if (signature.startsWith('sha256=')) {
        const expectedHex = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
        return timingSafeEqualStrings(signature, expectedHex);
      }
      return false;
    }

    case 'telegram': {
      // Telegram Bot API sends X-Telegram-Bot-Api-Secret-Token header configured at setWebhook.
      if (telegramSecretHeader && process.env.TELEGRAM_WEBHOOK_SECRET) {
        return timingSafeEqualDigests(telegramSecretHeader, process.env.TELEGRAM_WEBHOOK_SECRET);
      }
      // Fallback: HMAC-SHA256 using sha256(botToken) as key
      if (!signature) return false;
      const secretKey = crypto.createHash('sha256').update(secret).digest();
      const expected = crypto.createHmac('sha256', secretKey).update(payload).digest('hex');
      return timingSafeEqualStrings(signature, expected);
    }

    case 'linkedin': {
      if (!signature) return false;
      const rawHex = signature.startsWith('hmacsha256=')
        ? signature.slice('hmacsha256='.length)
        : signature;
      const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      return timingSafeEqualStrings(rawHex, expected);
    }

    case 'youtube': {
      // Google PubSubHubbub (WebSub) signs X-Hub-Signature with sha256= or sha1=
      if (!signature) return false;
      if (signature.startsWith('sha256=')) {
        const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
        return timingSafeEqualStrings(signature, expected);
      }
      if (signature.startsWith('sha1=')) {
        const expected = 'sha1=' + crypto.createHmac('sha1', secret).update(payload).digest('hex');
        return timingSafeEqualStrings(signature, expected);
      }
      return false;
    }

    default:
      return false;
  }
}

async function processWebhookEvent(
  platform: string,
  body: unknown,
): Promise<void> {
  const eventTypes = extractEventTypes(platform, body);

  for (const event of eventTypes) {
    await db.auditLog.create({
      data: {
        action: 'social_webhook_received',
        resource: `social:${platform}`,
        details: JSON.stringify({
          platform,
          event: event.type,
          eventId: event.id,
          signatureVerified: true,
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

// ─── GET Handler (webhook verification challenges) ─────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  try {
    const { platform } = await params;

    if (!SUPPORTED_PLATFORMS.has(platform)) {
      return NextResponse.json({ error: 'Unsupported platform' }, { status: 400 });
    }

    const searchParams = request.nextUrl.searchParams;
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token && challenge) {
      const verifyToken =
        process.env[`${platform.toUpperCase()}_VERIFY_TOKEN`] ||
        process.env.SOCIAL_WEBHOOK_VERIFY_TOKEN ||
        (platform === 'whatsapp' ? process.env.WHATSAPP_VERIFY_TOKEN : '');

      if (verifyToken && timingSafeEqualDigests(token, verifyToken)) {
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

// ─── POST Handler (webhook event receiving) ────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform } = await params;
  try {
    if (!SUPPORTED_PLATFORMS.has(platform)) {
      return NextResponse.json({ error: 'Unsupported platform' }, { status: 400 });
    }

    const rawBody = await request.text();

    const signature =
      request.headers.get('x-hub-signature-256') ||
      request.headers.get('x-hub-signature') ||
      request.headers.get('x-tiktok-signature') ||
      request.headers.get('x-pinterest-signature') ||
      request.headers.get('x-twitter-webhooks-signature') ||
      request.headers.get('x-li-signature') ||
      request.headers.get('x-signature') ||
      null;
    const telegramSecretHeader = request.headers.get('x-telegram-bot-api-secret-token');

    // Fail closed: configured secret AND valid cryptographic signature are mandatory.
    const secret = getWebhookSecret(platform);
    if (!secret) {
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 401 });
    }

    const isValid = verifySignature(platform, rawBody, signature, secret, telegramSecretHeader);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid or missing webhook signature' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    await processWebhookEvent(platform, body);

    return NextResponse.json({ status: 'ok', platform });
  } catch (error: unknown) {
    console.error(`Social webhook POST error (${platform}):`, error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
