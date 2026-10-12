import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getAgentFactory } from '@/lib/multi-agent-orchestrator';
import { z } from 'zod';

const AgentFactorySchema = z.object({
  name: z.string().min(1, 'name is required').max(100),
  departmentId: z.string().min(1, 'departmentId is required'),
  role: z.string().min(1, 'role is required'),
  systemPrompt: z.string().min(1, 'systemPrompt is required'),
  skills: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  knowledge: z.array(z.string()).default([]),
  memoryProfile: z.enum(['none', 'short', 'standard', 'long']).default('standard'),
  modelPolicy: z.enum(['fast', 'balanced', 'reasoning', 'coding', 'vision']).default('balanced'),
  allowedProviders: z.array(z.string()).default([]),
  permissions: z.array(z.string()).default([]),
  budgetLimit: z.number().min(0).default(10),
  triggers: z.array(z.string()).optional(),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  evaluationPolicy: z.string().optional(),
  expirationMinutes: z.number().int().min(1).optional(),
});

export async function POST(request: NextRequest) {
  try {
    await requireAuth();

    const body = await request.json();
    const parsed = AgentFactorySchema.safeParse(body);
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

    const spec = parsed.data;
    const factory = getAgentFactory();
    const agent = await factory.createAgent(spec);

    return NextResponse.json({
      success: true,
      data: agent,
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
    console.error('[/api/enterprise/agent-factory/create]', error);
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Internal server error',
      },
    }, { status: 500 });
  }
}
