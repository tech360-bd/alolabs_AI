import { db } from '@/lib/db'
import { legacyTenant, tenantWhere, legacyAuthResponse } from '@/lib/api/legacy-session'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const tenant = await legacyTenant(request)
    const body = await request.json()
    const { companyId: requestedCompanyId, query, collectionId } = body

    if (requestedCompanyId && requestedCompanyId !== tenant.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!query) {
      return NextResponse.json(
        { error: 'query is required' },
        { status: 400 }
      )
    }

    const startTime = Date.now()

    // Always filter chunks by the caller's resolved tenant
    const chunkWhere: Record<string, unknown> = {}
    if (collectionId) {
      const collection = await db.ragCollection.findFirst({
        where: tenantWhere(tenant, { id: collectionId }),
        select: { id: true },
      })
      if (!collection) {
        return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
      }
      const docIds = await db.ragDocument.findMany({
        where: tenantWhere(tenant, { collectionId }),
        select: { id: true },
      })
      chunkWhere.documentId = { in: docIds.map((d) => d.id) }
    }

    const chunks = await db.ragChunk.findMany({
      where: tenantWhere(tenant, chunkWhere),
      orderBy: { createdAt: 'desc' },
      take: 5,
    })

    const durationMs = Date.now() - startTime

    // Create RagQuery record bound to authoritative tenant
    const ragQuery = await db.ragQuery.create({
      data: {
        companyId: tenant.companyId,
        userId: tenant.userId,
        query,
        collectionId: collectionId || null,
        resultCount: chunks.length,
        status: chunks.length > 0 ? 'success' : 'no_results',
        durationMs,
      },
    })

    const answerContent = chunks.length > 0
      ? `Based on ${chunks.length} relevant document${chunks.length > 1 ? 's' : ''} found:\n\n${chunks.map((c, i) => `[${i + 1}] ${c.content.substring(0, 200)}...`).join('\n\n')}`
      : 'No relevant documents found for your query. Consider adding more documents to the knowledge base.'

    const chunkIds = JSON.stringify(chunks.map((c) => c.id))
    const confidence = chunks.length > 0 ? Math.min(0.95, 0.5 + chunks.length * 0.1) : 0

    const ragAnswer = await db.ragAnswer.create({
      data: {
        queryId: ragQuery.id,
        companyId: tenant.companyId,
        content: answerContent,
        chunks: chunkIds,
        confidence,
      },
    })

    return NextResponse.json({
      query: ragQuery,
      answer: ragAnswer,
      chunks: chunks.map((c) => ({
        id: c.id,
        content: c.content,
        metadata: c.metadata,
        position: c.position,
      })),
    })
  } catch (error) {
    const authFailure = legacyAuthResponse(error)
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status })
    console.error('[RAG Query] Error:', error)
    return NextResponse.json(
      { error: 'Failed to process RAG query' },
      { status: 500 }
    )
  }
}
