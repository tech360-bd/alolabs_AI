import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

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

    const existing = await db.marketplaceListing.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      );
    }

    const listing = await db.marketplaceListing.update({
      where: { id },
      data: {
        installCount: {
          increment: 1,
        },
      },
    });

    return NextResponse.json({ data: listing });
  } catch (error) {
    console.error('Failed to increment install count:', error);
    return NextResponse.json(
      { error: 'Failed to increment install count' },
      { status: 500 }
    );
  }
}