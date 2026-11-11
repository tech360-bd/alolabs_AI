import { v1Handler, v1Body, V1Error } from '@/lib/v1';
import { z } from 'zod';
import { db } from '@/lib/db';
import { runDiscovery } from '@/lib/discovery/engine';

/**
 * POST /api/v1/projects/:id/discover — run an authorized discovery on a project.
 */

const DiscoverSchema = z.object({
  mode: z.enum(['api', 'connector']),
  targetUrl: z.string().url().optional(),
  authorization: z.string().max(500).optional(),
  connectorReport: z.record(z.string(), z.unknown()).optional(),
});

export const POST = v1Handler(async ({ identity }, request) => {
  const projectId = request.nextUrl.pathname.split('/')[4];
  if (!projectId) throw new V1Error('Project ID required', 400, 'VALIDATION_ERROR');

  const project = await db.project.findFirst({
    where: { id: projectId, companyId: identity.companyId },
    select: { id: true, name: true },
  });
  if (!project) throw new V1Error('Project not found', 404, 'NOT_FOUND');

  const body = await v1Body<unknown>(request);
  const parsed = DiscoverSchema.safeParse(body);
  if (!parsed.success) {
    throw new V1Error('Validation failed: ' + parsed.error.issues.map((i) => i.message).join('; '), 400, 'VALIDATION_ERROR');
  }

  if (parsed.data.mode === 'api' && !parsed.data.targetUrl) {
    throw new V1Error('targetUrl is required for API mode', 400, 'VALIDATION_ERROR');
  }
  if (parsed.data.mode === 'connector' && !parsed.data.connectorReport) {
    throw new V1Error('connectorReport is required for connector mode', 400, 'VALIDATION_ERROR');
  }

  const result = await runDiscovery({
    companyId: identity.companyId,
    projectId: project.id,
    mode: parsed.data.mode,
    targetUrl: parsed.data.targetUrl,
    authorization: parsed.data.authorization,
    connectorReport: parsed.data.connectorReport,
  });

  return {
    discovery_id: result.discoveryId,
    status: result.status,
    capabilities: result.capabilities.map((c) => ({
      capability: c.capability,
      classification: c.classification,
      confidence: c.confidence,
      recommendation: c.recommendation,
    })),
    summary: result.summary,
    recommendations: result.recommendations,
  };
});
