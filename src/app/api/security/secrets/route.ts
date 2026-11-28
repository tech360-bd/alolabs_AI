/**
 * Secrets API
 * ALO Labs AIOS — Admin-only secret management.
 *
 * GET    /api/security/secrets — List secret keys (super_admin only)
 * POST   /api/security/secrets — Set/update/rotate a secret (super_admin only)
 * DELETE /api/security/secrets — Remove a secret (super_admin only)
 */

import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import {
  listSecrets,
  getSecret,
  setSecret,
  rotateSecret,
  validateSecrets,
} from '@/lib/security/secret-manager';

const ENV_ONLY_PATTERN = new Set([
  'DATABASE_URL',
  'REDIS_URL',
  'POSTGRES_URL',
  'ENCRYPTION_KEY',
  'ENCRYPTION_KEYS',
  'ENCRYPTION_KEY_ACTIVE',
  'ENCRYPTION_KEY_PREVIOUS',
  'ALO_KEK',
  'ALO_KEK_KEYS',
  'ALO_KEK_ACTIVE',
]);

function isProtectedSecretKey(key: string): boolean {
  if (ENV_ONLY_PATTERN.has(key)) return true;
  if (
    key === 'APP_SECRET' &&
    !process.env.ENCRYPTION_KEY &&
    !process.env.ENCRYPTION_KEYS
  ) {
    return true;
  }
  return false;
}

function safeMask(secret: string): string {
  if (!secret || secret.length < 16) return '****************';
  return `************${secret.slice(-4)}`;
}

function safeFingerprint(secret: string): string {
  const digest = createHash('sha256').update(secret).digest('hex').slice(0, 12);
  return `sha256:${digest}`;
}

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

    // Never allow overwriting protected infrastructure or encryption keys via DB API
    if (isProtectedSecretKey(key)) {
      return NextResponse.json(
        { error: `Cannot modify env-only infrastructure or encryption key "${key}" via API` },
        { status: 403 },
      );
    }

    if (value !== undefined) {
      if (typeof value !== 'string' || value.length < 8) {
        return NextResponse.json(
          { error: 'Secret value must be a string at least 8 characters long' },
          { status: 400 },
        );
      }
      if (value.length > 65536) {
        return NextResponse.json(
          { error: 'Secret value exceeds maximum allowed length (65536 characters)' },
          { status: 400 },
        );
      }
    }

    if (rotate) {
      const rotatedValue = await rotateSecret(key, value);

      try {
        const { db } = await import('@/lib/db');
        await db.auditLog.create({
          data: {
            userId: user.userId,
            action: 'secret_rotate',
            resource: 'secret',
            details: JSON.stringify({ key }),
          },
        });
      } catch {
        /* ignore */
      }

      // Resolve back through the secret manager to ensure DB update is active
      const resolved = await getSecret(key);
      const effective = resolved ?? rotatedValue;

      // Never return complete secret values through the API
      return NextResponse.json({
        success: true,
        message: `Secret "${key}" rotated successfully`,
        key,
        rotated: true,
        source: 'database',
        maskedValue: safeMask(effective),
        fingerprint: safeFingerprint(effective),
        lastRotatedAt: new Date().toISOString(),
      });
    }

    if (!value || typeof value !== 'string') {
      return NextResponse.json(
        { error: 'value is required (unless using rotate: true)' },
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

    // Read back through getSecret() (DB takes precedence over static env) and return safe mask only
    const current = await getSecret(key);
    const effective = current ?? value;

    return NextResponse.json({
      success: true,
      message: `Secret "${key}" set successfully`,
      key,
      source: 'database',
      maskedValue: safeMask(effective),
      fingerprint: safeFingerprint(effective),
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden: super_admin access required' }, { status: 403 });
    }
    if (error instanceof Error && error.name === 'SecretManagerError') {
      const code = (error as Error & { code?: string }).code;
      if (code === 'protected-key') {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      if (code === 'invalid-secret-name' || code === 'not-set' || code === 'invalid-record') {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    console.error('Secrets set error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
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

    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
      return NextResponse.json(
        { error: 'Key must be UPPER_SNAKE_CASE format' },
        { status: 400 },
      );
    }

    if (isProtectedSecretKey(key)) {
      return NextResponse.json(
        { error: `Cannot delete env-only infrastructure or encryption key "${key}" via API` },
        { status: 403 },
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
