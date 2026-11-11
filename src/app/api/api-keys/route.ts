import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import crypto from 'crypto';
import { requireAuth, canManageCompany, type AuthenticatedUser } from '@/lib/api-auth';

/**
 * /api/api-keys — legacy API key management surface.
 *
 * P0-A FIX: previously this route verified only that a session existed, then
 * accepted a caller-supplied `companyId` and listed every company's keys.
 * Any authenticated user could read/create/revoke any tenant's API keys.
 *
 * Now: tenant identity is resolved server-side from the authenticated session.
 * Non-admin users see only their own company's keys. Platform admins
 * (super_admin) may optionally filter by `?company=<slug>` for support.
 * Every read/create/mutation is audited.
 */

async function audit(userId: string, action: string, details: Record<string, unknown>, ip: string) {
  try {
    await db.auditLog.create({
      data: {
        action,
        resource: 'CompanyApiKey',
        details: JSON.stringify(details),
        userId,
        ipAddress: ip,
      },
    });
  } catch {
    /* best-effort */
  }
}

function clientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function keyProjection(k: {
  id: string;
  name: string;
  companyId: string;
  keyPrefix: string;
  keySuffix: string;
  keyType: string;
  scopes: string;
  rateLimit: number;
  isActive: boolean;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  rotatedAt: Date | null;
  company: { name: string; slug: string };
}) {
  return {
    id: k.id,
    name: k.name,
    companyId: k.companyId,
    companyName: k.company.name,
    companySlug: k.company.slug,
    keyPrefix: k.keyPrefix,
    keySuffix: k.keySuffix,
    keyType: k.keyType,
    scopes: JSON.parse(k.scopes || '[]'),
    rateLimit: k.rateLimit,
    isActive: k.isActive,
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    expiresAt: k.expiresAt?.toISOString() ?? null,
    rotatedAt: k.rotatedAt?.toISOString() ?? null,
    createdAt: k.createdAt.toISOString(),
  };
}

// GET /api/api-keys — list keys (scoped to caller's company; admins may pass ?company=<slug>)
export async function GET(request: NextRequest) {
  let user: AuthenticatedUser;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const companySlug = searchParams.get('company') || '';
    const search = searchParams.get('search') || '';
    const ip = clientIp(request);

    // Super admins may inspect another company for support; everyone else is
    // scoped to their own company. A non-admin passing ?company= is still
    // scoped to their own — the param is ignored, not an error.
    const isAdmin = user.role === 'super_admin' || user.role === 'admin';
    const targetSlug = isAdmin ? companySlug : undefined;

    let where: Record<string, unknown> = {};
    if (targetSlug) {
      const company = await db.company.findUnique({ where: { slug: targetSlug }, select: { id: true } });
      where.companyId = company?.id ?? '__none__';
    } else if (!isAdmin) {
      // Non-admin: strictly own company. If the user has no company, return empty.
      where.companyId = user.companyId ?? '__none__';
    }
    // Admins without a ?company= filter see their own company's keys (safer
    // default than the old "all companies" behaviour).
    if (isAdmin && !targetSlug) {
      where.companyId = user.companyId ?? '__none__';
    }

    const keys = await db.companyApiKey.findMany({
      where,
      include: { company: { select: { name: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
    });

    let data = keys.map(keyProjection);
    if (search) {
      const q = search.toLowerCase();
      data = data.filter((k) => k.name.toLowerCase().includes(q) || k.companyName.toLowerCase().includes(q));
    }

    await audit(user.userId, 'company_api_key.list', { count: data.length, scopedTo: where.companyId }, ip);
    return NextResponse.json({ data });
  } catch (error) {
    console.error('[api-keys GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/api-keys — create a key (scoped to caller's company)
export async function POST(request: NextRequest) {
  let user: AuthenticatedUser;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, keyType, scopes, rateLimit, expiresAt } = body;

    // P0-A: companyId is resolved server-side. A caller-supplied companyId is
    // ignored (not trusted as authorization).
    const companyId = user.companyId;
    if (!companyId) {
      return NextResponse.json({ error: 'No active company membership' }, { status: 403 });
    }
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    // Only company admins / managers or platform admins may create keys.
    if (!canManageCompany(user) && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const company = await db.company.findUnique({ where: { id: companyId }, select: { slug: true } });
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const plainKey = `alo_${company.slug}_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(plainKey).digest('hex');
    const keyPrefix = plainKey.slice(0, 12);
    const keySuffix = plainKey.slice(-4);

    const apiKey = await db.companyApiKey.create({
      data: {
        companyId,
        name,
        keyHash,
        keyPrefix,
        keySuffix,
        keyType: keyType || 'test',
        scopes: JSON.stringify(scopes || []),
        rateLimit: rateLimit || 1000,
        isActive: true,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });

    await audit(
      user.userId,
      'company_api_key.create',
      { keyId: apiKey.id, keyName: apiKey.name, companyId, keyType: apiKey.keyType },
      clientIp(request),
    );

    // plaintext returned once, never stored.
    return NextResponse.json(
      { id: apiKey.id, name: apiKey.name, plainKey, keyPrefix: apiKey.keyPrefix },
      { status: 201 },
    );
  } catch (error) {
    console.error('[api-keys POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
