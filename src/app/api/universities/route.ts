import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

const universitiesQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  country: z.string().optional(),
  city: z.string().optional(),
  type: z.enum(['public', 'private']).optional(),
  search: z.string().optional(),
  sortBy: z.enum(['rankingQS', 'name', 'studentCount']).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

type UniversitiesQuery = z.infer<typeof universitiesQuery>;

function buildWhere(query: UniversitiesQuery): Record<string, unknown> {
  const where: Record<string, unknown> = { status: 'active' };

  if (query.country) where.country = { contains: query.country, mode: 'insensitive' };
  if (query.city) where.city = { contains: query.city, mode: 'insensitive' };
  if (query.type) where.type = query.type;

  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { city: { contains: query.search, mode: 'insensitive' } },
      { country: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  return where;
}

function buildOrderBy(sortBy: string | undefined, sortOrder: 'asc' | 'desc'): Record<string, 'asc' | 'desc'> {
  if (!sortBy) return { name: 'asc' as const };
  return { [sortBy]: sortOrder };
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const searchParams = new URL(request.url).searchParams;
    const parsed = universitiesQuery.safeParse(Object.fromEntries(searchParams.entries()));
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        { success: false, error: `${firstIssue.path.join('.')}: ${firstIssue.message}` },
        { status: 400 },
      );
    }

    const query = parsed.data;
    const where = buildWhere(query);
    const orderBy = buildOrderBy(query.sortBy, query.sortOrder);

    const [universities, total] = await Promise.all([
      db.university.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          name: true,
          slug: true,
          country: true,
          city: true,
          campus: true,
          type: true,
          foundedYear: true,
          studentCount: true,
          internationalStudents: true,
          website: true,
          rankingQS: true,
          rankingTHE: true,
          rankingARWU: true,
          acceptanceRate: true,
          description: true,
          _count: {
            select: {
              faculties: true,
              courses: true,
              scholarships: true,
              accommodations: true,
            },
          },
        },
      }),
      db.university.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: { universities, total, page: query.page, limit: query.limit },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Universities GET error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
