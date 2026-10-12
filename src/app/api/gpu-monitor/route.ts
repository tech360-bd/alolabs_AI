import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';
import os from 'os';

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const loadAvg = os.loadavg();
    const uptime = os.uptime();

    // Get recent agent execution metrics from DB
    const recentLogs = await db.auditLog.findMany({
      where: { action: { startsWith: 'agent_execution' } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Parse execution data
    const executions = recentLogs.map(log => {
      try {
        const details = JSON.parse(log.details);
        return { ...details, timestamp: log.createdAt };
      } catch {
        return null;
      }
    }).filter(Boolean);

    const avgLatency = executions.length > 0
      ? Math.round(executions.reduce((sum: number, e: { latencyMs?: number; error?: string }) => sum + (e.latencyMs || 0), 0) / executions.length)
      : 0;

    const errorCount = executions.filter((e: { latencyMs?: number; error?: string }) => e.latencyMs === 0 || e.error).length;

    // Active agents count
    const activeAgents = await db.agent.count({ where: { status: 'active' } });
    const totalAgents = await db.agent.count();

    const data = {
      timestamp: new Date().toISOString(),
      cpu: {
        model: cpus[0]?.model || 'Unknown',
        cores: cpus.length,
        speed: `${(cpus[0]?.speed / 1000).toFixed(1)} GHz`,
        usagePercent: Math.round(loadAvg[0] / cpus.length * 100),
        loadAvg1m: parseFloat(loadAvg[0].toFixed(2)),
        loadAvg5m: parseFloat(loadAvg[1].toFixed(2)),
        loadAvg15m: parseFloat(loadAvg[2].toFixed(2)),
      },
      memory: {
        totalGb: Math.round(totalMem / 1_073_741_824 * 100) / 100,
        usedGb: Math.round((totalMem - freeMem) / 1_073_741_824 * 100) / 100,
        freeGb: Math.round(freeMem / 1_073_741_824 * 100) / 100,
        usagePercent: Math.round((1 - freeMem / totalMem) * 1000) / 10,
      },
      system: {
        hostname: os.hostname(),
        platform: os.platform(),
        uptime: Math.round(uptime),
        uptimeFormatted: formatUptime(uptime),
      },
      agents: {
        total: totalAgents,
        active: activeAgents,
        inactive: totalAgents - activeAgents,
      },
      execution: {
        lastHour: executions.length,
        avgLatencyMs: avgLatency,
        errorRate: executions.length > 0 ? Math.round(errorCount / executions.length * 1000) / 10 : 0,
      },
      alerts: generateAlerts(Math.round((1 - freeMem / totalMem) * 100), loadAvg[0], errorCount, executions.length),
    };

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('GPU Monitor error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function generateAlerts(memPercent: number, cpuLoad: number, errorCount: number, execCount: number): Array<{ level: string; message: string }> {
  const alerts: Array<{ level: string; message: string }> = [];
  if (memPercent > 90) alerts.push({ level: 'critical', message: `Memory usage at ${memPercent}%` });
  if (cpuLoad > 4) alerts.push({ level: 'warning', message: `CPU load high: ${cpuLoad.toFixed(2)}` });
  if (errorCount > execCount * 0.2 && execCount > 5) alerts.push({ level: 'warning', message: `Error rate ${(errorCount / execCount * 100).toFixed(1)}%` });
  return alerts;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}
