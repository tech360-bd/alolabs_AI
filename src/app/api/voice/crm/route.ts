import { db } from '@/lib/db'
import { readJson, requireString, optionalString, withCompany, RawResponse } from '@/lib/voice/api-helpers'
import {
  createContact,
  findDuplicates,
  customer360,
  resolveContactability,
  exportContactsCsv,
  importContactsCsv,
} from '@/lib/voice/crm-service'

export const dynamic = 'force-dynamic'

/**
 * Contact-center CRM API (Module H — Customer 360).
 *
 * GET   — list/search contacts
 *           ?q=            name/email/phone search (tenant scoped)
 *           ?status=       filter by status
 *           ?contactId=    full Customer 360 payload (calls, appointments,
 *                          consents, activities)
 *           ?duplicates=phone,email  → duplicate candidates, no write
 *           ?export=csv    → RFC4180 CSV download
 *           ?contactability=+8801… → DNC/consent resolution for a number
 * POST  — create a contact (refuses duplicates unless allowDuplicate=true)
 * PATCH — { action: 'import_csv', csv, allowDuplicates? } → import report
 */
export async function GET(request: Request) {
  return withCompany(async (auth) => {
    const { searchParams } = new URL(request.url)

    const contactId = searchParams.get('contactId')
    if (contactId) return { data: await customer360(auth.companyId, contactId) }

    const duplicates = searchParams.get('duplicates')
    if (duplicates) {
      const [phone, email] = duplicates.split(',')
      return {
        data: await findDuplicates({ companyId: auth.companyId, phone: phone || null, email: email || null }),
      }
    }

    const contactability = searchParams.get('contactability')
    if (contactability) {
      return {
        data: await resolveContactability({
          companyId: auth.companyId,
          phone: contactability,
          channel: (searchParams.get('channel') as 'voice' | 'sms' | 'whatsapp' | 'email' | null) ?? 'voice',
        }),
      }
    }

    if (searchParams.get('export') === 'csv') {
      const exported = await exportContactsCsv({
        companyId: auth.companyId,
        status: searchParams.get('status') ?? undefined,
        tag: searchParams.get('tag') ?? undefined,
      })
      return new RawResponse(new Response(exported.csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="contacts-${new Date().toISOString().slice(0, 10)}.csv"`,
          'X-Row-Count': String(exported.count),
        },
      }))
    }

    const q = searchParams.get('q')?.trim()
    const status = searchParams.get('status')?.trim()
    const where = {
      companyId: auth.companyId,
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { firstName: { contains: q } },
              { lastName: { contains: q } },
              { email: { contains: q } },
              { phone: { contains: q } },
              { company: { contains: q } },
            ],
          }
        : {}),
    }
    const [total, data] = await Promise.all([
      db.crmContact.count({ where }),
      db.crmContact.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 100 }),
    ])
    return { data, total }
  })
}

export async function POST(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const created = await createContact({
      companyId: auth.companyId,
      input: {
        firstName: requireString(body, 'firstName'),
        lastName: optionalString(body, 'lastName'),
        email: optionalString(body, 'email'),
        phone: optionalString(body, 'phone'),
        company: optionalString(body, 'company'),
        jobTitle: optionalString(body, 'jobTitle'),
        source: optionalString(body, 'source'),
        status: optionalString(body, 'status'),
        tags: Array.isArray(body.tags) ? (body.tags as unknown[]).filter((t): t is string => typeof t === 'string') : undefined,
        assignedTo: optionalString(body, 'assignedTo'),
      },
      allowDuplicate: body.allowDuplicate === true,
      actorUserId: auth.userId,
    })
    return {
      data: created,
      notice: created.duplicates.length > 0
        ? `Created despite ${created.duplicates.length} possible duplicate(s). Review them in the Customer 360 view.`
        : 'Contact created.',
    }
  })
}

export async function PATCH(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    if (optionalString(body, 'action') !== 'import_csv') {
      throw new Error('Invalid request: action must be "import_csv"')
    }
    const csv = requireString(body, 'csv')
    const report = await importContactsCsv({
      companyId: auth.companyId,
      csvText: csv,
      allowDuplicates: body.allowDuplicates === true,
      defaultSource: optionalString(body, 'source'),
      actorUserId: auth.userId,
    })
    return {
      data: report,
      notice: `${report.created} created, ${report.duplicates} duplicates skipped, ${report.invalid} invalid of ${report.total} row(s).`,
    }
  })
}
