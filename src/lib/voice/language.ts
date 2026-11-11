/**
 * Language detection for the voice pipeline (master prompt §09).
 *
 * Pure functions — no database, no network — so detection is deterministic
 * and unit-testable. Detection is SCRIPT-BASED (Unicode blocks), which is the
 * honest method for Bangla vs English: Bangla uses U+0980–U+09FF, English
 * (here) uses basic Latin. A "mixed" verdict means both scripts are present
 * in meaningful proportions — the common code-switching pattern in Bangla
 * conversation ("আমার meeting টা কবে?").
 *
 * Romanized Bangla ("amar meeting ta kobe") is NOT claimed to be detected:
 * transliteration detection needs an engine-level model. The result carries
 * `romanized: true` when the text is Latin-script but contains common Bangla
 * romanized markers, so callers can route it to a human/clarification path
 * instead of pretending an ASR language we cannot support.
 */

export type DetectedLanguage = 'bn-BD' | 'en-US' | 'mixed'

export interface LanguageDetection {
  language: DetectedLanguage
  /** Share of script letters that are Bangla, 0..1 (0 when no letters). */
  banglaRatio: number
  /** Total script letters counted (excluding digits/punct). */
  letterCount: number
  /** Confidence 0..1 — driven by the volume of script evidence. */
  confidence: number
  /** Latin-script text that looks like romanized Bangla. */
  romanized: boolean
  reason: string
}

const BANGLA_RE = /[\u0980-\u09FF]/g
const LATIN_RE = /[A-Za-z]/g

/** Thresholds: below MIN_LETTERS the sample is too small to be confident. */
const MIN_LETTERS = 2
/** A script is "present" when it holds at least this share of letters. */
const PRESENT_SHARE = 0.2

// Common romanized Bangla word markers (informal transliteration). Used ONLY
// to flag `romanized`, never to claim a Bangla ASR capability we lack.
const ROMANIZED_BANGLA_MARKERS =
  /\b(amar|apnar|tumi|apni|kemon|achen|kothay|kobe|kivabe|koto|bhalo|mongobaar|dhonnobad|dhorun|ache|korbo|kori|lagbe|dorkar|jonno|ekhon|pore|age|ami|bangla)\b/i

export function detectLanguage(text: string): LanguageDetection {
  const empty: LanguageDetection = {
    language: 'en-US',
    banglaRatio: 0,
    letterCount: 0,
    confidence: 0,
    romanized: false,
    reason: 'no script evidence — defaulting to en-US',
  }
  if (!text || typeof text !== 'string') return empty

  const bangla = text.match(BANGLA_RE)?.length ?? 0
  const latin = text.match(LATIN_RE)?.length ?? 0
  const letterCount = bangla + latin

  if (letterCount < MIN_LETTERS) return { ...empty, letterCount }

  const banglaRatio = bangla / letterCount
  const hasBangla = banglaRatio >= PRESENT_SHARE
  const hasLatin = 1 - banglaRatio >= PRESENT_SHARE

  const romanized = bangla === 0 && hasLatin && ROMANIZED_BANGLA_MARKERS.test(text)

  if (hasBangla && hasLatin) {
    return {
      language: 'mixed',
      banglaRatio,
      letterCount,
      confidence: Math.min(1, letterCount / 12),
      romanized: false,
      reason: `both scripts present (bangla=${bangla}, latin=${latin}) — code-switching turn`,
    }
  }
  if (hasBangla) {
    return {
      language: 'bn-BD',
      banglaRatio,
      letterCount,
      confidence: Math.min(1, letterCount / 12),
      romanized: false,
      reason: `bangla script dominant (ratio ${banglaRatio.toFixed(2)})`,
    }
  }
  return {
    language: 'en-US',
    banglaRatio,
    letterCount,
    confidence: Math.min(1, letterCount / 12),
    romanized,
    reason: romanized
      ? 'latin script with romanized-bangla markers — flag for clarification path'
      : `latin script dominant (ratio ${(1 - banglaRatio).toFixed(2)})`,
  }
}

/**
 * The language the AGENT should reply in for this turn. Mixed turns keep the
 * mixed channel alive by staying on the agent's configured mixed-capable
 * language; the LLM responder receives the raw utterance either way.
 */
export function replyLanguageFor(
  detection: LanguageDetection,
  agentLanguage = 'bn-BD',
): DetectedLanguage {
  if (detection.language === 'mixed') {
    // An agent configured for Bangla handles mixed conversation; one pinned
    // to English-only stays English. Never claim a third language.
    return agentLanguage.toLowerCase().startsWith('en') ? 'en-US' : 'mixed'
  }
  return detection.language
}

/** RFC-5646 base language of a tag ("bn-BD" → "bn") for engine matching. */
export function baseLanguage(tag: string): string {
  return tag.split('-')[0].toLowerCase()
}
