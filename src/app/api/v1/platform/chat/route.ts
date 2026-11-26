/**
 * POST /api/v1/platform/chat
 *
 * The platform's main generation endpoint. One request does all of:
 *
 *   · resolves the principal, workspace and (optionally) project
 *   · picks a model — explicit `model`, `mode: "auto"` task routing, or
 *     local-first default
 *   · runs the fallback chain across deployments
 *   · records usage (tokens, model, provider, latency, whether fallback ran)
 *   · persists the conversation when `conversationId` is supplied
 *
 * The response states the model that **actually** answered, plus the full
 * attempt trail, so a caller can see that a fallback happened rather than being
 * told "auto" and left guessing.
 */

import { z } from 'zod';
import { db } from '@/lib/db';
import { platformRoute, json, PlatformError } from '@/lib/platform/http';
import { runWithFallback } from '@/lib/platform/fallback-engine';
import { completeWithProvider } from '@/lib/platform/providers';
import { selectCandidates, type TaskType } from '@/lib/platform/model-registry';


const messageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1).max(200_000),
});

const bodySchema = z.object({
  projectId: z.string().min(1).max(64).optional(),
  conversationId: z.string().min(1).max(64).optional(),
  messages: z.array(messageSchema).min(1).max(200),
  /** Deployment id from GET /models (e.g. `ollama:llama3.2:3b`) or a bare model name. */
  model: z.string().max(120).optional(),
  /** "auto" lets the router choose by task; omit for the same behaviour. */
  mode: z.enum(['auto', 'manual']).default('auto'),
  task: z.enum(['chat', 'code', 'vision', 'reasoning', 'embedding', 'summarise', 'translation']).default('chat'),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(32_768).optional(),
  /** Hard ceiling for the whole chain, so a client is never held forever. */
  deadlineMs: z.number().int().min(1000).max(300_000).optional(),
});

function isTaskType(value: string): value is TaskType {
  return ['chat', 'code', 'vision', 'reasoning', 'embedding', 'summarise', 'translation'].includes(value);
}

export const POST = platformRoute(
  { scope: 'ai:chat', body: bodySchema, rateLimit: { limit: 120, windowMs: 60_000 } },
  async ({ principal, body, requestId, workspaceId }) => {
    // ── Resolve the project (tenancy already enforced by the wrapper for
    //    `projectScoped`, but here projectId is optional, so check explicitly).
    let projectId = body.projectId ?? null;
    if (projectId) {
      const project = await db.aiProject.findFirst({
        where: { id: projectId, workspaceId },
        select: { id: true },
      });
      if (!project) throw new PlatformError(404, 'not_found', 'Project not found');
    }

    const task: TaskType = isTaskType(body.task) ? body.task : 'chat';

    // ── Manual model pinning. Accept a full deployment id or a bare model name;
    //    resolve both against the live candidate list so a pinned model that is
    //    currently blocked fails honestly instead of silently substituting.
    let preferredModel: string | undefined;
    if (body.mode === 'manual') {
      if (!body.model) throw new PlatformError(400, 'invalid_request', 'mode "manual" requires a model');
      const all = await selectCandidates({ requires: [task] });
      const match = all.find((c) => c.id === body.model) ?? all.find((c) => c.model === body.model);
      if (!match) {
        throw new PlatformError(
          400, 'invalid_request',
          `Model "${body.model}" is not available for task "${task}"`,
          'List selectable models with GET /api/v1/platform/models.',
        );
      }
      preferredModel = match.id;
    } else if (body.model) {
      preferredModel = body.model;
    }

    // ── Load prior turns when continuing a conversation.
    let messages = body.messages;
    if (body.conversationId) {
      const conversation = await db.aiConversation.findFirst({
        where: { id: body.conversationId, workspaceId, userId: principal.userId },
        select: { id: true },
      });
      if (!conversation) throw new PlatformError(404, 'not_found', 'Conversation not found');
      if (body.messages.length === 1) {
        const history = await db.aiChatMessage.findMany({
          where: { conversationId: conversation.id },
          orderBy: { createdAt: 'asc' },
          take: 40,
          select: { role: true, content: true },
        });
        messages = [...history.map((h) => ({ role: h.role as 'system' | 'user' | 'assistant', content: h.content })), ...body.messages];
      }
    }

    const outcome = await runWithFallback(
      {
        messages,
        ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
        ...(body.maxTokens !== undefined ? { maxTokens: body.maxTokens } : {}),
      },
      completeWithProvider,
      {
        requires: [task],
        ...(preferredModel ? { preferredModel } : {}),
        // Local-first by default. Remote providers are only considered when an
        // administrator has configured one; the engine enforces that, not this
        // route, so there is a single place to audit.
        allowRemote: process.env.ALO_ALLOW_REMOTE_MODELS === 'true',
        ...(body.deadlineMs ? { deadlineMs: body.deadlineMs } : {}),
        // The engine writes the AiUsageRecord (success *and* exhausted chains)
        // and its own AiFallbackEvent; routes must not duplicate that.
        recordUsage: {
          workspaceId,
          projectId,
          userId: principal.userId,
          apiKeyId: principal.apiKeyId,
          service: `chat:${task}`,
        },
      },
    );

    if (!outcome.ok || !outcome.result) {
      const unavailable = new PlatformError(
        outcome.error?.status === 429 ? 429 : 503,
        outcome.error?.status === 429 ? 'rate_limited' : 'unavailable',
        outcome.error?.message ?? 'No model could serve this request',
        outcome.error?.remediation,
      );
      throw unavailable;
    }

    // ── Conversation persistence.
    let conversationId = body.conversationId ?? null;
    if (body.conversationId || (conversationId === null && projectId && body.messages.some((m) => m.role === 'user'))) {
      conversationId = await persistConversation({
        workspaceId,
        userId: principal.userId,
        projectId,
        conversationId: body.conversationId ?? null,
        messages: body.messages,
        assistant: outcome.result.content,
        model: outcome.result.model,
        provider: outcome.result.provider,
        tokens: outcome.result.usage.totalTokens,
      });
    }

    return json({
      content: outcome.result.content,
      model: outcome.result.model,
      provider: outcome.result.provider,
      hostingType: outcome.result.hostingType,
      usage: outcome.result.usage,
      latencyMs: outcome.result.latencyMs,
      finishReason: outcome.result.finishReason ?? 'stop',
      routing: {
        requested: body.mode === 'manual' ? body.model : 'auto',
        task,
        usedFallback: outcome.usedFallback,
        attempts: outcome.attempts.map((a) => ({
          deployment: a.deploymentId,
          provider: a.provider,
          model: a.model,
          ok: a.ok,
          ...(a.ok ? {} : { errorClass: a.errorClass }),
        })),
      },
      ...(conversationId ? { conversationId } : {}),
      requestId,
    }, requestId);
  },
);

async function persistConversation(input: {
  workspaceId: string;
  userId: string;
  projectId: string | null;
  conversationId: string | null;
  messages: Array<{ role: string; content: string }>;
  assistant: string;
  model: string;
  provider: string;
  tokens: number;
}): Promise<string> {
  let conversationId = input.conversationId;
  if (!conversationId) {
    const firstUser = input.messages.find((m) => m.role === 'user');
    const conversation = await db.aiConversation.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        projectId: input.projectId,
        title: (firstUser?.content ?? 'New conversation').slice(0, 120),
        model: input.model,
        provider: input.provider,
      },
      select: { id: true },
    });
    conversationId = conversation.id;
  }
  const lastUser = [...input.messages].reverse().find((m) => m.role === 'user');
  if (lastUser) {
    await db.aiChatMessage.create({
      data: { conversationId, role: 'user', content: lastUser.content },
    });
  }
  await db.aiChatMessage.create({
    data: {
      conversationId,
      role: 'assistant',
      content: input.assistant,
      model: input.model,
      provider: input.provider,
      // `tokens` does not exist on this model; the schema splits prompt and
      // completion counts, and only the total is known here.
      completionTokens: input.tokens,
    },
  });
  await db.aiConversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date(), model: input.model, provider: input.provider },
  }).catch(() => undefined);
  return conversationId;
}
