import { NextRequest, NextResponse } from 'next/server'
import { getRagEngineStats } from '@/lib/rag-engine'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const [engineStats, collections] = await Promise.all([
      getRagEngineStats(),
      db.ragCollection.findMany({
        select: {
          id: true,
          name: true,
          documentCount: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    // Get chunk counts per collection
    const collectionIds = collections.map((c) => c.id)
    let chunkCountsByCollection: Record<string, number> = {}

    if (collectionIds.length > 0) {
      // Get document IDs per collection, then count chunks per document
      const documents = await db.ragDocument.findMany({
        where: { collectionId: { in: collectionIds } },
        select: { id: true, collectionId: true },
      })

      const docIds = documents.map((d) => d.id)
      const chunks = await db.ragChunk.groupBy({
        by: ['documentId'],
        where: { documentId: { in: docIds } },
        _count: { id: true },
      })

      const chunkCountByDoc = new Map(chunks.map((c) => [c.documentId, c._count.id]))

      const docToCollection = new Map(documents.map((d) => [d.id, d.collectionId]))

      for (const collection of collections) {
        const docsInCollection = documents.filter((d) => d.collectionId === collection.id)
        const totalChunks = docsInCollection.reduce(
          (sum, doc) => sum + (chunkCountByDoc.get(doc.id) || 0),
          0
        )
        chunkCountsByCollection[collection.id] = totalChunks
      }
    }

    const collectionsWithChunks = collections.map((c) => ({
      id: c.id,
      name: c.name,
      documentCount: c.documentCount,
      chunkCount: chunkCountsByCollection[c.id] || 0,
    }))

    return NextResponse.json({
      engine: engineStats,
      collections: collectionsWithChunks,
    })
  } catch (error) {
    console.error('[RAG Engine Stats] Error:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve RAG engine statistics' },
      { status: 500 }
    )
  }
}