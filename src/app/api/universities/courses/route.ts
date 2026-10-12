import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

const coursesQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  country: z.string().optional(),
  universityId: z.string().optional(),
  level: z.enum(['undergraduate', 'postgraduate', 'phd', 'foundation']).optional(),
  facultyName: z.string().optional(),
  maxTuition: z.coerce.number().min(0).optional(),
  search: z.string().optional(),
});

type CoursesQuery = z.infer<typeof coursesQuery>;

async function buildWhere(query: CoursesQuery): Promise<Record<string, unknown>> {
  const where: Record<string, unknown> = { status: 'active' };

  if (query.universityId) where.universityId = query.universityId;
  if (query.level) where.level = query.level;
  if (query.facultyName) where.facultyName = { contains: query.facultyName };
  if (query.maxTuition !== undefined) where.tuitionFeeUSD = { lte: query.maxTuition };

  if (query.country) {
    where.university = { country: { contains: query.country } };
  }

  if (query.search) {
    if (query.country) {
      // Already have university filter, resolve IDs
      const matchingUnis = await db.university.findMany({
        where: {
          country: { contains: query.country },
          OR: [{ name: { contains: query.search } }],
        },
        select: { id: true },
      });
      const uniIds = matchingUnis.map((u) => u.id);
      where.OR = [
        { universityId: { in: uniIds } },
        { name: { contains: query.search } },
      ];
      // Remove the top-level university filter since OR handles it
      delete where.university;
    } else {
      where.OR = [
        { name: { contains: query.search } },
        { university: { name: { contains: query.search } } },
      ];
    }
  }

  return where;
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const searchParams = new URL(request.url).searchParams;
    const parsed = coursesQuery.safeParse(Object.fromEntries(searchParams.entries()));
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        { success: false, error: `${firstIssue.path.join('.')}: ${firstIssue.message}` },
        { status: 400 },
      );
    }

    const query = parsed.data;
    const where = await buildWhere(query);

    const [courses, total] = await Promise.all([
      db.universityCourse.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          universityId: true,
          facultyName: true,
          name: true,
          slug: true,
          level: true,
          duration: true,
          tuitionFeeUSD: true,
          tuitionFeeLocal: true,
          localCurrency: true,
          intakeMonths: true,
          entryRequirements: true,
          description: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          university: { select: { name: true, country: true } },
        },
      }),
      db.universityCourse.count({ where }),
    ]);

    const data = courses.map((c) => ({
      ...c,
      universityName: c.university.name,
      universityCountry: c.university.country,
      university: undefined,
    }));

    return NextResponse.json({
      success: true,
      data: { courses: data, total, page: query.page, limit: query.limit },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Courses GET error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
