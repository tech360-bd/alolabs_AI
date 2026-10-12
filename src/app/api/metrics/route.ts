import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';
import { parseBody } from '@/lib/validators';

const metricUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  value: z.number().optional(),
  labels: z.record(z.string(), z.unknown()).optional(),
  unit: z.string().optional(),
});

// GET /api/metrics — query metrics with optional aggregation
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const agg = searchParams.get('agg');
    const period = searchParams.get('period');
    const labels = searchParams.get('labels');
    const limit = Math.min(500, parseInt(searchParams.get('limit') || '100'));

    const where: Record<string, unknown> = {};
    if (name) where.name = name;

    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as Record<string, unknown>).gte = new Date(from);
      if (to) (where.createdAt as Record<string, unknown>).lte = new Date(to);
    }

    if (labels) {
      try {
        const labelFilters = JSON.parse(labels);
        for (const [key, value] of Object.entries(labelFilters)) {
          where.labels = { contains: `"${key}":"${value}"` };
        }
      } catch {
        return NextResponse.json({ error: 'Invalid labels JSON' }, { status: 400 });
      }
    }

    if (agg) {
      const validAggs = ['sum', 'avg', 'min', 'max', 'count'];
      if (!validAggs.includes(agg)) {
        return NextResponse.json({ error: `Invalid aggregation. Must be one of: ${validAggs.join(', ')}` }, { status: 400 });
      }

      const metrics = await db.metric.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        take: 10000,
      });

      if (metrics.length === 0) {
        return NextResponse.json({ data: { aggregation: agg, name, result: null, count: 0 } });
      }

      const values = metrics.map((m) => m.value);
      let result: number | null = null;

      switch (agg) {
        case 'sum': result = values.reduce((a, b) => a + b, 0); break;
        case 'avg': result = values.reduce((a, b) => a + b, 0) / values.length; break;
        case 'min': result = Math.min(...values); break;
        case 'max': result = Math.max(...values); break;
        case 'count': result = values.length; break;
      }

      let buckets: Array<{ bucket: string; value: number; count: number }> | null = null;
      if (period) {
        const periodMs = parsePeriod(period);
        if (periodMs > 0) {
          const bucketValues = new Map<string, number[]>();
          for (const m of metrics) {
            const ts = new Date(m.createdAt).getTime();
            const bucketStart = Math.floor(ts / periodMs) * periodMs;
            const bucketKey = new Date(bucketStart).toISOString();
            const arr = bucketValues.get(bucketKey) || [];
            arr.push(m.value);
            bucketValues.set(bucketKey, arr);
          }

          buckets = Array.from(bucketValues.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([bucket, vals]) => {
              let bucketValue: number;
              switch (agg) {
                case 'sum': bucketValue = vals.reduce((a, b) => a + b, 0); break;
                case 'avg': bucketValue = vals.reduce((a, b) => a + b, 0) / vals.length; break;
                case 'min': bucketValue = Math.min(...vals); break;
                case 'max': bucketValue = Math.max(...vals); break;
                case 'count': bucketValue = vals.length; break;
                default: bucketValue = vals.reduce((a, b) => a + b, 0);
              }
              return { bucket, value: bucketValue, count: vals.length };
            });
        }
      }

      return NextResponse.json({
        data: {
          aggregation: agg,
          name,
          result: Math.round(result! * 10000) / 10000,
          count: metrics.length,
          period: period || null,
          buckets,
        },
      });
    }

    const metrics = await db.metric.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const data = metrics.map((m) => ({
      id: m.id,
      name: m.name,
      value: m.value,
      labels: m.labels,
      unit: m.unit,
      createdAt: m.createdAt.toISOString(),
    }));

    return NextResponse.json({ data, count: data.length });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('GET /api/metrics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/metrics — record a metric
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const { name, value, labels, unit } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (typeof value !== 'number') {
      return NextResponse.json({ error: 'value must be a number' }, { status: 400 });
    }

    const metric = await db.metric.create({
      data: {
        name,
        value,
        labels: labels ? JSON.stringify(labels) : '{}',
        unit: unit || '',
      },
    });

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'create',
        resource: 'metrics',
        details: JSON.stringify({ metricId: metric.id, name: metric.name }),
      },
    });

    return NextResponse.json({ data: metric }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('POST /api/metrics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/metrics — update a metric
export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = parseBody(metricUpdateSchema, body);
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status });

    const { id, labels, ...rest } = parsed.data;

    const existing = await db.metric.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Metric not found' }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (rest.name !== undefined) data.name = rest.name;
    if (rest.value !== undefined) data.value = rest.value;
    if (labels !== undefined) data.labels = JSON.stringify(labels);
    if (rest.unit !== undefined) data.unit = rest.unit;

    const metric = await db.metric.update({
      where: { id },
      data,
    });

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'update',
        resource: 'metrics',
        details: JSON.stringify({ metricId: id, changes: Object.keys(data) }),
      },
    });

    return NextResponse.json({ data: metric });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('PUT /api/metrics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/metrics — prune old metrics (?olderThan=2025-01-01)
export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(request.url);
    const olderThan = searchParams.get('olderThan');

    if (!olderThan) {
      return NextResponse.json({ error: 'olderThan query parameter is required (ISO date string)' }, { status: 400 });
    }

    const cutoff = new Date(olderThan);
    if (isNaN(cutoff.getTime())) {
      return NextResponse.json({ error: 'Invalid date format for olderThan' }, { status: 400 });
    }

    const result = await db.metric.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'delete',
        resource: 'metrics',
        details: JSON.stringify({ olderThan, deleted: result.count }),
      },
    });

    return NextResponse.json({ data: { deleted: result.count, olderThan } });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('DELETE /api/metrics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function parsePeriod(period: string): number {
  const match = period.match(/^(\d+)(ms|s|m|h|d)$/);
  if (!match) return 0;
  const num = parseInt(match[1]);
  const unit = match[2];
  switch (unit) {
    case 'ms': return num;
    case 's': return num * 1000;
    case 'm': return num * 60 * 1000;
    case 'h': return num * 60 * 60 * 1000;
    case 'd': return num * 24 * 60 * 60 * 1000;
    default: return 0;
  }
}
