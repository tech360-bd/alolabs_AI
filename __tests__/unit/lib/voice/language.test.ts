import { describe, it, expect } from 'vitest'
import { detectLanguage, replyLanguageFor, baseLanguage } from '@/lib/voice/language'

describe('voice language detection (bn/en/mixed)', () => {
  it('detects pure Bangla', () => {
    const d = detectLanguage('আমার অর্ডারটি কবে পৌঁছাবে?')
    expect(d.language).toBe('bn-BD')
    expect(d.banglaRatio).toBe(1)
    expect(d.confidence).toBeGreaterThan(0.5)
  })

  it('detects pure English', () => {
    const d = detectLanguage('When will my order arrive?')
    expect(d.language).toBe('en-US')
    expect(d.romanized).toBe(false)
  })

  it('detects Bangla-English code-switching as mixed', () => {
    const d = detectLanguage('আমার meeting টা কবে হবে?')
    expect(d.language).toBe('mixed')
    expect(d.banglaRatio).toBeGreaterThan(0.2)
    expect(d.banglaRatio).toBeLessThan(0.8)
  })

  it('flags romanized Bangla instead of pretending to detect it', () => {
    const d = detectLanguage('amar order ta kobe ashbe')
    expect(d.language).toBe('en-US')
    expect(d.romanized).toBe(true)
  })

  it('does not flag plain English as romanized', () => {
    const d = detectLanguage('please check the schedule tomorrow')
    expect(d.romanized).toBe(false)
  })

  it('returns low-confidence defaults for digit/punctuation-only input', () => {
    const d = detectLanguage('12345 !!!')
    expect(d.language).toBe('en-US')
    expect(d.confidence).toBe(0)
  })

  it('handles empty and non-string input honestly', () => {
    expect(detectLanguage('').letterCount).toBe(0)
    expect(detectLanguage(undefined as unknown as string).language).toBe('en-US')
  })

  it('replyLanguageFor keeps mixed conversation on the mixed-capable channel', () => {
    const mixed = detectLanguage('আমার meeting টা কবে?')
    expect(replyLanguageFor(mixed, 'bn-BD')).toBe('mixed')
    expect(replyLanguageFor(mixed, 'en-US')).toBe('en-US')
    const bn = detectLanguage('শুধু বাংলা')
    expect(replyLanguageFor(bn, 'bn-BD')).toBe('bn-BD')
  })

  it('baseLanguage strips the region tag', () => {
    expect(baseLanguage('bn-BD')).toBe('bn')
    expect(baseLanguage('en-US')).toBe('en')
  })
})
