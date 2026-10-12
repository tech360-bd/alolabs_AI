import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { aiRouter } from '@/lib/ai-router';

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const providers = aiRouter.getRegisteredProviders();
    const healthReport: Record<string, unknown>[] = [];

    for (const providerName of providers) {
      const provider = aiRouter.getProvider(providerName);
      if (!provider) continue;

      try {
        const models = await provider.listModels();
        for (const model of models) {
          healthReport.push({
            id: `${providerName}:${model.id}`,
            name: model.name,
            provider: providerName,
            family: model.family ?? 'unknown',
            contextLength: model.contextLength ?? 0,
            capabilities: model.capabilities ?? [],
            costPerMillionTokens: model.costPerMillionTokens ?? null,
            status: provider.initialized ? 'healthy' : 'not_initialized',
          });
        }
      } catch (err) {
        healthReport.push({
          id: `${providerName}:unavailable`,
          name: providerName,
          provider: providerName,
          family: 'unknown',
          contextLength: 0,
          capabilities: [],
          status: 'error',
          error: err instanceof Error ? err.message : 'Failed to list models',
        });
      }
    }

    const data = {
      llm: healthReport,
      embeddings: [],
      vision: healthReport.filter(m => (m.capabilities as string[]).includes('vision')),
      totalModels: healthReport.length,
      healthyModels: healthReport.filter(m => m.status === 'healthy').length,
    };

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Model Hub error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
