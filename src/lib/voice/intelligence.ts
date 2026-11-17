/**
 * AI Call Intelligence (Module J).
 *
 * WHAT THIS IS — AND IS NOT
 * -------------------------
 * This module derives structured insight from text the platform actually has:
 * transcript segments, persisted conversation turns, call outcome metadata and
 * disposition. Each insight carries:
 *   - `evidence`: the exact segment index + quoted text that produced it
 *   - `confidence`: a calibrated-ish 0–1 score derived from how many signals
 *     matched, NOT a probability
 *   - `method`: 'lexicon' | 'llm' | 'human'
 *
 * It deliberately does NOT claim to detect a person's true emotional state.
 * `sentiment` is labeled as an automated estimate of language tone in every
 * response and API field description; docs/SECURITY_AND_COMPLIANCE.md and the
 * master prompt both require that.
 *
 * Lexicon-based extraction is deterministic, runs locally (no API cost) and is
 * auditable — the right default for a platform whose owner ruled out mandatory
 * paid AI APIs. An LLM path can supersede it when configured; the shape of the
 * output does not change.
 */

import { db } from '@/lib/db'

export type InsightKind = 'intent' | 'topic' | 'objection' | 'action_item' | 'compliance' | 'sentiment' | 'keyword' | 'csat' | 'quality'

export interface InsightEvidence {
  segmentIndex: number
  quote: string
}

export interface DerivedInsight {
  kind: InsightKind
  label: string
  value: string
  confidence: number
  evidence: InsightEvidence[]
  method: 'lexicon' | 'llm' | 'human'
}

export interface TranscriptSegmentLike {
  speaker?: string
  text: string
  startMs?: number
  endMs?: number
}

// ─── Lexicons (Bangla + Banglish + English) ──────────────────────────────────
// Bangla callers code-switch constantly ("price ta koto?", "refund chai"), so
// each intent lists Bangla, romanized Bangla and English triggers.

interface IntentRule {
  intent: string
  /** Shown to the dashboard. */
  label: string
  triggers: string[]
}

export const INTENT_RULES: readonly IntentRule[] = [
  { intent: 'pricing', label: 'Pricing / quotation', triggers: ['দাম', 'মূল্য', 'কত টাকা', 'কত', 'রেট', 'price', 'cost', 'how much', 'quote', 'rate', 'charge'] },
  { intent: 'order_status', label: 'Order status', triggers: ['অর্ডার', 'ডেলিভারি', 'কোথায়', 'কখন আসবে', 'order', 'delivery', 'shipped', 'tracking', 'courier'] },
  { intent: 'refund', label: 'Refund / return', triggers: ['রিফান্ড', 'ফেরত', 'বাতিল', 'refund', 'return', 'money back', 'cancel'] },
  { intent: 'appointment', label: 'Appointment / booking', triggers: ['অ্যাপয়েন্টমেন্ট', 'সিরিয়াল', 'বুকিং', 'সময় দেন', 'appointment', 'booking', 'schedule', 'reserve'] },
  { intent: 'complaint', label: 'Complaint', triggers: ['অভিযোগ', 'সমস্যা', 'খারাপ', 'নষ্ট', 'ভুল', 'complaint', 'problem', 'broken', 'wrong', 'terrible', 'worst'] },
  { intent: 'support', label: 'Technical support', triggers: ['সাহায্য', 'কাজ করছে না', 'ইনস্টল', 'help', 'support', 'not working', 'error', 'install', 'setup'] },
  { intent: 'account', label: 'Account / billing', triggers: ['অ্যাকাউন্ট', 'বিল', 'পাসওয়ার্ড', 'লগইন', 'account', 'bill', 'invoice', 'password', 'login'] },
  { intent: 'human_agent', label: 'Requested human agent', triggers: ['মানুষ', 'এজেন্ট', 'প্রতিনিধি', 'অপারেটর', 'human', 'agent', 'representative', 'operator', 'talk to someone'] },
  { intent: 'information', label: 'General information', triggers: ['জানতে চাই', 'তথ্য', 'কি কি', 'information', 'details', 'tell me', 'inquiry'] },
] as const

export const OBJECTION_TRIGGERS: Array<{ label: string; triggers: string[] }> = [
  { label: 'Price too high', triggers: ['বেশি', 'দাম বেশি', 'expensive', 'too much', 'costly', 'cheaper'] },
  { label: 'Needs to think', triggers: ['ভাবতে হবে', 'পরে জানাবো', 'think about', 'later', 'not now', 'consider'] },
  { label: 'Already has a vendor', triggers: ['আছে', 'ব্যবহার করছি', 'already have', 'current provider', 'existing'] },
  { label: 'Trust concern', triggers: ['বিশ্বাস', 'প্রতারণা', 'trust', 'scam', 'guarantee', 'fake'] },
  { label: 'Timing concern', triggers: ['সময় নেই', 'ব্যস্ত', 'busy', 'no time', 'next month'] },
]

export const ACTION_TRIGGERS: Array<{ label: string; triggers: string[] }> = [
  // Triggers include the common Bangla conjugations (পাঠিয়ে দেন / পাঠিয়ে দিচ্ছি /
  // পাঠাবো) because callers speak in the first person, not the imperative.
  { label: 'Send details / quotation', triggers: ['পাঠিয়ে দেন', 'পাঠিয়ে দি', 'পাঠাবো', 'পাঠিয়ে দেব', 'ইমেইল করেন', 'ইমেইল করব', 'send', 'email me', 'share the', 'quotation'] },
  { label: 'Call back', triggers: ['ফোন করবেন', 'ফোন করব', 'পরে কল', 'call me back', 'call back', 'reach me'] },
  { label: 'Book appointment', triggers: ['সিরিয়াল দেন', 'সময় দেন', 'book', 'schedule', 'appointment'] },
  { label: 'Refund / replacement request', triggers: ['রিফান্ড', 'বদলে দেন', 'বদলে দি', 'refund', 'replace'] },
  { label: 'Escalate to supervisor', triggers: ['ম্যানেজার', 'সুপারভাইজার', 'manager', 'supervisor', 'escalate'] },
]

const POSITIVE_TRIGGERS = ['ধন্যবাদ', 'ভালো', 'চমৎকার', 'সন্তুষ্ট', 'খুশি', 'thank', 'great', 'good', 'excellent', 'perfect', 'happy', 'satisfied', 'appreciate']
const NEGATIVE_TRIGGERS = ['খারাপ', 'সমস্যা', 'রাগ', 'বিরক্ত', 'অসন্তুষ্ট', 'bad', 'problem', 'angry', 'frustrated', 'disappointed', 'terrible', 'useless', 'unacceptable']

const COMPLIANCE_TRIGGERS: Array<{ label: string; triggers: string[] }> = [
  { label: 'Recording disclosure given', triggers: ['রেকর্ড', 'recording', 'recorded'] },
  { label: 'AI identity disclosed', triggers: ['এআই', 'কৃত্রিম বুদ্ধিমত্তা', 'ai assistant', 'virtual assistant', 'automated'] },
  { label: 'Opt-out offered', triggers: ['বন্ধ করতে', 'opt out', 'unsubscribe', 'do not call', 'আর ফোন'] },
]

/** Lowercase + normalize Bangla digits so matching is case/numeral-insensitive. */
function normalizeForMatching(text: string): string {
  return text
    .toLowerCase()
    .replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6))
    .replace(/\s+/g, ' ')
}

function evidenceFor(segments: TranscriptSegmentLike[], triggers: string[], max = 3): InsightEvidence[] {
  const out: InsightEvidence[] = []
  for (let i = 0; i < segments.length && out.length < max; i++) {
    const text = normalizeForMatching(segments[i].text ?? '')
    const hit = triggers.find((t) => text.includes(normalizeForMatching(t)))
    if (hit) out.push({ segmentIndex: i, quote: (segments[i].text ?? '').slice(0, 240) })
  }
  return out
}

/**
 * Confidence heuristic. Deliberately conservative and monotonic:
 * 1 hit = 0.55, 2 = 0.7, 3+ = 0.85 — capped below 0.9 because a lexicon match
 * is a signal, never a determination.
 */
function hitsToConfidence(hits: number): number {
  if (hits <= 0) return 0
  if (hits === 1) return 0.55
  if (hits === 2) return 0.7
  return 0.85
}

/** Detect intents, ordered by confidence then hit count. Pure. */
export function detectIntents(segments: TranscriptSegmentLike[]): DerivedInsight[] {
  const insights: DerivedInsight[] = []
  for (const rule of INTENT_RULES) {
    const evidence = evidenceFor(segments, rule.triggers)
    if (evidence.length === 0) continue
    insights.push({
      kind: 'intent',
      label: rule.label,
      value: rule.intent,
      confidence: hitsToConfidence(evidence.length),
      evidence,
      method: 'lexicon',
    })
  }
  return insights.sort((a, b) => b.confidence - a.confidence)
}

export function detectObjections(segments: TranscriptSegmentLike[]): DerivedInsight[] {
  return OBJECTION_TRIGGERS.flatMap((rule) => {
    const evidence = evidenceFor(segments, rule.triggers)
    if (evidence.length === 0) return []
    return [{
      kind: 'objection' as const,
      label: rule.label,
      value: 'objection',
      confidence: hitsToConfidence(evidence.length),
      evidence,
      method: 'lexicon' as const,
    }]
  })
}

export function detectActionItems(segments: TranscriptSegmentLike[]): DerivedInsight[] {
  return ACTION_TRIGGERS.flatMap((rule) => {
    const evidence = evidenceFor(segments, rule.triggers)
    if (evidence.length === 0) return []
    return [{
      kind: 'action_item' as const,
      label: rule.label,
      value: 'pending',
      confidence: hitsToConfidence(evidence.length),
      evidence,
      method: 'lexicon' as const,
    }]
  })
}

export function detectComplianceSignals(segments: TranscriptSegmentLike[]): DerivedInsight[] {
  return COMPLIANCE_TRIGGERS.flatMap((rule) => {
    const evidence = evidenceFor(segments, rule.triggers)
    if (evidence.length === 0) return []
    return [{
      kind: 'compliance' as const,
      label: rule.label,
      value: 'observed',
      confidence: hitsToConfidence(evidence.length),
      evidence,
      method: 'lexicon' as const,
    }]
  })
}

/**
 * Tone estimate. Returns `mixed` when both polarities are present and returns
 * `neutral` (confidence 0) when there is no evidence either way — it never
 * asserts "the customer was angry" without a quoted trigger.
 */
export function estimateSentiment(segments: TranscriptSegmentLike[]): {
  label: 'positive' | 'neutral' | 'negative' | 'mixed'
  confidence: number
  evidence: InsightEvidence[]
  disclaimer: string
} {
  const positive = evidenceFor(segments, POSITIVE_TRIGGERS)
  // Objections are negative-tone evidence in their own right ("দাম অনেক বেশি"
  // contains no negative word but is clearly a complaint signal).
  const objections = detectObjections(segments).flatMap((o) => o.evidence)
  const negative = [...evidenceFor(segments, NEGATIVE_TRIGGERS), ...objections].slice(0, 4)
  const disclaimer = 'Automated estimate of language tone in this transcript — not a measurement of the person’s emotional state.'
  if (positive.length === 0 && negative.length === 0) {
    return { label: 'neutral', confidence: 0, evidence: [], disclaimer }
  }
  if (positive.length > 0 && negative.length > 0) {
    return { label: 'mixed', confidence: 0.6, evidence: [...positive, ...negative].slice(0, 4), disclaimer }
  }
  if (negative.length > 0) {
    return { label: 'negative', confidence: hitsToConfidence(negative.length), evidence: negative, disclaimer }
  }
  return { label: 'positive', confidence: hitsToConfidence(positive.length), evidence: positive, disclaimer }
}

/** Repeated-phrase / topic surfacing across MANY calls (tenant trend view). */
export function detectRepeatedTopics(
  calls: Array<{ callSessionId: string; segments: TranscriptSegmentLike[] }>,
  options: { minCalls?: number } = {},
): Array<{ intent: string; label: string; callCount: number; confidence: number }> {
  const minCalls = options.minCalls ?? 2
  const byIntent = new Map<string, { label: string; calls: Set<string>; hits: number }>()
  for (const call of calls) {
    const intents = detectIntents(call.segments)
    for (const intent of intents) {
      const entry = byIntent.get(intent.value) ?? { label: intent.label, calls: new Set<string>(), hits: 0 }
      entry.calls.add(call.callSessionId)
      entry.hits += intent.evidence.length
      byIntent.set(intent.value, entry)
    }
  }
  return [...byIntent.entries()]
    .filter(([, v]) => v.calls.size >= minCalls)
    .map(([intent, v]) => ({
      intent,
      label: v.label,
      callCount: v.calls.size,
      confidence: Math.min(0.95, 0.5 + v.calls.size * 0.05),
    }))
    .sort((a, b) => b.callCount - a.callCount)
}

/**
 * Quality scorecard from measurable facts (not opinion):
 *   - greeting present, AI disclosure present, handoff performed when requested,
 *     call reached a terminal outcome, transcript available.
 * Score is a ratio of satisfied checks so it is explainable line by line.
 */
export function scoreConversationQuality(params: {
  segments: TranscriptSegmentLike[]
  handoffRequested: boolean
  handoffPerformed: boolean
  disposition: string | null
  hasTranscript: boolean
}): { score: number; checks: Array<{ name: string; passed: boolean; detail: string }> } {
  const checks: Array<{ name: string; passed: boolean; detail: string }> = []
  const firstAgentTurn = params.segments.find((s) => s.speaker === 'agent')?.text ?? ''
  checks.push({
    name: 'agent_opening_present',
    passed: firstAgentTurn.trim().length > 0,
    detail: firstAgentTurn ? 'agent opened the conversation' : 'no agent opening turn recorded',
  })
  const disclosure = evidenceFor(params.segments, ['রেকর্ড', 'recording', 'এআই', 'ai assistant', 'automated'])
  checks.push({
    name: 'disclosure_present',
    passed: disclosure.length > 0,
    detail: disclosure.length > 0 ? 'disclosure language found' : 'no disclosure language found in transcript',
  })
  checks.push({
    name: 'handoff_honored',
    passed: !params.handoffRequested || params.handoffPerformed,
    detail: params.handoffRequested
      ? (params.handoffPerformed ? 'handoff requested and performed' : 'handoff requested but NOT performed')
      : 'no handoff requested',
  })
  checks.push({
    name: 'terminal_outcome',
    passed: Boolean(params.disposition),
    detail: params.disposition ? `disposition ${params.disposition}` : 'no disposition recorded',
  })
  checks.push({
    name: 'transcript_available',
    passed: params.hasTranscript,
    detail: params.hasTranscript ? 'transcript stored' : 'no transcript (no speech engine or no turns)',
  })
  const passed = checks.filter((c) => c.passed).length
  return { score: Math.round((passed / checks.length) * 100) / 100, checks }
}

// ─── Persistence ─────────────────────────────────────────────────────────────

/**
 * Analyse one completed call and persist insights. Idempotent per call: existing
 * rows for that call are replaced atomically so re-running after a transcript
 * correction produces the corrected view, not duplicates.
 */
export async function analyzeCall(params: {
  companyId: string
  callSessionId: string
  model?: string
}): Promise<{ insights: DerivedInsight[]; sentiment: ReturnType<typeof estimateSentiment>; quality: ReturnType<typeof scoreConversationQuality> }> {
  const call = await db.callSession.findFirst({
    where: { id: params.callSessionId, companyId: params.companyId },
    select: { id: true, disposition: true, transferred: true, transferReason: true, outcome: true },
  })
  if (!call) throw new Error(`call ${params.callSessionId} not found for this tenant`)

  const transcript = await db.callTranscript.findUnique({
    where: { callSessionId: params.callSessionId },
    select: { segments: true, status: true },
  })
  let segments: TranscriptSegmentLike[] = []
  if (transcript?.segments) {
    try {
      segments = JSON.parse(transcript.segments) as TranscriptSegmentLike[]
    } catch {
      segments = []
    }
  }

  const intents = detectIntents(segments)
  const objections = detectObjections(segments)
  const actions = detectActionItems(segments)
  const compliance = detectComplianceSignals(segments)
  const sentiment = estimateSentiment(segments)
  const handoffRequested = Boolean(call.transferred || /handoff/i.test(call.transferReason ?? '') || intents.some((i) => i.value === 'human_agent'))
  const quality = scoreConversationQuality({
    segments,
    handoffRequested,
    handoffPerformed: call.transferred,
    disposition: call.disposition,
    hasTranscript: segments.length > 0,
  })

  const insights: DerivedInsight[] = [
    ...intents,
    ...objections,
    ...actions,
    ...compliance,
    {
      kind: 'sentiment',
      label: `Tone: ${sentiment.label}`,
      value: sentiment.label,
      confidence: sentiment.confidence,
      evidence: sentiment.evidence,
      method: 'lexicon',
    },
    {
      kind: 'quality',
      label: `Quality score ${Math.round(quality.score * 100)}%`,
      value: JSON.stringify(quality.checks),
      confidence: 1,
      evidence: [],
      method: 'lexicon',
    },
  ]

  await db.$transaction([
    db.callInsight.deleteMany({ where: { companyId: params.companyId, callSessionId: params.callSessionId } }),
    db.callInsight.createMany({
      data: insights.map((insight) => ({
        companyId: params.companyId,
        callSessionId: params.callSessionId,
        kind: insight.kind,
        label: insight.label,
        value: insight.value,
        confidence: insight.confidence,
        evidence: JSON.stringify(insight.evidence),
        model: params.model ?? 'lexicon-v1',
      })),
    }),
  ])

  return { insights, sentiment, quality }
}

/** Tenant-level trend: repeated intents/objections across the window. */
export async function intelligenceTrends(companyId: string, options: { days?: number; minCalls?: number } = {}) {
  const days = options.days ?? 30
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const rows = await db.callInsight.findMany({
    where: { companyId, createdAt: { gte: since }, kind: { in: ['intent', 'objection', 'action_item'] } },
    select: { kind: true, label: true, value: true, callSessionId: true, createdAt: true },
    take: 20_000,
  })
  const grouped = new Map<string, { kind: string; label: string; calls: Set<string>; occurrences: number }>()
  for (const row of rows) {
    const key = `${row.kind}:${row.value}`
    const entry = grouped.get(key) ?? { kind: row.kind, label: row.label, calls: new Set<string>(), occurrences: 0 }
    entry.calls.add(row.callSessionId)
    entry.occurrences++
    grouped.set(key, entry)
  }
  const minCalls = options.minCalls ?? 1
  return [...grouped.entries()]
    .filter(([, v]) => v.calls.size >= minCalls)
    .map(([key, v]) => ({ key, kind: v.kind, label: v.label, callCount: v.calls.size, occurrences: v.occurrences }))
    .sort((a, b) => b.callCount - a.callCount || b.occurrences - a.occurrences)
}
