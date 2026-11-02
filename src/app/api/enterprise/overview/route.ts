/**
 * The legacy overview returned global counts and recent tasks to any logged-in
 * user without tenant filtering. Retire it rather than expose cross-tenant data
 * or fabricate a compatible response. Use the tenant-scoped stats endpoint.
 */
import { NextResponse } from 'next/server'
import { requireCompanyAuth } from '@/lib/api-auth'

export async function GET() {
  try {
    await requireCompanyAuth()
    return NextResponse.json(
      { error: 'This legacy overview is retired. Use /api/enterprise/stats for tenant-scoped metrics.' },
      { status: 410 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500
    return NextResponse.json({ error: status === 500 ? 'Internal server error' : message }, { status })
  }
}
