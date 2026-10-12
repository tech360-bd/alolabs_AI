import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { db } from '@/lib/db';
import { IMAPEmailService } from '@/lib/email/imap';
import type { IMAPConfig, EmailMessage } from '@/lib/email/types';

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

async function getAccountConfig(accountId: string) {
  const setting = await db.settings.findUnique({
    where: { key: `email:account:${accountId}` },
  });
  if (!setting) return null;
  try {
    return JSON.parse(setting.value) as {
      id: string;
      email: string;
      imap: { host: string; port: number; tls: boolean };
      smtp: { host: string; port: number; secure: boolean };
      auth: { user: string; pass: string };
      isActive: boolean;
    };
  } catch {
    return null;
  }
}

async function storeEmail(accountId: string, message: EmailMessage, folder: string): Promise<void> {
  const emailId = `email:message:${accountId}:${message.id}`;

  const stored: StoredEmailMessage = {
    id: message.id,
    accountId,
    from: message.from,
    to: message.to,
    cc: message.cc,
    subject: message.subject,
    html: message.html,
    text: message.text,
    hasAttachments: message.attachments.length > 0,
    folder,
    isRead: false,
    receivedAt: new Date().toISOString(),
    rawHeaders: message.headers,
  };

  await db.settings.upsert({
    where: { key: emailId },
    update: { value: JSON.stringify(stored), updatedAt: new Date() },
    create: { key: emailId, value: JSON.stringify(stored), type: 'json' },
  });
}

async function updateAccountLastSync(accountId: string): Promise<void> {
  const setting = await db.settings.findUnique({
    where: { key: `email:account:${accountId}` },
  });
  if (!setting) return;

  try {
    const account = JSON.parse(setting.value);
    account.lastSyncAt = new Date().toISOString();
    await db.settings.update({
      where: { key: `email:account:${accountId}` },
      data: { value: JSON.stringify(account), updatedAt: new Date() },
    });
  } catch {
    // Ignore
  }
}

async function getLastSyncTime(accountId: string): Promise<Date | null> {
  const setting = await db.settings.findUnique({
    where: { key: `email:account:${accountId}` },
  });
  if (!setting) return null;
  try {
    const account = JSON.parse(setting.value);
    if (account.lastSyncAt) return new Date(account.lastSyncAt);
  } catch {
    // Ignore
  }
  // Default to 30 days ago if never synced
  const defaultDate = new Date();
  defaultDate.setDate(defaultDate.getDate() - 30);
  return defaultDate;
}

// ─── POST: Trigger email sync ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const session = await authenticate(request);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { accountId, folder = 'INBOX', fullSync = false } = body;

    if (!accountId) {
      return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
    }

    const account = await getAccountConfig(accountId);
    if (!account) {
      return NextResponse.json({ error: 'Email account not found' }, { status: 404 });
    }

    if (!account.isActive) {
      return NextResponse.json({ error: 'Email account is not active' }, { status: 400 });
    }

    const imapConfig: IMAPConfig = {
      host: account.imap.host,
      port: account.imap.port,
      tls: account.imap.tls,
      auth: { user: account.auth.user, pass: account.auth.pass },
    };

    const imapService = new IMAPEmailService(imapConfig);

    try {
      await imapService.connect();

      // Determine sync start date
      const sinceDate = fullSync
        ? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) // 90 days for full sync
        : (await getLastSyncTime(accountId)) ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Search for new emails since last sync
      const messages = await imapService.searchMessages(folder, {
        since: sinceDate,
      });

      let syncedCount = 0;
      let failedCount = 0;
      const errors: string[] = [];

      for (const message of messages) {
        try {
          await storeEmail(accountId, message, folder);
          syncedCount++;

          // Mark as read on server since we've stored it
          try {
            await imapService.markAsRead(message.id);
          } catch {
            // Non-critical
          }
        } catch (err) {
          failedCount++;
          errors.push(
            `Message ${message.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // Update last sync timestamp
      await updateAccountLastSync(accountId);

      await imapService.disconnect();

      return NextResponse.json({
        success: true,
        accountId,
        folder,
        synced: syncedCount,
        failed: failedCount,
        errors: errors.length > 0 ? errors : undefined,
        syncedAt: new Date().toISOString(),
      });
    } catch (err) {
      await imapService.disconnect().catch(() => {});
      const errorMessage = err instanceof Error ? err.message : String(err);

      return NextResponse.json(
        {
          success: false,
          error: `IMAP connection/sync failed: ${errorMessage}`,
          accountId,
          synced: 0,
          failed: 0,
        },
        { status: 502 },
      );
    }
  } catch (error) {
    console.error('Email sync POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}