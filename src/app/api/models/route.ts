import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';
import { AI_MODELS } from '@/lib/model-registry';

const DEFAULT_MODELS = AI_MODELS.map((m) => ({
  modelId: m.id,
  name: m.name,
  provider: m.provider,
  costPer1kTokens: 0,
  maxContext: m.maxContext,
  capabilities: m.capabilities,
  status: 'active' as const,
  healthStatus: 'healthy' as const,
}));

// GET /api/models — list models from registry
export async function GET() {
  try {
    await requireAuth();

    const models = await db.modelRegistry.findMany({
      orderBy: { createdAt: 'desc' },
    });

    // If no models registered, return defaults
    const data = models.length > 0
      ? models.map((m) => ({
          ...m,
          capabilities: JSON.parse(m.capabilities),
        }))
      : DEFAULT_MODELS;

    return NextResponse.json({ data, total: data.length });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/models — register a new model
export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    const body = await req.json();
    const { modelId, name, provider, costPer1kTokens, maxContext, capabilities, endpoint } = body;

    if (!modelId || !name) {
      return NextResponse.json({ error: 'modelId and name are required' }, { status: 400 });
    }

    const model = await db.modelRegistry.create({
      data: {
        modelId,
        name,
        provider: provider || 'local',
        costPer1kTokens: costPer1kTokens ?? 0,
        maxContext: maxContext || 4096,
        capabilities: capabilities ? JSON.stringify(capabilities) : '[]',
        status: 'active',
        healthStatus: 'healthy',
        endpoint: endpoint || null,
        deployedAt: new Date(),
      },
    });

    return NextResponse.json({ data: { ...model, capabilities: JSON.parse(model.capabilities) } }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.includes('Unique')) {
      return NextResponse.json({ error: 'Model with this modelId already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}