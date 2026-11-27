import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { legacyTenant, tenantWhere, legacyAuthResponse } from '@/lib/api/legacy-session'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await legacyTenant(request)
    const { id } = await params

    const chunk = await db.ragChunk.findFirst({
      where: tenantWhere(tenant, { id }),
    })

    if (!chunk) {
      return NextResponse.json({ error: 'Chunk not found' }, { status: 404 })
    }

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
    const authFailure = legacyAuthResponse(error)
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status })
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
  try {
    const tenant = await legacyTenant(request)
    const { id } = await params

    const chunk = await db.ragChunk.findFirst({
      where: tenantWhere(tenant, { id }),
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
    const authFailure = legacyAuthResponse(error)
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status })
    console.error('[RAG Chunk Delete] Error:', error)
    return NextResponse.json(
      { error: 'Failed to delete chunk' },
      { status: 500 }
    )
  }
}
