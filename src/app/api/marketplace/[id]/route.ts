import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

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

    const listing = await db.marketplaceListing.findUnique({
      where: { id },
      include: {
        reviews: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!listing) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: listing });
  } catch (error) {
    console.error('Failed to fetch marketplace listing:', error);
    return NextResponse.json(
      { error: 'Failed to fetch marketplace listing' },
      { status: 500 }
    );
  }
}

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

    const existing = await db.marketplaceListing.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      );
    }

    const {
      title,
      description,
      category,
      tags,
      version,
      pricing,
      priceMonthly,
      featured,
      status,
    } = body;

    if (status && !['draft', 'published', 'deprecated', 'removed'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be one of: draft, published, deprecated, removed' },
        { status: 400 }
      );
    }

    if (pricing && !['free', 'premium', 'enterprise'].includes(pricing)) {
      return NextResponse.json(
        { error: 'Invalid pricing. Must be one of: free, premium, enterprise' },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category;
    if (tags !== undefined) updateData.tags = typeof tags === 'string' ? tags : JSON.stringify(tags);
    if (version !== undefined) updateData.version = version;
    if (pricing !== undefined) updateData.pricing = pricing;
    if (priceMonthly !== undefined) updateData.priceMonthly = priceMonthly;
    if (featured !== undefined) updateData.featured = featured;
    if (status !== undefined) updateData.status = status;

    const listing = await db.marketplaceListing.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ data: listing });
  } catch (error) {
    console.error('Failed to update marketplace listing:', error);
    return NextResponse.json(
      { error: 'Failed to update marketplace listing' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    const existing = await db.marketplaceListing.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      );
    }

    // Soft-delete: set status to 'removed' instead of actually deleting
    const listing = await db.marketplaceListing.update({
      where: { id },
      data: { status: 'removed' },
    });

    return NextResponse.json({ data: listing });
  } catch (error) {
    console.error('Failed to remove marketplace listing:', error);
    return NextResponse.json(
      { error: 'Failed to remove marketplace listing' },
      { status: 500 }
    );
  }
}