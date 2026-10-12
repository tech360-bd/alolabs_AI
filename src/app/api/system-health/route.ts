import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Track process start time for uptime
const PROCESS_START = Date.now();

export async function GET(request: NextRequest) {
  // Auth check — system health is sensitive internal information
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const deep = searchParams.get('deep') === 'true';

    // Run core queries in parallel
    const [
      dbTest,
      agentCount,
      departmentCount,
      companyCount,
      activeKeyCount,
      recentErrorCount,
      systemSettings,
    ] = await Promise.all([
      // Database status: simple query
      db.settings.count().then(() => 'ok').catch(() => 'error'),
      // Counts
      db.agent.count(),
      db.department.count(),
      db.company.count(),
      db.companyApiKey.count({ where: { isActive: true } }),
      // Recent errors (last 24h)
      db.errorLog.count({
        where: {
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
      // System configuration from Settings
      db.settings.findMany({
        where: {
          key: {
            startsWith: 'system.',
          },
        },
      }),
    ]);

    // Parse system settings
    const config: Record<string, unknown> = {};
    for (const s of systemSettings) {
      let parsed = s.value;
      if (s.type === 'json') {
        try { parsed = JSON.parse(s.value); } catch { /* keep raw */ }
      } else if (s.type === 'number') {
        parsed = String(Number(s.value));
      } else if (s.type === 'boolean') {
        parsed = String(s.value === 'true');
      }
      config[s.key.replace('system.', '')] = parsed;
    }

    const uptimeMs = Date.now() - PROCESS_START;
    const uptimeHuman = formatUptime(uptimeMs);

    const healthResponse: Record<string, unknown> = {
      status: dbTest === 'ok' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: {
        ms: uptimeMs,
        human: uptimeHuman,
      },
      database: {
        status: dbTest === 'ok' ? 'connected' : 'disconnected',
        provider: process.env.DATABASE_URL?.startsWith('postgresql') ? 'postgresql' : process.env.DATABASE_URL?.startsWith('mysql') ? 'mysql' : 'sqlite',
      },
      counts: {
        agents: agentCount,
        departments: departmentCount,
        companies: companyCount,
        activeApiKeys: activeKeyCount,
        recentErrors24h: recentErrorCount,
      },
      systemConfig: config,
    };

    // Deep health check
    if (deep) {
      const deepChecks = await runDeepHealthChecks();
      healthResponse.services = deepChecks;

      // Overall status is degraded if any critical service is down
      const allHealthy = deepChecks.every((s) => s.status === 'healthy');
      healthResponse.status = allHealthy ? 'healthy' : 'degraded';
    }

    return NextResponse.json(healthResponse);
  } catch (error) {
    console.error('[system-health GET]', error);
    return NextResponse.json(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
      },
      { status: 500 }
    );
  }
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

async function runDeepHealthChecks(): Promise<{ service: string; status: string; responseMs?: number; details?: string }[]> {
  const checks: { service: string; status: string; responseMs?: number; details?: string }[] = [];

  // 1. Database write test
  const dbWriteStart = Date.now();
  try {
    const testKey = `health_check_${Date.now()}`;
    await db.settings.upsert({
      where: { key: testKey },
      update: { value: 'pong', updatedAt: new Date() },
      create: { key: testKey, value: 'pong', type: 'string' },
    });
    await db.settings.delete({ where: { key: testKey } });
    checks.push({
      service: 'database_write',
      status: 'healthy',
      responseMs: Date.now() - dbWriteStart,
      details: 'Read/write cycle successful',
    });
  } catch (err) {
    checks.push({
      service: 'database_write',
      status: 'down',
      responseMs: Date.now() - dbWriteStart,
      details: err instanceof Error ? err.message : 'Write test failed',
    });
  }

  // 2. Agent availability
  const agentStart = Date.now();
  try {
    const activeAgents = await db.agent.count({ where: { status: 'active' } });
    const totalAgents = await db.agent.count();
    checks.push({
      service: 'agents',
      status: 'healthy',
      responseMs: Date.now() - agentStart,
      details: `${activeAgents}/${totalAgents} agents active`,
    });
  } catch (err) {
    checks.push({
      service: 'agents',
      status: 'degraded',
      responseMs: Date.now() - agentStart,
      details: err instanceof Error ? err.message : 'Agent query failed',
    });
  }

  // 3. Workflow availability
  const wfStart = Date.now();
  try {
    const activeWorkflows = await db.workflow.count({ where: { status: 'active' } });
    const totalWorkflows = await db.workflow.count();
    checks.push({
      service: 'workflows',
      status: 'healthy',
      responseMs: Date.now() - wfStart,
      details: `${activeWorkflows}/${totalWorkflows} workflows active`,
    });
  } catch (err) {
    checks.push({
      service: 'workflows',
      status: 'degraded',
      responseMs: Date.now() - wfStart,
      details: err instanceof Error ? err.message : 'Workflow query failed',
    });
  }

  // 4. Company / Tenant health
  const coStart = Date.now();
  try {
    const activeCompanies = await db.company.count({ where: { status: 'active' } });
    const totalCompanies = await db.company.count();
    const activeKeys = await db.companyApiKey.count({ where: { isActive: true } });
    checks.push({
      service: 'tenants',
      status: 'healthy',
      responseMs: Date.now() - coStart,
      details: `${activeCompanies}/${totalCompanies} companies active, ${activeKeys} active API keys`,
    });
  } catch (err) {
    checks.push({
      service: 'tenants',
      status: 'degraded',
      responseMs: Date.now() - coStart,
      details: err instanceof Error ? err.message : 'Tenant query failed',
    });
  }

  // 5. Skill system
  const skillStart = Date.now();
  try {
    const approvedSkills = await db.skill.count({ where: { status: 'approved' } });
    const totalSkills = await db.skill.count();
    checks.push({
      service: 'skills',
      status: 'healthy',
      responseMs: Date.now() - skillStart,
      details: `${approvedSkills}/${totalSkills} skills approved`,
    });
  } catch (err) {
    checks.push({
      service: 'skills',
      status: 'degraded',
      responseMs: Date.now() - skillStart,
      details: err instanceof Error ? err.message : 'Skill query failed',
    });
  }

  // 6. Pending approvals backlog
  const approvalStart = Date.now();
  try {
    const pendingApprovals = await db.approval.count({ where: { status: 'pending' } });
    checks.push({
      service: 'approvals',
      status: pendingApprovals > 50 ? 'degraded' : 'healthy',
      responseMs: Date.now() - approvalStart,
      details: `${pendingApprovals} pending approvals`,
    });
  } catch (err) {
    checks.push({
      service: 'approvals',
      status: 'degraded',
      responseMs: Date.now() - approvalStart,
      details: err instanceof Error ? err.message : 'Approval query failed',
    });
  }

  // 7. Recent error rate
  const errorStart = Date.now();
  try {
    const errors1h = await db.errorLog.count({
      where: { createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
    });
    const errors24h = await db.errorLog.count({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    checks.push({
      service: 'error_rate',
      status: errors1h > 100 ? 'degraded' : 'healthy',
      responseMs: Date.now() - errorStart,
      details: `${errors1h} errors in last 1h, ${errors24h} in last 24h`,
    });
  } catch (err) {
    checks.push({
      service: 'error_rate',
      status: 'degraded',
      responseMs: Date.now() - errorStart,
      details: err instanceof Error ? err.message : 'Error query failed',
    });
  }

  // 8. Protection system
  const protectionStart = Date.now();
  try {
    const recentBlocks = await db.protectionLog.count({
      where: {
        blocked: true,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    checks.push({
      service: 'protection',
      status: 'healthy',
      responseMs: Date.now() - protectionStart,
      details: `${recentBlocks} blocks in last 24h`,
    });
  } catch (err) {
    checks.push({
      service: 'protection',
      status: 'degraded',
      responseMs: Date.now() - protectionStart,
      details: err instanceof Error ? err.message : 'Protection query failed',
    });
  }

  // 9. Memory system
  const memoryStart = Date.now();
  try {
    const totalMemories = await db.agentMemory.count();
    checks.push({
      service: 'memory',
      status: 'healthy',
      responseMs: Date.now() - memoryStart,
      details: `${totalMemories} agent memories stored`,
    });
  } catch (err) {
    checks.push({
      service: 'memory',
      status: 'degraded',
      responseMs: Date.now() - memoryStart,
      details: err instanceof Error ? err.message : 'Memory query failed',
    });
  }

  // 10. Webhook system
  const webhookStart = Date.now();
  try {
    const activeWebhooks = await db.webhookConfig.count({ where: { isActive: true } });
    const totalWebhooks = await db.webhookConfig.count();
    checks.push({
      service: 'webhooks',
      status: 'healthy',
      responseMs: Date.now() - webhookStart,
      details: `${activeWebhooks}/${totalWebhooks} webhooks active`,
    });
  } catch (err) {
    checks.push({
      service: 'webhooks',
      status: 'degraded',
      responseMs: Date.now() - webhookStart,
      details: err instanceof Error ? err.message : 'Webhook query failed',
    });
  }

  return checks;
}