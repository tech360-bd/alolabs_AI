import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';

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
    const type = searchParams.get('type') || '';
    const category = searchParams.get('category') || '';
    const pricing = searchParams.get('pricing') || '';
    const search = searchParams.get('search') || '';
    const sort = searchParams.get('sort') || 'createdAt';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));

    const where: Prisma.MarketplaceListingWhereInput = {};

    if (type) {
      where.type = type;
    }
    if (category) {
      where.category = category;
    }
    if (pricing) {
      where.pricing = pricing;
    }
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
      ];
    }

    // Only show published listings by default
    where.status = 'published';

    // Build orderBy
    let orderBy: Prisma.MarketplaceListingOrderByWithRelationInput;
    switch (sort) {
      case 'rating':
        orderBy = { rating: 'desc' };
        break;
      case 'installCount':
        orderBy = { installCount: 'desc' };
        break;
      case 'createdAt':
      default:
        orderBy = { createdAt: 'desc' };
        break;
    }

    const [listings, total] = await Promise.all([
      db.marketplaceListing.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
      }),
      db.marketplaceListing.count({ where }),
    ]);

    return NextResponse.json({
      data: listings,
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error('Failed to fetch marketplace listings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch marketplace listings' },
      { status: 500 }
    );
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
    const {
      type,
      itemId,
      title,
      description,
      category,
      tags,
      version,
      authorId,
      authorName,
      pricing,
      priceMonthly,
      featured,
      status,
    } = body;

    if (!type || !['agent', 'skill', 'workflow'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid type. Must be one of: agent, skill, workflow' },
        { status: 400 }
      );
    }

    if (!itemId) {
      return NextResponse.json(
        { error: 'itemId is required' },
        { status: 400 }
      );
    }

    if (!title || !description) {
      return NextResponse.json(
        { error: 'title and description are required' },
        { status: 400 }
      );
    }

    if (pricing && !['free', 'premium', 'enterprise'].includes(pricing)) {
      return NextResponse.json(
        { error: 'Invalid pricing. Must be one of: free, premium, enterprise' },
        { status: 400 }
      );
    }

    const listing = await db.marketplaceListing.create({
      data: {
        type,
        itemId,
        title,
        description,
        category: category || null,
        tags: typeof tags === 'string' ? tags : JSON.stringify(tags || []),
        version: version || '1.0.0',
        authorId: authorId || null,
        authorName: authorName || null,
        pricing: pricing || 'free',
        priceMonthly: priceMonthly || 0,
        featured: featured || false,
        status: status || 'published',
      },
    });

    return NextResponse.json({ data: listing }, { status: 201 });
  } catch (error) {
    console.error('Failed to create marketplace listing:', error);
    return NextResponse.json(
      { error: 'Failed to create marketplace listing' },
      { status: 500 }
    );
  }
}