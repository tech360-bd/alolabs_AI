/**
 * Knowledge Engine wiring for voice calls (master prompt §05 Module 11).
 *
 * `VoiceAgent.knowledgeScope` holds JSON ids of RagCollections (and, for
 * document-level scoping, CompanyKnowledgeDocuments). Before this module the
 * field was dead configuration — the conversation loop never read it. Now the
 * conversation service retrieves tenant-scoped knowledge for every turn and
 * the LLM responder is instructed to answer ONLY from these facts.
 *
 * FAIL-SOFT CONTRACT: knowledge problems must never break a live call. Any
 * retrieval error returns empty snippets plus an `error` string that is
 * persisted on the turn event for audit — the responder falls back to its
 * normal behavior (which for unknown facts is "offer a human agent").
 */

export interface KnowledgeSnippet {
  source: string
  text: string
  score?: number
}

export interface KnowledgeRetrievalResult {
  snippets: KnowledgeSnippet[]
  error: string | null
  collectionsQueried: string[]
}

/** Pure: parse the knowledgeScope JSON column into a clean id list. */
export function parseKnowledgeScope(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    const list = Array.isArray(parsed)
      ? parsed
      : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { collections?: unknown }).collections)
        ? (parsed as { collections: unknown[] }).collections
        : []
    return list
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map((v) => v.trim())
      .slice(0, 20) // bounded — a call loop must not query 500 collections
  } catch {
    return []
  }
}

/** Pure: render snippets as a bounded, source-labeled block for the LLM prompt. */
export function knowledgeBlockForPrompt(snippets: KnowledgeSnippet[], maxChars = 2400): string {
  if (snippets.length === 0) return ''
  const parts: string[] = []
  let used = 0
  for (const s of snippets) {
    const text = s.text.length > 400 ? `${s.text.slice(0, 400)}…` : s.text
    const line = `- [${s.source}] ${text}`
    if (used + line.length > maxChars) break
    parts.push(line)
    used += line.length
  }
  return parts.length > 0
    ? `Knowledge base facts you may rely on (do NOT go beyond them — if the answer is not here, offer a human agent):\n${parts.join('\n')}`
    : ''
}

/**
 * Retrieve tenant-scoped knowledge for one conversation turn. Scope entries
 * are RagCollection ids; a `doc:<id>` entry pulls the CompanyKnowledgeDocument
 * itself (it has no collection membership) so document-level scoping works.
 */
export async function retrieveKnowledge(params: {
  companyId: string
  scopeRaw: string | null | undefined
  query: string
  limitPerCollection?: number
  actorUserId?: string | null
}): Promise<KnowledgeRetrievalResult> {
  const ids = parseKnowledgeScope(params.scopeRaw)
  if (ids.length === 0 || !params.query.trim()) {
    return { snippets: [], error: null, collectionsQueried: [] }
  }

  const { db } = await import('@/lib/db')
  const { hybridSearch } = await import('@/lib/rag-engine')

  const collectionIds: string[] = []
  const docSnippets: KnowledgeSnippet[] = []
  const errors: string[] = []
  try {
    for (const id of ids) {
      if (id.startsWith('doc:')) {
        const doc = await db.companyKnowledgeDocument.findFirst({
          where: { id: id.slice(4), companyId: params.companyId },
          select: { title: true, content: true },
        })
        if (doc) docSnippets.push({ source: doc.title, text: doc.content.slice(0, 400) })
        else errors.push(`doc:${id.slice(4)} not found`)
        continue
      }
      const collection = await db.ragCollection.findFirst({
        where: { id, companyId: params.companyId },
        select: { id: true },
      })
      if (collection) collectionIds.push(collection.id)
      else errors.push(`collection ${id} not found`)
    }
  } catch (err) {
    return {
      snippets: [],
      error: `knowledge scope resolution failed: ${err instanceof Error ? err.message : String(err)}`,
      collectionsQueried: [],
    }
  }

  const snippets: KnowledgeSnippet[] = [...docSnippets]
  const seen = new Set(docSnippets.map((s) => s.text.slice(0, 120)))
  try {
    for (const collectionId of [...new Set(collectionIds)]) {
      const result = await hybridSearch(params.query, {
        companyId: params.companyId,
        userId: params.actorUserId ?? undefined,
        collectionId,
        limit: params.limitPerCollection ?? 3,
      })
      for (const hit of result.results) {
        const text = (hit.content ?? '').trim()
        if (!text) continue
        const key = text.slice(0, 120)
        if (seen.has(key)) continue
        seen.add(key)
        snippets.push({
          source: hit.source ?? collectionId,
          text,
          score: hit.score,
        })
      }
      if (snippets.length >= 8) break
    }
  } catch (err) {
    // Partial results are still useful; report the degradation honestly.
    errors.push(`retrieval degraded: ${err instanceof Error ? err.message : String(err)}`)
  }

  return {
    snippets: snippets.slice(0, 8),
    error: errors.length > 0 ? errors.join('; ') : null,
    collectionsQueried: [...new Set(collectionIds)],
  }
}
