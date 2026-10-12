import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

const scholarshipsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  country: z.string().optional(),
  universityId: z.string().optional(),
  type: z.enum(['merit', 'need', 'research', 'sports']).optional(),
  coverage: z.enum(['full', 'partial', 'tuition_only', 'living_only']).optional(),
  level: z.enum(['undergraduate', 'postgraduate', 'phd']).optional(),
  search: z.string().optional(),
});

type ScholarshipsQuery = z.infer<typeof scholarshipsQuery>;

async function buildWhere(query: ScholarshipsQuery): Promise<Record<string, unknown>> {
  const where: Record<string, unknown> = { status: 'active' };

  if (query.universityId) where.universityId = query.universityId;
  if (query.type) where.type = query.type;
  if (query.coverage) where.coverage = query.coverage;

  // Build university-level filters (country, level)
  const universityFilter: Record<string, unknown> = {};
  if (query.country) universityFilter.country = { contains: query.country };
  if (query.level) {
    universityFilter.courses = { some: { level: query.level } };
  }

  const hasUniversityFilter = Object.keys(universityFilter).length > 0;

  // If we need university filter + search, resolve university IDs first
  if (hasUniversityFilter && query.search) {
    const matchingUnis = await db.university.findMany({
      where: { ...universityFilter, OR: [{ name: { contains: query.search } }] },
      select: { id: true },
    });
    const uniIds = matchingUnis.map((u) => u.id);
    where.OR = [
      { universityId: { in: uniIds } },
      { name: { contains: query.search } },
      { eligibility: { contains: query.search } },
    ];
  } else if (hasUniversityFilter) {
    where.university = universityFilter;
  } else if (query.search) {
    where.OR = [
      { name: { contains: query.search } },
      { eligibility: { contains: query.search } },
      { university: { name: { contains: query.search } } },
    ];
  }

  return where;
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const searchParams = new URL(request.url).searchParams;
    const parsed = scholarshipsQuery.safeParse(Object.fromEntries(searchParams.entries()));
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        { success: false, error: `${firstIssue.path.join('.')}: ${firstIssue.message}` },
        { status: 400 },
      );
    }

    const query = parsed.data;
    const where = await buildWhere(query);

    const [scholarships, total] = await Promise.all([
      db.universityScholarship.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          universityId: true,
          name: true,
          type: true,
          coverage: true,
          amountUSD: true,
          amountLocal: true,
          localCurrency: true,
          eligibility: true,
          deadline: true,
          description: true,
          website: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          university: { select: { name: true, country: true } },
        },
      }),
      db.universityScholarship.count({ where }),
    ]);

    const data = scholarships.map((s) => ({
      ...s,
      universityName: s.university.name,
      universityCountry: s.university.country,
      university: undefined,
    }));

    return NextResponse.json({
      success: true,
      data: { scholarships: data, total, page: query.page, limit: query.limit },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Scholarships GET error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
