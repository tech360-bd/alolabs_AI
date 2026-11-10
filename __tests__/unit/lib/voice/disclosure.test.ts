import { describe, it, expect } from 'vitest'
import {
  buildOpeningGreeting,
  greetingContainsDisclosure,
  AI_DISCLOSURE,
} from '@/lib/voice/disclosure'

describe('AI identity disclosure (master prompt §07/§19)', () => {
  it('prepends the Bangla disclosure to a greeting lacking one', () => {
    const r = buildOpeningGreeting({ greeting: 'আসসালামু আলাইকুম! কীভাবে সাহায্য করতে পারি?', agentLanguage: 'bn-BD' })
    expect(r.disclosureIncluded).toBe(true)
    expect(r.text.startsWith(AI_DISCLOSURE['bn-BD'])).toBe(true)
    expect(r.text).toContain('আসসালামু আলাইকুম')
  })

  it('prepends the English disclosure for English calls', () => {
    const r = buildOpeningGreeting({ greeting: 'Hello, how can I help?', detectedLanguage: 'en-US' })
    expect(r.text.startsWith(AI_DISCLOSURE['en-US'])).toBe(true)
    expect(r.language).toBe('en-US')
  })

  it('never duplicates the disclosure when the greeting already has one', () => {
    const greeting = `${AI_DISCLOSURE['bn-BD']} স্বাগতম!`
    const r = buildOpeningGreeting({ greeting, agentLanguage: 'bn-BD' })
    expect(r.text).toBe(greeting)
    expect(greetingContainsDisclosure(r.text)).toBe(true)
  })

  it('uses a default greeting when none is configured', () => {
    const r = buildOpeningGreeting({ agentLanguage: 'bn-BD' })
    expect(r.text).toContain(AI_DISCLOSURE['bn-BD'])
    expect(r.text.length).toBeGreaterThan(AI_DISCLOSURE['bn-BD'].length + 5)
  })

  it('defaults to Bangla when the language is unknown', () => {
    const r = buildOpeningGreeting({})
    expect(r.language).toBe('bn-BD')
    expect(r.text).toContain('এআই')
  })

  it('treats common human-sounding greetings as lacking disclosure', () => {
    expect(greetingContainsDisclosure('হ্যালো, বলুন')).toBe(false)
    expect(greetingContainsDisclosure('Hi, this is John')).toBe(false)
  })
})
