import { describe, it, expect } from 'vitest'
import {
  PlaceholderTtsEngine,
  PlaceholderAsrEngine,
  SpeechEngineUnavailableError,
  countTtsCharacters,
  engineSupportsLanguage,
  estimateSpeechDurationSeconds,
  resolveAsrEngine,
  resolveTtsEngine,
  registerAsrEngine,
  registerTtsEngine,
  type AsrEngine,
  type TtsEngine,
} from '@/lib/voice/speech'
import {
  RuleBasedResponder,
  buildStructuredOutcome,
  runConversationTurn,
  transcriptSegmentsFromHistory,
} from '@/lib/voice/orchestrator'

describe('speech engines — honest availability', () => {
  it('built-in local engines are placeholders that refuse to fake output', async () => {
    const tts = new PlaceholderTtsEngine()
    const asr = new PlaceholderAsrEngine()
    expect(tts.info.available).toBe(false)
    expect(asr.info.available).toBe(false)
    await expect(tts.synthesize({ text: 'hello', language: 'bn-BD' })).rejects.toThrow(SpeechEngineUnavailableError)
    await expect(asr.transcribe({ audioKey: 'k' })).rejects.toThrow(SpeechEngineUnavailableError)
  })

  it('placeholder TTS advertises NO voices (no fabricated voice list)', async () => {
    const voices = await new PlaceholderTtsEngine().voices()
    expect(voices).toEqual([])
  })

  it('registries return the placeholder with an honest unavailable error', async () => {
    const engine = resolveTtsEngine('local-tts')
    await expect(engine.synthesize({ text: 'x', language: 'bn-BD' })).rejects.toThrow(
      /no local TTS model is deployed/,
    )
  })

  it('supports registering real engines and language checks', async () => {
    const fakeTts: TtsEngine = {
      info: { id: 'test-tts', label: 'Test TTS', available: true, local: true, languages: ['bn-BD'], capabilities: ['tts'] },
      voices: async () => [{ id: 'v1', name: 'Voice One', language: 'bn-BD', gender: 'female', previewAvailable: false }],
      synthesize: async () => ({ audioKey: 'k', format: 'wav', durationSeconds: 2, characters: 10, simulated: false }),
    }
    registerTtsEngine(fakeTts)
    const resolved = resolveTtsEngine('test-tts')
    expect(resolved.info.available).toBe(true)
    expect(engineSupportsLanguage(fakeTts.info, 'bn-BD')).toBe(true)
    expect(engineSupportsLanguage(fakeTts.info, 'ar-SA')).toBe(false)

    const fakeAsr: AsrEngine = {
      info: { id: 'test-asr', label: 'Test ASR', available: true, local: true, languages: ['bn-BD'], capabilities: ['asr'] },
      transcribe: async () => ({ transcript: 'টেস্ট', segments: [], language: 'bn-BD', confidence: 0.9, durationSeconds: 2, simulated: false }),
    }
    registerAsrEngine(fakeAsr)
    expect((await resolveAsrEngine('test-asr').transcribe({ audioKey: 'k' })).transcript).toBe('টেস্ট')
  })

  it('meters Bangla text by code points', () => {
    expect(countTtsCharacters('')).toBe(0)
    expect(countTtsCharacters('abc')).toBe(3)
    expect(countTtsCharacters('আমি ভালো আছি')).toBe(countTtsCharacters('আমি ভালো আছি'))
    expect(countTtsCharacters('আমি ভালো আছি')).toBe(12) // code points incl. spaces
    expect(estimateSpeechDurationSeconds('one two three four')).toBeGreaterThan(0)
  })
})

describe('conversation orchestrator', () => {
  it('opens with the agent greeting on an empty utterance', async () => {
    const out = await runConversationTurn({
      companyId: 'c', callSessionId: 'x',
      agent: { name: 'Receptionist', language: 'bn-BD', greeting: 'নমস্কার!' },
    })
    expect(out.reply).toBe('নমস্কার!')
    expect(out.responder).toBe('rule-based')
  })

  it('mandatory handoff survives even a responder that tries to keep talking', async () => {
    const out = await runConversationTurn({
      companyId: 'c', callSessionId: 'x',
      utterance: 'I need to speak to a human representative now',
    })
    expect(out.handoff.handoff).toBe(true)
    expect(out.handoff.mandatory).toBe(true)
    expect(out.handoff.trigger).toBe('customer_requested_human')
  })

  it('asks for clarification at low ASR confidence instead of guessing', async () => {
    const out = await runConversationTurn({ companyId: 'c', callSessionId: 'x', utterance: 'মumble', asrConfidence: 0.2 })
    expect(out.reply).toContain('আবার')
    expect(out.handoff.handoff).toBe(false)
  })

  it('uses the configured fallback message, never invented answers', async () => {
    const out = await runConversationTurn({
      companyId: 'c', callSessionId: 'x', utterance: 'আমার বিল কত?',
      agent: { name: 'A', language: 'bn-BD', fallbackMessage: 'কাস্টম ফলব্যাক' },
    })
    expect(out.reply).toBe('কাস্টম ফলব্যাক')
  })

  it('rule-based responder never produces tool-success claims', async () => {
    const r = new RuleBasedResponder()
    for (const utterance of ['book me an appointment', 'what is the price?', 'টাকা ফেরত দাও']) {
      const res = await r.respond(
        { companyId: 'c', callSessionId: 'x', utterance },
        { handoff: false, mandatory: false, reason: 'test' },
      )
      const text = JSON.stringify(res).toLowerCase()
      expect(text).not.toMatch(/booked|confirmed success|appointment confirmed/)
    }
  })

  it('structured outcomes mark unconfirmed actions as not_confirmed', () => {
    const outcome = buildStructuredOutcome({
      intents: ['lead_qualified'],
      actions: [{ description: 'Create CRM task', confirmed: false }],
    })
    expect(outcome.actions[0].result).toMatchObject({ status: 'not_confirmed' })
  })
})

describe('transcript segments', () => {
  it('builds monotonic segments from history without inventing content', () => {
    const segs = transcriptSegmentsFromHistory([
      { role: 'agent', text: 'নমস্কার' },
      { role: 'customer', text: 'হ্যাঁ বলুন' },
    ])
    expect(segs).toHaveLength(2)
    expect(segs[0].speaker).toBe('agent')
    expect(segs[1].startMs).toBeGreaterThanOrEqual(segs[0].endMs)
  })
})
