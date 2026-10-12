import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { db } from '@/lib/db';

// ─── Types ────────────────────────────────────────────────────────────

interface StoredEmailMessage {
  id: string;
  accountId: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  html: string;
  text: string;
  hasAttachments: boolean;
  folder: string;
  isRead: boolean;
  receivedAt: string;
  rawHeaders: Record<string, string>;
}

// ─── Helpers ──────────────────────────────────────────────────────────

async function authenticate(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return null;
  return verifySessionToken(token);
}

async function getAllEmailMessages(accountId?: string): Promise<StoredEmailMessage[]> {
  const prefix = accountId
    ? `email:message:${accountId}:`
    : 'email:message:';

  const settings = await db.settings.findMany({
    where: { key: { startsWith: prefix } },
    orderBy: { createdAt: 'desc' },
  });

  const messages: StoredEmailMessage[] = [];
  for (const s of settings) {
    try {
      const parsed = JSON.parse(s.value) as StoredEmailMessage;
      messages.push(parsed);
    } catch {
      // Skip malformed entries
    }
  }
  return messages;
}

function stripHtmlBody(email: StoredEmailMessage): Omit<StoredEmailMessage, 'html' | 'rawHeaders'> {
  const { html, rawHeaders, ...rest } = email;
  return rest;
}

// ─── GET: List emails with pagination and filtering ───────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await authenticate(request);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);

    // Pagination
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25', 10)));
    const offset = (page - 1) * limit;

    // Filtering
    const accountId = searchParams.get('accountId') || undefined;
    const folder = searchParams.get('folder') || undefined;
    const isRead = searchParams.get('isRead');
    const search = searchParams.get('search') || undefined;
    const from = searchParams.get('from') || undefined;
    const since = searchParams.get('since');
    const before = searchParams.get('before');
    const hasAttachments = searchParams.get('hasAttachments');

    let messages = await getAllEmailMessages(accountId);

    // Apply filters
    if (folder) {
      messages = messages.filter((m) => m.folder === folder);
    }

    if (isRead === 'true') {
      messages = messages.filter((m) => m.isRead);
    } else if (isRead === 'false') {
      messages = messages.filter((m) => !m.isRead);
    }

    if (from) {
      const fromLower = from.toLowerCase();
      messages = messages.filter((m) => m.from.toLowerCase().includes(fromLower));
    }

    if (search) {
      const searchLower = search.toLowerCase();
      messages = messages.filter(
        (m) =>
          m.subject.toLowerCase().includes(searchLower) ||
          m.text.toLowerCase().includes(searchLower) ||
          m.from.toLowerCase().includes(searchLower) ||
          m.to.some((t) => t.toLowerCase().includes(searchLower)),
      );
    }

    if (since) {
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate.getTime())) {
        messages = messages.filter((m) => new Date(m.receivedAt) >= sinceDate);
      }
    }

    if (before) {
      const beforeDate = new Date(before);
      if (!isNaN(beforeDate.getTime())) {
        messages = messages.filter((m) => new Date(m.receivedAt) <= beforeDate);
      }
    }

    if (hasAttachments === 'true') {
      messages = messages.filter((m) => m.hasAttachments);
    }

    // Sort by received date descending
    messages.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());

    // Stats
    const total = messages.length;
    const unreadCount = messages.filter((m) => !m.isRead).length;

    // Paginate
    const paginated = messages.slice(offset, offset + limit);

    // Strip large HTML body from list view
    const lightMessages = paginated.map((m) => stripHtmlBody(m));

    // Include full HTML only if ?full=true
    const includeFull = searchParams.get('full') === 'true';
    const finalMessages = includeFull ? paginated : lightMessages;

    return NextResponse.json({
      data: finalMessages,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: offset + limit < total,
        hasPrev: page > 1,
      },
      unreadCount,
    });
  } catch (error) {
    console.error('Email inbox GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}