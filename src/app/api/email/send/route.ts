import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { db } from '@/lib/db';
import { SMTPEmailService } from '@/lib/email/smtp';
import { EmailTrackingService } from '@/lib/email/tracking';
import type { SMTPConfig, EmailMessage, EmailAttachment } from '@/lib/email/types';
import * as crypto from 'crypto';

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

function generateMessageId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(8).toString('hex');
  return `<${timestamp}-${random}@alolabs.ai>`;
}

async function storeSentEmail(
  accountId: string,
  message: EmailMessage,
  messageId: string,
): Promise<void> {
  const key = `email:sent:${accountId}:${messageId.replace(/[<>]/g, '')}`;
  const stored = {
    id: messageId,
    accountId,
    from: message.from,
    to: message.to,
    cc: message.cc,
    bcc: message.bcc,
    subject: message.subject,
    html: message.html,
    text: message.text,
    hasAttachments: message.attachments.length > 0,
    sentAt: new Date().toISOString(),
    status: 'sent',
  };

  await db.settings.upsert({
    where: { key },
    update: { value: JSON.stringify(stored), updatedAt: new Date() },
    create: { key, value: JSON.stringify(stored), type: 'json' },
  });
}

// ─── POST: Send email ─────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const session = await authenticate(request);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const {
      accountId,
      to,
      cc = [],
      bcc = [],
      subject,
      html,
      text,
      attachments = [],
      inReplyTo = null,
      references = [],
      trackOpens = false,
    } = body;

    if (!accountId) {
      return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
    }

    if (!to || !Array.isArray(to) || to.length === 0) {
      return NextResponse.json({ error: 'At least one "to" recipient is required' }, { status: 400 });
    }

    if (!subject) {
      return NextResponse.json({ error: 'subject is required' }, { status: 400 });
    }

    if (!html && !text) {
      return NextResponse.json({ error: 'html or text body is required' }, { status: 400 });
    }

    const account = await getAccountConfig(accountId);
    if (!account) {
      return NextResponse.json({ error: 'Email account not found' }, { status: 404 });
    }

    const smtpConfig: SMTPConfig = {
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure,
      auth: { user: account.auth.user, pass: account.auth.pass },
    };

    const smtpService = new SMTPEmailService(smtpConfig);

    // Build attachments
    const parsedAttachments: EmailAttachment[] = attachments.map(
      (a: { filename: string; contentType?: string; content: string; encoding?: string }) => ({
        filename: a.filename,
        contentType: a.contentType || 'application/octet-stream',
        content: a.encoding === 'base64'
          ? Buffer.from(a.content, 'base64')
          : Buffer.from(a.content, 'utf-8'),
        size: Buffer.byteLength(a.content, a.encoding === 'base64' ? 'base64' : 'utf-8'),
      }),
    );

    // Inject tracking pixel if requested
    let finalHtml = html || '';
    let trackingMessageId = '';

    if (trackOpens && finalHtml) {
      trackingMessageId = generateMessageId();
      const trackingService = new EmailTrackingService();
      const pixel = trackingService.generateTrackingPixel(trackingMessageId);
      finalHtml = finalHtml.replace('</body>', `${pixel}</body>`);
    }

    const messageId = trackingMessageId || generateMessageId();

    // Build the email message
    const emailMessage: EmailMessage = {
      id: messageId,
      from: account.auth.user,
      to,
      cc,
      bcc,
      subject,
      html: finalHtml,
      text: text || '',
      attachments: parsedAttachments,
      headers: {
        'X-Mailer': 'ALO Labs AIOS',
        'X-Account-Id': accountId,
        ...(trackOpens ? { 'X-Email-Tracking': 'enabled' } : {}),
      },
      inReplyTo,
      references: references || [],
    };

    // Send the email
    const result = await smtpService.send(emailMessage);

    if (!result.success) {
      return NextResponse.json(
        { error: `Failed to send email: ${result.error}` },
        { status: 502 },
      );
    }

    // Store the sent email record
    await storeSentEmail(accountId, emailMessage, result.messageId);

    // Record tracking delivery if tracking enabled
    if (trackOpens) {
      try {
        const trackingService = new EmailTrackingService();
        for (const recipient of [...to, ...cc]) {
          trackingService.recordDelivered(result.messageId, recipient);
        }
      } catch {
        // Non-critical
      }
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      sentAt: new Date().toISOString(),
      recipients: { to, cc, bcc },
      tracked: trackOpens,
    });
  } catch (error) {
    console.error('Email send POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}