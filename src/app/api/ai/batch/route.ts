import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCompanyAuth } from '@/lib/api-auth';
import { CompanyAIError, executeCompanyAIChat } from '@/lib/multi-tenant-ai/service';
import { MODEL_ROUTING_PROFILES } from '@/lib/multi-tenant-ai/policy';

const ItemSchema = z.object({
  messages: z.array(z.object({ role: z.enum(['system', 'user', 'assistant', 'tool']), content: z.string().max(200_000) })).min(1).max(100),
  model: z.string().trim().min(1).max(200).optional(),
  profile: z.enum(MODEL_ROUTING_PROFILES).default('free_general'),
  agentId: z.string().min(1).optional(),
  departmentId: z.string().min(1).optional(),
  maxTokens: z.number().int().min(1).max(128_000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  dataClassification: z.enum(['confidential', 'restricted']).optional(),
});
const BatchSchema = z.object({ requests: z.array(ItemSchema).min(1).max(10) });

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof requireCompanyAuth>>;
  try { user = await requireCompanyAuth(); }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status: message === 'Forbidden' ? 403 : 401 });
  }
  let parsed;
  try { parsed = BatchSchema.safeParse(await request.json()); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const actor = { companyId: user.companyId, userId: user.userId, role: user.role };
  const results = [];
  for (const item of parsed.data.requests) {
    try {
      const result = await executeCompanyAIChat(actor, { model: item.model ?? '', messages: item.messages, maxTokens: item.maxTokens, temperature: item.temperature }, {
        profile: item.profile,
        agentId: item.agentId,
        departmentId: item.departmentId,
        dataClassification: item.dataClassification,
      });
      results.push({ success: true, data: { content: result.response.content, model: result.response.model, provider: result.provider, usage: result.response.usage, usageSource: result.response.usageSource ?? 'unknown', estimatedCostUsd: result.estimatedCostUsd, requestId: result.requestId } });
    } catch (error) {
      results.push({ success: false, error: error instanceof CompanyAIError ? { code: error.code, message: error.message, requestId: error.requestId } : { code: 'INTERNAL_ERROR', message: 'Request failed.' } });
    }
  }
  return NextResponse.json({ success: results.every((result) => result.success), data: results });
}
