import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db'
import { legacyTenant, tenantWhere, legacyAuthResponse } from '@/lib/api/legacy-session';
import { verifySessionToken } from '@/lib/auth';
import { isMetricsScrape, mayReadOperationalMetrics } from '@/lib/access/metrics-scrape';
import { gaugeLines } from '@/lib/prometheus-text';
import { voiceMetricsSnapshot, voiceMetricsPrometheusLines } from '@/lib/voice/metrics';

export async function GET(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  try {
    if (!isMetricsScrape('/api/metrics/prometheus', 'GET', authorization)) {
      const session = authorization?.startsWith('Bearer ') && await verifySessionToken(authorization.slice(7));
      if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      if (!mayReadOperationalMetrics(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const rows = await db.metric.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 300_000) } },
      select: { name: true, labels: true, value: true, createdAt: true },
      orderBy: { createdAt: 'desc' }, take: 5000,
    });
    const lines = gaugeLines(rows);
    try { lines.push(...voiceMetricsPrometheusLines(await voiceMetricsSnapshot())); }
    catch { console.error('Voice metrics unavailable; exporting core metrics only'); }
    return new NextResponse(lines.join('\n') + '\n', { headers: { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch { return new NextResponse('Metrics unavailable\n', { status: 503 }); }
}
