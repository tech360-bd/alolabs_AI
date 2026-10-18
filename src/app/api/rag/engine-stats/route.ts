import { NextResponse } from 'next/server'
import { requireCompanyAuth } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { getRagEngineStats } from '@/lib/rag-engine'

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error'
  const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500
  if (status === 500) console.error('[RAG Engine Stats] Error:', error)
  return NextResponse.json({ error: status === 500 ? 'Failed to retrieve RAG engine statistics' : message }, { status })
}

export async function GET() {
  try {
    const user = await requireCompanyAuth()
    const companyId = user.companyId
    const [engineStats, collections, indexedDocuments, embeddedChunks] = await Promise.all([
      getRagEngineStats(companyId),
      db.ragCollection.findMany({
        where: { companyId },
        select: { id: true, name: true },
        orderBy: { createdAt: 'desc' },
      }),
      db.ragDocument.count({ where: { companyId, status: 'indexed' } }),
      db.ragChunk.count({ where: { companyId, embedding: { not: null } } }),
    ])

    const collectionIds = collections.map((collection) => collection.id)
    const documents = collectionIds.length > 0
      ? await db.ragDocument.findMany({
          where: { companyId, collectionId: { in: collectionIds } },
          select: { id: true, collectionId: true },
        })
      : []
    const documentIds = documents.map((document) => document.id)
    const chunkGroups = documentIds.length > 0
      ? await db.ragChunk.groupBy({
          by: ['documentId'],
          where: { companyId, documentId: { in: documentIds } },
          _count: { id: true },
        })
      : []

    const chunksByDocument = new Map(chunkGroups.map((group) => [group.documentId, group._count.id]))
    const documentCounts = new Map<string, number>()
    const chunkCounts = new Map<string, number>()
    for (const document of documents) {
      documentCounts.set(document.collectionId, (documentCounts.get(document.collectionId) ?? 0) + 1)
      chunkCounts.set(
        document.collectionId,
        (chunkCounts.get(document.collectionId) ?? 0) + (chunksByDocument.get(document.id) ?? 0),
      )
    }

    const embeddingProviderConfigured = Boolean(process.env.EMBEDDING_API_URL && process.env.EMBEDDING_API_KEY)
    const collectionsWithCounts = collections.map((collection) => ({
      id: collection.id,
      name: collection.name,
      documentCount: documentCounts.get(collection.id) ?? 0,
      chunkCount: chunkCounts.get(collection.id) ?? 0,
    }))

    return NextResponse.json({
      engine: {
        ...engineStats,
        indexedDocuments,
        indexingRate: engineStats.documents > 0 ? indexedDocuments / engineStats.documents : null,
        embeddedChunks,
        embeddingProviderConfigured,
      },
      collections: collectionsWithCounts,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
