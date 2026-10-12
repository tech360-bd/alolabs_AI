import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/metrics/prometheus — export metrics in Prometheus text format
export async function GET(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    // Fetch recent metrics (last 5 minutes) for active gauges
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentMetrics = await db.metric.findMany({
      where: { createdAt: { gte: fiveMinAgo } },
      orderBy: { createdAt: 'desc' },
    });

    // Get latest value per metric name+labels combination
    const latestMap = new Map<string, { value: number; timestamp: number; unit: string }>();

    for (const m of recentMetrics) {
      const key = `${m.name}|${m.labels}`;
      const existing = latestMap.get(key);
      if (!existing || m.createdAt > new Date(existing.timestamp)) {
        latestMap.set(key, {
          value: m.value,
          timestamp: new Date(m.createdAt).getTime(),
          unit: m.unit,
        });
      }
    }

    const lines: string[] = [];
    lines.push('# TYPE agent_hub_metrics counter');

    for (const [key, data] of latestMap) {
      const [name, labelsRaw] = key.split('|');
      let labels: Record<string, string> = {};
      try {
        labels = JSON.parse(labelsRaw);
      } catch {
        labels = {};
      }

      // Sanitize metric name for Prometheus
      const safeName = name.replace(/[^a-zA-Z0-9_]/g, '_');

      // Build label string
      const labelEntries = Object.entries(labels);
      const labelStr = labelEntries.length > 0
        ? `{${labelEntries.map(([k, v]) => `${sanitizeLabelKey(k)}="${sanitizeLabelValue(v)}"`).join(',')}}`
        : '';

      const timestampMs = Math.floor(data.timestamp / 1000);
      lines.push(`${safeName}${labelStr} ${data.value} ${timestampMs}`);
    }

    // Add HELP lines for known metrics
    const helpLines: string[] = [];
    const seenNames = new Set<string>();
    for (const [key] of latestMap) {
      const [name] = key.split('|');
      const safeName = name.replace(/[^a-zA-Z0-9_]/g, '_');
      if (!seenNames.has(safeName)) {
        seenNames.add(safeName);
        helpLines.push(`# HELP ${safeName} ALO Labs Agent Hub metric: ${name}`);
      }
    }

    const output = [...helpLines, '# TYPE agent_hub_metrics gauge', ...lines].join('\n');

    return new NextResponse(output, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('GET /api/metrics/prometheus error:', error);
    return new NextResponse('# ERROR: Failed to export metrics\n', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

function sanitizeLabelKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_]/g, '_');
}

function sanitizeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}