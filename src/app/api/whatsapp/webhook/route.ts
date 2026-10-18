// ALO Labs AIOS — WhatsApp Webhook API
// Handles verification and incoming message processing

import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { recordSecurityEvent } from '@/lib/api/secure-route';
import { WhatsAppBusinessClient } from '@/lib/whatsapp/client';
import { WhatsAppAIHandler } from '@/lib/whatsapp/ai-handler';
import { buildWhatsAppClient } from '@/lib/whatsapp/config';
import { recordInboundMessage, recordOutboundMessage } from '@/lib/whatsapp/inbox';
import type {
  WhatsAppMessage,
  WhatsAppConversation,
  WhatsAppWebhookEvent,
} from '@/lib/whatsapp/types';

// ─── Human Handover Detection ──────────────────────────────────────────────────

const HANDOVER_KEYWORDS = [
  /\b(human|agent|person|speak to someone|real person|customer service|representative)\b/i,
  /\b(escalat|manager|supervisor|not helping|can't help)\b/i,
];

function detectHandover(text: string): boolean {
  return HANDOVER_KEYWORDS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

// ─── Helper: Get AI handler config ─────────────────────────────────────────────

function getAIHandlerConfig(): { enabled: boolean; endpoint: string } {
  return {
    enabled: process.env.WHATSAPP_AI_ENABLED === 'true',
    endpoint: process.env.WHATSAPP_AI_ENDPOINT || '',
  };
}

// ─── GET: WhatsApp Verification Challenge ───────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token && challenge) {
      const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
      if (token === verifyToken) {
        return new NextResponse(challenge, {
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    }

    return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
  } catch (error: unknown) {
    console.error('WhatsApp webhook GET error:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
  }
}

// ─── POST: Receive Incoming Messages ────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Verify webhook signature.
    //
    // This endpoint is unauthenticated by design (Meta calls it), so the HMAC
    // signature IS the authentication. Previously a mismatch only wrote a
    // warning to the log and processing continued, which let anyone forge
    // inbound messages. A missing or invalid signature is now rejected with
    // 401 whenever WHATSAPP_APP_SECRET is configured.
    const signature = request.headers.get('x-hub-signature-256');
    const appSecret = process.env.WHATSAPP_APP_SECRET;

    if (appSecret) {
      if (!signature) {
        void recordSecurityEvent({
          type: 'webhook_signature_missing',
          severity: 'high',
          resource: 'whatsapp.webhook',
          action: 'receive',
          requestId: randomUUID(),
          details: { reason: 'missing x-hub-signature-256' },
        });
        return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
      }

      const crypto = await import('node:crypto');
      const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
      let valid = false;
      try {
        const bufA = Buffer.from(signature);
        const bufB = Buffer.from(expected);
        valid = bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
      } catch {
        valid = false;
      }

      if (!valid) {
        void recordSecurityEvent({
          type: 'webhook_signature_invalid',
          severity: 'critical',
          resource: 'whatsapp.webhook',
          action: 'receive',
          requestId: randomUUID(),
          details: { reason: 'hmac mismatch' },
        });
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    // Parse with WhatsApp client
    const client = await buildWhatsAppClient();
    if (!client) {
      console.error('WhatsApp client not configured');
      return NextResponse.json({ status: 'ok' }); // Still 200 to prevent retries
    }

    let event: WhatsAppWebhookEvent;
    try {
      event = client.parseWebhook(body);
    } catch {
      // Not a valid WhatsApp webhook, return 200
      return NextResponse.json({ status: 'ok' });
    }

    // Extract messages
    const incomingMessages = client.extractMessages(event);

    // Process each message
    for (const { message, contactName, phoneNumberId } of incomingMessages) {
      await processIncomingMessage(message, contactName, phoneNumberId, client);
    }

    // Extract and store status updates
    const statuses = client.extractStatuses(event);
    for (const status of statuses) {
      await db.auditLog.create({
        data: {
          action: 'whatsapp_message_status',
          resource: `whatsapp:message:${status.messageId}`,
          details: JSON.stringify({
            messageId: status.messageId,
            recipientId: status.recipientId,
            status: status.status,
            timestamp: status.timestamp,
            conversationId: status.conversationId,
          }),
        },
      });
    }

    return NextResponse.json({ status: 'ok', messagesProcessed: incomingMessages.length });
  } catch (error: unknown) {
    console.error('WhatsApp webhook POST error:', error);
    return NextResponse.json({ status: 'ok' }); // Always 200
  }
}

// ─── Message Processing ────────────────────────────────────────────────────────

async function processIncomingMessage(
  message: WhatsAppMessage,
  contactName: string | undefined,
  phoneNumberId: string,
  client: WhatsAppBusinessClient,
): Promise<void> {
  // Build conversation object for AI handler
  const conversationId = `wa:${message.from}:${phoneNumberId}`;

  // Extract message content for storage
  let messageContent = '';
  let messageType = message.type;
  let mediaId: string | undefined;

  switch (message.type) {
    case 'text':
      messageContent = message.text?.body || '';
      break;
    case 'image':
      messageContent = message.image?.caption || '[Image]';
      mediaId = message.image?.id;
      break;
    case 'document':
      messageContent = message.document?.caption || `[Document: ${message.document?.filename || 'unknown'}]`;
      mediaId = message.document?.id;
      break;
    case 'audio':
      messageContent = '[Audio message]';
      mediaId = message.audio?.id;
      break;
    case 'video':
      messageContent = message.video?.caption || '[Video]';
      mediaId = message.video?.id;
      break;
    case 'location':
      messageContent = `[Location: ${message.location?.latitude}, ${message.location?.longitude}]`;
      break;
    case 'contacts':
      messageContent = '[Contacts shared]';
      break;
    case 'sticker':
      messageContent = '[Sticker]';
      break;
    case 'reaction': {
      const reactionMsg = message as unknown as { reaction?: { emoji?: string } };
      messageContent = `[Reaction: ${reactionMsg.reaction?.emoji || ''}]`;
      messageType = 'reaction';
      break;
    }
    default:
      messageContent = `[${message.type} message]`;
  }

  // Store message in database
  await db.auditLog.create({
    data: {
      action: 'whatsapp_message_received',
      resource: `whatsapp:conversation:${conversationId}`,
      details: JSON.stringify({
        messageId: message.id,
        from: message.from,
        to: message.to,
        type: messageType,
        content: messageContent,
        mediaId,
        contactName: contactName || null,
        phoneNumberId,
        timestamp: message.timestamp,
        isReply: !!message.context?.message_id,
        replyTo: message.context?.message_id || null,
      }),
    },
  });

  // Shared inbox (Conversation/ConversationMessage). Best-effort: an inbox
  // write must never make WhatsApp retry a delivery that was already handled.
  try {
    await recordInboundMessage({
      phoneNumberId,
      contact: message.from,
      contactName: contactName ?? null,
      content: messageContent,
      messageId: message.id,
      type: messageType,
      ...(mediaId ? { mediaId } : {}),
      timestamp: message.timestamp,
    });
  } catch (inboxError) {
    console.error('WhatsApp inbox write failed:', inboxError);
  }

  // Detect human handover
  const isTextMessage = message.type === 'text' && message.text?.body;
  let needsHandover = false;
  if (isTextMessage && message.text?.body) {
    needsHandover = detectHandover(message.text.body);
  }

  if (needsHandover) {
    await db.auditLog.create({
      data: {
        action: 'whatsapp_handover_requested',
        resource: `whatsapp:conversation:${conversationId}`,
        details: JSON.stringify({
          from: message.from,
          messageId: message.id,
          reason: 'keyword_detected',
          contactName,
        }),
      },
    });
    return;
  }

  // AI auto-reply (only for text messages)
  const aiConfig = getAIHandlerConfig();
  if (aiConfig.enabled && isTextMessage) {
    try {
      // Get recent conversation history for context
      const recentLogs = await db.auditLog.findMany({
        where: {
          resource: `whatsapp:conversation:${conversationId}`,
          action: { in: ['whatsapp_message_received', 'whatsapp_message_sent'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      const conversation: WhatsAppConversation = {
        id: conversationId,
        participants: [message.from, phoneNumberId],
        messages: recentLogs.reverse().map((log) => {
          const details = JSON.parse(log.details) as Record<string, unknown>;
          return {
            id: String(details.messageId || log.id),
            from: String(details.from || ''),
            to: String(details.to || ''),
            type: 'text' as const,
            text: { body: String(details.content || '') },
            timestamp: new Date().toISOString(),
            status: 'received' as const,
          } as WhatsAppMessage;
        }),
        createdAt: new Date(),
        updatedAt: new Date(),
        companyId: '',
        status: 'active',
      };

      const aiHandler = new WhatsAppAIHandler(client, {
        aiEndpoint: aiConfig.endpoint,
        leadCreationEnabled: true,
      });

      const reply = await aiHandler.handleIncomingMessage(message, conversation);

      if (reply) {
        const sendResult = await client.sendText(message.from, reply.text?.body || '');

        if (sendResult.success) {
          await db.auditLog.create({
            data: {
              action: 'whatsapp_message_sent',
              resource: `whatsapp:conversation:${conversationId}`,
              details: JSON.stringify({
                messageId: sendResult.messageId,
                to: message.from,
                type: 'text',
                content: reply.text?.body || '',
                autoReply: true,
              }),
            },
          });

          try {
            await recordOutboundMessage({
              phoneNumberId,
              contact: message.from,
              content: reply.text?.body || '',
              autoReply: true,
              messageId: sendResult.messageId,
            });
          } catch (inboxError) {
            console.error('WhatsApp inbox outbound write failed:', inboxError);
          }
        }
      }
    } catch (error: unknown) {
      console.error('WhatsApp AI auto-reply error:', error);
    }
  }
}