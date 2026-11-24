/**
 * Regression tests for the published case studies.
 *
 * The brief is explicit that this site must never invent clients, metrics or
 * testimonials. These tests enforce that mechanically, because the cheapest way
 * to break that promise later is for someone to add "trusted by 200+ companies"
 * to a project summary and never notice.
 */

import { describe, expect, it } from 'vitest'

import { PROJECT_STATE_LABEL, SHOWCASE_PROJECTS, UNPUBLISHED_CANDIDATES, projectBySlug } from '@/lib/brand/projects'

const PUBLISHED_SLUGS = ['agentos', 'client-portal', 'public-website'] as const

describe('project showcase', () => {
  it('publishes exactly the three verifiable builds', () => {
    expect(SHOWCASE_PROJECTS.map((p) => p.slug)).toEqual([...PUBLISHED_SLUGS])
  })

  it('resolves every published slug and rejects unknown ones', () => {
    for (const slug of PUBLISHED_SLUGS) expect(projectBySlug(slug)).toBeDefined()
    expect(projectBySlug('alo-education-crm')).toBeUndefined()
    expect(projectBySlug('alo-english-ai')).toBeUndefined()
  })

  it('answers every question the brief asks of a case study', () => {
    for (const project of SHOWCASE_PROJECTS) {
      expect(project.name, project.slug).toBeTruthy()
      expect(project.summary.length, project.slug).toBeGreaterThan(40)
      expect(project.kind, project.slug).toBeTruthy()
      expect(project.problem.length, project.slug).toBeGreaterThan(60)
      expect(project.architecture.length, project.slug).toBeGreaterThan(1)
      expect(project.implementation.length, project.slug).toBeGreaterThan(1)
      expect(project.surfaces.length, project.slug).toBeGreaterThan(0)
      expect(project.stack.length, project.slug).toBeGreaterThan(0)
      expect(project.links.length, project.slug).toBeGreaterThan(0)
      expect(PROJECT_STATE_LABEL[project.state], project.slug).toBeTruthy()
    }
  })

  it('backs every verified claim with a stated basis', () => {
    for (const project of SHOWCASE_PROJECTS) {
      expect(project.verified.length, project.slug).toBeGreaterThan(0)
      for (const evidence of project.verified) {
        expect(evidence.claim.length, project.slug).toBeGreaterThan(10)
        // A claim without a "where you could check this" is an assertion, not
        // evidence — the UI renders this line directly under the claim.
        expect(evidence.basis.length, `${project.slug}: ${evidence.claim}`).toBeGreaterThan(30)
      }
    }
  })

  it('shows what is not finished instead of hiding it', () => {
    for (const project of SHOWCASE_PROJECTS) {
      expect(project.notYet.length, `${project.slug} hides its limits`).toBeGreaterThan(0)
    }
  })

  it('never claims a metric, testimonial or client count', () => {
    const text = JSON.stringify(SHOWCASE_PROJECTS).toLowerCase()
    // Note: "testimonials" does appear — inside the sentence stating that none
    // have been granted. The ban is on attributing a quote to a person, not on
    // the word, so that case is checked by the pattern below instead.
    const banned = [
      'trusted by',
      'clients worldwide',
      'fortune 500',
      'roi of',
      '% increase',
      'revenue grew',
      'said: "',
      'lorem ipsum',
    ]
    for (const phrase of banned) expect(text, `case studies must not contain "${phrase}"`).not.toContain(phrase)
    // No quote attributed to a named person, e.g. `— Jane Doe, CTO`.
    expect(text).not.toMatch(/[—–-]\s*[a-z]+ [a-z]+, (cto|ceo|founder|director|manager)/)
    // No fabricated percentage improvements either.
    expect(text).not.toMatch(/\b\d{2,3}\s?%\s?(increase|improvement|faster|more|growth)/)
  })

  it('uses only real, safe link targets', () => {
    for (const project of SHOWCASE_PROJECTS) {
      for (const link of project.links) {
        expect(link.label, project.slug).toBeTruthy()
        if (link.external) {
          expect(link.href, project.slug).toMatch(/^https:\/\//)
        } else {
          // Absolute internal paths only — no relative or javascript: targets.
          // /login is legitimate here: the client portal is behind auth, and
          // the case study links to it rather than pretending to show its data.
          expect(link.href, project.slug).toMatch(/^\/(site|api|login)\b/)
        }
      }
    }
  })

  it('explains why the brief-named projects are not published', () => {
    const names = UNPUBLISHED_CANDIDATES.map((c) => c.name)
    expect(names).toContain('ALO Education CRM')
    expect(names).toContain('ALO English AI')
    for (const candidate of UNPUBLISHED_CANDIDATES) {
      // "Not published" is only honest if it carries a reason.
      expect(candidate.status, candidate.name).toBeTruthy()
      expect(candidate.reason.length, candidate.name).toBeGreaterThan(60)
    }
  })
})
