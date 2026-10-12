import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

const accommodationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  universityId: z.string().optional(),
  country: z.string().optional(),
  type: z.enum(['halls', 'apartments', 'homestay', 'private']).optional(),
  maxCostPerWeek: z.coerce.number().min(0).optional(),
});

type AccommodationQuery = z.infer<typeof accommodationQuery>;

function buildWhere(query: AccommodationQuery): Record<string, unknown> {
  const where: Record<string, unknown> = { status: 'available' };

  if (query.universityId) where.universityId = query.universityId;
  if (query.type) where.type = query.type;
  if (query.maxCostPerWeek !== undefined) where.costPerWeekUSD = { lte: query.maxCostPerWeek };

  if (query.country) {
    where.university = { country: { contains: query.country, mode: 'insensitive' } };
  }

  return where;
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const searchParams = new URL(request.url).searchParams;
    const parsed = accommodationQuery.safeParse(Object.fromEntries(searchParams.entries()));
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        { success: false, error: `${firstIssue.path.join('.')}: ${firstIssue.message}` },
        { status: 400 },
      );
    }

    const query = parsed.data;
    const where = buildWhere(query);

    const [accommodations, total] = await Promise.all([
      db.universityAccommodation.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          universityId: true,
          name: true,
          type: true,
          costPerWeekUSD: true,
          costPerWeekLocal: true,
          localCurrency: true,
          capacity: true,
          amenities: true,
          description: true,
          status: true,
          createdAt: true,
          university: { select: { name: true } },
        },
      }),
      db.universityAccommodation.count({ where }),
    ]);

    const data = accommodations.map((a) => ({
      ...a,
      universityName: a.university.name,
      university: undefined,
    }));

    return NextResponse.json({
      success: true,
      data: { accommodations: data, total, page: query.page, limit: query.limit },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Accommodation GET error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
