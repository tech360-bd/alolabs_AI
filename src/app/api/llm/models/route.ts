import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { AI_MODELS } from '@/lib/model-registry'
import { requireAuth } from '@/lib/api-auth'

// ──────────────────────────────────────────────
// Type definitions
// ──────────────────────────────────────────────

interface ModelConfig {
  id: string
  name: string
  provider: string
  costPer1kTokens: number
  maxContext: number
  supportsStreaming: boolean
  capabilities: string[]
  status: string
}

interface RoutingRule {
  taskType: string
  modelId: string
  priority: number
  reason?: string
}

// ──────────────────────────────────────────────
// Built-in default models (always available)
// ──────────────────────────────────────────────

const DEFAULT_MODELS: ModelConfig[] = AI_MODELS.map((m) => ({
  id: m.id,
  name: m.name,
  provider: m.provider,
  costPer1kTokens: 0,
  maxContext: m.maxContext,
  supportsStreaming: true,
  capabilities: m.capabilities,
  status: 'active',
}))

// ──────────────────────────────────────────────
// GET /api/llm/models — list all available models
// ──────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    // Fetch dynamic models stored in Settings table (key prefix "model:")
    const modelSettings = await db.settings.findMany({
      where: {
        key: { startsWith: 'model:' },
      },
    })

    // Parse dynamic models from settings
    const dynamicModels: ModelConfig[] = []
    for (const setting of modelSettings) {
      try {
        const parsed = JSON.parse(setting.value) as ModelConfig
        dynamicModels.push(parsed)
      } catch {
        // Skip malformed model configs
      }
    }

    // Merge: defaults first, then dynamic (dynamic can override defaults by id)
    const modelMap = new Map<string, ModelConfig>()
    for (const m of DEFAULT_MODELS) {
      modelMap.set(m.id, m)
    }
    for (const m of dynamicModels) {
      modelMap.set(m.id, m)
    }

    const allModels = Array.from(modelMap.values())

    // Fetch routing rules if configured in Settings
    let routingRules: RoutingRule[] = []
    try {
      const rulesSetting = await db.settings.findUnique({
        where: { key: 'model_routing_rules' },
      })
      if (rulesSetting) {
        routingRules = JSON.parse(rulesSetting.value) as RoutingRule[]
      }
    } catch {
      // No routing rules configured, that's fine
    }

    return NextResponse.json({
      models: allModels,
      routingRules,
      total: allModels.length,
    })
  } catch (error) {
    console.error('Error listing models:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ──────────────────────────────────────────────
// POST /api/llm/models — add/configure a new model
// ──────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await request.json()
    const {
      id,
      name,
      provider = 'local',
      costPer1kTokens = 0,
      maxContext = 32000,
      supportsStreaming = true,
      capabilities = [],
      status = 'active',
    } = body

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id is required and must be a string' }, { status: 400 })
    }
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'name is required and must be a string' }, { status: 400 })
    }
    if (!Array.isArray(capabilities)) {
      return NextResponse.json({ error: 'capabilities must be an array of strings' }, { status: 400 })
    }

    const modelConfig: ModelConfig = {
      id,
      name,
      provider,
      costPer1kTokens: Number(costPer1kTokens) || 0,
      maxContext: Number(maxContext) || 32000,
      supportsStreaming: Boolean(supportsStreaming),
      capabilities: capabilities.filter((c: unknown) => typeof c === 'string'),
      status,
    }

    // Store in Settings table as JSON under key "model:{id}"
    await db.settings.upsert({
      where: { key: `model:${id}` },
      update: {
        value: JSON.stringify(modelConfig),
        type: 'json',
      },
      create: {
        key: `model:${id}`,
        value: JSON.stringify(modelConfig),
        type: 'json',
      },
    })

    return NextResponse.json({
      data: modelConfig,
      message: `Model "${id}" configured successfully`,
    }, { status: 201 })
  } catch (error) {
    console.error('Error configuring model:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}