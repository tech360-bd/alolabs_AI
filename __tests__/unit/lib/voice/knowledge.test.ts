import { describe, it, expect } from 'vitest'
import { parseKnowledgeScope, knowledgeBlockForPrompt } from '@/lib/voice/knowledge'

describe('parseKnowledgeScope', () => {
  it('parses a plain id array', () => {
    expect(parseKnowledgeScope('["col1","col2"]')).toEqual(['col1', 'col2'])
  })

  it('accepts the { collections: [...] } wrapper shape', () => {
    expect(parseKnowledgeScope('{"collections":["col1"]}')).toEqual(['col1'])
  })

  it('drops non-strings and empties, caps at 20 entries', () => {
    const ids = Array.from({ length: 30 }, (_, i) => `col${i}`)
    const parsed = parseKnowledgeScope(JSON.stringify([null, 42, '', ...ids]))
    expect(parsed).toHaveLength(20)
    expect(parsed[0]).toBe('col0')
  })

  it('returns [] for null, invalid JSON and non-array shapes', () => {
    expect(parseKnowledgeScope(null)).toEqual([])
    expect(parseKnowledgeScope('not-json')).toEqual([])
    expect(parseKnowledgeScope('{"a":1}')).toEqual([])
  })
})

describe('knowledgeBlockForPrompt', () => {
  it('returns empty string with no snippets', () => {
    expect(knowledgeBlockForPrompt([])).toBe('')
  })

  it('labels each snippet with its source and instructs the model to stay inside the facts', () => {
    const block = knowledgeBlockForPrompt([{ source: 'pricing.pdf', text: 'Pro plan costs 500 BDT/month' }])
    expect(block).toContain('[pricing.pdf]')
    expect(block).toContain('Pro plan costs 500 BDT/month')
    expect(block).toContain('do NOT go beyond them')
  })

  it('is bounded by maxChars', () => {
    const snippets = Array.from({ length: 20 }, (_, i) => ({ source: `s${i}`, text: 'x'.repeat(300) }))
    const block = knowledgeBlockForPrompt(snippets, 1000)
    expect(block.length).toBeLessThanOrEqual(1000 + 200) // header + last-line tolerance
    expect(block).toContain('[s0]')
  })

  it('truncates individual snippets over 400 chars', () => {
    const block = knowledgeBlockForPrompt([{ source: 'doc', text: 'y'.repeat(900) }])
    expect(block).toContain('…')
    expect(block.length).toBeLessThan(600)
  })
})
