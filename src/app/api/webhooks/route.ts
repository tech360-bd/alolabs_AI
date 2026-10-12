import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import crypto from 'crypto';

// GET /api/webhooks
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

    const where: Record<string, unknown> = {};
    if (companySlug) {
      const company = await db.company.findUnique({ where: { slug: companySlug } });
      if (company) where.companyId = company.id;
    }

    const webhooks = await db.webhookConfig.findMany({
      where,
      include: {
        company: {
          select: { name: true, slug: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const data = webhooks.map((w) => ({
      id: w.id,
      name: w.name,
      companyId: w.companyId,
      companyName: w.company?.name ?? '',
      url: w.url,
      events: JSON.parse(w.events || '[]'),
      isActive: w.isActive,
      lastTriggeredAt: w.lastTriggeredAt?.toISOString() ?? null,
      createdAt: w.createdAt.toISOString(),
      updatedAt: w.updatedAt.toISOString(),
    }));

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/webhooks
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
    const { companyId, name, url, events } = body;

    if (!companyId || !name || !url || !events || events.length === 0) {
      return NextResponse.json({ error: 'companyId, name, url, and events are required' }, { status: 400 });
    }

    const company = await db.company.findUnique({ where: { id: companyId } });
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const webhookSecret = crypto.randomBytes(32).toString('hex');

    const webhook = await db.webhookConfig.create({
      data: {
        companyId,
        name,
        url,
        events: JSON.stringify(events),
        secret: webhookSecret,
        isActive: true,
      },
    });

    return NextResponse.json({
      id: webhook.id,
      name: webhook.name,
      secret: webhookSecret,
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}