import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export async function GET() {
  try {
    await requireAuth();

    const [totalUniversities, totalCourses, totalScholarships, totalAccommodations] =
      await Promise.all([
        db.university.count({ where: { status: 'active' } }),
        db.universityCourse.count({ where: { status: 'active' } }),
        db.universityScholarship.count({ where: { status: 'active' } }),
        db.universityAccommodation.count({ where: { status: 'available' } }),
      ]);

    // Unique countries - lightweight groupBy
    const countryRows = await db.university.groupBy({
      by: ['country'],
      where: { status: 'active' },
      _count: true,
      orderBy: { _count: { id: 'desc' } },
    });

    const countries = countryRows.map((r) => r.country);

    // Average tuition - two separate lightweight aggregation queries
    const [undergradResult, postgradResult] = await Promise.all([
      db.universityCourse.aggregate({
        _avg: { tuitionFeeUSD: true },
        where: { status: 'active', level: 'undergraduate', tuitionFeeUSD: { not: null } },
      }),
      db.universityCourse.aggregate({
        _avg: { tuitionFeeUSD: true },
        where: { status: 'active', level: 'postgraduate', tuitionFeeUSD: { not: null } },
      }),
    ]);

    // Top 5 by QS ranking (lower number = better rank)
    const topRanked = await db.university.findMany({
      where: { status: 'active', rankingQS: { not: null } },
      orderBy: { rankingQS: 'asc' },
      take: 5,
      select: {
        id: true,
        name: true,
        slug: true,
        country: true,
        city: true,
        rankingQS: true,
        rankingTHE: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        totalUniversities,
        totalCourses,
        totalScholarships,
        totalAccommodations,
        countries: {
          count: countries.length,
          list: countries,
        },
        averageTuition: {
          undergraduate: undergradResult._avg.tuitionFeeUSD ?? null,
          postgraduate: postgradResult._avg.tuitionFeeUSD ?? null,
        },
        topRanked,
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('University stats GET error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
