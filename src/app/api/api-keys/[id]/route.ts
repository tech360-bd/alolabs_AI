import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import crypto from 'crypto';
import { requireAuth, canManageCompany, type AuthenticatedUser } from '@/lib/api-auth';

/**
 * /api/api-keys/[id] — legacy single-key management (get / patch: revoke / rotate).
 *
 * P0-A FIX: previously the PATCH handler verified only that a session existed,
 * then mutated any key by id — any authenticated user could revoke or rotate
 * any tenant's API keys. Now: key ownership + company membership is verified
 * on every read/mutation. Cross-tenant access returns 404 (not 403) to prevent
 * resource enumeration.
 */

function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function generatePlainKey(): string {
  const random = crypto.randomBytes(32).toString('hex').slice(0, 32);
  return `ako-${random}`;
}

function clientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

async function audit(userId: string, action: string, details: Record<string, unknown>, ip: string) {
  try {
    await db.auditLog.create({
      data: { action, resource: 'CompanyApiKey', details: JSON.stringify(details), userId, ipAddress: ip },
    });
  } catch {
    /* best-effort */
  }
}

/**
 * Verify the caller may manage the key with `id`. Returns the key row or
 * throws a V1Error-shaped error that the caller converts to a response.
 */
async function authorizeKeyAccess(
  user: AuthenticatedUser,
  keyId: string,
  requireManage: boolean,
): Promise<{ id: string; companyId: string; name: string; keyHash: string }> {
  const key = await db.companyApiKey.findUnique({
    where: { id: keyId },
    select: { id: true, companyId: true, name: true, keyHash: true },
  });
  if (!key) return null as never; // caller returns 404

  // Super admin may access any key. Non-admin must own it.
  const isSuperAdmin = user.role === 'super_admin';
  const ownsKey = user.companyId === key.companyId;
  if (!isSuperAdmin && !ownsKey) return null as never; // 404, not 403

  if (requireManage && !isSuperAdmin && !canManageCompany(user)) {
    // Owned but not a manager — read is OK, mutation is not.
    throw { status: 403, code: 'FORBIDDEN', message: 'Insufficient role to manage API keys' };
  }
  return key;
}

// PATCH /api/api-keys/[id] — revoke, suspend, or rotate
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user: AuthenticatedUser;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    let key: { id: string; companyId: string; name: string; keyHash: string };
    try {
      key = await authorizeKeyAccess(user, id, true);
    } catch (denied) {
      const d = denied as { status: number; code: string; message: string };
      return NextResponse.json({ error: d.message }, { status: d.status });
    }
    if (!key) {
      return NextResponse.json({ error: 'Key not found' }, { status: 404 });
    }

    const body = await request.json();
    const { action } = body;
    const ip = clientIp(request);

    if (action === 'revoke' || action === 'suspend') {
      await db.companyApiKey.update({ where: { id }, data: { isActive: false } });
      await audit(user.userId, `company_api_key.${action}`, { keyId: id, companyId: key.companyId, keyName: key.name }, ip);
      return NextResponse.json({ success: true });
    }

    if (action === 'rotate') {
      const newPlainKey = generatePlainKey();
      const newKeyHash = hashKey(newPlainKey);
      const newPrefix = newPlainKey.slice(0, 8);

      const updatedKey = await db.companyApiKey.update({
        where: { id },
        data: {
          previousKeyHash: key.keyHash,
          keyHash: newKeyHash,
          keyPrefix: newPrefix,
          rotatedAt: new Date(),
        },
      });

      await audit(
        user.userId,
        'company_api_key.rotate',
        { keyId: id, companyId: key.companyId, keyName: key.name, rotatedAt: updatedKey.rotatedAt?.toISOString() },
        ip,
      );

      // plaintext returned once, never stored.
      return NextResponse.json({
        success: true,
        id: updatedKey.id,
        key: newPlainKey,
        keyPrefix: newPrefix,
        rotatedAt: updatedKey.rotatedAt?.toISOString(),
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[api-keys PATCH]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/api-keys/[id] — get key details (ownership-verified)
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user: AuthenticatedUser;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    let key: { id: string; companyId: string; name: string; keyHash: string };
    try {
      key = await authorizeKeyAccess(user, id, false);
    } catch (denied) {
      const d = denied as { status: number; code: string; message: string };
      return NextResponse.json({ error: d.message }, { status: d.status });
    }
    if (!key) {
      return NextResponse.json({ error: 'Key not found' }, { status: 404 });
    }

    const full = await db.companyApiKey.findUnique({
      where: { id },
      include: { company: { select: { name: true, slug: true } } },
    });
    if (!full) {
      return NextResponse.json({ error: 'Key not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: full.id,
      name: full.name,
      companyId: full.companyId,
      companyName: full.company.name,
      companySlug: full.company.slug,
      keyPrefix: full.keyPrefix,
      keySuffix: full.keySuffix,
      keyType: full.keyType,
      scopes: JSON.parse(full.scopes || '[]'),
      rateLimit: full.rateLimit,
      isActive: full.isActive,
      lastUsedAt: full.lastUsedAt?.toISOString() ?? null,
      rotatedAt: full.rotatedAt?.toISOString() ?? null,
      expiresAt: full.expiresAt?.toISOString() ?? null,
      createdAt: full.createdAt.toISOString(),
    });
  } catch (error) {
    console.error('[api-keys GET [id]]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
