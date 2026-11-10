/**
 * AI identity disclosure (master prompt §07/§19).
 *
 * HARD RULE: the agent must never pretend to be human. Every conversation
 * opening carries an explicit AI disclosure in the caller's language. This
 * module is the single source of the disclosure text so it cannot be edited
 * away in one agent config while staying in another.
 *
 * The disclosure is prepended to the greeting UNLESS the configured greeting
 * already contains a disclosure marker (so tenants can word it themselves
 * without doubling it). "Contains a marker" is checked with the same Bangla +
 * English phrases defined here.
 */

export const AI_DISCLOSURE: Record<string, string> = {
  'bn-BD': 'আমি একটি এআই সহকারী, মানুষ নই।',
  'en-US': "I'm an AI assistant, not a human.",
}

/** Fallback used when the caller's language is unknown at open time. */
export const DEFAULT_DISCLOSURE_LANGUAGE = 'bn-BD'

const DISCLOSURE_MARKERS: RegExp[] = [
  /(এআই|এ\.আই|AI|এআই সহকারী)/i,
  /(মানুষ নই|not a human|artificial intelligence|automated)/i,
  /(ভার্চুয়াল অ্যাসিস্ট্যান্ট|virtual assistant)/i,
]

export function greetingContainsDisclosure(text: string | null | undefined): boolean {
  if (!text) return false
  return DISCLOSURE_MARKERS.some((re) => re.test(text))
}

/**
 * Build the conversation-opening utterance for a call.
 *
 * - Always includes the AI disclosure (prepended when the greeting lacks it).
 * - Language picked from detection when available, else the agent language,
 *   else the Bangla default (the product's primary language).
 */
export function buildOpeningGreeting(params: {
  greeting?: string | null
  agentLanguage?: string | null
  detectedLanguage?: string | null
}): { text: string; language: string; disclosureIncluded: boolean } {
  const lang =
    (params.detectedLanguage && (params.detectedLanguage.startsWith('bn') ? 'bn-BD' : params.detectedLanguage.startsWith('en') ? 'en-US' : null)) ??
    (params.agentLanguage?.startsWith('en') ? 'en-US' : 'bn-BD')

  const greeting = params.greeting?.trim() || ''
  if (greetingContainsDisclosure(greeting)) {
    return { text: greeting, language: lang, disclosureIncluded: true }
  }
  const disclosure = AI_DISCLOSURE[lang] ?? AI_DISCLOSURE[DEFAULT_DISCLOSURE_LANGUAGE]
  const defaultGreeting =
    lang === 'en-US'
      ? 'Hello! How can I help you today?'
      : 'আসসালামু আলাইকুম! আমি আপনাকে কীভাবে সাহায্য করতে পারি?'
  const base = greeting || defaultGreeting
  return { text: `${disclosure} ${base}`, language: lang, disclosureIncluded: true }
}
