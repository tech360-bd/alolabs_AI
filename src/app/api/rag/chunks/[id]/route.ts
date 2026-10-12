import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

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

    const chunk = await db.ragChunk.findUnique({
      where: { id },
    })

    if (!chunk) {
      return NextResponse.json({ error: 'Chunk not found' }, { status: 404 })
    }

    // Parse metadata JSON
    let parsedMetadata: Record<string, unknown> = {}
    try {
      parsedMetadata = chunk.metadata ? JSON.parse(chunk.metadata) : {}
    } catch {
      parsedMetadata = {}
    }

    return NextResponse.json({
      id: chunk.id,
      documentId: chunk.documentId,
      companyId: chunk.companyId,
      content: chunk.content,
      position: chunk.position,
      metadata: parsedMetadata,
      createdAt: chunk.createdAt,
    })
  } catch (error) {
    console.error('[RAG Chunk Get] Error:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve chunk' },
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

    const chunk = await db.ragChunk.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!chunk) {
      return NextResponse.json({ error: 'Chunk not found' }, { status: 404 })
    }

    await db.ragChunk.delete({
      where: { id },
    })

    return NextResponse.json({ success: true, deletedChunkId: id })
  } catch (error) {
    console.error('[RAG Chunk Delete] Error:', error)
    return NextResponse.json(
      { error: 'Failed to delete chunk' },
      { status: 500 }
    )
  }
}