import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { SMTPEmailService } from '@/lib/email/smtp';
import type { SMTPConfig, EmailMessage } from '@/lib/email/types';

/**
 * POST /api/public/contact — the public website's enquiry form.
 *
 * Public by design (the edge allowlist covers `/api/public/`); every submission
 * is validated, honeypot-filtered, rate-limited per IP, and captured as a CRM
 * lead (CrmContact + CrmNote) inside the platform's own database. When an
 * active mail account is configured a notification goes to the house address as
 * a best effort — the lead is recorded either way.
 */

const SUBJECT = 'Website enquiry';
const HOUSE_EMAIL = 'info@alolabs.net';

// ─── In-memory per-IP rate limit (the edge applies a coarser global limit) ───

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || entry.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

// ─── Validation ──────────────────────────────────────────────────────────────

interface Enquiry {
  name: string;
  email: string;
  company: string;
  phone: string;
  topic: string;
  subject: string;
  message: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function clean(value: unknown, max = 400): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function validate(body: Record<string, unknown>): { ok: true; enquiry: Enquiry } | { ok: false; error: string } {
  const name = clean(body.name, 120);
  const email = clean(body.email, 200).toLowerCase();
  const message = clean(body.message, 4000);
  if (!name) return { ok: false, error: 'Please tell us your name.' };
  if (!email || !EMAIL_RE.test(email)) return { ok: false, error: 'Please provide a valid email address.' };
  if (message.length < 10) return { ok: false, error: 'Please include a short message (at least 10 characters).' };
  return {
    ok: true,
    enquiry: {
      name,
      email,
      company: clean(body.company, 160),
      phone: clean(body.phone, 60),
      topic: clean(body.topic, 120) || 'General enquiry',
      subject: clean(body.subject, 200) || SUBJECT,
      message,
    },
  };
}

// ─── Best-effort notification ────────────────────────────────────────────────

async function notifyHouse(enquiry: Enquiry): Promise<boolean> {
  try {
    const settings = await db.settings.findMany({ where: { key: { startsWith: 'email:account:' } } });
    for (const setting of settings) {
      let account: {
        email?: string;
        smtp?: Omit<SMTPConfig, 'auth'>;
        auth?: { user: string; pass: string };
        isActive?: boolean;
      };
      try {
        account = JSON.parse(setting.value);
      } catch {
        continue;
      }
      if (account.isActive === false || !account.smtp || !account.auth) continue;
      const config: SMTPConfig = { ...account.smtp, auth: account.auth };
      const service = new SMTPEmailService(config);
      const message: EmailMessage = {
        id: `<contact-${Date.now().toString(36)}@${config.auth.user.split('@')[1] || 'alolabs.net'}>`,
        from: account.email || HOUSE_EMAIL,
        to: [HOUSE_EMAIL],
        cc: [],
        bcc: [],
        subject: `[Website] ${enquiry.subject} — ${enquiry.name}`,
        text:
          `New enquiry from alolabs.net\n\n` +
          `Name: ${enquiry.name}\n` +
          `Email: ${enquiry.email}\n` +
          `Company: ${enquiry.company || '—'}\n` +
          `Phone: ${enquiry.phone || '—'}\n` +
          `Topic: ${enquiry.topic}\n\n` +
          `${enquiry.message}\n`,
        html:
          `<h2>New enquiry from alolabs.net</h2>` +
          `<p><strong>Name:</strong> ${escapeHtml(enquiry.name)}<br/>` +
          `<strong>Email:</strong> ${escapeHtml(enquiry.email)}<br/>` +
          `<strong>Company:</strong> ${escapeHtml(enquiry.company || '—')}<br/>` +
          `<strong>Phone:</strong> ${escapeHtml(enquiry.phone || '—')}<br/>` +
          `<strong>Topic:</strong> ${escapeHtml(enquiry.topic)}</p>` +
          `<p>${escapeHtml(enquiry.message).replace(/\n/g, '<br/>')}</p>`,
        attachments: [],
        headers: {},
        inReplyTo: null,
        references: [],
      };
      await service.send(message);
      return true;
    }
  } catch {
    // Notification is best-effort; the CRM lead is the record of truth.
  }
  return false;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (rateLimited(ip)) {
    return NextResponse.json(
      { ok: false, message: 'Too many messages from this address. Please try again in a few minutes.' },
      { status: 429 },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid request body.' }, { status: 400 });
  }

  // Honeypot: bots fill every field. Pretend success, record nothing.
  if (clean(body.company_website, 120)) {
    return NextResponse.json({ ok: true, delivered: true, message: 'Thank you.' });
  }

  const result = validate(body);
  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.error }, { status: 400 });
  }
  const { enquiry } = result;

  try {
    const contact = await db.crmContact.create({
      data: {
        firstName: enquiry.name.split(/\s+/)[0] || enquiry.name,
        lastName: enquiry.name.split(/\s+/).slice(1).join(' ') || '—',
        email: enquiry.email,
        phone: enquiry.phone || null,
        company: enquiry.company || null,
        source: 'website-contact',
        status: 'lead',
        tags: JSON.stringify(['website', enquiry.topic.toLowerCase().replace(/\s+/g, '-')]),
        metadata: JSON.stringify({ topic: enquiry.topic, subject: enquiry.subject, page: 'alolabs.net' }),
        lastContactAt: new Date(),
      },
    });
    await db.crmNote.create({
      data: {
        contactId: contact.id,
        content: `${enquiry.subject}\n\n${enquiry.message}`,
        createdBy: 'website-contact-form',
      },
    });
    const delivered = await notifyHouse(enquiry);
    return NextResponse.json({
      ok: true,
      delivered,
      message: delivered
        ? 'Your request has been sent; we will reply within one business day.'
        : 'Your request has been recorded. For anything urgent, email ' + HOUSE_EMAIL + '.',
    });
  } catch (error) {
    console.error('[contact] failed to record enquiry', error);
    return NextResponse.json(
      { ok: false, message: `The message could not be recorded. Please email ${HOUSE_EMAIL}.` },
      { status: 502 },
    );
  }
}
