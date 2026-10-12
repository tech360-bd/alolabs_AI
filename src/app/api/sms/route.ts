// ALO Labs AIOS — SMS Management API
// List and send SMS messages stored in the Settings table
//
// Rate Limiting Note: In production, integrate a rate limiter (e.g., upstash/ratelimit)
// to prevent abuse. Suggested limits: 10 sends/min per user, 1000/day per tenant.

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

type SmsStatus = 'pending' | 'sent' | 'delivered' | 'failed';

interface SmsMessage {
  id: string;
  to: string;
  body: string;
  from: string;
  campaignId?: string;
  status: SmsStatus;
  errorMessage?: string;
  externalId?: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

interface SendSmsRequest {
  to: string;
  body: string;
  from?: string;
  campaignId?: string;
}

// ─── Storage Helpers ──────────────────────────────────────────────────────────

const MESSAGE_KEY_PREFIX = 'sms:message:';

async function saveMessage(msg: SmsMessage): Promise<void> {
  await db.settings.upsert({
    where: { key: `${MESSAGE_KEY_PREFIX}${msg.id}` },
    update: {
      value: JSON.stringify(msg),
      type: 'json',
      updatedAt: new Date(),
    },
    create: {
      key: `${MESSAGE_KEY_PREFIX}${msg.id}`,
      value: JSON.stringify(msg),
      type: 'json',
    },
  });
}

async function listMessages(filters: {
  status?: SmsStatus | null;
  campaignId?: string | null;
  phone?: string | null;
  search?: string | null;
  limit: number;
  offset: number;
}): Promise<{ messages: SmsMessage[]; total: number }> {
  const allSettings = await db.settings.findMany({
    where: { key: { startsWith: MESSAGE_KEY_PREFIX } },
    orderBy: { createdAt: 'desc' },
  });

  let messages: SmsMessage[] = [];
  for (const setting of allSettings) {
    try {
      messages.push(JSON.parse(setting.value) as SmsMessage);
    } catch {
      // Skip malformed entries
    }
  }

  // Apply filters
  if (filters.status) {
    messages = messages.filter((m) => m.status === filters.status);
  }
  if (filters.campaignId) {
    messages = messages.filter((m) => m.campaignId === filters.campaignId);
  }
  if (filters.phone) {
    const phoneNorm = filters.phone.replace(/[^0-9]/g, '');
    messages = messages.filter((m) => m.to.replace(/[^0-9]/g, '').includes(phoneNorm));
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    messages = messages.filter(
      (m) =>
        m.body.toLowerCase().includes(q) ||
        m.to.includes(q) ||
        m.from.includes(q),
    );
  }

  const total = messages.length;
  const paginated = messages.slice(filters.offset, filters.offset + filters.limit);
  return { messages: paginated, total };
}

// ─── Auth Helper ──────────────────────────────────────────────────────────────

async function authenticate(request: NextRequest): Promise<{ userId: string } | NextResponse> {
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
  return session;
}

// ─── GET: List SMS Messages ───────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticate(request);
    if (authResult instanceof NextResponse) return authResult;
    // authResult is { userId }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as SmsStatus | null;
    const campaignId = searchParams.get('campaignId');
    const phone = searchParams.get('phone');
    const search = searchParams.get('search');
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

    const { messages, total } = await listMessages({ status, campaignId, phone, search, limit, offset });

    return NextResponse.json({
      data: messages,
      total,
      limit,
      offset,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('SMS GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── POST: Send SMS Message ───────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticate(request);
    if (authResult instanceof NextResponse) return authResult;

    const body = (await request.json()) as SendSmsRequest;

    if (!body.to) {
      return NextResponse.json({ error: 'to (recipient phone number) is required' }, { status: 400 });
    }

    // Validate phone number (basic E.164 check)
    const digits = body.to.replace(/[^0-9]/g, '');
    if (digits.length < 7 || digits.length > 15) {
      return NextResponse.json(
        { error: 'Invalid phone number. Use E.164 format (e.g., +1234567890).' },
        { status: 400 },
      );
    }

    if (!body.body || body.body.trim().length === 0) {
      return NextResponse.json({ error: 'body (message text) is required' }, { status: 400 });
    }

    if (body.body.length > 1600) {
      return NextResponse.json({ error: 'Message body exceeds 1600 character limit' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const messageId = crypto.randomUUID();

    const message: SmsMessage = {
      id: messageId,
      to: body.to,
      body: body.body.trim(),
      from: body.from || process.env.SMS_DEFAULT_FROM || '+10000000000',
      campaignId: body.campaignId,
      status: 'pending',
      userId: authResult.userId,
      createdAt: now,
      updatedAt: now,
    };

    // Store the message with 'pending' status. An external SMS provider callback (e.g. Twilio, Vonage) will update the status.

    await saveMessage(message);

    // Create a notification record for the SMS send event
    await db.notification.create({
      data: {
        type: 'sms',
        title: 'SMS Queued',
        message: `SMS to ${body.to} queued for delivery`,
        priority: 'normal',
        userId: authResult.userId,
        metadata: JSON.stringify({
          messageId,
          to: body.to,
          from: message.from,
          campaignId: body.campaignId,
        }),
      },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        userId: authResult.userId,
        action: 'sms_message_send',
        resource: `${MESSAGE_KEY_PREFIX}${messageId}`,
        details: JSON.stringify({
          to: body.to,
          from: message.from,
          campaignId: body.campaignId,
          bodyLength: body.body.length,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      message: {
        id: message.id,
        to: message.to,
        from: message.from,
        body: message.body,
        status: message.status,
        campaignId: message.campaignId,
        createdAt: message.createdAt,
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('SMS POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}