import { db } from '@/lib/db'
import { readJson, requireString, optionalString, withCompany } from '@/lib/voice/api-helpers'
import { normalizeForSpeech } from '@/lib/voice/bangla-text'

export const dynamic = 'force-dynamic'

/**
 * Pronunciation dictionary (Module C — pronunciation dictionary, Bangla
 * business vocabulary).
 *
 * Entries are applied to TTS text BEFORE number/date expansion, so
 * "Aarong" → "আড়ং" or "Tk" → "টাকা" is spoken the way the operator decided.
 *
 * GET    — entries + a live preview of how a sample is spoken
 * POST   — add/replace an entry { term, phonetic, language? }
 * PATCH  — enable/disable or edit an entry
 * DELETE — { id }
 * PUT    — { text, language } → normalized preview WITHOUT synthesizing
 */
export async function GET(request: Request) {
  return withCompany(async (auth) => {
    const { searchParams } = new URL(request.url)
    const language = searchParams.get('language') ?? 'bn-BD'
    const entries = await db.pronunciationEntry.findMany({
      where: { companyId: auth.companyId, language },
      orderBy: { term: 'asc' },
      take: 1000,
    })
    const sample = searchParams.get('preview')
    return {
      data: entries,
      total: entries.length,
      ...(sample
        ? {
            preview: normalizeForSpeech(sample, language, {
              pronunciation: entries.filter((e) => e.enabled).map((e) => ({ term: e.term, phonetic: e.phonetic, caseSensitive: e.caseSensitive })),
            }),
          }
        : {}),
      language,
    }
  })
}

export async function POST(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const term = requireString(body, 'term')
    const phonetic = requireString(body, 'phonetic')
    const language = optionalString(body, 'language') ?? 'bn-BD'
    if (term.length > 120) throw new Error('Invalid request: term is limited to 120 characters')
    if (phonetic.length > 240) throw new Error('Invalid request: phonetic is limited to 240 characters')

    const entry = await db.pronunciationEntry.upsert({
      where: { companyId_language_term: { companyId: auth.companyId, language, term } },
      create: {
        companyId: auth.companyId,
        language,
        term,
        phonetic,
        caseSensitive: body.caseSensitive === true,
      },
      update: { phonetic, caseSensitive: body.caseSensitive === true },
    })
    return {
      data: entry,
      notice: 'Saved. This entry is applied before number/date expansion when the next job synthesizes.',
    }
  })
}

export async function PATCH(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const id = requireString(body, 'id')
    const existing = await db.pronunciationEntry.findFirst({ where: { id, companyId: auth.companyId }, select: { id: true } })
    if (!existing) throw new Error(`pronunciation entry ${id} not found for this tenant`)

    const data: Record<string, unknown> = {}
    if (optionalString(body, 'phonetic')) data.phonetic = optionalString(body, 'phonetic')
    if (typeof body.enabled === 'boolean') data.enabled = body.enabled
    if (typeof body.caseSensitive === 'boolean') data.caseSensitive = body.caseSensitive
    if (Object.keys(data).length === 0) throw new Error('Invalid request: nothing to update')
    await db.pronunciationEntry.updateMany({ where: { id, companyId: auth.companyId }, data })
    return { data: { ok: true } }
  })
}

export async function DELETE(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const id = requireString(body, 'id')
    const result = await db.pronunciationEntry.deleteMany({ where: { id, companyId: auth.companyId } })
    if (result.count === 0) throw new Error(`pronunciation entry ${id} not found for this tenant`)
    return { data: { ok: true } }
  })
}

/** Text-normalization preview: exactly what would be sent to the engine. */
export async function PUT(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const text = requireString(body, 'text')
    const language = optionalString(body, 'language') ?? 'bn-BD'
    const entries = await db.pronunciationEntry.findMany({
      where: { companyId: auth.companyId, language, enabled: true },
      select: { term: true, phonetic: true, caseSensitive: true },
      take: 1000,
    })
    const result = normalizeForSpeech(text, language, { pronunciation: entries })
    return { data: { ...result, language, dictionaryEntries: entries.length } }
  })
}
