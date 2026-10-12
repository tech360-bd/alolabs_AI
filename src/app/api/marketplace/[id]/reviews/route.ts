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
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));

    const listing = await db.marketplaceListing.findUnique({ where: { id } });
    if (!listing) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      );
    }

    const [reviews, total] = await Promise.all([
      db.marketplaceReview.findMany({
        where: { listingId: id },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.marketplaceReview.count({ where: { listingId: id } }),
    ]);

    return NextResponse.json({
      data: reviews,
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error('Failed to fetch reviews:', error);
    return NextResponse.json(
      { error: 'Failed to fetch reviews' },
      { status: 500 }
    );
  }
}

export async function POST(
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
    const { rating, title, comment, companyId, userId } = body;

    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: 'Rating is required and must be between 1 and 5' },
        { status: 400 }
      );
    }

    const listing = await db.marketplaceListing.findUnique({ where: { id } });
    if (!listing) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      );
    }

    const review = await db.marketplaceReview.create({
      data: {
        listingId: id,
        rating: Math.round(rating),
        title: title || null,
        comment: comment || null,
        companyId: companyId || null,
        userId: userId || null,
      },
    });

    // Recalculate the average rating and review count for the listing
    const agg = await db.marketplaceReview.aggregate({
      where: { listingId: id },
      _avg: { rating: true },
      _count: { rating: true },
    });

    await db.marketplaceListing.update({
      where: { id },
      data: {
        rating: agg._avg.rating ? Math.round(agg._avg.rating * 100) / 100 : 0,
        reviewCount: agg._count.rating,
      },
    });

    return NextResponse.json({ data: review }, { status: 201 });
  } catch (error) {
    console.error('Failed to create review:', error);
    return NextResponse.json(
      { error: 'Failed to create review' },
      { status: 500 }
    );
  }
}