import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, type AuthenticatedUser } from '@/lib/api-auth';
import { getQuotaStatus, getOrderedFreeProviders, resetProviderQuota, getDefaultQuota } from '@/lib/ai-router/free-tier-quota-tracker';

/**
 * GET /api/admin/providers/quota — view all free-tier provider quotas.
 * Admin-only. Shows which providers have remaining quota and which are
 * exhausted (and when they reset).
 */
export async function GET(request: NextRequest) {
  let user: AuthenticatedUser;
  try { user = await requireAuth(); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
  if (user.role !== 'super_admin' && user.role !== 'admin' && user.role !== 'platform_super_admin' && user.role !== 'ai_model_admin') {
    return NextResponse.json({ error: 'Forbidden — admin role required' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const providerId = searchParams.get('providerId');
  const providerKind = searchParams.get('providerKind') ?? '';

  if (providerId) {
    const status = await getQuotaStatus(providerId, providerKind);
    return NextResponse.json({ data: status });
  }

  // List all default quotas for reference
  const knownKinds = ['groq', 'openrouter-free', 'openrouter', 'unorouter-free', 'unorouter', 'deepseek', 'mistral', 'qwen', 'zai-sdk', 'zai', 'github-models', 'cerebras', 'huggingface', 'cloudflare-workers-ai', 'cohere', 'ollama', 'openai-compatible-free'];
  const defaults = knownKinds.map(kind => ({ kind, ...getDefaultQuota(kind) }));

  return NextResponse.json({ data: { defaults } });
}

/**
 * POST /api/admin/providers/quota — reset a provider's quota (admin action).
 * Body: { providerId, providerKind }
 */
export async function POST(request: NextRequest) {
  let user: AuthenticatedUser;
  try { user = await requireAuth(); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
  if (user.role !== 'super_admin' && user.role !== 'admin' && user.role !== 'platform_super_admin') {
    return NextResponse.json({ error: 'Forbidden — admin role required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { providerId, providerKind } = body;
    if (!providerId) {
      return NextResponse.json({ error: 'providerId is required' }, { status: 400 });
    }
    await resetProviderQuota(providerId, providerKind ?? 'default');
    return NextResponse.json({ success: true, message: `Quota reset for ${providerId}` });
  } catch (error) {
    console.error('[admin/providers/quota POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
