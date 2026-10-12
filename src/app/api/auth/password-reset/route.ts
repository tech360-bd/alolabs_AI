import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, revokeUserSessions } from '@/lib/auth';
import crypto from 'crypto';

const RESET_TOKEN_EXPIRY_MS = 900_000; // 15 minutes

export async function POST(request: NextRequest) {
  try {
    const { email, token, newPassword } = await request.json();

    // Phase 1: Request reset
    if (!token && !newPassword && email) {
      const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
      if (!user) {
        // Don't reveal whether email exists
        return NextResponse.json({ success: true, status: 200, message: 'If the email exists, a reset link will be sent' });
      }

      const resetToken = crypto.randomBytes(32).toString('hex');
      await db.settings.upsert({
        where: { key: `password_reset:${resetToken}` },
        update: { value: JSON.stringify({ userId: user.id, createdAt: Date.now() }), updatedAt: new Date() },
        create: { key: `password_reset:${resetToken}`, value: JSON.stringify({ userId: user.id, createdAt: Date.now() }), type: 'json' },
      });

      await db.auditLog.create({
        data: { userId: user.id, action: 'user.password_reset_requested', resource: 'User', details: JSON.stringify({ email: user.email }) },
      });

      // In production, send email with reset link containing token
      // For now, return token (dev only - remove in production)
      if (process.env.NODE_ENV !== 'production') {
        return NextResponse.json({ success: true, status: 200, message: 'Reset token generated', data: { resetToken } });
      }

      return NextResponse.json({ success: true, status: 200, message: 'If the email exists, a reset link will be sent' });
    }

    // Phase 2: Execute reset
    if (token && newPassword && email) {
      if (newPassword.length < 12) {
        return NextResponse.json({ success: false, status: 400, message: 'Password must be at least 12 characters', error: 'WEAK_PASSWORD' }, { status: 400 });
      }

      const resetEntry = await db.settings.findUnique({ where: { key: `password_reset:${token}` } });
      if (!resetEntry) {
        return NextResponse.json({ success: false, status: 400, message: 'Invalid or expired reset token', error: 'INVALID_TOKEN' }, { status: 400 });
      }

      const resetData = JSON.parse(resetEntry.value);
      const age = Date.now() - resetData.createdAt;
      if (age > RESET_TOKEN_EXPIRY_MS) {
        await db.settings.delete({ where: { key: `password_reset:${token}` } });
        return NextResponse.json({ success: false, status: 400, message: 'Reset token has expired', error: 'TOKEN_EXPIRED' }, { status: 400 });
      }

      const user = await db.user.findUnique({ where: { id: resetData.userId } });
      if (!user) {
        return NextResponse.json({ success: false, status: 404, message: 'User not found', error: 'NOT_FOUND' }, { status: 404 });
      }

      const newHash = await hashPassword(newPassword);
      await db.user.update({ where: { id: user.id }, data: { passwordHash: newHash, updatedAt: new Date() } });
      await db.settings.delete({ where: { key: `password_reset:${token}` } });

      // Invalidate all existing sessions
      await revokeUserSessions(user.id);

      await db.auditLog.create({
        data: { userId: user.id, action: 'user.password_reset_completed', resource: 'User', details: '{}' },
      });

      return NextResponse.json({ success: true, status: 200, message: 'Password has been reset' });
    }

    return NextResponse.json({ success: false, status: 400, message: 'Invalid request', error: 'BAD_REQUEST' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, status: 500, message: 'Internal server error', error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
