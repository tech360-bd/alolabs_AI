import { NextResponse } from 'next/server'
import { requireCompanyAuth } from '@/lib/api-auth'
import { getSecurityStats } from '@/lib/ai-security/validator'

export async function GET() {
  try {
    const user = await requireCompanyAuth()
    const data = await getSecurityStats(user.companyId)
    return NextResponse.json({ data, success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500
    return NextResponse.json({ error: message, success: false }, { status })
  }
}
