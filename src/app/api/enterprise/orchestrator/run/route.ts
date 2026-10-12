import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAuth } from '@/lib/api-auth';
import { getOrchestrator } from '@/lib/multi-agent-orchestrator';
import { z } from 'zod';

const StepSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  task: z.string().min(1),
  dependsOn: z.array(z.string()).optional(),
  condition: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
  maxTokens: z.number().int().positive().optional(),
  tools: z.array(z.string()).optional(),
  retryCount: z.number().int().min(0).optional(),
});

const RunOrchestrationSchema = z.object({
  type: z.enum([
    'sequential',
    'parallel',
    'conditional',
    'delegation',
    'aggregation',
    'voting',
    'consensus',
    'review',
  ]),
  steps: z.array(StepSchema).min(1, 'At least one step is required'),
  input: z.string().min(1, 'input is required'),
  context: z.record(z.string(), z.unknown()).optional(),
  departmentId: z.string().optional(),
  priority: z.enum(['P0', 'P1', 'P2', 'P3', 'P4', 'P5']).optional(),
  parallelConfig: z.object({
    maxConcurrency: z.number().int().min(1).max(50).optional(),
    timeoutMs: z.number().int().positive().optional(),
    failFast: z.boolean().optional(),
    aggregationStrategy: z.enum([
      'first', 'last', 'voting', 'consensus', 'all', 'concatenate',
    ]).optional(),
  }).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();

    const body = await request.json();
    const parsed = RunOrchestrationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: parsed.error.issues,
        },
      }, { status: 400 });
    }

    const { type, steps, input, context, departmentId, priority, parallelConfig } =
      parsed.data;

    const orchestrator = getOrchestrator();
    const task = await orchestrator.executeTask({
      type,
      steps,
      input,
      companyId: user.companyId,
      userId: user.userId,
      departmentId,
      priority,
      context,
      parallelConfig: parallelConfig ?? undefined,
    });

    return NextResponse.json({
      success: true,
      data: {
        taskId: task.id,
        status: task.status,
        type: task.type,
        stepCount: task.steps.length,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
      }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Forbidden' },
      }, { status: 403 });
    }
    console.error('[/api/enterprise/orchestrator/run]', error);
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Internal server error',
      },
    }, { status: 500 });
  }
}
