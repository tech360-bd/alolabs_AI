import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireCompanyAuth } from '@/lib/api-auth'

const CreateCollectionSchema = z.object({
  name: z.string().trim().min(1).max(191),
  description: z.string().trim().max(2000).optional(),
})

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error'
  const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500
  return NextResponse.json({ success: false, error: message }, { status })
}

export async function GET() {
  try {
    const user = await requireCompanyAuth()
    const collections = await db.ragCollection.findMany({
      where: { companyId: user.companyId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { documents: true } } },
    })
    return NextResponse.json({ success: true, data: collections })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const parsed = CreateCollectionSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 400 })
    }
    const collection = await db.ragCollection.create({
      data: {
        companyId: user.companyId,
        name: parsed.data.name,
        ...(parsed.data.description ? { description: parsed.data.description } : {}),
      },
    })
    return NextResponse.json({ success: true, data: collection }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
