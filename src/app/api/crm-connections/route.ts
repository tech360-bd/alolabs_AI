import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';
import { readCrmLeads, verifyCrmConnection } from '@/lib/integrations/connections';
import { createRun } from '@/lib/runs';

/**
 * /api/crm-connections — tenant-scoped view of stored CRM connections.
 *
 * REWRITTEN 2026-11-19. The previous implementation returned fabricated
 * evidence: `connect` merely set `Company.webCrmConnected`, invented a
 * `webhookSecret`, reported `syncedAgents: 2000` and `contactsProcessed:
 * Math.floor(Math.random()…)`; `test` reported `auth: valid` and a random
 * latency from the same flag; any authenticated user could act on ANY
 * companyId. Nothing in it contacted a CRM.
 *
 * This version never invents a verdict:
 *  - reads are scoped to the caller's company;
 *  - `connect` / `test` perform a real authenticated, read-only request;
 *  - `sync` reads real leads (bounded) and reports only what the CRM returned;
 *  - `dispatch` queues a real AgentOS run instead of claiming agents deployed.
 */

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  credentialId: z.string().min(1).max(200),
  action: z.enum(['connect', 'disconnect', 'test', 'sync', 'dispatch']),
  config: z.record(z.string(), z.unknown()).optional(),
}).strict();

function canManage(role: string, companyRole?: string): boolean {
  return role === 'super_admin' || companyRole === 'owner' || companyRole === 'admin';
}

function statusLabel(state: string): string {
  switch (state) {
    case 'connected': return 'connected';
    case 'authentication_failed': return 'authentication_failed';
    case 'permission_denied': return 'permission_denied';
    case 'unreachable': return 'unreachable';
    case 'sync_failed': return 'sync_failed';
    case 'not_configured': return 'not_configured';
    default: return 'unverified';
  }
}

function endpointHost(baseUrl: string | null): string | null {
  if (!baseUrl) return null;
  try {
    const url = new URL(baseUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const user = await requireAuth();
    if (!user.companyId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const [credentials, usageCount] = await Promise.all([
      db.integrationCredential.findMany({
        where: { companyId: user.companyId, integrationType: { startsWith: 'crm.' } },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, name: true, integrationType: true, baseUrl: true, status: true,
          lastVerifiedAt: true, secretFingerprint: true, updatedAt: true,
        },
      }),
      db.usageLog.count({ where: { companyId: user.companyId } }),
    ]);

    const data = credentials.map((credential) => ({
      id: credential.id,
      name: credential.name,
      integrationType: credential.integrationType,
      endpoint: endpointHost(credential.baseUrl),
      status: statusLabel(credential.status),
      connected: credential.status === 'connected',
      hasSecret: Boolean(credential.secretFingerprint),
      lastVerifiedAt: credential.lastVerifiedAt?.toISOString() ?? null,
      updatedAt: credential.updatedAt.toISOString(),
      capabilities: [
        { name: 'Leads (read-only)', enabled: credential.status === 'connected' },
      ],
      connectionDetails: {
        apiVersion: 'ALO Lead API v1',
        protocol: 'REST (read-only)',
        dataFormat: 'JSON',
        lastSync: credential.lastVerifiedAt?.toISOString() ?? null,
      },
      stats: { usageCount },
    }));

    const connected = data.filter((entry) => entry.connected).length;
    return NextResponse.json({
      data,
      summary: {
        totalConnections: data.length,
        connected,
        disconnected: data.length - connected,
        totalUsage: usageCount,
        overallSyncStatus: data.length === 0 ? 'not_configured' : connected === data.length ? 'all_verified' : 'partial',
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user.companyId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!canManage(user.role, user.companyRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'credentialId and a valid action are required' }, { status: 400 });
    }
    const { credentialId, action, config } = parsed.data;

    const credential = await db.integrationCredential.findFirst({
      where: { id: credentialId, companyId: user.companyId, integrationType: { startsWith: 'crm.' } },
      select: { id: true, name: true, baseUrl: true },
    });
    if (!credential) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });

    switch (action) {
      case 'connect':
      case 'test': {
        const verification = await verifyCrmConnection({ companyId: user.companyId, credentialId });
        if (action === 'connect') {
          await db.company.update({
            where: { id: user.companyId },
            data: { webCrmConnected: verification.state === 'connected' },
          });
        }
        return NextResponse.json({
          success: verification.state === 'connected',
          action,
          verification,
          message: verification.state === 'connected'
            ? `CRM verified: ${verification.endpointHost}`
            : `CRM verification failed (${verification.state}): ${verification.message}`,
        });
      }

      case 'disconnect': {
        await db.company.update({ where: { id: user.companyId }, data: { webCrmConnected: false } });
        await db.auditEvent.create({
          data: {
            actorUserId: user.userId,
            companyId: user.companyId,
            action: 'company.crm.disconnect',
            resource: 'integration-credential',
            resourceId: credential.id,
            details: JSON.stringify({ name: credential.name }),
          },
        });
        return NextResponse.json({ success: true, message: 'CRM marked disconnected for this tenant; the stored credential was not deleted.' });
      }

      case 'sync': {
        const limit = Math.min(Math.max(Number(config?.limit ?? 5) || 5, 1), 50);
        const read = await readCrmLeads({ companyId: user.companyId, credentialId, limit });
        if (!read.ok) {
          return NextResponse.json({
            success: false,
            message: `CRM read failed (${read.state}): ${read.message}`,
            connectionStatus: read.state,
          }, { status: 502 });
        }
        return NextResponse.json({
          success: true,
          message: `Read ${read.leads.length} lead record(s) from the CRM (read-only).`,
          syncedAt: new Date().toISOString(),
          stats: { leadsRead: read.leads.length, latencyMs: read.latencyMs },
          leadIds: read.leads.map((lead) => lead.id),
        });
      }

      case 'dispatch': {
        const command = typeof config?.command === 'string' && config.command.trim()
          ? config.command.trim().slice(0, 2000)
          : `Work the ${credential.name} CRM pipeline`;
        const run = await createRun({
          objective: command,
          companyId: user.companyId,
          userId: user.userId,
        });
        return NextResponse.json({
          success: true,
          message: 'AgentOS run queued. Agents are not "deployed"; the run executes through the normal pipeline.',
          runId: run.runId,
          status: run.status,
        });
      }

      default:
        return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
