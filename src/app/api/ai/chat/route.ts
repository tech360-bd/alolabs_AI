import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCompanyAuth } from '@/lib/api-auth';
import { checkEndpointLimit } from '@/lib/security/rate-limiter';
import { executeCompanyAIChat, CompanyAIError } from '@/lib/multi-tenant-ai/service';
import { MODEL_ROUTING_PROFILES } from '@/lib/multi-tenant-ai/policy';

const RequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant', 'tool']),
    content: z.string().max(200_000),
  })).min(1).max(100),
  model: z.string().trim().min(1).max(200).optional(),
  profile: z.enum(MODEL_ROUTING_PROFILES).default('free_general'),
  agentId: z.string().min(1).optional(),
  departmentId: z.string().min(1).optional(),
  maxTokens: z.number().int().min(1).max(128_000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  tools: z.array(z.object({
    type: z.literal('function'),
    function: z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(2000).optional(),
      parameters: z.record(z.string(), z.unknown()).optional(),
    }),
  })).max(32).optional(),
  dataClassification: z.enum(['confidential', 'restricted']).optional(),
});

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof requireCompanyAuth>>;
  try {
    user = await requireCompanyAuth();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status: message === 'Forbidden' ? 403 : 401 });
  }
  const rateLimit = await checkEndpointLimit('/api/ai/chat', user.userId);
  if (!rateLimit.allowed) {
    const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
    return NextResponse.json({ error: 'Rate limit exceeded', retryAfter }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  }
  let parsed;
  try { parsed = RequestSchema.safeParse(await request.json()); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const { response, requestId, provider, profile, estimatedCostUsd, fallbackUsed } = await executeCompanyAIChat(
      { companyId: user.companyId, userId: user.userId, role: user.role },
      {
        model: parsed.data.model ?? '',
        messages: parsed.data.messages,
        temperature: parsed.data.temperature,
        maxTokens: parsed.data.maxTokens,
        tools: parsed.data.tools,
      },
      {
        profile: parsed.data.profile,
        agentId: parsed.data.agentId,
        departmentId: parsed.data.departmentId,
        dataClassification: parsed.data.dataClassification,
      },
    );
    return NextResponse.json({
      success: true,
      data: {
        id: response.id,
        content: response.content,
        model: response.model,
        provider,
        usage: response.usage,
        usageSource: response.usageSource ?? 'unknown',
        finishReason: response.finishReason,
        latencyMs: response.latencyMs,
        estimatedCostUsd,
        routedBy: 'company-policy-router',
        fallbackUsed,
        profile,
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof CompanyAIError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message }, requestId: error.requestId, timestamp: new Date().toISOString() }, { status: error.status });
    }
    console.error('[AI Chat] Policy execution failed:', error);
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'AI request could not be completed.' } }, { status: 500 });
  }
}
