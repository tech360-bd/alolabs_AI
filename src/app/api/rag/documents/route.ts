import { db } from '@/lib/db'
import { legacyTenant, tenantWhere, legacyAuthResponse } from '@/lib/api/legacy-session'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const tenant = await legacyTenant(request)
    const { searchParams } = new URL(request.url)
    const collectionId = searchParams.get('collectionId')

    const where = tenantWhere(
      tenant,
      collectionId ? { collectionId } : {},
    )

    const documents = await db.ragDocument.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    return NextResponse.json(documents)
  } catch (error) {
    const authFailure = legacyAuthResponse(error)
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status })
    console.error('[RAG Documents List] Error:', error)
    return NextResponse.json(
      { error: 'Failed to list RAG documents' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenant = await legacyTenant(request)
    const body = await request.json()
    const { collectionId, companyId: requestedCompanyId, name, source, classification } = body

    if (requestedCompanyId && requestedCompanyId !== tenant.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!collectionId || !name) {
      return NextResponse.json(
        { error: 'collectionId and name are required' },
        { status: 400 }
      )
    }

    const collection = await db.ragCollection.findFirst({
      where: tenantWhere(tenant, { id: collectionId }),
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
        companyId: tenant.companyId,
        name,
        source: source || null,
        classification: classification || 'internal',
        status: 'indexed',
        indexedAt: new Date(),
      },
    })

    // Update collection document count within tenant
    const docCount = await db.ragDocument.count({
      where: tenantWhere(tenant, { collectionId }),
    })
    await db.ragCollection.update({
      where: { id: collectionId },
      data: { documentCount: docCount },
    })

    return NextResponse.json(document, { status: 201 })
  } catch (error) {
    const authFailure = legacyAuthResponse(error)
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status })
    console.error('[RAG Document Create] Error:', error)
    return NextResponse.json(
      { error: 'Failed to create RAG document' },
      { status: 500 }
    )
  }
}
