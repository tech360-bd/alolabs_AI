import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { db } from '@/lib/db';
import * as crypto from 'crypto';

// ─── Types ────────────────────────────────────────────────────────────

interface EmailAccountConfig {
  id: string;
  label: string;
  email: string;
  provider: 'gmail' | 'outlook' | 'zoho' | 'custom-smtp';
  imap: { host: string; port: number; tls: boolean };
  smtp: { host: string; port: number; secure: boolean };
  auth: { user: string; pass: string };
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function settingKey(id: string) {
  return `email:account:${id}`;
}

function generateId(): string {
  return crypto.randomUUID();
}

async function authenticate(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return null;
  return verifySessionToken(token);
}

async function getAllAccounts(): Promise<EmailAccountConfig[]> {
  const settings = await db.settings.findMany({
    where: { key: { startsWith: 'email:account:' } },
    orderBy: { createdAt: 'desc' },
  });

  const accounts: EmailAccountConfig[] = [];
  for (const s of settings) {
    try {
      const parsed = JSON.parse(s.value) as EmailAccountConfig;
      accounts.push(parsed);
    } catch {
      // Skip malformed entries
    }
  }
  return accounts;
}

// ─── GET: List email accounts ─────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await authenticate(request);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accounts = await getAllAccounts();

    // Mask passwords in the response
    const safeAccounts = accounts.map((a) => ({
      ...a,
      auth: { user: a.auth.user, pass: '••••••••' },
    }));

    return NextResponse.json({ data: safeAccounts, count: safeAccounts.length });
  } catch (error) {
    console.error('Email accounts GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── POST: Add new email account ──────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const session = await authenticate(request);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { label, email, provider, imap, smtp, auth, isActive } = body;

    if (!email || !auth?.user || !auth?.pass) {
      return NextResponse.json(
        { error: 'email, auth.user, and auth.pass are required' },
        { status: 400 },
      );
    }

    if (!imap?.host || !smtp?.host) {
      return NextResponse.json(
        { error: 'IMAP and SMTP host configuration is required' },
        { status: 400 },
      );
    }

    const id = generateId();
    const now = new Date().toISOString();

    const account: EmailAccountConfig = {
      id,
      label: label || email,
      email,
      provider: provider || 'custom-smtp',
      imap: {
        host: imap.host,
        port: imap.port || 993,
        tls: imap.tls !== false,
      },
      smtp: {
        host: smtp.host,
        port: smtp.port || 465,
        secure: smtp.secure !== false,
      },
      auth: { user: auth.user, pass: auth.pass },
      isActive: isActive !== false,
      lastSyncAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await db.settings.upsert({
      where: { key: settingKey(id) },
      update: { value: JSON.stringify(account), updatedAt: new Date() },
      create: { key: settingKey(id), value: JSON.stringify(account), type: 'json' },
    });

    // Return without password
    const safe = { ...account, auth: { user: account.auth.user, pass: '••••••••' } };
    return NextResponse.json({ data: safe }, { status: 201 });
  } catch (error) {
    console.error('Email accounts POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── PUT: Update email account ────────────────────────────────────────

export async function PUT(request: NextRequest) {
  try {
    const session = await authenticate(request);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const existing = await db.settings.findUnique({ where: { key: settingKey(id) } });
    if (!existing) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const account = JSON.parse(existing.value) as EmailAccountConfig;

    // Merge updates
    if (updates.label !== undefined) account.label = updates.label;
    if (updates.provider !== undefined) account.provider = updates.provider;
    if (updates.isActive !== undefined) account.isActive = updates.isActive;
    if (updates.imap) {
      account.imap = { ...account.imap, ...updates.imap };
    }
    if (updates.smtp) {
      account.smtp = { ...account.smtp, ...updates.smtp };
    }
    if (updates.auth) {
      account.auth = { ...account.auth, ...updates.auth };
    }

    account.updatedAt = new Date().toISOString();

    await db.settings.update({
      where: { key: settingKey(id) },
      data: { value: JSON.stringify(account), updatedAt: new Date() },
    });

    const safe = { ...account, auth: { user: account.auth.user, pass: '••••••••' } };
    return NextResponse.json({ data: safe });
  } catch (error) {
    console.error('Email accounts PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── DELETE: Remove email account ─────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const session = await authenticate(request);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id query parameter is required' }, { status: 400 });
    }

    const existing = await db.settings.findUnique({ where: { key: settingKey(id) } });
    if (!existing) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    await db.settings.delete({ where: { key: settingKey(id) } });

    // Also clean up stored emails for this account
    const emailKeys = await db.settings.findMany({
      where: { key: { startsWith: `email:message:${id}:` } },
      select: { key: true },
    });

    for (const ek of emailKeys) {
      await db.settings.delete({ where: { key: ek.key } }).catch(() => {});
    }

    return NextResponse.json({ success: true, deleted: id });
  } catch (error) {
    console.error('Email accounts DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}