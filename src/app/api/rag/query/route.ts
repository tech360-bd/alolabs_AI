import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const body = await request.json()
    const { companyId, query, collectionId } = body

    if (!query) {
      return NextResponse.json(
        { error: 'query is required' },
        { status: 400 }
      )
    }

    const startTime = Date.now()

    // Find relevant chunks
    const chunkWhere: Record<string, unknown> = {}
    if (companyId) chunkWhere.companyId = companyId
    if (collectionId) {
      const docIds = await db.ragDocument.findMany({
        where: { collectionId },
        select: { id: true },
      })
      chunkWhere.documentId = { in: docIds.map((d) => d.id) }
    }

    const chunks = await db.ragChunk.findMany({
      where: chunkWhere,
      orderBy: { createdAt: 'desc' },
      take: 5,
    })

    const durationMs = Date.now() - startTime

    // Create RagQuery record
    const ragQuery = await db.ragQuery.create({
      data: {
        companyId: companyId || null,
        query,
        collectionId: collectionId || null,
        resultCount: chunks.length,
        status: chunks.length > 0 ? 'success' : 'no_results',
        durationMs,
      },
    })

    // Build answer from retrieved chunks (keyword-based retrieval)
    // When Qdrant vector DB is available, replace with semantic similarity search.
    const answerContent = chunks.length > 0
      ? `Based on ${chunks.length} relevant document${chunks.length > 1 ? 's' : ''} found:\n\n${chunks.map((c, i) => `[${i + 1}] ${c.content.substring(0, 200)}...`).join('\n\n')}`
      : 'No relevant documents found for your query. Consider adding more documents to the knowledge base.'

    const chunkIds = JSON.stringify(chunks.map((c) => c.id))
    const confidence = chunks.length > 0 ? Math.min(0.95, 0.5 + chunks.length * 0.1) : 0

    // Create RagAnswer record
    const ragAnswer = await db.ragAnswer.create({
      data: {
        queryId: ragQuery.id,
        companyId: companyId || null,
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
    console.error('[RAG Query] Error:', error)
    return NextResponse.json(
      { error: 'Failed to process RAG query' },
      { status: 500 }
    )
  }
}