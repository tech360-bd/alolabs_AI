import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/api-auth';

const roles = ['super_admin', 'platform_super_admin', 'infrastructure_admin'];
const key = 'worker_pool_config';
const poolSchema = z.object({ minWorkers: z.number().int().min(1).max(32), maxWorkers: z.number().int().min(1).max(32), autoScale: z.boolean() }).strict().refine(c => c.minWorkers <= c.maxWorkers);
const defaults = { minWorkers: 2, maxWorkers: 8, autoScale: true };
function failure(err: unknown) {
  const status = err instanceof Error && err.message === 'Unauthorized' ? 401 : err instanceof Error && err.message === 'Forbidden' ? 403 : 500;
  return NextResponse.json({ error: status === 401 ? 'Unauthorized' : status === 403 ? 'Forbidden' : 'Worker registry unavailable' }, { status });
}

export async function GET() {
  try {
    await requireRole(...roles);
    const [data, saved] = await Promise.all([db.workerNode.findMany({ orderBy: { name: 'asc' }, take: 500 }), db.settings.findUnique({ where: { key } })]);
    const pool = saved ? poolSchema.parse(JSON.parse(saved.value)) : defaults;
    return NextResponse.json({ data, pool });
  } catch (err) { return failure(err); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole(...roles);
    const body = await request.json().catch(() => null);
    if (['start', 'stop', 'restart'].includes(body?.action)) {
      return NextResponse.json({ error: 'Use the host process supervisor. No process state was changed.' }, { status: 501 });
    }
    const parsed = poolSchema.safeParse(body?.config);
    if (body?.action !== 'update_pool' || !parsed.success) return NextResponse.json({ error: 'Expected a valid worker pool configuration' }, { status: 400 });
    const value = JSON.stringify(parsed.data);
    await db.$transaction([
      db.settings.upsert({ where: { key }, update: { value }, create: { key, value, type: 'json' } }),
      db.auditLog.create({ data: { userId: user.userId, action: 'update_pool', resource: 'workers', details: value } }),
    ]);
    return NextResponse.json({ success: true, config: parsed.data });
  } catch (err) { return failure(err); }
}
