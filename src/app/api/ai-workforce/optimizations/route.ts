import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireCompanyAuth } from '@/lib/api-auth'
import { getOptimizations, proposeOptimization, type OptimizationType } from '@/lib/ai-workforce/self-improvement'

const OptimizationTypeSchema = z.enum(['prompt', 'workflow', 'planning', 'skill_selection', 'tool_selection'])
const OptimizationSchema = z.object({
  agentId: z.string().min(1),
  type: OptimizationTypeSchema,
  optimizedValue: z.record(z.string(), z.unknown()),
  rationale: z.string().trim().min(1).max(5000),
}).superRefine((value, context) => {
  const requiredKey = value.type === 'prompt'
    ? 'purpose'
    : value.type === 'skill_selection'
      ? 'allowedSkills'
      : value.type === 'tool_selection'
        ? 'allowedTools'
        : 'workflowSteps'
  const candidate = value.optimizedValue[requiredKey]
  const valid = requiredKey === 'purpose'
    ? typeof candidate === 'string' && candidate.trim().length > 0
    : Array.isArray(candidate) && candidate.every((entry) => typeof entry === 'string')
  if (!valid) {
    context.addIssue({
      code: 'custom',
      path: ['optimizedValue', requiredKey],
      message: `A valid ${requiredKey} value is required for this optimization type`,
    })
  }
})

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error'
  const status = message === 'Unauthorized' ? 401
    : message === 'Forbidden' ? 403
      : message === 'Optimization not found' || message === 'Agent not found' ? 404
        : message.includes('Only pending') || message.includes('must be approved') || message.includes('Only applied') ? 409
          : 500
  return NextResponse.json({ error: message, success: false }, { status })
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const search = req.nextUrl.searchParams
    const rawType = search.get('type')
    const parsedType = rawType ? OptimizationTypeSchema.safeParse(rawType) : undefined
    if (parsedType && !parsedType.success) {
      return NextResponse.json({ error: 'Unsupported optimization type', success: false }, { status: 400 })
    }
    const rawStatus = search.get('status')
    const statuses = ['pending', 'approved', 'rejected', 'applied', 'rolled_back'] as const
    const parsedStatus = rawStatus ? z.enum(statuses).safeParse(rawStatus) : undefined
    if (parsedStatus && !parsedStatus.success) {
      return NextResponse.json({ error: 'Unsupported optimization status', success: false }, { status: 400 })
    }

    const type: OptimizationType | undefined = parsedType?.success ? parsedType.data : undefined
    const data = await getOptimizations({
      agentId: search.get('agentId') ?? undefined,
      type,
      status: parsedStatus?.success ? parsedStatus.data : undefined,
      companyId: user.companyId,
      limit: 50,
    })
    return NextResponse.json({ data, success: true })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const parsed = OptimizationSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten(), success: false }, { status: 400 })
    }

    const data = await proposeOptimization({
      ...parsed.data,
      companyId: user.companyId,
      proposedBy: user.userId,
    })
    return NextResponse.json({ data, success: true }, { status: 201 })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}
