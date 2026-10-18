import { describe, expect, it } from 'vitest'
import { isKnowledgeVisibleToCompany } from '@/lib/tenant-knowledge'

describe('tenant knowledge visibility', () => {
  const companyId = 'company-current'

  it('allows a department node only after the department is independently tenant-verified', () => {
    expect(isKnowledgeVisibleToCompany('{}', companyId, true)).toBe(true)
    expect(isKnowledgeVisibleToCompany('{}', companyId, false)).toBe(false)
  })

  it('requires an exact company owner match for explicitly owned knowledge', () => {
    expect(isKnowledgeVisibleToCompany(JSON.stringify({ companyId }), companyId, false)).toBe(true)
    expect(isKnowledgeVisibleToCompany(JSON.stringify({ companyId: 'company-other' }), companyId, false)).toBe(false)
  })

  it('allows explicitly public or global unowned knowledge', () => {
    expect(isKnowledgeVisibleToCompany(JSON.stringify({ visibility: 'public' }), companyId, false)).toBe(true)
    expect(isKnowledgeVisibleToCompany(JSON.stringify({ scope: 'global' }), companyId, false)).toBe(true)
    expect(isKnowledgeVisibleToCompany(JSON.stringify({ isPublic: true }), companyId, false)).toBe(true)
  })

  it('does not let public flags override a foreign explicit owner', () => {
    expect(isKnowledgeVisibleToCompany(JSON.stringify({ companyId: 'company-other', visibility: 'public' }), companyId, true)).toBe(false)
  })

  it('fails closed for unowned and malformed legacy metadata', () => {
    expect(isKnowledgeVisibleToCompany('{}', companyId, false)).toBe(false)
    expect(isKnowledgeVisibleToCompany('not-json', companyId, false)).toBe(false)
  })
})
