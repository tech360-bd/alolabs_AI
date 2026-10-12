/**
 * Secrets API
 * ALO Labs AIOS — Admin-only secret management.
 *
 * GET    /api/security/secrets — List secret keys (super_admin only)
 * POST   /api/security/secrets — Set/update a secret (super_admin only)
 * DELETE /api/security/secrets — Remove a secret (super_admin only)
 */

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import {
  listSecrets,
  getSecret,
  setSecret,
  rotateSecret,
  validateSecrets,
} from '@/lib/security/secret-manager';

// ─── GET: List Secret Keys ───────────────────────────────────────────

export async function GET() {
  try {
    await requireRole('super_admin');

    const [secrets, validation] = await Promise.all([
      listSecrets(),
      validateSecrets(),
    ]);

    return NextResponse.json({
      secrets,
      validation,
      total: secrets.length,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden: super_admin access required' }, { status: 403 });
    }
    console.error('Secrets list error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ─── POST: Set/Update Secret ─────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const user = await requireRole('super_admin');

    const body = await request.json();
    const { key, value, rotate = false } = body as {
      key?: string;
      value?: string;
      rotate?: boolean;
    };

    if (!key || typeof key !== 'string') {
      return NextResponse.json(
        { error: 'key is required and must be a string' },
        { status: 400 },
      );
    }

    // Validate key name
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
      return NextResponse.json(
        { error: 'Key must be UPPER_SNAKE_CASE format (e.g., API_KEY_NAME)' },
        { status: 400 },
      );
    }

    // Prevent overwriting critical environment variable patterns
    const protectedKeys = ['DATABASE_URL', 'REDIS_URL', 'POSTGRES_URL'];
    if (protectedKeys.includes(key) && process.env[key]) {
      return NextResponse.json(
        { error: `Cannot overwrite protected environment variable "${key}" via API` },
        { status: 403 },
      );
    }

    if (rotate) {
      // Rotate: generate new value or use provided value
      const newValue = await rotateSecret(key, value);
      return NextResponse.json({
        success: true,
        message: `Secret "${key}" rotated successfully`,
        value: newValue, // Only returned once on rotation
      });
    }

    if (!value || typeof value !== 'string') {
      return NextResponse.json(
        { error: 'value is required (unless using rotate: true)' },
        { status: 400 },
      );
    }

    // Minimum length validation
    if (value.length < 8) {
      return NextResponse.json(
        { error: 'Secret value must be at least 8 characters long' },
        { status: 400 },
      );
    }

    await setSecret(key, value);

    // Audit log
    try {
      const { db } = await import('@/lib/db');
      await db.auditLog.create({
        data: {
          userId: user.userId,
          action: 'secret_set',
          resource: 'secret',
          details: JSON.stringify({ key }),
        },
      });
    } catch {
      /* ignore */
    }

    // Mask existing value for confirmation
    const current = await getSecret(key);
    const masked = current
      ? `${current.slice(0, 4)}${'*'.repeat(Math.max(0, current.length - 8))}${current.slice(-4)}`
      : 'unknown';

    return NextResponse.json({
      success: true,
      message: `Secret "${key}" set successfully`,
      maskedValue: masked,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden: super_admin access required' }, { status: 403 });
    }
    console.error('Secrets set error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

// ─── DELETE: Remove Secret ───────────────────────────────────────────

export async function DELETE(request: Request) {
  try {
    const user = await requireRole('super_admin');

    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json(
        { error: 'key query parameter is required' },
        { status: 400 },
      );
    }

    // Delete from database
    const { db } = await import('@/lib/db');
    const result = await db.settings.deleteMany({
      where: { key: `secret:encrypted:${key}` },
    });

    // Clear Redis cache
    try {
      const { redisDel } = await import('@/lib/redis');
      await redisDel(`secret:cache:${key}`);
    } catch {
      /* ignore */
    }

    // Audit log
    try {
      await db.auditLog.create({
        data: {
          userId: user.userId,
          action: 'secret_delete',
          resource: 'secret',
          details: JSON.stringify({ key, deleted: result.count > 0 }),
        },
      });
    } catch {
      /* ignore */
    }

    if (result.count === 0) {
      return NextResponse.json(
        { error: `Secret "${key}" not found in database` },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      message: `Secret "${key}" removed from database`,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden: super_admin access required' }, { status: 403 });
    }
    console.error('Secrets delete error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}