// @vitest-environment node
/**
 * CRM, call intelligence and omnichannel pure logic.
 *
 * These modules decide who gets contacted, what a call "was about" and how a
 * customer's channels are grouped. All three have honesty requirements, so the
 * tests assert absence of fabricated output as much as presence of correct
 * output.
 */
import { describe, expect, it } from 'vitest'
import { contactIdentity, parseCsv } from '@/lib/voice/crm-service'
import {
  detectIntents,
  detectActionItems,
  detectObjections,
  estimateSentiment,
  scoreConversationQuality,
  detectRepeatedTopics,
} from '@/lib/voice/intelligence'
import { threadKeyFor, renderTemplate, extractTemplateVariables } from '@/lib/voice/omnichannel'
import { asrResultFromVerbose, isLocalEndpoint, parseLanguageList, estimateAudioDurationMs, resolveHttpTtsConfig } from '@/lib/voice/speech-adapters/http-engine'

describe('CRM contact identity', () => {
  it('normalizes Bangladeshi phone formats to one identity', () => {
    const a = contactIdentity({ phone: '01712345678' })
    const b = contactIdentity({ phone: '+8801712345678' })
    const c = contactIdentity({ phone: '+880 1712-345678' })
    expect(a.phone).toBe(b.phone)
    expect(b.phone).toBe(c.phone)
  })

  it('lowercases email so casing cannot hide a duplicate', () => {
    expect(contactIdentity({ email: 'Rahim@Example.COM ' }).email).toBe('rahim@example.com')
  })

  it('keeps an unparseable phone as-is rather than dropping it', () => {
    expect(contactIdentity({ phone: '+447700900123' }).phone).toBe('+447700900123')
  })
})

describe('CSV parsing', () => {
  it('handles quotes, embedded commas and newlines', () => {
    const csv = 'first_name,email,phone\n"Rahim, Jr.",rahim@x.com,01712345678\n"Multi\nLine",a@b.com,1'
    const result = parseCsv(csv)
    expect(result.headers).toEqual(['first_name', 'email', 'phone'])
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].first_name).toBe('Rahim, Jr.')
    expect(result.rows[1].first_name).toBe('Multi\nLine')
  })

  it('handles doubled quotes', () => {
    const result = parseCsv('name\n"He said ""hi"""')
    expect(result.rows[0].name).toBe('He said "hi"')
  })

  it('reports an unterminated quote instead of silently truncating', () => {
    const result = parseCsv('name\n"unclosed')
    expect(result.errors.some((e) => e.includes('unterminated'))).toBe(true)
  })

  it('reports an empty file', () => {
    expect(parseCsv('').errors.length).toBeGreaterThan(0)
  })

  it('skips blank lines', () => {
    const result = parseCsv('a,b\n1,2\n\n\n3,4')
    expect(result.rows).toHaveLength(2)
  })
})

const conversation = [
  { speaker: 'agent', text: 'আসসালামু আলাইকুম। আমি এআই অ্যাসিস্ট্যান্ট, এই কলটি রেকর্ড করা হচ্ছে।' },
  { speaker: 'customer', text: 'আমার অর্ডার কোথায়? ডেলিভারি কখন আসবে?' },
  { speaker: 'customer', text: 'দাম অনেক বেশি মনে হচ্ছে।' },
  { speaker: 'agent', text: 'আমি বিস্তারিত ইমেইল করে পাঠিয়ে দিচ্ছি।' },
]

describe('call intelligence', () => {
  it('detects intents with quoted evidence', () => {
    const intents = detectIntents(conversation)
    expect(intents.map((i) => i.value)).toContain('order_status')
    expect(intents.every((i) => i.evidence.length > 0)).toBe(true)
    expect(intents.every((i) => i.confidence > 0 && i.confidence < 0.9)).toBe(true)
    expect(intents[0].evidence[0].segmentIndex).toBeGreaterThanOrEqual(0)
  })

  it('never reports an intent without evidence', () => {
    const empty = detectIntents([{ speaker: 'customer', text: 'আকাশ নীল' }])
    expect(empty).toEqual([])
  })

  it('detects objections and action items in Bangla first person', () => {
    expect(detectObjections(conversation).map((o) => o.label)).toContain('Price too high')
    expect(detectActionItems(conversation).map((a) => a.label)).toContain('Send details / quotation')
  })

  it('returns neutral with zero confidence when there is no tone signal', () => {
    const sentiment = estimateSentiment([{ text: 'আকাশ নীল' }])
    expect(sentiment.label).toBe('neutral')
    expect(sentiment.confidence).toBe(0)
    expect(sentiment.disclaimer).toContain('not a measurement')
  })

  it('reports negative tone when the only signal is an objection', () => {
    // No positive trigger appears in this conversation, so "negative" is the
    // honest result — a thank-you elsewhere must not neutralise a complaint.
    const sentiment = estimateSentiment(conversation)
    expect(sentiment.label).toBe('negative')
    expect(sentiment.evidence.length).toBeGreaterThan(0)
  })

  it('marks mixed tone only when both polarities really appear', () => {
    const mixed = estimateSentiment([
      { text: 'দাম অনেক বেশি মনে হচ্ছে।' },
      { text: 'তবুও সার্ভিস খুব ভালো, ধন্যবাদ।' },
    ])
    expect(mixed.label).toBe('mixed')
    expect(mixed.evidence.length).toBeGreaterThanOrEqual(2)
  })

  it('scores quality from explainable checks', () => {
    const quality = scoreConversationQuality({
      segments: conversation,
      handoffRequested: true,
      handoffPerformed: false,
      disposition: 'answered',
      hasTranscript: true,
    })
    expect(quality.score).toBeGreaterThan(0)
    expect(quality.checks.find((c) => c.name === 'handoff_honored')?.passed).toBe(false)
    expect(quality.checks).toHaveLength(5)
  })

  it('surfaces repeated topics only across multiple calls', () => {
    const repeated = detectRepeatedTopics([
      { callSessionId: 'c1', segments: [{ text: 'দাম কত?' }] },
      { callSessionId: 'c2', segments: [{ text: 'দাম কত বলুন' }] },
      { callSessionId: 'c3', segments: [{ text: 'ডেলিভারি কখন?' }] },
    ], { minCalls: 2 })
    expect(repeated.map((r) => r.intent)).toContain('pricing')
    expect(repeated.map((r) => r.intent)).not.toContain('order_status')
  })
})

describe('omnichannel', () => {
  it('groups the same customer across phone formats into one thread', () => {
    expect(threadKeyFor('whatsapp', '+880 1712-345678')).toBe(threadKeyFor('whatsapp', '01712345678'))
  })

  it('does not merge different channels for the same number', () => {
    expect(threadKeyFor('whatsapp', '01712345678')).not.toBe(threadKeyFor('sms', '01712345678'))
  })

  it('lowercases email threads', () => {
    expect(threadKeyFor('email', 'Rahim@Example.com')).toBe('email:rahim@example.com')
  })

  it('reports missing template variables instead of blanking them', () => {
    const result = renderTemplate('আসসালামু আলাইকুম {{name}}, আপনার অর্ডার {{orderId}} পাঠানো হয়েছে।', { name: 'রহিম' })
    expect(result.text).toContain('রহিম')
    expect(result.text).toContain('{{orderId}}')
    expect(result.missing).toEqual(['orderId'])
  })

  it('extracts unique declared variables', () => {
    expect(extractTemplateVariables('{{a}} {{b}} {{a}}')).toEqual(['a', 'b'])
  })
})

describe('speech engine configuration', () => {
  it('is unconfigured by default — no silent fake engine', () => {
    expect(resolveHttpTtsConfig({ NODE_ENV: 'test' })).toBeNull()
    expect(resolveHttpTtsConfig({ NODE_ENV: 'test',  VOICE_TTS_PROVIDER: 'openai' })).toBeNull()
  })

  it('marks loopback and private hosts as local inference', () => {
    expect(isLocalEndpoint('http://127.0.0.1:8880/v1')).toBe(true)
    expect(isLocalEndpoint('http://192.168.1.20:8000/v1')).toBe(true)
    expect(isLocalEndpoint('https://api.example.com/v1')).toBe(false)
  })

  it('defaults Bangla first and parses extra languages', () => {
    expect(parseLanguageList(undefined)).toEqual(['bn-BD'])
    expect(parseLanguageList('bn-BD, en-US ,hi-IN')).toEqual(['bn-BD', 'en-US', 'hi-IN'])
  })

  it('estimates WAV/MP3 duration from byte length', () => {
    expect(estimateAudioDurationMs(48_044, 'wav')).toBe(1000)
    expect(estimateAudioDurationMs(8_000, 'mp3')).toBe(1000)
    expect(estimateAudioDurationMs(0, 'mp3')).toBe(0)
  })

  it('converts verbose ASR JSON without inventing confidence', () => {
    const withScores = asrResultFromVerbose({
      text: 'হ্যালো',
      language: 'bengali',
      duration: 2.5,
      segments: [{ start: 0, end: 1.2, text: 'হ্যালো', avg_logprob: Math.log(0.8) }],
    }, 'bn-BD', 'test')
    expect(withScores.language).toBe('bengali')
    expect(withScores.segments[0].confidence).toBeCloseTo(0.8, 1)
    expect(withScores.simulated).toBe(false)

    const withoutScores = asrResultFromVerbose({ text: 'x', segments: [{ start: 0, end: 1, text: 'x' }] }, 'bn-BD', 'test')
    expect(withoutScores.confidence).toBe(0)
    expect(withoutScores.segments[0].confidence).toBeUndefined()
  })
  describe('Bangla negation and evidence hygiene', () => {
    it('never scores "অসন্তুষ্ট" (dissatisfied) as positive praise', () => {
      const result = estimateSentiment([
        { speaker: 'customer', text: 'আমার বিল ভুল হয়েছে, এটা খুব খারাপ সেবা, আমি অসন্তুষ্ট এবং রাগান্বিত' },
      ]);
      expect(result.label).toBe('negative');
      expect(result.evidence.length).toBeGreaterThan(0);
    });

    it('treats English "unsatisfied" as negative, not satisfied', () => {
      const result = estimateSentiment([{ speaker: 'customer', text: 'I am unsatisfied with this terrible service' }]);
      expect(result.label).toBe('negative');
    });

    it('still reports genuine praise as positive', () => {
      const result = estimateSentiment([{ speaker: 'customer', text: 'সেবা পেয়ে আমি খুব সন্তুষ্ট, ধন্যবাদ' }]);
      expect(result.label).toBe('positive');
    });

    it('requires a second, positive segment before calling a complaint-filled call mixed', () => {
      const result = estimateSentiment([
        { speaker: 'customer', text: 'সেবা পেয়ে আমি খুব সন্তুষ্ট, ধন্যবাদ' },
        { speaker: 'agent', text: 'কিন্তু ডেলিভারি খুব খারাপ ছিল' },
      ]);
      expect(result.label).toBe('mixed');
      // One quote per segment — the same sentence must never be double-counted.
      const indexes = result.evidence.map((e) => e.segmentIndex);
      expect(new Set(indexes).size).toBe(indexes.length);
    });

    it('does not duplicate evidence when several lexicons hit one sentence', () => {
      const result = estimateSentiment([
        { speaker: 'customer', text: 'দাম অনেক বেশি, এটা খুব খারাপ, আমি অসন্তুষ্ট' },
      ]);
      const indexes = result.evidence.map((e) => e.segmentIndex);
      expect(new Set(indexes).size).toBe(indexes.length);
      expect(result.label).toBe('negative');
    });

    it('stays neutral on text with no sentiment signal at all', () => {
      const result = estimateSentiment([{ speaker: 'agent', text: 'আজ আবহাওয়া মেঘলা' }]);
      expect(result.label).toBe('neutral');
      expect(result.confidence).toBe(0);
    });
  });

})
