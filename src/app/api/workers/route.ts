import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';
import {
  parseBody,
  parseQuery,
  paginationQuery,
  buildWhereClause,
  buildOrderBy,
  paginatedResponse,
} from '@/lib/validators';

const workerCreateSchema = z.object({
  name: z.string().min(1),
  host: z.string().min(1),
  port: z.number().int(),
  concurrency: z.number().int().default(5),
  maxMemoryMb: z.number().int().default(512),
});

const workerUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  host: z.string().optional(),
  port: z.number().int().optional(),
  status: z.enum(['idle', 'busy', 'draining', 'offline']).optional(),
  concurrency: z.number().int().optional(),
  maxMemoryMb: z.number().int().optional(),
  activeJobs: z.number().int().optional(),
  cpuUsage: z.number().optional(),
  memoryUsageMb: z.number().int().optional(),
  totalProcessed: z.number().int().optional(),
  totalFailed: z.number().int().optional(),
  lastError: z.string().optional(),
});

// GET /api/workers
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const parsed = parseQuery(paginationQuery, new URL(request.url).searchParams);
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status });

    const { page, limit, sort, order, search } = parsed.data;
    const where = buildWhereClause(['name', 'host'], search);
    const orderBy = buildOrderBy(sort, order);

    const [workers, total] = await Promise.all([
      db.workerNode.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.workerNode.count({ where }),
    ]);

    return NextResponse.json(paginatedResponse(workers, page, limit, total));
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Workers GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/workers
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = parseBody(workerCreateSchema, body);
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status });

    const worker = await db.workerNode.create({ data: parsed.data });

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'create',
        resource: 'workers',
        details: JSON.stringify({ workerId: worker.id, name: worker.name }),
      },
    });

    return NextResponse.json({ data: worker }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Workers POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/workers
export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = parseBody(workerUpdateSchema, body);
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status });

    const { id, ...updateData } = parsed.data;

    const existing = await db.workerNode.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Worker not found' }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (updateData.name !== undefined) data.name = updateData.name;
    if (updateData.host !== undefined) data.host = updateData.host;
    if (updateData.port !== undefined) data.port = updateData.port;
    if (updateData.status !== undefined) data.status = updateData.status;
    if (updateData.concurrency !== undefined) data.concurrency = updateData.concurrency;
    if (updateData.maxMemoryMb !== undefined) data.maxMemoryMb = updateData.maxMemoryMb;
    if (updateData.activeJobs !== undefined) data.activeJobs = updateData.activeJobs;
    if (updateData.cpuUsage !== undefined) data.cpuUsage = updateData.cpuUsage;
    if (updateData.memoryUsageMb !== undefined) data.memoryUsageMb = updateData.memoryUsageMb;
    if (updateData.totalProcessed !== undefined) data.totalProcessed = updateData.totalProcessed;
    if (updateData.totalFailed !== undefined) data.totalFailed = updateData.totalFailed;
    if (updateData.lastError !== undefined) data.lastError = updateData.lastError;

    const worker = await db.workerNode.update({
      where: { id },
      data,
    });

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'update',
        resource: 'workers',
        details: JSON.stringify({ workerId: id, changes: Object.keys(updateData) }),
      },
    });

    return NextResponse.json({ data: worker });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Workers PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/workers
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const existing = await db.workerNode.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Worker not found' }, { status: 404 });
    }

    await db.workerNode.delete({ where: { id } });

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'delete',
        resource: 'workers',
        details: JSON.stringify({ workerId: id, name: existing.name }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Workers DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
