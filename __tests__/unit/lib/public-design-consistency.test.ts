/**
 * Design-system consistency across the public site.
 *
 * WHY THIS EXISTS
 * ---------------
 * The public site drifted into two visual identities without anyone noticing.
 * The homepage, solutions, projects, services, platform and every conversion
 * route are dark (`.ag-*`); About, How-we-work and Careers were still the old
 * light system — different logo lockup ("AI & SOFTWARE" vs "AGENTOS"), different
 * palette, different navigation. A visitor clicking "About" in the dark header
 * landed on something that looked like a different company's website.
 *
 * That is invisible to unit tests of individual components and to any amount of
 * HTML inspection, because both pages are individually "fine". It only shows up
 * when you compare them, or look at them. This test compares them.
 */

import { describe, expect, it } from 'vitest'

import { SELF_CHROMED_PAGES, isSelfChromePage } from '@/lib/access/surfaces'

/** Public pages that must render on the dark AgentOS design system. */
const MUST_BE_DARK = [
  '/site/about',
  '/site/careers',
  '/site/how-we-work',
  '/site/solutions',
  '/site/projects',
  '/site/services',
  '/site/platform-overview',
  '/site/contact',
  '/site/start-a-project',
  '/site/request-a-solution',
  '/site/book-a-consultation',
] as const

describe('public design-system consistency', () => {
  it.each(MUST_BE_DARK)('%s is registered as self-chromed', (path) => {
    // Self-chromed pages render their own DarkHeader/DarkFooter and are skipped
    // by the light /site layout. Anything missing here gets the light chrome
    // wrapped around a dark component — two navigation bars, two identities.
    expect(SELF_CHROMED_PAGES).toContain(path)
    expect(isSelfChromePage(path)).toBe(true)
  })

  it('keeps the legal pages on their own chrome', () => {
    // Terms/Privacy are deliberately excluded for now: they are still light and
    // are a separate migration. Pinning it here means the inconsistency is
    // recorded rather than forgotten — when they move, update this test.
    expect(isSelfChromePage('/site/terms')).toBe(false)
    expect(isSelfChromePage('/site/privacy')).toBe(false)
  })

  it('matches nested routes under a dark page too', () => {
    expect(isSelfChromePage('/site/solutions/ai-software-development')).toBe(true)
    expect(isSelfChromePage('/site/projects/agentos')).toBe(true)
  })
})
