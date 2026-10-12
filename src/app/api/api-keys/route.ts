import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import crypto from 'crypto';

// GET /api/api-keys
export async function GET(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const companySlug = searchParams.get('company') || '';
    const search = searchParams.get('search') || '';

    const where: Record<string, unknown> = {};
    if (companySlug) {
      const company = await db.company.findUnique({ where: { slug: companySlug } });
      if (company) where.companyId = company.id;
    }

    const keys = await db.companyApiKey.findMany({
      where,
      include: {
        company: {
          select: { name: true, slug: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    let data = keys.map((k) => ({
      id: k.id,
      name: k.name,
      companyId: k.companyId,
      companyName: k.company.name,
      companySlug: k.company.slug,
      keyPrefix: k.keyPrefix,
      keyType: k.keyType,
      scopes: JSON.parse(k.scopes || '[]'),
      rateLimit: k.rateLimit,
      isActive: k.isActive,
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      expiresAt: k.expiresAt?.toISOString() ?? null,
      createdAt: k.createdAt.toISOString(),
    }));

    if (search) {
      const q = search.toLowerCase();
      data = data.filter(
        (k) =>
          k.name.toLowerCase().includes(q) ||
          k.companyName.toLowerCase().includes(q)
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/api-keys
export async function POST(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const body = await request.json();
    const { companyId, name, keyType, scopes, rateLimit, expiresAt } = body;

    if (!companyId || !name) {
      return NextResponse.json({ error: 'companyId and name are required' }, { status: 400 });
    }

    const company = await db.company.findUnique({ where: { id: companyId } });
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Generate API key
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

    return NextResponse.json({
      id: apiKey.id,
      name: apiKey.name,
      plainKey,
      keyPrefix: apiKey.keyPrefix,
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}