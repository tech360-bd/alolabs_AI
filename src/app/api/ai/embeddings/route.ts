import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCompanyAuth } from '@/lib/api-auth';
import { checkEndpointLimit } from '@/lib/security/rate-limiter';
import { CompanyAIError, executeCompanyAIEmbeddings } from '@/lib/multi-tenant-ai/service';

export const dynamic = 'force-dynamic';

const InputSchema = z.union([
  z.string().min(1).max(100_000),
  z.array(z.string().min(1).max(100_000)).min(1).max(100),
]);
const RequestSchema = z.object({
  input: InputSchema,
  agentId: z.string().min(1).optional(),
  departmentId: z.string().min(1).optional(),
  dataClassification: z.enum(['confidential', 'restricted']).default('confidential'),
}).strict();

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof requireCompanyAuth>>;
  try { user = await requireCompanyAuth(); }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status: message === 'Forbidden' ? 403 : 401 });
  }
  const rateLimit = await checkEndpointLimit('/api/ai/embeddings', user.userId);
  if (!rateLimit.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });

  let parsed;
  try { parsed = RequestSchema.safeParse(await request.json()); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const result = await executeCompanyAIEmbeddings(
      { companyId: user.companyId, userId: user.userId, role: user.role },
      { model: '', input: parsed.data.input },
      {
        profile: 'free_embeddings',
        agentId: parsed.data.agentId,
        departmentId: parsed.data.departmentId,
        dataClassification: parsed.data.dataClassification,
      },
    );
    return NextResponse.json({
      success: true,
      requestId: result.requestId,
      provider: result.provider,
      model: result.response.model,
      usage: result.response.usage,
      usageSource: result.response.usageSource ?? 'unknown',
      data: result.response.data,
    });
  } catch (error) {
    if (error instanceof CompanyAIError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message }, requestId: error.requestId }, { status: error.status });
    }
    console.error('[AI Embeddings] Policy execution failed:', error);
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Embedding request could not be completed.' } }, { status: 500 });
  }
}
