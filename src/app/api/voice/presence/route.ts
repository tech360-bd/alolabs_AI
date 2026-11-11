import { db } from '@/lib/db'
import { readJson, requireString, optionalString, withCompany } from '@/lib/voice/api-helpers'
import { setPresence } from '@/lib/voice/call-service'

export const dynamic = 'force-dynamic'

/**
 * Human agent workspace presence (Module G): offline / available / busy /
 * after_call_work / break. Used by queue routing.
 */
export async function GET() {
  return withCompany(async (auth) => {
    const presence = await db.agentPresence.findMany({
      where: { companyId: auth.companyId },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    })
    return { data: presence, total: presence.length }
  })
}

export async function POST(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const status = requireString(body, 'status')
    const userId = optionalString(body, 'userId') ?? auth.userId
    // Only super admins may change another agent's presence.
    if (userId !== auth.userId && auth.role !== 'super_admin') {
      throw new Error('refused: cannot change another agent\'s presence')
    }
    await setPresence(auth.companyId, userId, status)
    return { data: { ok: true, userId, status } }
  })
}
