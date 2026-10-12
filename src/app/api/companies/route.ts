import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import crypto from 'crypto';

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export async function GET(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const companies = await db.company.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { usageLogs: true, users: true } },
      },
    });

    const data = companies.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      domain: c.domain,
      status: c.status,
      webCrmConnected: c.webCrmConnected,
      monthlyUsageLimit: c.monthlyUsageLimit,
      usageCount: c._count.usageLogs,
      userCount: c._count.users,
    }));

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

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
    const { name, slug, domain } = body;

    if (!name || !slug || !domain) {
      return NextResponse.json(
        { error: 'name, slug, and domain are required' },
        { status: 400 }
      );
    }

    const existing = await db.company.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json(
        { error: 'Company with this slug already exists' },
        { status: 409 }
      );
    }

    const apiSecret = crypto.randomBytes(32).toString('hex');

    const company = await db.company.create({
      data: {
        name,
        slug,
        domain,
        status: 'active',
        monthlyUsageLimit: 10000,
        apiSecret,
      },
    });

    return NextResponse.json(
      {
        id: company.id,
        name: company.name,
        slug: company.slug,
        domain: company.domain,
        status: company.status,
        webCrmConnected: company.webCrmConnected,
        monthlyUsageLimit: company.monthlyUsageLimit,
        usageCount: 0,
        userCount: 0,
        apiSecret, // returned only once on creation
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}