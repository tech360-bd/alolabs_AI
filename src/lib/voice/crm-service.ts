/**
 * CRM contact service for the contact center (Module H — Customer 360).
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * `CrmContact` rows were only created through the generic CRM routes. The
 * contact-center spec requires features that had no implementation anywhere:
 *
 *   - duplicate detection (same phone in different formats, same email casing)
 *   - CSV import with per-row validation and a real report
 *   - CSV export
 *   - segmentation by status/tag
 *   - consent + DNC-aware "can we contact this customer" resolution
 *   - call history aggregation for the Customer 360 panel
 *
 * Design rules:
 *   - Phone numbers are normalized (BD rules from customers.ts) before dedupe,
 *     so `+8801712345678` and `01712345678` are the SAME person.
 *   - Imports never silently overwrite: a duplicate is reported, and merging is
 *     an explicit, audited operation.
 *   - Exports respect tenant scope and never include another tenant's rows.
 */

import { db } from '@/lib/db'
import { normalizeBdPhoneNumber } from './customers'

export class CrmServiceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CrmServiceError'
  }
}

export interface ContactInput {
  firstName: string
  lastName?: string
  email?: string
  phone?: string
  company?: string
  jobTitle?: string
  source?: string
  status?: string
  tags?: string[]
  assignedTo?: string
  metadata?: Record<string, unknown>
}

/** Canonical contact identity for dedupe: normalized phone, else lowercased email. */
export function contactIdentity(input: { phone?: string | null; email?: string | null }): { phone: string | null; email: string | null } {
  const normalized = input.phone ? normalizeBdPhoneNumber(input.phone) : null
  return {
    phone: normalized?.e164 ?? (input.phone?.trim() || null),
    email: input.email?.trim().toLowerCase() || null,
  }
}

export interface DuplicateCandidate {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  matchedOn: 'phone' | 'email' | 'both'
}

/**
 * Find duplicates for a candidate contact.
 *
 * Compares NORMALIZED phones, so formatting never hides a duplicate. Email
 * comparison is case-insensitive. Returns at most `limit` candidates.
 */
export async function findDuplicates(params: {
  companyId: string
  phone?: string | null
  email?: string | null
  excludeContactId?: string
  limit?: number
}): Promise<DuplicateCandidate[]> {
  const identity = contactIdentity({ phone: params.phone, email: params.email })
  if (!identity.phone && !identity.email) return []

  const orClauses: Array<Record<string, unknown>> = []
  if (identity.email) orClauses.push({ email: { equals: identity.email } })
  if (identity.phone) {
    // Both the normalized and raw form — legacy rows may hold unnormalized data.
    orClauses.push({ phone: { in: [...new Set([identity.phone, params.phone?.trim() ?? ''].filter(Boolean))] } })
  }

  const rows = await db.crmContact.findMany({
    where: {
      companyId: params.companyId,
      ...(params.excludeContactId ? { id: { not: params.excludeContactId } } : {}),
      OR: orClauses,
    },
    take: params.limit ?? 10,
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
  })

  return rows.map((row) => {
    const phoneMatch = Boolean(identity.phone && row.phone && contactIdentity({ phone: row.phone }).phone === identity.phone)
    const emailMatch = Boolean(identity.email && row.email && row.email.trim().toLowerCase() === identity.email)
    return {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      phone: row.phone,
      matchedOn: phoneMatch && emailMatch ? 'both' : phoneMatch ? 'phone' : 'email',
    }
  })
}

/** Create a contact, refusing (by default) when a duplicate exists. */
export async function createContact(params: {
  companyId: string
  input: ContactInput
  allowDuplicate?: boolean
  actorUserId?: string
}): Promise<{ id: string; duplicates: DuplicateCandidate[] }> {
  const firstName = params.input.firstName?.trim()
  if (!firstName) throw new CrmServiceError('firstName is required')

  const duplicates = await findDuplicates({
    companyId: params.companyId,
    phone: params.input.phone,
    email: params.input.email,
  })
  if (duplicates.length > 0 && !params.allowDuplicate) {
    throw new CrmServiceError(
      `duplicate contact: ${duplicates.map((d) => `${d.firstName} ${d.lastName} (${d.matchedOn})`).join(', ')} — pass allowDuplicate to create anyway`,
    )
  }

  const identity = contactIdentity({ phone: params.input.phone, email: params.input.email })
  const contact = await db.crmContact.create({
    data: {
      companyId: params.companyId,
      firstName,
      lastName: params.input.lastName?.trim() ?? '',
      email: identity.email ?? '',
      phone: identity.phone,
      company: params.input.company ?? null,
      jobTitle: params.input.jobTitle ?? null,
      source: params.input.source ?? 'manual',
      status: params.input.status ?? 'lead',
      tags: JSON.stringify(params.input.tags ?? []),
      assignedTo: params.input.assignedTo ?? null,
      metadata: JSON.stringify({ ...(params.input.metadata ?? {}), ...(params.actorUserId ? { createdBy: params.actorUserId } : {}) }),
    },
    select: { id: true },
  })
  return { id: contact.id, duplicates }
}

/**
 * Contactability resolution: is this customer contactable on a channel right
 * now? Combines DNC suppression with recorded consent.
 *
 * Returns `unknown` when there is no consent evidence — calling an unknown
 * number is the operator's compliance decision, not something this function
 * should silently permit.
 */
export async function resolveContactability(params: {
  companyId: string
  phone: string
  channel?: 'voice' | 'sms' | 'whatsapp' | 'email'
  purpose?: string
}): Promise<{ contactable: 'allowed' | 'blocked' | 'unknown'; reason: string; dnc: boolean; consentGranted: boolean }> {
  const channel = params.channel ?? 'voice'
  const purpose = params.purpose ?? 'outbound_contact'
  const normalized = normalizeBdPhoneNumber(params.phone)
  const e164 = normalized?.e164 ?? params.phone.trim()

  const [dnc, consent] = await Promise.all([
    db.dncEntry.findFirst({ where: { companyId: params.companyId, phoneNumber: { in: [...new Set([e164, params.phone.trim()])] } } }),
    db.customerConsent.findUnique({
      where: {
        companyId_phoneNumber_channel_purpose: {
          companyId: params.companyId,
          phoneNumber: e164,
          channel,
          purpose,
        },
      },
    }),
  ])

  if (dnc) {
    return { contactable: 'blocked', reason: `on do-not-call list (${dnc.reason})`, dnc: true, consentGranted: Boolean(consent?.granted) }
  }
  const granted = Boolean(consent?.granted && !consent?.revokedAt)
  if (granted) {
    return { contactable: 'allowed', reason: `consent on file (${consent?.method ?? 'recorded'})`, dnc: false, consentGranted: true }
  }
  return {
    contactable: 'unknown',
    reason: consent?.revokedAt ? `consent revoked ${consent.revokedAt.toISOString().slice(0, 10)}` : 'no consent record',
    dnc: false,
    consentGranted: false,
  }
}

/** Customer 360: contact + calls + consents + appointments + recent activities. */
export async function customer360(companyId: string, contactId: string) {
  const contact = await db.crmContact.findFirst({
    where: { id: contactId, companyId },
  })
  if (!contact) throw new CrmServiceError(`contact ${contactId} not found for this tenant`)

  const [calls, appointments, activities, notes, consents] = await Promise.all([
    db.callSession.findMany({
      where: { companyId, contactId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, direction: true, status: true, disposition: true, fromNumber: true, toNumber: true,
        durationSeconds: true, startedAt: true, endedAt: true, language: true, recordingConsent: true,
        simulated: true, voiceAgentId: true, assignedUserId: true,
      },
    }),
    db.appointment.findMany({ where: { companyId, contactId }, orderBy: { scheduledFor: 'desc' }, take: 20 }),
    // CrmNote has no companyId column; tenancy is inherited from the contact
    // whose id was already resolved with a companyId filter above.
    db.crmActivity.findMany({ where: { companyId, contactId }, orderBy: { createdAt: 'desc' }, take: 30 }).catch(() => []),
    db.crmNote.findMany({ where: { contactId }, orderBy: { createdAt: 'desc' }, take: 30 }).catch(() => []),
    db.customerConsent.findMany({ where: { companyId, contactId }, orderBy: { createdAt: 'desc' } }),
  ])

  return {
    contact: { ...contact, tags: safeJson<string[]>(contact.tags, []), metadata: safeJson<Record<string, unknown>>(contact.metadata, {}) },
    calls,
    appointments,
    activities,
    notes,
    consents,
    stats: {
      totalCalls: calls.length,
      answered: calls.filter((c) => c.status === 'completed').length,
      missed: calls.filter((c) => ['no_answer', 'busy', 'abandoned'].includes(c.status)).length,
      totalTalkSeconds: calls.reduce((sum, c) => sum + c.durationSeconds, 0),
      lastContactAt: calls[0]?.startedAt ?? contact.lastContactAt,
    },
  }
}

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return (JSON.parse(raw) as T) ?? fallback
  } catch {
    return fallback
  }
}

// ─── CSV import / export ─────────────────────────────────────────────────────

export interface CsvParseResult {
  headers: string[]
  rows: Array<Record<string, string>>
  errors: string[]
}

/**
 * Minimal, correct CSV parser: RFC4180 quoting, embedded commas/newlines and
 * doubled quotes. Deliberately dependency-free so an import works offline.
 */
export function parseCsv(text: string): CsvParseResult {
  const errors: string[] = []
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += char
      continue
    }
    if (char === '"') { inQuotes = true; continue }
    if (char === ',') { row.push(field); field = ''; continue }
    if (char === '\r') continue
    if (char === '\n') {
      row.push(field)
      if (row.some((v) => v.trim() !== '')) rows.push(row)
      row = []
      field = ''
      continue
    }
    field += char
  }
  if (inQuotes) errors.push('unterminated quoted field at end of file')
  row.push(field)
  if (row.some((v) => v.trim() !== '')) rows.push(row)

  if (rows.length === 0) return { headers: [], rows: [], errors: [...errors, 'file is empty'] }
  const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))
  const dataRows = rows.slice(1).map((cells) => {
    const obj: Record<string, string> = {}
    headers.forEach((header, index) => { obj[header] = (cells[index] ?? '').trim() })
    return obj
  })
  return { headers, rows: dataRows, errors }
}

const IMPORT_ALIASES: Record<string, string[]> = {
  firstName: ['first_name', 'firstname', 'first', 'given_name', 'নাম'],
  lastName: ['last_name', 'lastname', 'last', 'surname', 'family_name'],
  email: ['email', 'e_mail', 'email_address'],
  phone: ['phone', 'phone_number', 'mobile', 'msisdn', 'number', 'ফোন'],
  company: ['company', 'organization', 'organisation', 'account'],
  jobTitle: ['job_title', 'title', 'designation', 'position'],
  status: ['status', 'stage'],
  source: ['source', 'lead_source'],
  tags: ['tags', 'labels'],
}

function pick(row: Record<string, string>, field: string): string | undefined {
  for (const alias of IMPORT_ALIASES[field] ?? [field]) {
    const value = row[alias]
    if (value && value.trim()) return value.trim()
  }
  return undefined
}

export interface ImportReport {
  total: number
  created: number
  duplicates: number
  invalid: number
  rows: Array<{ line: number; status: 'created' | 'duplicate' | 'invalid'; contactId?: string; error?: string }>
  parseErrors: string[]
}

/**
 * Import contacts from CSV.
 *
 * - Validates each row; a row without a name is `invalid` (with the reason).
 * - Duplicates are NOT created unless `allowDuplicates` — they are reported
 *   with the existing contact id so an operator can merge deliberately.
 * - One DB write per created row, so a mid-file failure leaves a truthful,
 *   partial report rather than a half-applied bulk insert.
 */
export async function importContactsCsv(params: {
  companyId: string
  csvText: string
  allowDuplicates?: boolean
  defaultSource?: string
  actorUserId?: string
  maxRows?: number
}): Promise<ImportReport> {
  const parsed = parseCsv(params.csvText)
  const maxRows = params.maxRows ?? 5000
  if (parsed.rows.length > maxRows) {
    throw new CrmServiceError(`import limited to ${maxRows} rows per file (got ${parsed.rows.length})`)
  }
  if (parsed.headers.length === 0) {
    return { total: 0, created: 0, duplicates: 0, invalid: 0, rows: [], parseErrors: parsed.errors }
  }

  const report: ImportReport = {
    total: parsed.rows.length,
    created: 0,
    duplicates: 0,
    invalid: 0,
    rows: [],
    parseErrors: parsed.errors,
  }

  for (let index = 0; index < parsed.rows.length; index++) {
    const row = parsed.rows[index]
    const line = index + 2 // header is line 1
    const firstName = pick(row, 'firstName')
    if (!firstName) {
      report.invalid++
      report.rows.push({ line, status: 'invalid', error: 'missing first name' })
      continue
    }
    const email = pick(row, 'email')
    const phone = pick(row, 'phone')
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      report.invalid++
      report.rows.push({ line, status: 'invalid', error: `invalid email "${email}"` })
      continue
    }
    try {
      const duplicates = await findDuplicates({ companyId: params.companyId, phone, email })
      if (duplicates.length > 0 && !params.allowDuplicates) {
        report.duplicates++
        report.rows.push({ line, status: 'duplicate', contactId: duplicates[0].id, error: `matches existing ${duplicates[0].matchedOn}` })
        continue
      }
      const tags = pick(row, 'tags')?.split(/[;|]/).map((t) => t.trim()).filter(Boolean)
      const created = await createContact({
        companyId: params.companyId,
        input: {
          firstName,
          lastName: pick(row, 'lastName'),
          email,
          phone,
          company: pick(row, 'company'),
          jobTitle: pick(row, 'jobTitle'),
          status: pick(row, 'status'),
          source: pick(row, 'source') ?? params.defaultSource ?? 'csv_import',
          tags,
        },
        allowDuplicate: Boolean(params.allowDuplicates),
        actorUserId: params.actorUserId,
      })
      report.created++
      report.rows.push({ line, status: 'created', contactId: created.id })
    } catch (err) {
      report.invalid++
      report.rows.push({ line, status: 'invalid', error: err instanceof Error ? err.message : 'failed' })
    }
  }

  return report
}

/** Escape one CSV field (RFC4180). */
function csvField(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value)
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

/** Export tenant contacts as CSV. */
export async function exportContactsCsv(params: {
  companyId: string
  status?: string
  tag?: string
  limit?: number
}): Promise<{ csv: string; count: number }> {
  const rows = await db.crmContact.findMany({
    where: {
      companyId: params.companyId,
      ...(params.status ? { status: params.status } : {}),
      ...(params.tag ? { tags: { contains: params.tag } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(params.limit ?? 5000, 20_000),
  })
  const headers = ['first_name', 'last_name', 'email', 'phone', 'company', 'job_title', 'status', 'source', 'tags', 'score', 'last_contact_at', 'created_at']
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push([
      csvField(row.firstName),
      csvField(row.lastName),
      csvField(row.email),
      csvField(row.phone),
      csvField(row.company),
      csvField(row.jobTitle),
      csvField(row.status),
      csvField(row.source),
      csvField(safeJson<string[]>(row.tags, []).join(';')),
      csvField(row.score),
      csvField(row.lastContactAt?.toISOString() ?? ''),
      csvField(row.createdAt.toISOString()),
    ].join(','))
  }
  return { csv: `${lines.join('\n')}\n`, count: rows.length }
}
