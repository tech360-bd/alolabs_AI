import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import crypto from 'crypto';

function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function generatePlainKey(): string {
  const random = crypto.randomBytes(32).toString('hex').slice(0, 32);
  return `ako-${random}`;
}

// PATCH /api/api-keys/[id] — revoke, suspend, or rotate
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json();
    const { action } = body;

    const key = await db.companyApiKey.findUnique({ where: { id } });
    if (!key) {
      return NextResponse.json({ error: 'Key not found' }, { status: 404 });
    }

    if (action === 'revoke') {
      await db.companyApiKey.update({
        where: { id },
        data: { isActive: false },
      });
    } else if (action === 'suspend') {
      // For now, suspend = revoke. Could add a 'suspended' state later.
      await db.companyApiKey.update({
        where: { id },
        data: { isActive: false },
      });
    } else if (action === 'rotate') {
      // Generate new API key
      const newPlainKey = generatePlainKey();
      const newKeyHash = hashKey(newPlainKey);
      const newPrefix = newPlainKey.slice(0, 8);

      // Update record: store old hash, set new hash, mark rotated
      const updatedKey = await db.companyApiKey.update({
        where: { id },
        data: {
          previousKeyHash: key.keyHash,
          keyHash: newKeyHash,
          keyPrefix: newPrefix,
          rotatedAt: new Date(),
        },
      });

      // Create audit log entry for rotation
      await db.auditLog.create({
        data: {
          action: 'company_api_key.rotate',
          resource: 'CompanyApiKey',
          details: JSON.stringify({
            keyId: id,
            companyId: key.companyId,
            keyName: key.name,
            rotatedAt: updatedKey.rotatedAt?.toISOString(),
          }),
          ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
        },
      });

      // Return the new plain key (shown only once)
      return NextResponse.json({
        success: true,
        id: updatedKey.id,
        key: newPlainKey,
        keyPrefix: newPrefix,
        rotatedAt: updatedKey.rotatedAt?.toISOString(),
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/api-keys/[id] — get key details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const { id } = await params;
    const key = await db.companyApiKey.findUnique({
      where: { id },
      include: {
        company: { select: { name: true, slug: true } },
      },
    });

    if (!key) {
      return NextResponse.json({ error: 'Key not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: key.id,
      name: key.name,
      companyId: key.companyId,
      companyName: key.company.name,
      keyPrefix: key.keyPrefix,
      keyType: key.keyType,
      scopes: JSON.parse(key.scopes || '[]'),
      rateLimit: key.rateLimit,
      isActive: key.isActive,
      lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
      rotatedAt: key.rotatedAt?.toISOString() ?? null,
      expiresAt: key.expiresAt?.toISOString() ?? null,
      createdAt: key.createdAt.toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}