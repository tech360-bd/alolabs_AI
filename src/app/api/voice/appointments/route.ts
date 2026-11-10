import { db } from '@/lib/db'
import { readJson, requireString, optionalString, withCompany } from '@/lib/voice/api-helpers'

export const dynamic = 'force-dynamic'

/**
 * Appointments (master prompt §12 inbound features / §18 entities).
 * GET   — tenant-scoped list, soonest first.
 * POST  — book an appointment (optionally linked to the booking call).
 * PATCH — { appointmentId, status: confirmed|cancelled|completed|no_show }
 */
export async function GET() {
  return withCompany(async (auth) => {
    const [total, data] = await Promise.all([
      db.appointment.count({ where: { companyId: auth.companyId } }),
      db.appointment.findMany({
        where: { companyId: auth.companyId },
        orderBy: { scheduledFor: 'asc' },
        take: 100,
      }),
    ])
    return { data, total }
  })
}

export async function POST(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const title = requireString(body, 'title')
    const scheduledFor = requireString(body, 'scheduledFor')
    const when = new Date(scheduledFor)
    if (Number.isNaN(when.getTime())) throw new Error('Invalid request: scheduledFor must be an ISO date-time')
    // The booking is only "confirmed by an action" when the row actually
    // persisted — the result reports the real row id, never a promise.
    const appointment = await db.appointment.create({
      data: {
        companyId: auth.companyId,
        contactId: optionalString(body, 'contactId') ?? null,
        callSessionId: optionalString(body, 'callSessionId') ?? null,
        title,
        scheduledFor: when,
        durationMin: Number.isFinite(body.durationMin) ? Number(body.durationMin) : 30,
        timezone: optionalString(body, 'timezone') ?? 'Asia/Dhaka',
        notes: optionalString(body, 'notes') ?? null,
        createdById: auth.userId ?? null,
      },
    })
    return { data: appointment }
  })
}

const STATUSES = new Set(['scheduled', 'confirmed', 'cancelled', 'completed', 'no_show'])

export async function PATCH(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const appointmentId = requireString(body, 'appointmentId')
    const status = requireString(body, 'status')
    if (!STATUSES.has(status)) throw new Error(`Invalid request: status must be one of ${[...STATUSES].join(', ')}`)
    const appointment = await db.appointment.findFirst({
      where: { id: appointmentId, companyId: auth.companyId },
    })
    if (!appointment) throw new Error(`appointment ${appointmentId} not found for this tenant`)
    const updated = await db.appointment.update({
      where: { id: appointment.id },
      data: { status },
    })
    return { data: updated }
  })
}
