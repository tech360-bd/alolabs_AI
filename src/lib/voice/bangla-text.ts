/**
 * Bangla (bn-BD) text normalization for speech synthesis and transcript
 * processing.
 *
 * WHY THIS EXISTS
 * ---------------
 * A TTS engine pronounces what it is *given*. Raw Bangla business text is full
 * of tokens no engine reads acceptably as-is:
 *
 *   - Western digits (`01712345678`, `2026`, `1,250.50`) which some Bangla
 *     voices read in English or spell digit by digit;
 *   - Currency symbols (`৳`, `Tk`, `BDT`) and units (`kg`, `km`, `%`);
 *   - Dates (`2026-11-17`, `17/11/2026`);
 *   - Time (`10:30`, `6 pm`);
 *   - Abbreviations (` Govt. `, `No. `, `M/s `);
 *   - Punctuation that stalls prosody (ellipsis, repeated marks, emoji);
 *   - Tenant-specific names (a business called "Aarong" or a person called
 *     "Rumana") that a general-purpose voice mangles.
 *
 * This module converts those into Bangla words/phonetics BEFORE synthesis, and
 * is applied AFTER the tenant's pronunciation dictionary so operator overrides
 * always win. Everything is pure and deterministic — the tests in
 * `__tests__/unit/lib/voice/bangla-text.test.ts` pin the behavior.
 *
 * HONEST BOUNDARY: normalization improves what an engine is asked to say. It
 * does not make an engine capable of Bangla. Quality is still established only
 * by native-speaker evaluation (docs/BANGLA_VOICE_MODEL_EVALUATION.md).
 */

export type SpeechLanguage = 'bn-BD' | 'bn-IN' | 'en-US' | 'hi-IN' | 'ar-SA' | string

const BN_DIGITS = ['শূন্য', 'এক', 'দুই', 'তিন', 'চার', 'পাঁচ', 'ছয়', 'সাত', 'আট', 'নয়']

/** 0–99 Bangla number words (Bangladeshi standard spellings). */
const BN_UNDER_100: readonly string[] = [
  'শূন্য', 'এক', 'দুই', 'তিন', 'চার', 'পাঁচ', 'ছয়', 'সাত', 'আট', 'নয়',
  'দশ', 'এগারো', 'বারো', 'তেরো', 'চৌদ্দ', 'পনেরো', 'ষোলো', 'সতেরো', 'আঠারো', 'উনিশ',
  'বিশ', 'একুশ', 'বাইশ', 'তেইশ', 'চব্বিশ', 'পঁচিশ', 'ছাব্বিশ', 'সাতাশ', 'আটাশ', 'ঊনত্রিশ',
  'ত্রিশ', 'একত্রিশ', 'বত্রিশ', 'তেত্রিশ', 'চৌত্রিশ', 'পঁয়ত্রিশ', 'ছত্রিশ', 'সাঁইত্রিশ', 'আটত্রিশ', 'ঊনচল্লিশ',
  'চল্লিশ', 'একচল্লিশ', 'বিয়াল্লিশ', 'তেতাল্লিশ', 'চুয়াল্লিশ', 'পঁয়তাল্লিশ', 'ছেচল্লিশ', 'সাতচল্লিশ', 'আটচল্লিশ', 'ঊনপঞ্চাশ',
  'পঞ্চাশ', 'একান্ন', 'বায়ান্ন', 'তিপ্পান্ন', 'চুয়ান্ন', 'পঞ্চান্ন', 'ছাপ্পান্ন', 'সাতান্ন', 'আটান্ন', 'ঊনষাট',
  'ষাট', 'একষট্টি', 'বাষট্টি', 'তেষট্টি', 'চৌষট্টি', 'পঁয়ষট্টি', 'ছেষট্টি', 'সাতষট্টি', 'আটষট্টি', 'ঊনসত্তর',
  'সত্তর', 'একাত্তর', 'বাহাত্তর', 'তিয়াত্তর', 'চুয়াত্তর', 'পঁচাত্তর', 'ছিয়াত্তর', 'সাতাত্তর', 'আটাত্তর', 'ঊনআশি',
  'আশি', 'একাশি', 'বিরাশি', 'তিরাশি', 'চুরাশি', 'পঁচাশি', 'ছিয়াশি', 'সাতাশি', 'আটাশি', 'ঊননব্বই',
  'নব্বই', 'একানব্বই', 'বিরানব্বই', 'তিরানব্বই', 'চুরানব্বই', 'পঁচানব্বই', 'ছিয়ানব্বই', 'সাতানব্বই', 'আটানব্বই', 'নিরানব্বই',
]

const BN_MONTHS = [
  'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
  'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর',
]

const BN_WEEKDAYS = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার']

/** English number words used when the target language is not Bangla. */
const EN_UNDER_20 = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

export function isBangla(language: SpeechLanguage): boolean {
  return language.toLowerCase().startsWith('bn')
}

/**
 * Bangla integer → words using the Bangladeshi numbering system: lakh
 * (১,০০,০০০) and crore (১,০০,০০,০০০) rather than the western million group.
 * This matters: "১,২০,০০০ টাকা" is "এক লক্ষ বিশ হাজার টাকা", not "one hundred
 * twenty thousand".
 */
export function banglaNumberWords(n: number): string {
  if (!Number.isFinite(n)) return ''
  const neg = n < 0
  let value = Math.abs(Math.trunc(n))
  if (value === 0) return BN_UNDER_100[0]
  const parts: string[] = []

  const crore = Math.floor(value / 10_000_000)
  value -= crore * 10_000_000
  const lakh = Math.floor(value / 100_000)
  value -= lakh * 100_000
  const thousand = Math.floor(value / 1_000)
  value -= thousand * 1_000
  const hundred = Math.floor(value / 100)
  value -= hundred * 100
  const rest = value

  if (crore > 0) parts.push(`${banglaNumberWords(crore)} কোটি`)
  if (lakh > 0) parts.push(`${BN_UNDER_100[lakh]} লক্ষ`)
  if (thousand > 0) parts.push(`${BN_UNDER_100[thousand]} হাজার`)
  if (hundred > 0) parts.push(`${BN_UNDER_100[hundred]} শত`)
  if (rest > 0) parts.push(BN_UNDER_100[rest])
  const words = parts.join(' ').trim()
  return neg ? `ঋণাত্মক ${words}` : words
}

/** English integer → words (Indian grouping optional, default western). */
export function englishNumberWords(n: number): string {
  if (!Number.isFinite(n)) return ''
  const neg = n < 0
  const value = Math.abs(Math.trunc(n))
  if (value === 0) return 'zero'
  const chunks: string[] = []
  let remaining = value
  const scales: Array<[number, string]> = [[1_000_000_000, 'billion'], [1_000_000, 'million'], [1_000, 'thousand']]
  for (const [scale, name] of scales) {
    if (remaining >= scale) {
      chunks.push(`${threeDigits(remaining / scale)} ${name}`)
      remaining %= scale
    }
  }
  if (remaining > 0) chunks.push(threeDigits(remaining))
  const words = chunks.join(' ').replace(/\s+/g, ' ').trim()
  return neg ? `negative ${words}` : words
}

function threeDigits(n: number): string {
  const value = Math.trunc(n)
  const h = Math.floor(value / 100)
  const rest = value % 100
  const parts: string[] = []
  if (h > 0) parts.push(`${EN_UNDER_20[h]} hundred`)
  if (rest > 0) {
    if (rest < 20) parts.push(EN_UNDER_20[rest])
    else parts.push(`${EN_TENS[Math.floor(rest / 10)]}${rest % 10 ? `-${EN_UNDER_20[rest % 10]}` : ''}`)
  }
  return parts.join(' ')
}

/** Number → words for the target language, including decimals. */
export function numberToWords(raw: string, language: SpeechLanguage): string {
  const cleaned = raw.replace(/[,٬\s]/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return raw
  const bn = isBangla(language)
  const [intPart, fracPart] = cleaned.split('.')
  const intWords = bn ? banglaNumberWords(Number(intPart)) : englishNumberWords(Number(intPart))
  if (!fracPart) return intWords
  return bn ? `${intWords} দশমিক ${fracPart.split('').map((d) => BN_DIGITS[Number(d)]).join(' ')}`
    : `${intWords} point ${fracPart.split('').map((d) => EN_UNDER_20[Number(d)]).join(' ')}`
}

/** Bangla digits (০-৯) → ASCII digits so downstream numeric logic works. */
export function normalizeBanglaDigits(text: string): string {
  return text.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6))
}

/**
 * Spoken time: "10:30" → "দশটা ত্রিশ মিনিট" / "ten thirty".
 *
 * `explicitMeridiem` is 'am' | 'pm' when the source text carried one after the
 * clock ("6:00 pm"). Without it the 24-hour value decides, and a bare 12-hour
 * value (e.g. "6:00") is spoken WITHOUT a meridiem — inventing "am" would be
 * wrong half the time.
 */
function timeToWords(match: string, language: SpeechLanguage, explicitMeridiem?: 'am' | 'pm'): string {
  const [, hRaw, mRaw] = match.match(/^(\d{1,2}):(\d{2})$/) ?? []
  if (!hRaw || !mRaw) return match
  const h = Number(hRaw)
  const m = Number(mRaw)
  if (h > 23 || m > 59) return match

  let hour24 = h
  if (explicitMeridiem) {
    if (h === 0 || h > 12) return match // "13:00 pm" is malformed — leave as-is
    hour24 = explicitMeridiem === 'pm' ? (h % 12) + 12 : h % 12
  }
  const hasPeriod = explicitMeridiem !== undefined || h > 12 || h === 0
  const isPm = hour24 >= 12
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12

  if (isBangla(language)) {
    const periodBn = isPm ? 'পি এম' : 'এ এম'
    const suffix = hasPeriod ? ` ${periodBn}` : ''
    const hourWord = banglaNumberWords(hour12)
    if (m === 0) return `${hourWord}টা${suffix}`
    if (m === 30) return `${hourWord}টা ত্রিশ মিনিট${suffix}`
    return `${hourWord}টা ${banglaNumberWords(m)} মিনিট${suffix}`
  }
  const suffix = hasPeriod ? ` ${isPm ? 'pm' : 'am'}` : ''
  if (m === 0) return `${englishNumberWords(hour12)} o'clock${suffix}`
  return `${englishNumberWords(hour12)} ${englishNumberWords(m)}${suffix}`
}

/** ISO / dotted date → spoken date. */
function dateToWords(match: string, language: SpeechLanguage): string {
  const m = match.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  const dmy = match.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)
  let year: number, month: number, day: number
  if (m) { year = Number(m[1]); month = Number(m[2]); day = Number(m[3]) }
  else if (dmy) { day = Number(dmy[1]); month = Number(dmy[2]); year = Number(dmy[3]) }
  else return match
  if (month < 1 || month > 12 || day < 1 || day > 31) return match
  if (isBangla(language)) {
    return `${banglaNumberWords(day)} ${BN_MONTHS[month - 1]} ${banglaNumberWords(year)}`
  }
  return `${englishNumberWords(day)} ${BN_MONTHS[month - 1].replace(/[^\x00-\x7F]/g, '') || month} ${englishNumberWords(year)}`
}

/** Spoken phone number: digit-by-digit, grouped naturally. */
function phoneToWords(digits: string, language: SpeechLanguage): string {
  const clean = digits.replace(/\D/g, '')
  if (clean.length < 7) return digits
  if (isBangla(language)) {
    return clean.split('').map((d) => BN_DIGITS[Number(d)]).join(' ')
  }
  return clean.split('').map((d) => EN_UNDER_20[Number(d)]).join(' ')
}

/** Spoken weekday helper used by business-hour narration. */
export function banglaWeekdayName(dayIndex: number): string {
  return BN_WEEKDAYS[((dayIndex % 7) + 7) % 7]
}

export interface NormalizeOptions {
  /** Tenant pronunciation dictionary, applied LAST (highest precedence). */
  pronunciation?: Array<{ term: string; phonetic: string; caseSensitive?: boolean }>
  /** Expand numbers into words (default true for speech). */
  expandNumbers?: boolean
  /** Strip emoji/symbols that stall prosody (default true). */
  stripUnspeakable?: boolean
}

export interface NormalizeResult {
  text: string
  /** What changed — returned so the studio can show a diff, never to hide it. */
  substitutions: Array<{ from: string; to: string; rule: string }>
}

/**
 * Full normalization pipeline. Deterministic order:
 *   1. Bangla digits → ASCII
 *   2. pronunciation dictionary (tenant overrides first — highest priority)
 *   3. dates, times, currency, units, percentages
 *   4. phone-number-like digit runs
 *   5. remaining bare numbers
 *   6. unspeakable symbol stripping + whitespace collapse
 */
export function normalizeForSpeech(raw: string, language: SpeechLanguage, options: NormalizeOptions = {}): NormalizeResult {
  const substitutions: NormalizeResult['substitutions'] = []
  const note = (from: string, to: string, rule: string) => substitutions.push({ from, to, rule })
  const bn = isBangla(language)

  let text = normalizeBanglaDigits(raw)

  // 2. Tenant pronunciation dictionary — literal replacement, highest priority.
  for (const entry of options.pronunciation ?? []) {
    if (!entry.term) continue
    const before = text
    if (entry.caseSensitive) {
      text = text.split(entry.term).join(entry.phonetic)
    } else {
      const escaped = entry.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      text = text.replace(new RegExp(escaped, 'gi'), entry.phonetic)
    }
    if (text !== before) note(entry.term, entry.phonetic, 'pronunciation_dictionary')
  }

  // 3a. Currency: ৳1,250.50 / Tk 1,250 / BDT 500 — paisa are spoken, not dropped.
  text = text.replace(/(?:৳|Tk\.?|BDT)\s*([\d,]+)(?:\.(\d{1,2}))?/gi, (match, whole: string, fraction?: string) => {
    const taka = Number(whole.replace(/,/g, ''))
    const paisa = fraction ? Number(fraction.padEnd(2, '0')) : 0
    const words = bn
      ? `${banglaNumberWords(taka)} টাকা${paisa > 0 ? ` ${banglaNumberWords(paisa)} পয়সা` : ''}`
      : `${englishNumberWords(taka)} taka${paisa > 0 ? ` and ${englishNumberWords(paisa)} poisha` : ''}`
    note(match, words, 'currency')
    return words
  })

  // 3b. Percentage
  text = text.replace(/([\d,]+(?:\.\d+)?)\s*%/g, (match, amount: string) => {
    const words = bn ? `${banglaNumberWords(Number(amount.replace(/,/g, '')))} শতাংশ` : `${englishNumberWords(Number(amount.replace(/,/g, '')))} percent`
    note(match, words, 'percentage')
    return words
  })

  // 3c. Times — an explicit am/pm suffix is consumed with the clock so it is
  // never echoed as a second, contradictory meridiem.
  text = text.replace(/\b(\d{1,2}:\d{2})\s*(am|pm|a\.m\.|p\.m\.)\b/gi, (match, clock: string, mer: string) => {
    const words = timeToWords(clock, language, mer.toLowerCase().startsWith('a') ? 'am' : 'pm')
    if (words !== clock) note(match, words, 'time')
    return words
  })
  text = text.replace(/\b\d{1,2}:\d{2}\b/g, (match) => {
    const words = timeToWords(match, language)
    if (words !== match) note(match, words, 'time')
    return words
  })

  // 3d. Dates (ISO before dmy so 2026-11-17 is not misread)
  text = text.replace(/\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b|\b\d{1,2}[-/.]\d{1,2}[-/.]\d{4}\b/g, (match) => {
    const words = dateToWords(match, language)
    if (words !== match) note(match, words, 'date')
    return words
  })

  // 3e. Units commonly spoken in Bangla business calls
  const unitMap: Array<[RegExp, string, string]> = bn
    ? [
        [/([\d,]+)\s*kg\b/gi, ' কেজি', 'unit'],
        [/([\d,]+)\s*km\b/gi, ' কিলোমিটার', 'unit'],
        [/([\d,]+)\s*GB\b/g, ' গিগাবাইট', 'unit'],
        [/([\d,]+)\s*MB\b/g, ' মেগাবাইট', 'unit'],
        [/([\d,]+)\s*(?:hrs?|hours?)\b/gi, ' ঘণ্টা', 'unit'],
        [/([\d,]+)\s*(?:mins?|minutes?)\b/gi, ' মিনিট', 'unit'],
      ]
    : [
        [/([\d,]+)\s*kg\b/gi, ' kilograms', 'unit'],
        [/([\d,]+)\s*km\b/gi, ' kilometres', 'unit'],
        [/([\d,]+)\s*GB\b/g, ' gigabytes', 'unit'],
        [/([\d,]+)\s*MB\b/g, ' megabytes', 'unit'],
      ]
  for (const [pattern, suffix, rule] of unitMap) {
    text = text.replace(pattern, (match, amount: string) => {
      const words = `${options.expandNumbers === false ? amount : numberToWords(amount, language)}${suffix}`
      note(match, words, rule)
      return words
    })
  }

  // 4. Phone-number-like runs (+8801712345678, 01712345678)
  text = text.replace(/(\+?\d[\d\-\s]{6,}\d)/g, (match) => {
    const digitsOnly = match.replace(/\D/g, '')
    // Only treat as a phone number when it is long enough and not already handled.
    if (digitsOnly.length < 9 || digitsOnly.length > 15) return match
    const words = phoneToWords(digitsOnly, language)
    note(match, words, 'phone_number')
    return words
  })

  // 5. Remaining bare numbers (amounts, counts, years)
  if (options.expandNumbers !== false) {
    text = text.replace(/\b\d+(?:[.,]\d+)*\b/g, (match) => {
      const words = numberToWords(match, language)
      if (words !== match) note(match, words, 'number')
      return words
    })
  }

  // 5b. Abbreviations that confuse prosody.
  const abbrev: Array<[RegExp, string]> = bn
    ? [[/\bMr\./g, 'মিস্টার'], [/\bMrs\./g, 'মিসেস'], [/\bDr\./g, 'ডাক্তার'], [/\bNo\.\s*/g, 'নম্বর ']]
    : [[/\bMr\./g, 'Mister'], [/\bMrs\./g, 'Missus'], [/\bDr\./g, 'Doctor'], [/\bNo\.\s*/g, 'number ']]
  for (const [pattern, replacement] of abbrev) text = text.replace(pattern, replacement)

  // 6. Unspeakable symbols & runaway punctuation.
  if (options.stripUnspeakable !== false) {
    text = text
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ') // emoji
      .replace(/[*_#`~^|<>[\]{}]/g, ' ')
      .replace(/\.{2,}/g, '।')
      .replace(/([!?।,])\1{2,}/g, '$1')
      .replace(/[ \t]+/g, ' ')
      .replace(/\s+([!?।,])/g, '$1')
      .trim()
  }

  return { text, substitutions }
}

/**
 * Split long text into synthesis-safe sentence chunks.
 *
 * Long-form speech needs bounded chunks: TTS engines truncate, and a single
 * failure should not lose the whole document. Bangla sentence terminator is
 * `।` (dari), plus `!` `?` and line breaks. Returns chunks in original order.
 */
export function splitIntoSpeechSentences(text: string, maxChars = 280): string[] {
  if (!text.trim()) return []
  const rough = text
    .split(/(?<=[।!?\n])/u)
    .map((s) => s.trim())
    .filter(Boolean)
  const out: string[] = []
  for (const sentence of rough) {
    if (sentence.length <= maxChars) {
      out.push(sentence)
      continue
    }
    // Long sentence: split on commas/space boundaries, never mid-cluster.
    let buffer = ''
    for (const word of sentence.split(/\s+/)) {
      if ((buffer + ' ' + word).trim().length > maxChars && buffer) {
        out.push(buffer.trim())
        buffer = word
      } else {
        buffer = `${buffer} ${word}`
      }
    }
    if (buffer.trim()) out.push(buffer.trim())
  }
  return out
}

/** Rough spoken duration for capacity planning (never billed as fact). */
export function estimateSpokenSeconds(text: string, language: SpeechLanguage = 'bn-BD'): number {
  const chars = [...text].length
  // Bangla is written without spaces between most words; character rate is a
  // better planning basis than a word count.
  const charsPerSecond = isBangla(language) ? 13 : 15
  return Math.max(0, Math.round(chars / charsPerSecond))
}
