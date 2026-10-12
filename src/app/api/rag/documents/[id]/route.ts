import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { deleteDocumentChunks } from '@/lib/rag-engine'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const { id } = await params

    const document = await db.ragDocument.findUnique({
      where: { id },
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const chunks = await db.ragChunk.findMany({
      where: { documentId: id },
      orderBy: { position: 'asc' },
    })

    const parsedChunks = chunks.map((chunk) => {
      let parsedMetadata: Record<string, unknown> = {}
      try {
        parsedMetadata = chunk.metadata ? JSON.parse(chunk.metadata) : {}
      } catch {
        parsedMetadata = {}
      }

      return {
        id: chunk.id,
        content: chunk.content,
        position: chunk.position,
        metadata: parsedMetadata,
        createdAt: chunk.createdAt,
      }
    })

    return NextResponse.json({
      id: document.id,
      collectionId: document.collectionId,
      companyId: document.companyId,
      name: document.name,
      source: document.source,
      classification: document.classification,
      status: document.status,
      chunkCount: document.chunkCount,
      indexedAt: document.indexedAt,
      createdAt: document.createdAt,
      chunks: parsedChunks,
    })
  } catch (error) {
    console.error('[RAG Document Get] Error:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve document' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const { id } = await params

    const document = await db.ragDocument.findUnique({
      where: { id },
      select: { id: true, collectionId: true },
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Delete all chunks via RAG engine (also removes from Qdrant)
    const deletedChunks = await deleteDocumentChunks(id)

    // Delete the document record
    await db.ragDocument.delete({
      where: { id },
    })

    // Update collection document count
    const docCount = await db.ragDocument.count({
      where: { collectionId: document.collectionId },
    })
    await db.ragCollection.update({
      where: { id: document.collectionId },
      data: { documentCount: docCount },
    })

    return NextResponse.json({
      success: true,
      deletedDocumentId: id,
      deletedChunks,
    })
  } catch (error) {
    console.error('[RAG Document Delete] Error:', error)
    return NextResponse.json(
      { error: 'Failed to delete document' },
      { status: 500 }
    )
  }
}