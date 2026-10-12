import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url)
    const collectionId = searchParams.get('collectionId')

    const where: Record<string, unknown> = {}
    if (collectionId) {
      where.collectionId = collectionId
    }

    const documents = await db.ragDocument.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    return NextResponse.json(documents)
  } catch (error) {
    console.error('[RAG Documents List] Error:', error)
    return NextResponse.json(
      { error: 'Failed to list RAG documents' },
      { status: 500 }
    )
  }
}

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
    const { collectionId, companyId, name, source, classification } = body

    if (!collectionId || !name) {
      return NextResponse.json(
        { error: 'collectionId and name are required' },
        { status: 400 }
      )
    }

    const collection = await db.ragCollection.findUnique({
      where: { id: collectionId },
    })

    if (!collection) {
      return NextResponse.json(
        { error: 'Collection not found' },
        { status: 404 }
      )
    }

    const document = await db.ragDocument.create({
      data: {
        collectionId,
        companyId: companyId || null,
        name,
        source: source || null,
        classification: classification || 'internal',
        status: 'indexed',
        indexedAt: new Date(),
      },
    })

    // Update collection document count
    const docCount = await db.ragDocument.count({
      where: { collectionId },
    })
    await db.ragCollection.update({
      where: { id: collectionId },
      data: { documentCount: docCount },
    })

    return NextResponse.json(document, { status: 201 })
  } catch (error) {
    console.error('[RAG Document Create] Error:', error)
    return NextResponse.json(
      { error: 'Failed to create RAG document' },
      { status: 500 }
    )
  }
}