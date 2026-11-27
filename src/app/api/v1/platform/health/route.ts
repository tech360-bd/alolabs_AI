/**
 * GET /api/v1/platform/health
 *
 * Per-deployment live health, cooldowns and quota, for the workspace settings
 * and Super Admin pages. Public-safe in the sense that it exposes no secrets, but
 * it does reveal provider topology, so it requires a credential.
 *
 * `?scope=platform` (admin only) additionally includes unreachable deployments
 * and the cooldown list.
 */

import { db } from '@/lib/db';
import { z } from 'zod';
import { platformRoute, json, forbidden } from '@/lib/platform/http';
import { describeAvailability } from '@/lib/platform/model-registry';
import { listActiveCooldowns, listHealth } from '@/lib/platform/routing-state';

const querySchema = z.object({ scope: z.enum(['workspace', 'platform']).default('workspace') });

export const GET = platformRoute({ scope: 'models:read', query: querySchema, allowCompanyScope: true }, async ({ principal, query, requestId }) => {
  const availability = await describeAvailability();
  const health = await listHealth();
  const healthByKey = new Map(health.map((h) => [`${h.provider}::${h.model}`, h.health]));

  let cooldowns: Awaited<ReturnType<typeof listActiveCooldowns>> = [];
  let recentFallbacks: Array<{ createdAt: Date; outcome: string; finalModel: string | null; finalProvider: string | null; errorClass: string | null }> = [];

  if (query.scope === 'platform') {
    const user = await db.user.findUnique({ where: { id: principal.userId }, select: { role: true } });
    if (!user || !['admin', 'super_admin'].includes(user.role)) {
      throw forbidden('Platform health requires an administrator account');
    }
    cooldowns = await listActiveCooldowns();
    recentFallbacks = await db.aiFallbackEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: { createdAt: true, outcome: true, finalModel: true, finalProvider: true, errorClass: true },
    });
  }

  return json({
    deployments: availability.map((d) => ({
      id: d.id,
      provider: d.provider,
      model: d.model,
      hostingType: d.hostingType,
      selectable: d.selectable,
      reachable: d.reachable,
      health: healthByKey.get(`${d.provider}::${d.model}`) ?? null,
      ...(d.selectable ? {} : { blockedReason: d.blockedReason }),
    })),
    cooldowns,
    ...(query.scope === 'platform' ? { recentFallbacks } : {}),
  }, requestId);
});
