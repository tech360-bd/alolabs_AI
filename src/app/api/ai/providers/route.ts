import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAuth } from '@/lib/api-auth';
import { listCompanyAIModels } from '@/lib/multi-tenant-ai/service';
import { MODEL_ROUTING_PROFILES, type ModelRoutingProfile } from '@/lib/multi-tenant-ai/policy';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();
    const profileParam = request.nextUrl.searchParams.get('profile') ?? 'free_general';
    if (!(MODEL_ROUTING_PROFILES as readonly string[]).includes(profileParam)) return NextResponse.json({ error: 'Invalid profile' }, { status: 400 });
    const models = await listCompanyAIModels({ companyId: user.companyId, userId: user.userId, role: user.role }, profileParam as ModelRoutingProfile);
    const groups = new Map<string, typeof models>();
    for (const model of models) groups.set(model.provider, [...(groups.get(model.provider) ?? []), model]);
    const providers = [...groups.entries()].map(([provider, providerModels]) => ({
      provider,
      routeKind: providerModels.some((model) => model.routeKind === 'local') ? 'local' : providerModels.some((model) => model.routeKind === 'verified_free') ? 'verified_free' : 'paid',
      models: providerModels.map((model) => model.id),
      initialized: true,
    }));
    return NextResponse.json({ success: true, data: { providers, configured: providers.length > 0 } });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof Error && error.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('[AI Providers] Failed:', error);
    return NextResponse.json({ error: 'Unable to list company-authorized providers' }, { status: 500 });
  }
}
