import { NextRequest, NextResponse } from 'next/server'
import { isPostgresConnected, query } from '@/lib/postgres'
import { requireRole } from '@/lib/api-auth'

export async function POST(request: NextRequest) {
  try {
    await requireRole('super_admin');
    if (!isPostgresConnected()) {
      return NextResponse.json(
        { error: 'PostgreSQL is not connected. Connect first via /api/infra/connect.' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { sql, params } = body as { sql: string; params?: unknown[] }

    if (!sql || typeof sql !== 'string') {
      return NextResponse.json({ error: 'sql parameter is required' }, { status: 400 })
    }

    // Security: only allow SELECT statements
    const trimmed = sql.trim().toUpperCase()
    if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('WITH')) {
      return NextResponse.json(
        { error: 'Only SELECT and WITH (CTE) statements are allowed for safety.' },
        { status: 403 }
      )
    }

    // Block dangerous keywords even inside CTEs
    const dangerousPatterns = [
      /\bINSERT\b/i,
      /\bUPDATE\b/i,
      /\bDELETE\b/i,
      /\bDROP\b/i,
      /\bALTER\b/i,
      /\bCREATE\b/i,
      /\bTRUNCATE\b/i,
      /\bGRANT\b/i,
      /\bREVOKE\b/i,
      /\bEXECUTE\b/i,
      /\bCOPY\b/i,
    ]

    for (const pattern of dangerousPatterns) {
      if (pattern.test(sql)) {
        return NextResponse.json(
          { error: `Dangerous operation detected: ${pattern.source}. Only read-only queries are allowed.` },
          { status: 403 }
        )
      }
    }

    const startTime = Date.now()
    const result = await query(sql, params)
    const durationMs = Date.now() - startTime

    return NextResponse.json({
      rows: result.rows,
      rowCount: result.rowCount,
      durationMs,
    })
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message === 'Forbidden' ? 'Forbidden' : 'Unauthorized' }, { status: error.message === 'Forbidden' ? 403 : 401 });
    }
    console.error('[Infra PG Query] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Query failed' },
      { status: 500 }
    )
  }
}