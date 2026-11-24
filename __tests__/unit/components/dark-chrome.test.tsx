/**
 * Regression tests for the dark-site header, written after a real browser
 * defect: on mobile the menu was an in-flow block below the sticky bar, so its
 * own top edge covered the logo and put the close button on top of the brand
 * mark. It only became visible in a rendered screenshot, which is exactly why
 * it is worth pinning here.
 *
 * These are structural assertions on the rendered markup and the scoped styles,
 * not snapshot tests — a snapshot would happily encode the broken layout.
 */

import { render } from '@testing-library/react'
import type { CSSProperties } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

/*
 * The shared test setup stubs IntersectionObserver with a plain factory, which
 * next/image calls as a constructor and throws on. Give it a real class for this
 * file, and drop the `priority` prop so React does not warn about it in the DOM.
 */
beforeAll(() => {
  class IO {
    constructor(_cb: unknown) {}
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  }
  vi.stubGlobal('IntersectionObserver', IO)
})

const push = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}))
vi.mock('next/image', () => ({
  // next/image needs a configured loader; a plain img keeps the DOM assertable.
  // The props are typed loosely on purpose — this is a stand-in for next/image,
  // and `priority` is dropped rather than forwarded to the DOM.
  default: ({ priority: _priority, ...props }: { priority?: boolean; [key: string]: unknown }) => {
    const { src, alt, width, height, style } = props as {
      src?: string
      alt?: string
      width?: number
      height?: number
      style?: CSSProperties
    }
    return <img src={src ?? ''} alt={alt ?? ''} width={width} height={height} style={style} />
  },
}))

const { DarkHeader, DarkFooter } = await import('@/components/agentos/dark-chrome')

describe('dark header', () => {
  it('renders a skip link as the first focusable element', () => {
    const { container } = render(<DarkHeader />)
    const first = container.querySelector('a')
    expect(first?.getAttribute('href')).toBe('#main')
    expect(first?.textContent).toContain('Skip to content')
  })

  it('exposes the primary nav and a labelled mobile nav container', () => {
    const { container } = render(<DarkHeader />)
    expect(container.querySelector('nav[aria-label="Primary"]')).toBeTruthy()
  })

  it('gives the menu button an accessible name and expanded state', () => {
    const { container } = render(<DarkHeader />)
    const btn = container.querySelector('button[aria-expanded]')
    expect(btn).toBeTruthy()
    expect(btn?.getAttribute('aria-expanded')).toBe('false')
    expect(btn?.getAttribute('aria-label')).toBe('Open menu')
    expect(btn?.getAttribute('aria-controls')).toBe('ag-mobile-nav')
    // Hidden on desktop by the scoped media query, shown under 980px.
    expect(container.innerHTML).toContain('.ag-menu-btn { display: inline-flex; }')
  })

  it('keeps the header bar above the mobile sheet, and the sheet below the bar', () => {
    const { container } = render(<DarkHeader />)
    const css = container.querySelector('style')?.textContent ?? ''
    const header = container.querySelector('header') as HTMLElement
    // The bar must form its own stacking context, or the fixed sheet covers it.
    expect(header?.style.isolation).toBe('isolate')
    // The sheet is anchored under the 70px bar rather than overlapping it.
    expect(css).toContain('position: fixed')
    expect(css).toContain('top: 70px')
  })

  it('does not hold the mobile sheet open over the page', () => {
    const { container } = render(<DarkHeader />)
    // Closed by default: no panel in the DOM until it is opened.
    expect(container.querySelector('#ag-mobile-nav')).toBeNull()
  })

  it('labels the brand link for screen readers instead of relying on the logo', () => {
    const { container } = render(<DarkHeader />)
    const brand = container.querySelector('a[aria-label="ALO Labs — home"]')
    expect(brand).toBeTruthy()
  })
})

describe('dark footer', () => {
  it('publishes the six required groups plus a legal row', () => {
    const { container } = render(<DarkFooter />)
    const html = container.textContent ?? ''
    for (const group of ['Company', 'Services', 'AgentOS', 'Projects', 'Resources']) {
      expect(html, `footer is missing the ${group} group`).toContain(group)
    }
    for (const legal of ['Privacy Policy', 'Terms of Service', 'Contact']) {
      expect(html, `footer is missing ${legal}`).toContain(legal)
    }
    expect(container.querySelector('a[href="/site/privacy"]')).toBeTruthy()
    expect(container.querySelector('a[href="/site/terms"]')).toBeTruthy()
  })

  it('renders no social icons while no channel is verified', () => {
    const { container } = render(<DarkFooter />)
    // Guessing a handle would point the footer at somebody else's account, so
    // an empty row is the correct output until one is confirmed.
    const socials = container.querySelectorAll('a[aria-label*="on Facebook"], a[aria-label*="on Instagram"], a[aria-label*="on YouTube"], a[aria-label*="on Pinterest"]')
    expect(socials).toHaveLength(0)
  })

  it('links to the conversion routes from the footer', () => {
    const { container } = render(<DarkFooter />)
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/site/start-a-project')
  })
})
