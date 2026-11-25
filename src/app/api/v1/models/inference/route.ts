/**
 * /api/v1/models/inference — the directive's central single-shot inference
 * endpoint for connected ALO projects.
 *
 * Design constraints (deliberately chosen):
 *
 *  - **No new inference path.** Execution goes through
 *    `executeCompanyAIChat`, the one tenant-aware gateway that already owns
 *    routing profiles, budget guards, failover, duplicate-execution
 *    prevention (caller idempotency keys) and atomic usage metering.
 *  - **No silent paid execution.** Routing profiles are policy-bound:
 *    `local_*` profiles are localOnly, `free_*` profiles never permit paid
 *    providers. A caller that needs a paid route must use an authorized
 *    profile; none is reachable through this endpoint without explicit
 *    policy authorization.
 *  - **Tenant safety.** The actor's companyId comes from the authenticated
 *    identity, never the request body. Budget/metering rows are stamped with
 *    that companyId.
 *
 * Scope for API keys: `models:execute` (this path is treated as an execute
 * action by v1Handler's scope derivation).
 */
import { z } from 'zod';
import { v1Handler, v1Body, v1RateLimit, V1Error } from '@/lib/v1';
import { executeCompanyAIChat, CompanyAIError } from '@/lib/multi-tenant-ai/service';
import { MODEL_ROUTING_PROFILES, type ModelRoutingProfile } from '@/lib/multi-tenant-ai/policy';

export const dynamic = 'force-dynamic';

/**
 * `MODEL_ROUTING_PROFILES` is `as const` (readonly); `z.enum` needs a mutable
 * tuple. Spreading keeps the single source of truth instead of duplicating the
 * profile list here.
 */
const PROFILE_VALUES = [...MODEL_ROUTING_PROFILES] as [ModelRoutingProfile, ...ModelRoutingProfile[]];

const MessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1).max(200_000),
});

const InferenceSchema = z.object({
  messages: z.array(MessageSchema).min(1).max(100),
  /** Optional hint; the routing profile decides which providers are eligible. */
  model: z.string().trim().max(200).optional(),
  profile: z.enum(PROFILE_VALUES).default('free_general'),
  maxTokens: z.number().int().min(1).max(32_768).optional(),
  /** Caller-supplied idempotency key; replays return the original outcome. */
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
  agentId: z.string().trim().max(100).optional(),
  taskId: z.string().trim().max(100).optional(),
});

export const POST = v1Handler(async ({ identity }, request) => {
  await v1RateLimit(request, identity, '/api/v1/models/inference');
  const body = await v1Body<unknown>(request);
  const parsed = InferenceSchema.safeParse(body);
  if (!parsed.success) {
    throw new V1Error(`Validation failed: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`, 400, 'VALIDATION_ERROR');
  }
  const data = parsed.data;

  try {
    const result = await executeCompanyAIChat(
      { companyId: identity.companyId, userId: identity.userId, role: identity.role },
      {
        model: data.model ?? '',
        messages: data.messages,
        maxTokens: data.maxTokens,
      },
      {
        profile: data.profile as (typeof MODEL_ROUTING_PROFILES)[number],
        idempotencyKey: data.idempotencyKey,
        agentId: data.agentId,
        taskId: data.taskId,
      },
    );

    return {
      requestId: result.requestId,
      provider: result.provider,
      profile: result.profile,
      content: result.response.content,
      model: result.response.model,
      finishReason: result.response.finishReason,
      usage: result.response.usage,
      usageSource: result.response.usageSource ?? 'unknown',
      latencyMs: result.response.latencyMs,
      estimatedCostUsd: result.estimatedCostUsd,
      attempts: result.attempts,
      fallbackUsed: result.fallbackUsed,
    };
  } catch (error) {
    if (error instanceof CompanyAIError) {
      throw new V1Error(error.message, error.status, error.code);
    }
    throw error;
  }
});
