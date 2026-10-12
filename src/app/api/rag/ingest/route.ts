import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireCompanyAuth } from '@/lib/api-auth'
import { ingestDocument } from '@/lib/rag-engine'

const IngestSchema = z.object({
  collectionId: z.string().min(1),
  documentId: z.string().min(1),
  content: z.string().trim().min(1).max(2_000_000),
  source: z.string().trim().max(500).optional(),
  classification: z.enum(['public', 'internal', 'confidential', 'restricted', 'highly_restricted']).optional(),
  chunkSize: z.number().int().min(64).max(8192).optional(),
  overlap: z.number().int().min(0).max(2048).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const parsed = IngestSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 400 })
    }

    const [collection, document] = await Promise.all([
      db.ragCollection.findFirst({
        where: { id: parsed.data.collectionId, companyId: user.companyId },
        select: { id: true },
      }),
      db.ragDocument.findFirst({
        where: {
          id: parsed.data.documentId,
          collectionId: parsed.data.collectionId,
          companyId: user.companyId,
        },
        select: { id: true },
      }),
    ])
    if (!collection || !document) {
      return NextResponse.json({ success: false, error: 'Collection or document not found' }, { status: 404 })
    }

    const result = await ingestDocument(
      parsed.data.collectionId,
      parsed.data.documentId,
      parsed.data.content,
      {
        companyId: user.companyId,
        ...(parsed.data.source ? { source: parsed.data.source } : {}),
        ...(parsed.data.classification ? { classification: parsed.data.classification } : {}),
        ...(parsed.data.chunkSize ? { chunkSize: parsed.data.chunkSize } : {}),
        ...(typeof parsed.data.overlap === 'number' ? { overlap: parsed.data.overlap } : {}),
      },
    )

    if (result.errors.length > 0 && result.chunksCreated === 0) {
      return NextResponse.json({ success: false, error: 'Ingestion failed', data: result }, { status: 422 })
    }
    return NextResponse.json({ success: result.errors.length === 0, data: result }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to ingest document'
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
