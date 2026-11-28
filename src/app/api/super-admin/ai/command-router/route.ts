import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/api-auth';
import { aiRouter, ensureRouterSynced } from '@/lib/ai-router';
import {
  discoverLiveProviderModels,
  executeCommandRoute,
  getCommandRouterConfig,
  planCommandRoute,
  saveCommandRouterConfig,
  type ExtendedCapability,
  type PrivacyGuardMode,
  type RoutingStrategy,
} from '@/lib/ai-router/command-router';
import { decryptField, isEncryptedField } from '@/lib/security/field-encryption';
import { writeAuditEvent } from '@/lib/audit-events';

const ActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('update_config'),
    strategy: z.enum(['capability', 'free-first', 'local-first', 'lowest-cost', 'lowest-latency', 'priority', 'manual', 'fallback']).optional(),
    privacyMode: z.enum(['standard', 'guarded', 'strict']).optional(),
    preferFreeFirst: z.boolean().optional(),
    preferLocalFirst: z.boolean().optional(),
    maxConcurrencyPerTenant: z.number().int().min(1).max(200).optional(),
    pinnedProvider: z.string().nullable().optional(),
    pinnedModel: z.string().nullable().optional(),
  }),
  z.object({
    action: z.literal('simulate_plan'),
    requestedModel: z.string().optional(),
    strategy: z.enum(['capability', 'free-first', 'local-first', 'lowest-cost', 'lowest-latency', 'priority', 'manual', 'fallback']).optional(),
    privacyMode: z.enum(['standard', 'guarded', 'strict']).optional(),
    requiredCapabilities: z.array(z.string()).optional(),
  }),
  z.object({
    action: z.literal('test_route'),
    prompt: z.string().min(1).max(4000),
    model: z.string().optional(),
    strategy: z.enum(['capability', 'free-first', 'local-first', 'lowest-cost', 'lowest-latency', 'priority', 'manual', 'fallback']).optional(),
    privacyMode: z.enum(['standard', 'guarded', 'strict']).optional(),
    requiredCapabilities: z.array(z.string()).optional(),
  }),
  z.object({
    action: z.literal('discover_models'),
    providerConfigId: z.string().min(1),
  }),
]);

export async function GET(request: NextRequest) {
  let actor: Awaited<ReturnType<typeof requireRole>>;
  try {
    actor = await requireRole('super_admin');
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unauthorized';
    return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 401 });
  }

  await ensureRouterSynced();
  const url = new URL(request.url);
  const strategyParam = url.searchParams.get('strategy') as RoutingStrategy | null;
  const privacyParam = url.searchParams.get('privacyMode') as PrivacyGuardMode | null;

  const [config, plan, decisions, providers] = await Promise.all([
    getCommandRouterConfig(),
    planCommandRoute({
      companyId: actor.companyId ?? 'system',
      ...(strategyParam ? { strategy: strategyParam } : {}),
      ...(privacyParam ? { privacyMode: privacyParam } : {}),
    }),
    db.modelRoutingDecision.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        companyId: true,
        requestedModel: true,
        taskType: true,
        selectedProvider: true,
        selectedModel: true,
        reason: true,
        attempts: true,
        fallbackFrom: true,
        success: true,
        errorCode: true,
        latencyMs: true,
        promptTokens: true,
        completionTokens: true,
        costUsd: true,
        createdAt: true,
      },
    }),
    db.aIProviderConfig.findMany({
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        provider: true,
        name: true,
        baseUrl: true,
        isEnabled: true,
        isLocal: true,
        priority: true,
        lastHealthStatus: true,
        lastHealthLatencyMs: true,
        lastError: true,
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    config,
    plan,
    health: aiRouter.getProviderSummaries(),
    decisions,
    providers,
    protocols: [
      { id: 'anthropic-messages', endpoint: '/api/v1/gateway/anthropic/v1/messages', status: 'active' },
      { id: 'openai-chat', endpoint: '/api/v1/gateway/openai/v1/chat/completions', status: 'active' },
      { id: 'openai-responses', endpoint: '/api/v1/gateway/openai/v1/responses', status: 'active' },
      { id: 'gemini-generate', endpoint: '/api/v1/gateway/gemini/v1beta/models/{model}/generateContent', status: 'active' },
    ],
  });
}

export async function POST(request: NextRequest) {
  let actor: Awaited<ReturnType<typeof requireRole>>;
  try {
    actor = await requireRole('super_admin');
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unauthorized';
    return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 401 });
  }

  let parsed: ReturnType<typeof ActionSchema.safeParse>;
  try {
    parsed = ActionSchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  if (data.action === 'update_config') {
    const updated = await saveCommandRouterConfig(
      {
        ...(data.strategy ? { strategy: data.strategy } : {}),
        ...(data.privacyMode ? { privacyMode: data.privacyMode } : {}),
        ...(typeof data.preferFreeFirst === 'boolean' ? { preferFreeFirst: data.preferFreeFirst } : {}),
        ...(typeof data.preferLocalFirst === 'boolean' ? { preferLocalFirst: data.preferLocalFirst } : {}),
        ...(typeof data.maxConcurrencyPerTenant === 'number' ? { maxConcurrencyPerTenant: data.maxConcurrencyPerTenant } : {}),
        ...(data.pinnedProvider !== undefined ? { pinnedProvider: data.pinnedProvider } : {}),
        ...(data.pinnedModel !== undefined ? { pinnedModel: data.pinnedModel } : {}),
      },
      actor.userId,
    );
    await writeAuditEvent({
      companyId: actor.companyId,
      actorUserId: actor.userId,
      action: 'command_router.config_updated',
      resource: 'Settings',
      resourceId: 'command_router:config',
      details: updated as unknown as Record<string, unknown>,
    });
    return NextResponse.json({ success: true, config: updated });
  }

  if (data.action === 'simulate_plan') {
    const plan = await planCommandRoute({
      companyId: actor.companyId ?? 'system',
      requestedModel: data.requestedModel,
      strategy: data.strategy,
      privacyMode: data.privacyMode,
      requiredCapabilities: (data.requiredCapabilities as ExtendedCapability[] | undefined) ?? ['chat'],
    });
    return NextResponse.json({ success: true, plan });
  }

  if (data.action === 'discover_models') {
    const cfg = await db.aIProviderConfig.findUnique({ where: { id: data.providerConfigId } });
    if (!cfg || !cfg.baseUrl) {
      return NextResponse.json({ error: 'Provider config or baseUrl not found' }, { status: 404 });
    }
    const apiKey =
      cfg.encryptedApiKey && isEncryptedField(cfg.encryptedApiKey)
        ? decryptField(cfg.encryptedApiKey)
        : undefined;
    const discovery = await discoverLiveProviderModels({
      providerKind: cfg.provider,
      baseUrl: cfg.baseUrl,
      apiKey,
    });
    await db.aIProviderConfig.update({
      where: { id: cfg.id },
      data: {
        lastHealthStatus: discovery.reachable ? 'healthy' : 'unreachable',
        lastHealthAt: new Date(),
        lastHealthLatencyMs: discovery.latencyMs,
        lastError: discovery.error ?? null,
      },
    });
    return NextResponse.json({ success: discovery.reachable, discovery });
  }

  // action === 'test_route'
  try {
    const result = await executeCommandRoute({
      companyId: actor.companyId ?? 'system',
      userId: actor.userId,
      request: {
        model: data.model ?? 'auto',
        messages: [{ role: 'user', content: data.prompt }],
        maxTokens: 256,
      },
      strategy: data.strategy,
      privacyMode: data.privacyMode,
      requiredCapabilities: (data.requiredCapabilities as ExtendedCapability[] | undefined) ?? ['chat'],
    });
    return NextResponse.json({
      success: true,
      selectedProvider: result.selectedProvider,
      selectedModel: result.response.model,
      latencyMs: result.response.latencyMs,
      redactedSecrets: result.redactedSecrets,
      content: result.response.content,
      usage: result.response.usage,
      plan: result.plan,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Test route failed',
      },
      { status: 503 },
    );
  }
}
