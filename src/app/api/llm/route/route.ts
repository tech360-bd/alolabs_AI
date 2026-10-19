import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCompanyAuth } from '@/lib/api-auth';
import { previewCompanyAIRoute } from '@/lib/multi-tenant-ai/service';
import type { ModelRoutingProfile } from '@/lib/multi-tenant-ai/policy';

const RouteRequestSchema = z.object({
  task: z.string().trim().min(1).max(20_000),
  input: z.string().max(100_000).optional(),
  contextSize: z.number().int().positive().max(1_000_000).optional(),
  preferCost: z.boolean().optional(),
  quality: z.enum(['low', 'medium', 'high']).optional(),
}).strict();

const TASK_PATTERNS: Array<{ pattern: RegExp; taskType: string; confidence: number }> = [
  { pattern: /\b(code|programming|function|class|typescript|python|javascript|react|api|debug|refactor|implement)\b/i, taskType: 'code_generation', confidence: 0.9 },
  { pattern: /\b(analyz|review|assess|evaluate|compare|audit|investigate|diagnos|examine)\b/i, taskType: 'analysis', confidence: 0.9 },
  { pattern: /\b(write|story|poem|creative|brainstorm|imagine|design|draft)\b/i, taskType: 'creative', confidence: 0.85 },
  { pattern: /\b(hello|hi|hey|chat|talk|ask|question|help me|what is|how to|tell me)\b/i, taskType: 'conversation', confidence: 0.85 },
  { pattern: /\b(parse|transform|convert|extract|process|format|clean|csv|json|xml|data)\b/i, taskType: 'data_processing', confidence: 0.85 },
];

function detectTaskType(task: string): { taskType: string; confidence: number } {
  let bestMatch = { taskType: 'conversation', confidence: 0.5 };
  for (const candidate of TASK_PATTERNS) {
    if (candidate.pattern.test(task) && candidate.confidence > bestMatch.confidence) {
      bestMatch = { taskType: candidate.taskType, confidence: candidate.confidence };
    }
  }
  return bestMatch;
}

function profileForTask(taskType: string, quality?: 'low' | 'medium' | 'high'): ModelRoutingProfile {
  if (taskType === 'code_generation') return 'free_coding';
  if (taskType === 'analysis' || quality === 'high') return 'free_reasoning';
  return 'free_general';
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireCompanyAuth();
    let body: unknown;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

    const parsed = RouteRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { task, input, quality } = parsed.data;
    const detected = detectTaskType(task);
    const profile = profileForTask(detected.taskType, quality);
    const inputText = [task, input ?? ''].filter(Boolean).join('\n');
    // The request's optional contextSize is not trusted; derive this estimate from the supplied text.
    const estimatedTokens = estimateTokens(inputText);
    const preview = await previewCompanyAIRoute(
      { companyId: actor.companyId, userId: actor.userId, role: actor.companyRole ?? actor.role },
      { model: '', messages: [{ role: 'user', content: inputText }] },
      { profile, dataClassification: 'confidential' },
    );

    if (!preview.available || !preview.selected) {
      return NextResponse.json({
        available: false,
        reason: preview.reason ?? 'No authorized model is currently available.',
        requestId: preview.requestId,
        profile,
        estimatedTokens,
        taskType: detected.taskType,
        confidence: detected.confidence,
        source: 'multi-tenant-ai',
      }, { status: 503 });
    }

    return NextResponse.json({
      available: true,
      selectedModel: preview.selected.model,
      provider: preview.selected.provider,
      routeKind: preview.selected.routeKind,
      reasoning: `Selected by the company-scoped ${profile} routing policy.`,
      ...(preview.selected.estimatedCostPerMillion !== undefined
        ? { estimatedCostPerMillion: preview.selected.estimatedCostPerMillion }
        : {}),
      fallbacks: preview.fallbacks,
      requestId: preview.requestId,
      profile,
      estimatedTokens,
      taskType: detected.taskType,
      confidence: detected.confidence,
      source: 'multi-tenant-ai',
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('[LLM Route Preview] Error:', error);
    return NextResponse.json({ error: 'Unable to preview an authorized model route.' }, { status: 500 });
  }
}
