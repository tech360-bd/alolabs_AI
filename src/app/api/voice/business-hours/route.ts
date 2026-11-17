import { db } from '@/lib/db'
import { readJson, requireString, optionalString, withCompany, parseJsonColumn } from '@/lib/voice/api-helpers'
import {
  createBusinessHours,
  upsertBusinessHours,
  isValidTimezone,
  type WeeklySlot,
} from '@/lib/voice/telephony-config'
import { businessHoursStatus, type BusinessHourConfig } from '@/lib/voice/routing'

export const dynamic = 'force-dynamic'

/**
 * Business hours & holiday calendar (Module A).
 *
 * GET   — list schedules with a LIVE open/closed evaluation for "now"
 * POST  — create { name, timezone?, weeklySchedule[], holidays[] }
 * PATCH — { id, name?, timezone?, weeklySchedule?, holidays? }
 *
 * Validation refuses overnight windows (close <= open) because the routing
 * evaluator compares same-day windows and would silently treat a 22:00–06:00
 * shift as closed all day.
 */
export async function GET() {
  return withCompany(async (auth) => {
    const rows = await db.businessHour.findMany({
      where: { companyId: auth.companyId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    })
    const now = new Date()
    return {
      data: rows.map((row) => {
        const weekly = parseJsonColumn<WeeklySlot[]>(row.weeklySchedule, [])
        const holidays = parseJsonColumn<string[]>(row.holidays, [])
        const config: BusinessHourConfig = {
          timezone: row.timezone,
          weeklySchedule: weekly.map((d) => ({
            day: d.day,
            closed: d.closed ?? !d.open,
            ...(d.open ? { open: d.open } : {}),
            ...(d.close ? { close: d.close } : {}),
          })),
          holidays,
        }
        return {
          ...row,
          weeklySchedule: weekly,
          holidays,
          currentStatus: businessHoursStatus(config, now),
        }
      }),
      total: rows.length,
    }
  })
}

export async function POST(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const timezone = optionalString(body, 'timezone') ?? 'Asia/Dhaka'
    if (!isValidTimezone(timezone)) throw new Error(`Invalid request: "${timezone}" is not a valid IANA timezone`)
    if (!Array.isArray(body.weeklySchedule)) throw new Error('Invalid request: weeklySchedule must be an array')

    const created = await createBusinessHours({
      companyId: auth.companyId,
      name: requireString(body, 'name'),
      timezone,
      weeklySchedule: body.weeklySchedule as WeeklySlot[],
      holidays: Array.isArray(body.holidays) ? (body.holidays as unknown[]).filter((h): h is string => typeof h === 'string') : [],
    })
    return { data: created, notice: 'Business hours saved. The most recent schedule governs inbound after-hours routing.' }
  })
}

export async function PATCH(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const id = requireString(body, 'id')
    const timezone = optionalString(body, 'timezone')
    if (timezone && !isValidTimezone(timezone)) throw new Error(`Invalid request: "${timezone}" is not a valid IANA timezone`)

    const result = await upsertBusinessHours({
      companyId: auth.companyId,
      id,
      name: optionalString(body, 'name'),
      timezone,
      weeklySchedule: Array.isArray(body.weeklySchedule) ? (body.weeklySchedule as WeeklySlot[]) : undefined,
      holidays: Array.isArray(body.holidays) ? (body.holidays as unknown[]).filter((h): h is string => typeof h === 'string') : undefined,
    })
    return { data: { ok: true, validation: result.validation } }
  })
}

export async function DELETE(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const id = requireString(body, 'id')
    const existing = await db.businessHour.findFirst({ where: { id, companyId: auth.companyId }, select: { id: true } })
    if (!existing) throw new Error(`business hours ${id} not found for this tenant`)
    const remaining = await db.businessHour.count({ where: { companyId: auth.companyId } })
    if (remaining <= 1) {
      throw new Error('refused: this is your only schedule — inbound routing would become always-open. Edit it instead.')
    }
    await db.businessHour.delete({ where: { id: existing.id } })
    return { data: { ok: true } }
  })
}
