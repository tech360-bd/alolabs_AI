import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAuth } from '@/lib/api-auth';
import {
  getConversationMessages,
  markConversationRead,
  recordOutboundMessage,
  resolveConversationTarget,
} from '@/lib/whatsapp/inbox';
import { buildWhatsAppClient } from '@/lib/whatsapp/config';

/**
 * /api/whatsapp/inbox/:id
 *
 * GET   — conversation header + messages (marks the thread read)
 * POST  — send a text reply through the number that owns the conversation,
 *         then persist it as an agent message
 * PATCH — explicit read receipt ({ "unread": 0 })
 */

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompanyAuth();
    const { id } = await context.params;

    const conversation = await getConversationMessages({
      companyId: user.companyId,
      conversationId: decodeURIComponent(id),
    });
    if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    await markConversationRead(user.companyId, decodeURIComponent(id));

    return NextResponse.json({
      conversation: { ...conversation.conversation, unread: 0 },
      messages: conversation.messages,
    });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    console.error('WhatsApp conversation read error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompanyAuth();
    const { id } = await context.params;
    const conversationId = decodeURIComponent(id);

    const body = (await request.json().catch(() => ({}))) as { text?: string };
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 });
    if (text.length > 4096) return NextResponse.json({ error: 'text is too long' }, { status: 400 });

    const target = await resolveConversationTarget(user.companyId, conversationId);
    if (!target) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    const client = await buildWhatsAppClient(target.phoneNumberId);
    if (!client) {
      return NextResponse.json(
        {
          error:
            'Configuration required: register a WhatsApp number with an access token (Settings → WhatsApp) or set WHATSAPP_ACCESS_TOKEN',
        },
        { status: 503 },
      );
    }

    const result = await client.sendText(target.contact, text);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'WhatsApp rejected the message' },
        { status: 502 },
      );
    }

    await recordOutboundMessage({
      phoneNumberId: target.phoneNumberId,
      contact: target.contact,
      content: text,
      messageId: result.messageId,
    });

    return NextResponse.json(
      { success: true, messageId: result.messageId, sentAt: new Date().toISOString() },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    console.error('WhatsApp reply error:', error);
    return NextResponse.json({ error: 'Failed to send the reply' }, { status: 500 });
  }
}

export async function PATCH(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompanyAuth();
    const { id } = await context.params;
    const marked = await markConversationRead(user.companyId, decodeURIComponent(id));
    if (!marked) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    console.error('WhatsApp read receipt error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
