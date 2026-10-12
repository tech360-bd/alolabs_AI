import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/api-auth';

// GET /api/disaster-recovery — return DR config + recovery runs
export async function GET() {
  try {
    await requireRole('super_admin', 'admin');

    let config = await db.disasterRecoveryConfig.findFirst();

    if (!config) {
      config = await db.disasterRecoveryConfig.create({
        data: {
          rtoTargetMinutes: 60,
          rpoTargetMinutes: 15,
          failoverZone: 'primary',
          backupFrequency: 'daily',
          autoFailover: false,
        },
      });
    }

    const recoveryRuns = await db.recoveryRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({ config, recoveryRuns });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message === 'Forbidden' ? 'Forbidden' : 'Unauthorized' }, { status: error.message === 'Forbidden' ? 403 : 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/disaster-recovery — create a recovery run
export async function POST(req: NextRequest) {
  try {
    const user = await requireRole('super_admin', 'admin');
    const body = await req.json();
    const { type, triggeredBy } = body;

    if (!type) {
      return NextResponse.json({ error: 'type is required' }, { status: 400 });
    }

    const run = await db.recoveryRun.create({
      data: {
        type,
        triggeredBy: triggeredBy || user.userId || 'system',
        status: 'pending',
      },
    });

    return NextResponse.json({ data: run }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message === 'Forbidden' ? 'Forbidden' : 'Unauthorized' }, { status: error.message === 'Forbidden' ? 403 : 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}