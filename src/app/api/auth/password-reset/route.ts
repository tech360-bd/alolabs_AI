import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { hashPassword, revokeUserSessions } from '@/lib/auth';
import { parseBody } from '@/lib/validators';
import crypto from 'crypto';

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

    // Phase 1: request a reset. The response does not reveal whether the
    // address is registered; production delivery is handled by the mailer.
    if (!token && !newPassword) {
      const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
      if (!user) {
        return NextResponse.json({ success: true, message: 'If the email exists, a reset link will be sent' });
      }

      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetValue = JSON.stringify({ userId: user.id, createdAt: Date.now() });
      await db.settings.upsert({
        where: { key: `password_reset:${resetToken}` },
        update: { value: resetValue, updatedAt: new Date() },
        create: { key: `password_reset:${resetToken}`, value: resetValue, type: 'json' },
      });
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'user.password_reset_requested',
          resource: 'User',
          details: JSON.stringify({ email: user.email }),
        },
      });

      // Development-only convenience for testing the reset flow. Never return
      // the reset credential from a production response.
      if (process.env.NODE_ENV !== 'production') {
        return NextResponse.json({ success: true, message: 'Reset token generated', data: { resetToken } });
      }
      return NextResponse.json({ success: true, message: 'If the email exists, a reset link will be sent' });
    }

    // Phase 2: consume the single-use reset token.
    const resetKey = `password_reset:${token}`;
    const resetEntry = await db.settings.findUnique({ where: { key: resetKey } });
    if (!resetEntry) {
      return NextResponse.json({ success: false, error: 'INVALID_TOKEN', message: 'Invalid or expired reset token' }, { status: 400 });
    }

    let resetData: { userId: string; createdAt: number };
    try {
      resetData = JSON.parse(resetEntry.value) as { userId: string; createdAt: number };
    } catch {
      await db.settings.delete({ where: { key: resetKey } }).catch(() => undefined);
      return NextResponse.json({ success: false, error: 'INVALID_TOKEN', message: 'Invalid or expired reset token' }, { status: 400 });
    }
    if (typeof resetData.userId !== 'string' || typeof resetData.createdAt !== 'number') {
      await db.settings.delete({ where: { key: resetKey } }).catch(() => undefined);
      return NextResponse.json({ success: false, error: 'INVALID_TOKEN', message: 'Invalid or expired reset token' }, { status: 400 });
    }
    if (Date.now() - resetData.createdAt >= RESET_TOKEN_EXPIRY_MS) {
      await db.settings.delete({ where: { key: resetKey } });
      return NextResponse.json({ success: false, error: 'TOKEN_EXPIRED', message: 'Reset token has expired' }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { id: resetData.userId } });
    if (!user) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND', message: 'User not found' }, { status: 404 });
    }

    const passwordHash = await hashPassword(newPassword!);
    await db.user.update({ where: { id: user.id }, data: { passwordHash, updatedAt: new Date() } });
    await db.settings.delete({ where: { key: resetKey } });
    await revokeUserSessions(user.id);
    await db.auditLog.create({
      data: { userId: user.id, action: 'user.password_reset_completed', resource: 'User', details: '{}' },
    });

    return NextResponse.json({ success: true, message: 'Password has been reset' });
  } catch (error) {
    console.error('Password reset error:', error);
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR', message: 'Internal server error' }, { status: 500 });
  }
}
