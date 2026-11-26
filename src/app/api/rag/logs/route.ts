import { db } from '@/lib/db'
import { legacyTenant, tenantWhere, legacyAuthResponse } from '@/lib/api/legacy-session'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  // Session → live Company membership. Authentication alone never authorises.
  const tenant = await legacyTenant(request);
  try {
    const queries = await db.ragQuery.findMany({
      where: tenantWhere(tenant),
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    return NextResponse.json(queries)
  } catch (error) {
    const authFailure = legacyAuthResponse(error);
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status });
    console.error('[RAG Logs] Error:', error)
    return NextResponse.json(
      { error: 'Failed to load RAG query logs' },
      { status: 500 }
    )
  }
}