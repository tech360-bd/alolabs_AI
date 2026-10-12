import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAuth, requireRole } from '@/lib/api-auth';

const coursePagination = z.object({
  coursePage: z.coerce.number().int().min(1).default(1),
  courseLimit: z.coerce.number().int().min(1).max(100).default(10),
});

const universityUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z.string().min(1).max(255).optional(),
  country: z.string().min(1).optional(),
  city: z.string().min(1).optional(),
  campus: z.string().optional(),
  type: z.enum(['public', 'private']).optional(),
  foundedYear: z.number().int().min(1000).max(2100).nullable().optional(),
  studentCount: z.number().int().min(0).optional(),
  internationalStudents: z.number().int().min(0).optional(),
  website: z.string().optional(),
  description: z.string().optional(),
  rankingQS: z.number().int().positive().nullable().optional(),
  rankingTHE: z.number().int().positive().nullable().optional(),
  rankingARWU: z.number().int().positive().nullable().optional(),
  acceptanceRate: z.number().min(0).max(100).nullable().optional(),
  status: z.string().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth();
    const { id } = await params;

    const searchParams = new URL(request.url).searchParams;
    const pagination = coursePagination.safeParse(Object.fromEntries(searchParams.entries()));
    const coursePage = pagination.success ? pagination.data.coursePage : 1;
    const courseLimit = pagination.success ? pagination.data.courseLimit : 10;

    const university = await db.university.findUnique({
      where: { id },
      include: {
        faculties: true,
        scholarships: true,
        accommodations: true,
        intakes: { orderBy: [{ year: 'desc' }, { month: 'asc' }] },
        courses: {
          skip: (coursePage - 1) * courseLimit,
          take: courseLimit,
          orderBy: { createdAt: 'desc' },
        },
        _count: { select: { courses: true } },
      },
    });

    if (!university) {
      return NextResponse.json({ success: false, error: 'University not found' }, { status: 404 });
    }

    const { _count, courses, ...rest } = university;
    return NextResponse.json({
      success: true,
      data: {
        ...rest,
        courses,
        coursePagination: {
          page: coursePage,
          limit: courseLimit,
          total: _count.courses,
        },
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('University GET by ID error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole('admin', 'super_admin');
    const { id } = await params;

    const body = await request.json();
    const parsed = universityUpdateSchema.safeParse(body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        { success: false, error: `${firstIssue.path.join('.')}: ${firstIssue.message}` },
        { status: 400 },
      );
    }

    const existing = await db.university.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'University not found' }, { status: 404 });
    }

    const university = await db.university.update({
      where: { id },
      data: parsed.data,
    });

    return NextResponse.json({ success: true, data: university });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    console.error('University PUT error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
