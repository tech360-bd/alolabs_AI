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

interface RouteRequest {
  task: string
  input?: string
  contextSize?: number
  preferCost?: boolean
  quality?: 'low' | 'medium' | 'high'
}

// ──────────────────────────────────────────────
// Built-in default models
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
// Task type detection heuristics
// ──────────────────────────────────────────────

const TASK_PATTERNS: Array<{ pattern: RegExp; taskType: string; confidence: number }> = [
  { pattern: /\b(code|programming|function|class|typescript|python|javascript|react|api|debug|refactor|implement|build\s+an?\s+\w+)\b/i, taskType: 'code_generation', confidence: 0.9 },
  { pattern: /\b(analyz|review|assess|evaluate|compare|audit|investigate|diagnos|examine)\b/i, taskType: 'analysis', confidence: 0.9 },
  { pattern: /\b(write|story|poem|creative|brainstorm|imagine|design|draft)\b/i, taskType: 'creative', confidence: 0.85 },
  { pattern: /\b(hello|hi|hey|chat|talk|ask|question|help me|what is|how to|tell me)\b/i, taskType: 'conversation', confidence: 0.85 },
  { pattern: /\b(parse|transform|convert|extract|process|format|clean|csv|json|xml|data)\b/i, taskType: 'data_processing', confidence: 0.85 },
]

// Quality-to-model preference scoring
const QUALITY_MODEL_SCORES: Record<string, Record<string, number>> = {
  high: { 'deepseek-r1': 3, 'deepseek-v3': 2, 'llama-3.1-70b': 2, 'qwen-3-235b-a22b': 2 },
  medium: { 'deepseek-v3': 3, 'deepseek-r1': 2, 'llama-3.1-70b': 2, 'qwen-3-235b-a22b': 2 },
  low: { 'llama-3.1-70b': 3, 'deepseek-v3': 2, 'qwen-3-235b-a22b': 2, 'deepseek-r1': 1 },
}

// ──────────────────────────────────────────────
// Helper: load all models (defaults + dynamic)
// ──────────────────────────────────────────────

async function loadAllModels(): Promise<ModelConfig[]> {
  const modelSettings = await db.settings.findMany({
    where: { key: { startsWith: 'model:' } },
  })

  const dynamicModels: ModelConfig[] = []
  for (const setting of modelSettings) {
    try {
      dynamicModels.push(JSON.parse(setting.value) as ModelConfig)
    } catch {
      // Skip malformed configs
    }
  }

  const modelMap = new Map<string, ModelConfig>()
  for (const m of DEFAULT_MODELS) modelMap.set(m.id, m)
  for (const m of dynamicModels) modelMap.set(m.id, m)

  return Array.from(modelMap.values()).filter((m) => m.status === 'active')
}

// ──────────────────────────────────────────────
// Helper: load routing rules from Settings
// ──────────────────────────────────────────────

async function loadRoutingRules(): Promise<RoutingRule[]> {
  try {
    const setting = await db.settings.findUnique({
      where: { key: 'model_routing_rules' },
    })
    if (setting) return JSON.parse(setting.value) as RoutingRule[]
  } catch {
    // No rules configured
  }
  return []
}

// ──────────────────────────────────────────────
// Helper: estimate tokens from input text
// ──────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

// ──────────────────────────────────────────────
// Helper: detect task type from task description
// ──────────────────────────────────────────────

function detectTaskType(task: string): { taskType: string; confidence: number } {
  let bestMatch = { taskType: 'conversation', confidence: 0.5 } // default fallback

  for (const { pattern, taskType, confidence } of TASK_PATTERNS) {
    if (pattern.test(task)) {
      if (confidence > bestMatch.confidence) {
        bestMatch = { taskType, confidence }
      }
    }
  }

  return bestMatch
}

// ──────────────────────────────────────────────
// POST /api/llm/route — intelligent model routing
// ──────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json() as RouteRequest
    const { task, input, contextSize, preferCost, quality } = body

    if (!task || typeof task !== 'string') {
      return NextResponse.json({ error: 'task is required and must be a string' }, { status: 400 })
    }

    // Load available models and routing rules
    const models = await loadAllModels()
    const routingRules = await loadRoutingRules()

    if (models.length === 0) {
      return NextResponse.json({ error: 'No models available' }, { status: 503 })
    }

    // Step 1: Detect task type
    const detected = detectTaskType(task)
    const taskType = detected.taskType

    // Step 2: Check for explicit routing rules
    const ruleForTask = routingRules
      .filter((r) => r.taskType === taskType)
      .sort((a, b) => b.priority - a.priority)[0]

    if (ruleForTask) {
      const ruleModel = models.find((m) => m.id === ruleForTask.modelId)
      if (ruleModel) {
        const estimatedTokens = contextSize ?? estimateTokens(task + (input || ''))
        const estimatedCost = (estimatedTokens / 1000) * ruleModel.costPer1kTokens

        await recordRoutingMetric(taskType, ruleModel.id, detected.confidence, ruleForTask.reason || '')

        return NextResponse.json({
          selectedModel: ruleModel.id,
          reasoning: ruleForTask.reason || `Routing rule matched for task type "${taskType}"`,
          estimatedCost: Math.round(estimatedCost * 10000) / 10000,
          estimatedTokens,
          taskType,
          confidence: detected.confidence,
          source: 'routing_rule',
        })
      }
    }

    // Step 3: Score all models based on task requirements
    const inputTokens = contextSize ?? estimateTokens(task + (input || ''))
    const scoredModels = models.map((model) => {
      let score = 0
      const reasons: string[] = []

      // Capability match (highest weight)
      if (model.capabilities.includes(taskType)) {
        score += 40
        reasons.push(`Supports ${taskType} capability`)
      } else {
        score -= 20
        reasons.push(`Does not support ${taskType} capability`)
      }

      // Context window fit
      if (inputTokens > 0) {
        const contextUtilization = inputTokens / model.maxContext
        if (contextUtilization <= 0.7) {
          score += 15
          reasons.push(`Context window sufficient (${model.maxContext} tokens)`)
        } else if (contextUtilization <= 0.9) {
          score += 5
          reasons.push(`Context window tight but usable`)
        } else if (contextUtilization <= 1.0) {
          score -= 10
          reasons.push(`Context window nearly full (${Math.round(contextUtilization * 100)}% utilization)`)
        } else {
          score -= 50 // Cannot fit
          reasons.push(`Context window too small (need ~${inputTokens}, max ${model.maxContext})`)
        }
      }

      // Cost preference
      if (preferCost) {
        if (model.costPer1kTokens === 0) {
          score += 20
          reasons.push('Zero cost (local model)')
        } else if (model.costPer1kTokens < 0.01) {
          score += 10
          reasons.push('Low cost model')
        }
      }

      // Quality preference
      if (quality) {
        const qualityScore = QUALITY_MODEL_SCORES[quality]?.[model.id] || 1
        score += qualityScore * 5
        if (qualityScore >= 3) {
          reasons.push(`Optimal for ${quality} quality`)
        }
      }

      // Streaming support bonus for conversation tasks
      if (taskType === 'conversation' && model.supportsStreaming) {
        score += 5
        reasons.push('Supports streaming for real-time conversation')
      }

      // Default model slight preference for stability
      if (['deepseek-v3', 'deepseek-r1', 'llama-3.1-70b'].includes(model.id)) {
        score += 2
      }

      return { model, score, reasons }
    })

    // Step 4: Select the best scoring model
    scoredModels.sort((a, b) => b.score - a.score)
    const best = scoredModels[0]

    if (!best || best.score < -20) {
      // No suitable model found
      return NextResponse.json({
        selectedModel: models[0].id, // fallback
        reasoning: 'No model scored well for this task; falling back to default.',
        estimatedCost: 0,
        estimatedTokens: inputTokens,
        taskType,
        confidence: 0.3,
        source: 'fallback',
        warning: 'Low confidence match',
      })
    }

    const estimatedCost = (inputTokens / 1000) * best.model.costPer1kTokens

    // Record routing metric (non-blocking)
    await recordRoutingMetric(taskType, best.model.id, detected.confidence, best.reasons.join('. ')).catch(() => {})

    return NextResponse.json({
      selectedModel: best.model.id,
      reasoning: best.reasons.join('. '),
      estimatedCost: Math.round(estimatedCost * 10000) / 10000,
      estimatedTokens: inputTokens,
      taskType,
      confidence: Math.min(0.99, detected.confidence + (best.score > 40 ? 0.1 : 0)),
      source: 'auto_routing',
      allScores: scoredModels.map((s) => ({
        modelId: s.model.id,
        score: s.score,
      })),
    })
  } catch (error) {
    console.error('Error in model routing:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ──────────────────────────────────────────────
// Helper: record routing metric
// ──────────────────────────────────────────────

async function recordRoutingMetric(
  taskType: string,
  selectedModel: string,
  confidence: number,
  reason: string,
): Promise<void> {
  try {
    await db.metric.create({
      data: {
        name: 'llm_model_routing',
        value: 1,
        labels: JSON.stringify({ taskType, selectedModel, confidence: Math.round(confidence * 100) / 100 }),
        unit: 'request',
      },
    })
  } catch {
    // Non-blocking metric recording
  }
}