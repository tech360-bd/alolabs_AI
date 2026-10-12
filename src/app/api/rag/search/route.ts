import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireCompanyAuth } from '@/lib/api-auth'
import { hybridSearch } from '@/lib/rag-engine'

const SearchSchema = z.object({
  query: z.string().trim().min(1).max(50_000),
  collectionId: z.string().min(1).optional(),
  collectionName: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  vectorWeight: z.number().finite().min(0).max(1).optional(),
  keywordWeight: z.number().finite().min(0).max(1).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const parsed = SearchSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 400 })
    }

    const result = await hybridSearch(parsed.data.query, {
      companyId: user.companyId,
      userId: user.userId,
      ...(parsed.data.collectionId ? { collectionId: parsed.data.collectionId } : {}),
      ...(parsed.data.collectionName ? { collectionName: parsed.data.collectionName } : {}),
      ...(parsed.data.limit ? { limit: parsed.data.limit } : {}),
      ...(typeof parsed.data.vectorWeight === 'number' ? { vectorWeight: parsed.data.vectorWeight } : {}),
      ...(typeof parsed.data.keywordWeight === 'number' ? { keywordWeight: parsed.data.keywordWeight } : {}),
    })
    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
