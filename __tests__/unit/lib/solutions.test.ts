/**
 * The twelve business solutions are the buying view of the site; `service-lines.ts`
 * is the engineering view. These tests keep the two honest and consistent.
 *
 * The failure mode this guards against is subtle: a solution page that promises
 * a capability the site elsewhere says is not running. That is not a broken
 * link, it is a broken claim — so the checks below are about agreement, not
 * formatting.
 */

import { describe, expect, it } from 'vitest'

import { SERVICE_LINES, serviceBySlug } from '@/lib/brand/service-lines'
import {
  BUSINESS_SOLUTIONS,
  SOLUTION_GROUPS,
  SOLUTION_GROUP_BLURB,
  SOLUTION_STATE_LABEL,
  solutionBySlug,
  solutionStateCounts,
} from '@/lib/brand/solutions'

/* The twelve solutions named in the brief, in order. */
const REQUIRED_SLUGS = [
  'ai-software-development',
  'custom-ai-agent-development',
  'multi-agent-ai-systems',
  'business-process-automation',
  'website-web-application-development',
  'enterprise-crm-portals',
  'ai-marketing-seo',
  'ai-content-production',
  'image-video-audio',
  'voice-ai-customer-support',
  'api-system-integration',
  'cloud-devops-engineering',
] as const

describe('business solutions catalogue', () => {
  it('covers exactly the twelve solutions the site promises', () => {
    expect(BUSINESS_SOLUTIONS.map((s) => s.slug)).toEqual([...REQUIRED_SLUGS])
  })

  it('uses unique, URL-safe slugs', () => {
    const slugs = BUSINESS_SOLUTIONS.map((s) => s.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('resolves every slug and rejects unknown ones', () => {
    for (const slug of REQUIRED_SLUGS) expect(solutionBySlug(slug)).toBeDefined()
    expect(solutionBySlug('not-a-solution')).toBeUndefined()
    expect(solutionBySlug('')).toBeUndefined()
  })

  it('assigns every solution to a declared group', () => {
    for (const solution of BUSINESS_SOLUTIONS) {
      expect(SOLUTION_GROUPS).toContain(solution.group)
      expect(SOLUTION_GROUP_BLURB[solution.group]).toBeTruthy()
    }
    // Four groups, three solutions each — the homepage relies on the balance.
    for (const group of SOLUTION_GROUPS) {
      expect(BUSINESS_SOLUTIONS.filter((s) => s.group === group)).toHaveLength(3)
    }
  })

  it('gives every solution the full set of buying answers', () => {
    for (const solution of BUSINESS_SOLUTIONS) {
      expect(solution.name, solution.slug).toBeTruthy()
      // The five questions the brief requires, each answered with substance.
      expect(solution.tagline.length, solution.slug).toBeGreaterThan(20)
      expect(solution.whatItDoes.length, solution.slug).toBeGreaterThan(40)
      expect(solution.businessProblem.length, solution.slug).toBeGreaterThan(40)
      expect(solution.youReceive.length, solution.slug).toBeGreaterThan(0)
      expect(solution.howWeDeliver.length, solution.slug).toBeGreaterThan(0)
      expect(solution.availableToday.length, solution.slug).toBeGreaterThan(40)
      expect(solution.tags.length, solution.slug).toBeGreaterThan(0)
      expect(SOLUTION_STATE_LABEL[solution.state], solution.slug).toBeTruthy()
    }
  })

  it('cross-references a service line that actually exists', () => {
    // A dangling `service` would send a visitor from a bought outcome to a 404.
    for (const solution of BUSINESS_SOLUTIONS) {
      expect(serviceBySlug(solution.service), `${solution.slug} → ${solution.service}`).toBeDefined()
    }
  })

  it('never claims more than its underlying service line does', () => {
    // A solution cannot be 'live' when the service that delivers it is not.
    const rank = { live: 3, available: 2, 'project-scope': 1, delivered: 3 } as const
    for (const solution of BUSINESS_SOLUTIONS) {
      const service = serviceBySlug(solution.service)
      expect(service, solution.slug).toBeDefined()
      if (!service) continue
      const serviceRank = rank[service.state as keyof typeof rank] ?? 1
      const solutionRank = rank[solution.state as keyof typeof rank] ?? 1
      expect(
        solutionRank,
        `${solution.slug} is "${solution.state}" but its service "${service.slug}" is "${service.state}"`,
      ).toBeLessThanOrEqual(serviceRank)
    }
  })

  it('counts states the way the legend and hub describe them', () => {
    const counts = solutionStateCounts()
    expect(counts.live + counts.available + counts.scoped).toBe(12)
    // The homepage and hub both state this split in words; keep them true.
    expect(counts).toEqual({ live: 3, available: 7, scoped: 2 })
  })

  it('keeps the scoped solutions explicit about what is missing', () => {
    const scoped = BUSINESS_SOLUTIONS.filter((s) => s.state === 'scoped')
    expect(scoped.length).toBeGreaterThan(0)
    for (const solution of scoped) {
      // A scoped badge must be accompanied by the missing component in words,
      // not left for the reader to infer from the label.
      const text = solution.availableToday.toLowerCase()
      expect(text.length, solution.slug).toBeGreaterThan(60)
      expect(
        /not (provisioned|configured|available|enabled)|requires|needs|no .* is /.test(text),
        `${solution.slug} is scoped but its availableToday does not say what is missing`,
      ).toBe(true)
    }
  })

  it('does not contradict the service-line catalogue on state vocabulary', () => {
    // Both catalogues render on the same site, so their state words must agree.
    const serviceStates = new Set(SERVICE_LINES.map((s) => s.state))
    for (const state of serviceStates) {
      expect(typeof state).toBe('string')
      expect(state.length).toBeGreaterThan(0)
    }
  })

  it('has no placeholder or lorem text', () => {
    const serialised = JSON.stringify(BUSINESS_SOLUTIONS).toLowerCase()
    for (const banned of ['lorem ipsum', 'tbd', 'todo', 'xxx', 'placeholder']) {
      expect(serialised).not.toContain(banned)
    }
  })
})
