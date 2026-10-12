import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

// GET /api/webhooks/deliveries — real delivery logs from webhookDelivery table
export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const skip = (page - 1) * limit;
    const webhookId = searchParams.get('webhookId');

    const where: Record<string, unknown> = {};
    if (webhookId) where.webhookId = webhookId;

    const [data, total] = await Promise.all([
      db.webhookDelivery.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          webhook: { select: { id: true, name: true, url: true } },
        },
      }),
      db.webhookDelivery.count({ where }),
    ]);

    return NextResponse.json({
      data,
      total,
      page,
      limit,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}