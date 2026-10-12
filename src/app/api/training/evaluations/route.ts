import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireCompanyAuth } from '@/lib/api-auth'
import { evaluateTraining, getTrainingEvaluations } from '@/lib/training'

const EvaluateSchema = z.object({
  sourceId: z.string().min(1),
  agentId: z.string().min(1),
})

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error'
  const status = message === 'Unauthorized' ? 401
    : message === 'Forbidden' ? 403
      : message === 'Source not found' || message === 'Agent not found' ? 404
        : 500
  return NextResponse.json({ error: message, success: false }, { status })
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const search = req.nextUrl.searchParams
    const sourceId = search.get('sourceId') ?? undefined
    const agentId = search.get('agentId') ?? undefined
    if (sourceId) {
      const source = await db.trainingSource.findFirst({
        where: { id: sourceId, companyId: user.companyId },
        select: { id: true },
      })
      if (!source) return NextResponse.json({ error: 'Training source not found', success: false }, { status: 404 })
    }
    const data = await getTrainingEvaluations({ sourceId, agentId, companyId: user.companyId })
    return NextResponse.json({ data, success: true })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const parsed = EvaluateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten(), success: false }, { status: 400 })
    }

    const source = await db.trainingSource.findFirst({
      where: { id: parsed.data.sourceId, companyId: user.companyId },
      select: { id: true, agentId: true },
    })
    if (!source) return NextResponse.json({ error: 'Training source not found', success: false }, { status: 404 })
    if (source.agentId && source.agentId !== parsed.data.agentId) {
      return NextResponse.json({ error: 'Training source is attached to a different agent', success: false }, { status: 409 })
    }

    const result = await evaluateTraining(parsed.data.sourceId, parsed.data.agentId)
    return NextResponse.json(result, { status: result.success ? 200 : 503 })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}
