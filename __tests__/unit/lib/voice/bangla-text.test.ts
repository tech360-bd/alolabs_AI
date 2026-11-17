/**
 * Bangla text normalization + subtitle/error-rate helpers.
 *
 * These pin behavior that a real TTS engine depends on: digits, currency,
 * dates, times, phone numbers, the pronunciation dictionary and sentence
 * chunking. A regression here is audible to a Bangla caller.
 */
import { describe, expect, it } from 'vitest'
import {
  banglaNumberWords,
  englishNumberWords,
  normalizeBanglaDigits,
  normalizeForSpeech,
  numberToWords,
  splitIntoSpeechSentences,
  estimateSpokenSeconds,
  banglaWeekdayName,
} from '@/lib/voice/bangla-text'
import {
  formatTimestamp,
  toSrt,
  toVtt,
  planAudioSegments,
  computeSilenceTrimPlan,
  diffTranscriptSegments,
  wordErrorRate,
  characterErrorRate,
  hasUsableTiming,
} from '@/lib/voice/subtitles'

describe('Bangla number words', () => {
  it('uses lakh/crore grouping, not millions', () => {
    expect(banglaNumberWords(120000)).toBe('এক লক্ষ বিশ হাজার')
    expect(banglaNumberWords(10000000)).toBe('এক কোটি')
    expect(banglaNumberWords(0)).toBe('শূন্য')
  })

  it('handles hundreds and remainders', () => {
    expect(banglaNumberWords(1250)).toBe('এক হাজার দুই শত পঞ্চাশ')
    expect(banglaNumberWords(99)).toBe('নিরানব্বই')
    expect(banglaNumberWords(-5)).toContain('ঋণাত্মক')
  })

  it('english words for non-bangla targets', () => {
    expect(englishNumberWords(1250)).toBe('one thousand two hundred fifty')
    expect(englishNumberWords(0)).toBe('zero')
  })

  it('converts Bangla digits to ASCII', () => {
    expect(normalizeBanglaDigits('০১৭১২৩৪৫৬৭৮')).toBe('01712345678')
  })

  it('speaks decimals digit by digit', () => {
    expect(numberToWords('3.75', 'bn-BD')).toContain('দশমিক')
    expect(numberToWords('3.75', 'en-US')).toBe('three point seven five')
  })
})

describe('normalizeForSpeech', () => {
  it('expands currency including paisa (never silently dropping it)', () => {
    const result = normalizeForSpeech('বিল ৳1,250.50', 'bn-BD')
    expect(result.text).toContain('টাকা')
    expect(result.text).toContain('পয়সা')
    expect(result.substitutions.some((s) => s.rule === 'currency')).toBe(true)
  })

  it('expands ISO dates in Bangla', () => {
    const result = normalizeForSpeech('2026-11-17 তারিখে আসবেন', 'bn-BD')
    expect(result.text).toContain('নভেম্বর')
    expect(result.text).toContain('সতেরো')
  })

  it('consumes an explicit am/pm rather than doubling it', () => {
    const result = normalizeForSpeech('মিটিং 6:00 pm এ', 'bn-BD')
    expect(result.text).toContain('পি এম')
    expect(result.text).not.toMatch(/পি এম\s+এ এম/)
    const english = normalizeForSpeech('Call at 6:00 pm', 'en-US')
    expect(english.text).toBe("Call at six o'clock pm")
  })

  it('does not invent a meridiem for a bare 12-hour clock', () => {
    const result = normalizeForSpeech('6:00', 'en-US')
    expect(result.text).toBe("six o'clock")
    expect(result.text).not.toContain('am')
  })

  it('keeps 24-hour times unambiguous', () => {
    expect(normalizeForSpeech('18:30', 'en-US').text).toBe('six thirty pm')
    expect(normalizeForSpeech('00:15', 'en-US').text).toBe('twelve fifteen am')
  })

  it('speaks phone numbers digit by digit', () => {
    const result = normalizeForSpeech('কল করুন 01712345678', 'bn-BD')
    expect(result.substitutions.some((s) => s.rule === 'phone_number')).toBe(true)
    expect(result.text).not.toMatch(/\d/)
  })

  it('expands percentages and units', () => {
    expect(normalizeForSpeech('15% ছাড়', 'bn-BD').text).toContain('শতাংশ')
    expect(normalizeForSpeech('2 kg চাল', 'bn-BD').text).toContain('কেজি')
  })

  it('applies the pronunciation dictionary with highest priority', () => {
    const result = normalizeForSpeech('Aarong theke kini', 'bn-BD', {
      pronunciation: [{ term: 'Aarong', phonetic: 'আড়ং' }],
    })
    expect(result.text).toContain('আড়ং')
    expect(result.substitutions.some((s) => s.rule === 'pronunciation_dictionary')).toBe(true)
  })

  it('honors caseSensitive dictionary entries', () => {
    // "Tk" is itself a currency token, so this uses a neutral term.
    const insensitive = normalizeForSpeech('Rumana apu ke bolun', 'bn-BD', { pronunciation: [{ term: 'rumana', phonetic: 'রুমানা' }] })
    expect(insensitive.text).toContain('রুমানা')
    const sensitive = normalizeForSpeech('Rumana apu ke bolun', 'bn-BD', {
      pronunciation: [{ term: 'rumana', phonetic: 'রুমানা', caseSensitive: true }],
    })
    expect(sensitive.text).not.toContain('রুমানা')
  })

  it('strips emoji and runaway punctuation', () => {
    const result = normalizeForSpeech('ধন্যবাদ 😀!!!', 'bn-BD')
    expect(result.text).not.toContain('😀')
    expect(result.text).not.toContain('!!!')
  })

  it('can skip number expansion for expert callers', () => {
    const result = normalizeForSpeech('Room 12', 'en-US', { expandNumbers: false })
    expect(result.text).toContain('12')
  })
})

describe('sentence chunking', () => {
  it('splits on the Bangla danda', () => {
    expect(splitIntoSpeechSentences('প্রথম। দ্বিতীয়! তৃতীয়?')).toHaveLength(3)
  })

  it('splits oversize sentences without breaking mid-word', () => {
    const long = Array.from({ length: 100 }, (_, i) => `শব্দ${i}`).join(' ')
    const chunks = splitIntoSpeechSentences(long, 120)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(160)
  })

  it('estimates spoken duration monotonically', () => {
    expect(estimateSpokenSeconds('')).toBe(0)
    expect(estimateSpokenSeconds('অ'.repeat(130))).toBeGreaterThan(estimateSpokenSeconds('অ'.repeat(13)))
  })

  it('names weekdays', () => {
    expect(banglaWeekdayName(0)).toBe('রবিবার')
    expect(banglaWeekdayName(6)).toBe('শনিবার')
  })
})

describe('subtitles', () => {
  const segments = [
    { speaker: 'agent', text: 'আসসালামু আলাইকুম', startMs: 0, endMs: 1500 },
    { speaker: 'customer', text: 'ওয়া আলাইকুমুস সালাম', startMs: 1500, endMs: 3200 },
  ]

  it('formats timestamps in both styles', () => {
    expect(formatTimestamp(1250, 'srt')).toBe('00:00:01,250')
    expect(formatTimestamp(3725450, 'vtt')).toBe('01:02:05.450')
  })

  it('builds valid SRT with speaker labels', () => {
    const { srt, cues, skipped } = toSrt(segments)
    expect(cues).toBe(2)
    expect(skipped).toBe(0)
    expect(srt).toContain('00:00:00,000 --> 00:00:01,500')
    expect(srt).toContain('agent:')
  })

  it('builds valid VTT', () => {
    const { vtt } = toVtt(segments)
    expect(vtt.startsWith('WEBVTT')).toBe(true)
    expect(vtt).toContain('00:00:01.500 --> 00:00:03.200')
  })

  it('drops untimed segments and reports the count instead of inventing time', () => {
    const { srt, cues, skipped } = toSrt([...segments, { text: 'no timing', startMs: 0, endMs: 0 }])
    expect(cues).toBe(2)
    expect(skipped).toBe(1)
    expect(srt).not.toContain('no timing')
  })

  it('identifies usable timing', () => {
    expect(hasUsableTiming({ startMs: 0, endMs: 100 })).toBe(true)
    expect(hasUsableTiming({ startMs: 100, endMs: 100 })).toBe(false)
    expect(hasUsableTiming({ startMs: 200, endMs: 100 })).toBe(false)
  })

  it('plans cumulative audio segments and flags estimates', () => {
    const { chunks, basedOnEstimates } = planAudioSegments(['প্রথম বাক্য।', 'দ্বিতীয় বাক্য।'], { durationsMs: [1000, 2000], gapMs: 100 })
    expect(chunks).toHaveLength(2)
    expect(chunks[0].startMs).toBe(0)
    expect(chunks[0].endMs).toBe(1000)
    expect(chunks[1].startMs).toBe(1100)
    expect(basedOnEstimates).toBe(false)

    const estimated = planAudioSegments(['একটি বাক্য।'])
    expect(estimated.basedOnEstimates).toBe(true)
  })

  it('rejects invalid silent spans instead of guessing', () => {
    const plan = computeSilenceTrimPlan(10_000, [
      { startMs: 1000, endMs: 2000 },
      { startMs: 20_000, endMs: 21_000 }, // out of range → rejected
      { startMs: 5000, endMs: 4000 }, // inverted → rejected
    ])
    expect(plan.rejected).toBe(2)
    expect(plan.keptMs + plan.removedMs).toBe(10_000)
  })

  it('diffs a corrected transcript without destroying the original', () => {
    const { corrections, changedCount } = diffTranscriptSegments(
      [{ text: 'আমি যাব' }, { text: 'ঠিক আছে' }],
      ['আমি যাবো', 'ঠিক আছে'],
    )
    expect(changedCount).toBe(1)
    expect(corrections[0].original).toBe('আমি যাব')
    expect(corrections[0].corrected).toBe('আমি যাবো')
  })

  it('computes WER and CER including perfect matches', () => {
    expect(wordErrorRate('আমি ভালো আছি', 'আমি ভালো আছি')).toBe(0)
    expect(wordErrorRate('আমি ভালো আছি', 'আমি আছি')).toBeCloseTo(1 / 3, 5)
    expect(characterErrorRate('abc', 'abc')).toBe(0)
    expect(characterErrorRate('abc', 'abd')).toBeCloseTo(1 / 3, 5)
    expect(wordErrorRate('', '')).toBe(0)
    expect(wordErrorRate('', 'অতিরিক্ত')).toBe(1)
  })
})
