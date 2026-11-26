/**
 * /api/v1/platform/admin/routing
 *
 * GET   current routing state: cooldowns, health, remote-lane policy, provider order
 * POST  administrative actions on routing state
 *
 * Supported actions:
 *   { action: 'clear-cooldown', provider, model }  — re-admit a model immediately
 *   { action: 'purge-expired' }                    — drop stale routing rows
 *
 * There is deliberately no "force a model to be used". If a model is unhealthy,
 * an administrator who believes otherwise should clear its cooldown and let the
 * next real request prove it — not override the health signal, which is what
 * makes the signal trustworthy.
 */

import { z } from 'zod';
import { platformRoute, json, PlatformError } from '@/lib/platform/http';
import { requirePlatformAdmin, listProviderConfigs } from '@/lib/platform/admin';
import { clearCooldown, listActiveCooldowns, listHealth, purgeExpiredRoutingState } from '@/lib/platform/routing-state';
import { describeAvailability } from '@/lib/platform/model-registry';

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('clear-cooldown'), provider: z.string().min(1).max(80), model: z.string().min(1).max(160) }),
  z.object({ action: z.literal('purge-expired') }),
]);
type Action = z.infer<typeof actionSchema>;

export const GET = platformRoute({}, async ({ request, requestId }) => {
  await requirePlatformAdmin(request);
  const [cooldowns, health, providers, availability] = await Promise.all([
    listActiveCooldowns(),
    listHealth(),
    listProviderConfigs(),
    describeAvailability(),
  ]);

  // The effective attempt order is what an operator actually needs to reason
  // about a fallback: it is the order the engine will walk.
  const order = [...availability]
    .filter((deployment) => deployment.selectable)
    .sort((a, b) => a.priority - b.priority)
    .map((deployment, index) => ({
      position: index + 1,
      deploymentId: deployment.id,
      provider: deployment.provider,
      model: deployment.model,
      hostingType: deployment.hostingType,
      priority: deployment.priority,
    }));

  return json({
    policy: {
      remoteAllowed: process.env.ALO_ALLOW_REMOTE_MODELS === 'true',
      maxAttemptsPerDeployment: 2,
      defaultCooldownCapMs: 15 * 60 * 1000,
      classifierCooldownCapMs: 5 * 60 * 1000,
    },
    order,
    cooldowns,
    health,
    providers,
  }, requestId);
});

export const POST = platformRoute({ body: actionSchema }, async ({ request, body, requestId }) => {
  await requirePlatformAdmin(request);
  const action = body as Action;

  if (action.action === 'clear-cooldown') {
    await clearCooldown(action.provider, action.model);
    return json({
      cleared: true,
      provider: action.provider,
      model: action.model,
      note: 'The deployment will be attempted again on the next request. Its health record is unchanged.',
    }, requestId);
  }

  if (action.action === 'purge-expired') {
    const removed = await purgeExpiredRoutingState();
    return json({ purged: removed }, requestId);
  }

  throw new PlatformError(400, 'invalid_request', 'Unknown routing action');
});
