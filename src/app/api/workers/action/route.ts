import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export async function GET() {
  try {
    await requireAuth();
    const workers = await db.settings.findMany({
      where: { key: { startsWith: 'worker:' } },
    });

    const poolConfig = await db.settings.findUnique({ where: { key: 'worker_pool_config' } });
    let pool = { minWorkers: 2, maxWorkers: 8, autoScale: true };
    if (poolConfig) {
      try { pool = { ...pool, ...JSON.parse(poolConfig.value) }; } catch { /* default */ }
    }

    const data = workers.map((w) => {
      try { return { id: w.id, key: w.key, ...JSON.parse(w.value), createdAt: w.createdAt, updatedAt: w.updatedAt }; }
      catch { return null; }
    }).filter(Boolean);

    return NextResponse.json({ data, pool });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Workers GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const { action, workerId, config } = body;

    if (action === 'start' || action === 'stop' || action === 'restart') {
      if (!workerId) {
        return NextResponse.json({ error: 'workerId is required' }, { status: 400 });
      }
      const worker = await db.settings.findUnique({ where: { id: workerId } });
      if (!worker) {
        return NextResponse.json({ error: 'Worker not found' }, { status: 404 });
      }
      const parsed = JSON.parse(worker.value);
      const newStatus = action === 'start' ? 'running' : action === 'stop' ? 'stopped' : 'restarting';
      await db.settings.update({
        where: { id: workerId },
        data: {
          value: JSON.stringify({ ...parsed, status: action === 'restart' ? 'running' : newStatus }),
        },
      });

      await db.auditLog.create({
        data: {
          userId: user.userId,
          action: `worker_${action}`,
          resource: 'worker',
          details: JSON.stringify({ workerId, action }),
        },
      });

      return NextResponse.json({ success: true, message: `Worker ${action}d` });
    }

    if (action === 'update_pool') {
      if (config) {
        await db.settings.upsert({
          where: { key: 'worker_pool_config' },
          create: { key: 'worker_pool_config', value: JSON.stringify(config) },
          update: { value: JSON.stringify(config) },
        });
        return NextResponse.json({ success: true, config });
      }
      return NextResponse.json({ error: 'config is required' }, { status: 400 });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Workers action POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}