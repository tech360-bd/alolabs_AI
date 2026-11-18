import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { hashPassword, revokeUserSessions } from '@/lib/auth';
import { parseBody } from '@/lib/validators';
import crypto from 'node:crypto';
import { checkLimit } from '@/lib/security/rate-limiter';
import { SMTPEmailService } from '@/lib/email/smtp';

const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

const RESET_TOKEN_EXPIRY_MS = 900_000; // 15 minutes
const resetRequestSchema = z.object({
  email: z.string().trim().email().max(255),
  token: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  newPassword: z.string().min(12).max(128).optional(),
}).strict().refine(
  ({ token, newPassword }) => Boolean(token) === Boolean(newPassword),
  { message: 'token and newPassword must be provided together' },
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = parseBody(resetRequestSchema, body);
    if (parsed.error) {
      return NextResponse.json({ success: false, error: 'BAD_REQUEST', message: parsed.error.message }, { status: 400 });
    }
    const { email, token, newPassword } = parsed.data;

    const normalized = email.toLowerCase();
    const key = `recovery:v2:${digest(normalized)}`;
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!(await checkLimit(`recovery:ip:${ip}`, 20, 60_000)).allowed || !(await checkLimit(`recovery:${token ? 'apply' : 'request'}:${key}`, 5, 900_000)).allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }
    if (!token) {
      const { SMTP_HOST: host, SMTP_USER: sender, SMTP_PASS: pass } = process.env;
      const port = Number(process.env.SMTP_PORT || 587);
      if (!host || !sender || !pass || !Number.isInteger(port) || port <= 0 || port > 65535) {
        return NextResponse.json({ error: 'Password recovery is not configured. Contact your administrator.' }, { status: 503 });
      }
      const user = await db.user.findUnique({ where: { email: normalized }, select: { id: true, isActive: true, email: true } });
      if (user?.isActive) {
        const code = crypto.randomBytes(32).toString('hex'), value = digest(code);
        await db.settings.upsert({ where: { key }, create: { key, value, type: 'string' }, update: { value, updatedAt: new Date() } });
        const transport = new SMTPEmailService({ host, port, secure: port === 465, auth: { user: sender, pass } });
        const sent = await transport.send({
          id: '', from: process.env.SMTP_FROM || sender, to: [user.email], cc: [], bcc: [],
          subject: 'ALO Labs password recovery code', text: `Enter this code in the ALO Labs password recovery form within 15 minutes:\n\n${code}\n\nIf you did not request this, ignore this message.`,
          html: '', attachments: [], headers: {}, inReplyTo: null, references: [],
        });
        if (!sent.success) await db.settings.deleteMany({ where: { key, value } });
        await db.auditLog.create({ data: { userId: user.id, action: sent.success ? 'user.password_reset_requested' : 'user.password_reset_delivery_failed', resource: 'User', details: '{}' } });
      }
      // The credential is delivered only to the account's mailbox, even in development.
      return NextResponse.json({ success: true, message: 'Check your mailbox if this is an active account.' });
    }
    const value = digest(token.toLowerCase());
    const activeIntent = () => ({ key, value, updatedAt: { gt: new Date(Date.now() - RESET_TOKEN_EXPIRY_MS) } });
    const invalid = () => NextResponse.json({ error: 'Invalid or expired recovery code.' }, { status: 400 });
    if (!await db.settings.findFirst({ where: activeIntent(), select: { id: true } })) return invalid();
    const passwordHash = await hashPassword(newPassword!);
    const applied = await db.$transaction(async tx => {
      if ((await tx.settings.deleteMany({ where: activeIntent() })).count !== 1) return false;
      const user = await tx.user.update({ where: { email: normalized, isActive: true }, data: { passwordHash } });
      await revokeUserSessions(user.id, tx);
      await tx.auditLog.create({ data: { userId: user.id, action: 'user.password_reset_completed', resource: 'User', details: '{}' } });
      return true;
    });
    return applied ? NextResponse.json({ success: true, message: 'Password changed. Sign in again.' }) : invalid();
  } catch {
    return NextResponse.json({ error: 'Password recovery is unavailable.' }, { status: 500 });
  }
}
