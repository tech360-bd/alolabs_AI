// ALO Labs AIOS — WhatsApp Send API
// Send text, image, document, and template messages via WhatsApp Business API

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth';
import { WhatsAppBusinessClient } from '@/lib/whatsapp/client';
import type { WhatsAppConfig, WhatsAppTemplate } from '@/lib/whatsapp/types';

// ─── Helper: Get WhatsApp client ──────────────────────────────────────────────

async function getWhatsAppClient(phoneNumberId?: string): Promise<{
  client: WhatsAppBusinessClient;
  resolvedPhoneNumberId: string;
} | null> {
  const apiUrl = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com';
  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v21.0';
  let accessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
  let resolvedPhoneNumberId = phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || '';

  // Try to resolve from stored settings
  if (!resolvedPhoneNumberId || !accessToken) {
    try {
      const numbersSetting = await db.settings.findUnique({
        where: { key: 'whatsapp:numbers' },
      });
      if (numbersSetting) {
        const numbers = JSON.parse(numbersSetting.value) as Array<{
          phoneNumberId: string;
          accessToken: string;
          isDefault: boolean;
        }>;
        const target = resolvedPhoneNumberId
          ? numbers.find((n) => n.phoneNumberId === resolvedPhoneNumberId)
          : numbers.find((n) => n.isDefault) || numbers[0];

        if (target) {
          if (!resolvedPhoneNumberId) resolvedPhoneNumberId = target.phoneNumberId;
          if (!accessToken) accessToken = target.accessToken;
        }
      }
    } catch { /* ignore */ }
  }

  // Check social token settings
  if (!accessToken) {
    try {
      const tokenSetting = await db.settings.findUnique({
        where: { key: 'social:whatsapp:token' },
      });
      if (tokenSetting) {
        const data = JSON.parse(tokenSetting.value) as { accessToken: string };
        accessToken = data.accessToken;
      }
    } catch { /* ignore */ }
  }

  if (!resolvedPhoneNumberId || !accessToken) return null;

  const config: WhatsAppConfig = {
    apiUrl,
    apiVersion,
    phoneNumberId: resolvedPhoneNumberId,
    accessToken,
    verifyToken,
    webhookUrl: '',
  };

  return {
    client: new WhatsAppBusinessClient(config),
    resolvedPhoneNumberId,
  };
}

// ─── POST: Send Message ────────────────────────────────────────────────────────

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

    const body = (await request.json()) as {
      to: string;
      type: 'text' | 'image' | 'document' | 'template' | 'video' | 'audio';
      text?: string;
      previewUrl?: boolean;
      mediaId?: string;
      mediaUrl?: string;
      caption?: string;
      filename?: string;
      template?: WhatsAppTemplate;
      phoneNumberId?: string;
      replyToMessageId?: string;
      metadata?: Record<string, unknown>;
    };

    if (!body.to) {
      return NextResponse.json({ error: 'to (recipient phone number) is required' }, { status: 400 });
    }

    if (!body.type) {
      return NextResponse.json({ error: 'type is required' }, { status: 400 });
    }

    const clientResult = await getWhatsAppClient(body.phoneNumberId);
    if (!clientResult) {
      return NextResponse.json(
        { error: 'WhatsApp not configured. Connect a WhatsApp Business number first.' },
        { status: 400 },
      );
    }

    const { client, resolvedPhoneNumberId } = clientResult;
    let result;

    switch (body.type) {
      case 'text': {
        if (!body.text) {
          return NextResponse.json({ error: 'text is required for text messages' }, { status: 400 });
        }
        result = await client.sendText(body.to, body.text, body.previewUrl);
        break;
      }

      case 'image': {
        if (!body.mediaId && !body.mediaUrl) {
          return NextResponse.json({ error: 'mediaId or mediaUrl is required for image messages' }, { status: 400 });
        }
        if (body.mediaId) {
          result = await client.sendImage(body.to, body.mediaId, body.caption);
        } else {
          // Upload then send
          const uploadId = await client.uploadMedia(
            Buffer.from(''),
            'image/jpeg',
            'image',
          );
          result = await client.sendImage(body.to, uploadId, body.caption);
        }
        break;
      }

      case 'document': {
        if (!body.mediaId) {
          return NextResponse.json({ error: 'mediaId is required for document messages' }, { status: 400 });
        }
        result = await client.sendDocument(body.to, body.mediaId, body.filename, body.caption);
        break;
      }

      case 'template': {
        if (!body.template) {
          return NextResponse.json({ error: 'template is required for template messages' }, { status: 400 });
        }
        result = await client.sendTemplate(body.to, body.template);
        break;
      }

      case 'video': {
        if (!body.mediaId) {
          return NextResponse.json({ error: 'mediaId is required for video messages' }, { status: 400 });
        }
        // WhatsApp client doesn't have a direct sendVideo, use sendMessage
        const { default: crypto } = await import('node:crypto');
        result = await client.sendMessage(body.to, {
          id: crypto.randomUUID(),
          from: resolvedPhoneNumberId,
          to: body.to,
          type: 'video',
          video: { id: body.mediaId, caption: body.caption },
          timestamp: new Date().toISOString(),
          status: 'queued',
        });
        break;
      }

      case 'audio': {
        if (!body.mediaId) {
          return NextResponse.json({ error: 'mediaId is required for audio messages' }, { status: 400 });
        }
        const { default: crypto } = await import('node:crypto');
        result = await client.sendMessage(body.to, {
          id: crypto.randomUUID(),
          from: resolvedPhoneNumberId,
          to: body.to,
          type: 'audio',
          audio: { id: body.mediaId },
          timestamp: new Date().toISOString(),
          status: 'queued',
        });
        break;
      }

      default:
        return NextResponse.json({ error: `Unsupported message type: ${body.type}` }, { status: 400 });
    }

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'whatsapp_message_send',
        resource: `whatsapp:message:${result.messageId}`,
        details: JSON.stringify({
          to: body.to,
          type: body.type,
          success: result.success,
          error: result.error,
          phoneNumberId: resolvedPhoneNumberId,
        }),
      },
    });

    return NextResponse.json({
      success: result.success,
      messageId: result.messageId,
      error: result.error,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('WhatsApp send POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}