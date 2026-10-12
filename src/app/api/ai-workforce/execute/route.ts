import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireCompanyAuth } from '@/lib/api-auth'
import { executeAgentPipeline, getExecutions } from '@/lib/ai-workforce'

const ExecutionRequestSchema = z.object({
  instanceId: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
  priority: z.enum(['critical', 'high', 'normal', 'low']).optional(),
})

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error'
  const status = message === 'Unauthorized' ? 401
    : message === 'Forbidden' ? 403
      : message.includes('not found') ? 404
        : 500
  return NextResponse.json({ success: false, error: message }, { status })
}

function positiveInteger(value: string | null, fallback: number, maximum: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) return fallback
  return Math.min(parsed, maximum)
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const params = request.nextUrl.searchParams
    const data = await getExecutions({
      companyId: user.companyId,
      ...(params.get('instanceId') ? { instanceId: params.get('instanceId')! } : {}),
      ...(params.get('status') ? { status: params.get('status')! } : {}),
      limit: positiveInteger(params.get('limit'), 50, 100),
      offset: positiveInteger(params.get('offset'), 0, 10_000),
    })
    return NextResponse.json({ data, success: true })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const parsed = ExecutionRequestSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 400 })
    }

    const result = await executeAgentPipeline(parsed.data.instanceId, parsed.data.input, {
      companyId: user.companyId,
      userId: user.userId,
      ...(parsed.data.priority ? { priority: parsed.data.priority } : {}),
    })
    const status = result.needsApproval ? 202 : result.success ? 200 : 502
    return NextResponse.json({ data: result, success: result.success }, { status })
  } catch (error) {
    return errorResponse(error)
  }
}
