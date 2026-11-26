/**
 * GET /api/v1/platform/admin/overview
 *
 * The Super Admin landing data: tenant counts, model topology, routing state,
 * queue depth, recent fallbacks and provider configuration — everything the
 * panel needs in one round trip.
 *
 * Administrator-only. Every count is a platform-wide aggregate, which is why
 * this route is not reachable with a workspace credential.
 */

import { db } from '@/lib/db';
import { platformRoute, json } from '@/lib/platform/http';
import { requirePlatformAdmin, listProviderConfigs } from '@/lib/platform/admin';
import { describeAvailability } from '@/lib/platform/model-registry';
import { listActiveCooldowns, listHealth } from '@/lib/platform/routing-state';

export const GET = platformRoute({}, async ({ request, requestId }) => {
  const admin = await requirePlatformAdmin(request);

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    workspaces,
    organisations,
    projects,
    users,
    activeKeys,
    conversations,
    files,
    usage24h,
    fallbacks24h,
    providerConfigs,
    availability,
    health,
    cooldowns,
    platformJobDepth,
    agentosQueueDepth,
  ] = await Promise.all([
    db.aiWorkspace.count(),
    db.aiOrganisation.count(),
    db.aiProject.count(),
    db.user.count(),
    db.aiApiKey.count({ where: { isActive: true, revokedAt: null } }),
    db.aiConversation.count({ where: { archived: false } }),
    db.aiFile.count(),
    db.aiUsageRecord.aggregate({
      where: { createdAt: { gte: since24h } },
      _count: { id: true },
      _sum: { totalTokens: true, costUsd: true },
    }),
    db.aiFallbackEvent.count({ where: { createdAt: { gte: since24h } } }),
    listProviderConfigs(),
    describeAvailability(),
    listHealth(),
    listActiveCooldowns(),
    // Queue depth reads the platform's own job table (`AiJob`), and the
    // AgentOS queue (`QueueItem`) alongside it so the panel reflects both work
    // pools. Both are best-effort: a minimal deployment may not have run the
    // worker yet, and a missing queue must never break the whole panel.
    db.aiJob
      .count({ where: { status: { in: ['queued', 'running'] } } })
      .catch(() => null),
    db.queueItem
      .count({ where: { status: { in: ['queued', 'processing'] } } })
      .catch(() => null),
  ]);

  const healthByKey = new Map(health.map((h) => [`${h.provider}::${h.model}`, h.health]));

  return json({
    admin: { email: admin.user.email, role: admin.user.role },
    tenants: {
      workspaces,
      organisations,
      projects,
      users,
      activeApiKeys: activeKeys,
      conversations,
      files,
    },
    usage24h: {
      requests: usage24h._count.id,
      tokens: usage24h._sum.totalTokens ?? 0,
      costUsd: Number((usage24h._sum.costUsd ?? 0).toFixed(6)),
      fallbacks: fallbacks24h,
    },
    models: {
      total: availability.length,
      selectable: availability.filter((d) => d.selectable).length,
      deployments: availability.map((deployment) => ({
        id: deployment.id,
        provider: deployment.provider,
        model: deployment.model,
        hostingType: deployment.hostingType,
        priority: deployment.priority,
        selectable: deployment.selectable,
        reachable: deployment.reachable,
        health: healthByKey.get(`${deployment.provider}::${deployment.model}`) ?? null,
        ...(deployment.selectable ? {} : { blockedReason: deployment.blockedReason }),
      })),
    },
    routing: {
      cooldowns,
      // Whether a paid provider can be reached at all is a policy fact an
      // administrator must be able to confirm at a glance.
      remoteAllowed: process.env.ALO_ALLOW_REMOTE_MODELS === 'true',
      localEndpoints: {
        platformLocal: Boolean(process.env.ALO_PLATFORM_LOCAL_URL),
        ollama: Boolean(process.env.OLLAMA_BASE_URL),
        vllm: Boolean(process.env.VLLM_BASE_URL),
        litellm: Boolean(process.env.LITELLM_BASE_URL),
      },
    },
    providers: providerConfigs,
    queues: { platformJobs: platformJobDepth, agentosQueue: agentosQueueDepth },
  }, requestId);
});
