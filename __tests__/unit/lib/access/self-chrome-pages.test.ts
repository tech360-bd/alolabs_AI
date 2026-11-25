/**
 * The dark marketing pages carry their own header and footer, so /site/layout
 * must not wrap them in the light publication chrome. Before this existed the
 * services index rendered two navigation bars stacked vertically.
 *
 * These tests pin the classification in both directions: self-chromed pages are
 * recognised, and ordinary /site pages still get the shared chrome.
 */

import { describe, expect, it } from 'vitest'

import { SELF_CHROMED_PAGES, isInternalPagePath, isSelfChromePage } from '@/lib/access/surfaces'

describe('isSelfChromePage', () => {
  it.each([
    '/site/services',
    '/site/platform-overview',
    '/site/contact',
    '/site/solutions',
    '/site/projects',
    '/site/start-a-project',
    '/site/request-a-solution',
    '/site/book-a-consultation',
    // Company pages, rebuilt on the dark AgentOS system.
    '/site/about',
    '/site/how-we-work',
    '/site/careers',
  ])('treats %s as carrying its own chrome', (path) => {
    expect(isSelfChromePage(path)).toBe(true)
  })

  it('matches nested paths under a self-chromed route', () => {
    expect(isSelfChromePage('/site/services/ai-agent-development')).toBe(true)
    expect(isSelfChromePage('/site/services/voice-conversational-ai')).toBe(true)
    // Detail pages inherit the chrome of their index.
    expect(isSelfChromePage('/site/solutions/custom-ai-agent-development')).toBe(true)
    expect(isSelfChromePage('/site/projects/agentos')).toBe(true)
  })

  it('leaves the other /site pages on the shared chrome', () => {
    expect(isSelfChromePage('/site/privacy')).toBe(false)
    expect(isSelfChromePage('/site/terms')).toBe(false)
    expect(isSelfChromePage('/')).toBe(false)
    expect(isSelfChromePage('')).toBe(false)
  })

  it('does not match a route that merely shares a prefix string', () => {
    // "/site/services-directory" is not "/site/services".
    expect(isSelfChromePage('/site/services-directory')).toBe(false)
    expect(isSelfChromePage('/site/contact-us')).toBe(false)
    expect(isSelfChromePage('/site/project-planner')).toBe(false)
    // The internal engineering reference is not the public overview page.
    expect(isSelfChromePage('/site/platform')).toBe(false)
  })

  it('only lists public paths, never internal ones', () => {
    for (const path of SELF_CHROMED_PAGES) {
      expect(isInternalPagePath(path)).toBe(false)
    }
  })
})
