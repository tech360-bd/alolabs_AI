/**
 * Component and route checks for this round's additions:
 * - the Icons living spec renders every icon and the showcase figure
 * - the terminal frame renders the mono `#` title and the terminal palette
 * - the marketing-kit API serves a template asset as JSON and as a download, and refuses traversal
 */

import { describe, it, expect, vi } from 'vitest'
import * as React from 'react'
import { render, within } from '@testing-library/react'
import { NextRequest } from 'next/server'

vi.mock('@/lib/api-auth', () => ({ requireAuth: async () => ({ id: 'test-user' }) }))

import { IconsSection } from '@/app/design/icons-section'
import { EditorialDiagram } from '@/components/diagrams/editorial-diagram'
import { DIAGRAM_ICONS } from '@/lib/diagram-design/icons.generated'
import { ICON_SHOWCASE } from '@/lib/diagram-design/icon-examples'
import { GET } from '@/app/api/marketing-kit/[slug]/route'

describe('Icons living spec', () => {
  it('renders every icon in the set plus the showcase figure', () => {
    const { container } = render(<IconsSection />)
    const icons = container.querySelectorAll('li [data-icon]')
    expect(icons.length).toBe(DIAGRAM_ICONS.length)
    expect(container.querySelector(`[data-diagram="${ICON_SHOWCASE.slug}"]`)).not.toBeNull()
    expect(container.textContent).toContain('87 monochrome icons')
  })
})

describe('terminal frame', () => {
  it('uses the mono title with a comment prefix and the terminal chrome', () => {
    const spec = { ...ICON_SHOWCASE, frame: 'terminal' as const, title: 'Request path' }
    const { container } = render(<EditorialDiagram spec={spec} />)
    const heading = container.querySelector('h3')!
    expect(heading.className).toContain('font-mono')
    expect(heading.textContent).toBe('# Request path')
    // Terminal skin: the figure's paper token is the fixed terminal paper, not the editorial light paper.
    expect(container.innerHTML).toContain('--dd-paper: #141414')
    expect(within(container).getByText(/diagram-design render --type/)).toBeTruthy()
  })
})

describe('marketing-kit API — template assets', () => {
  const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) })

  it('returns the creative review template as JSON', async () => {
    const res = await GET(
      new NextRequest('http://localhost/api/marketing-kit/ad-creative?asset=assets/creative-review-template.html'),
      ctx('ad-creative'),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.asset.path).toBe('assets/creative-review-template.html')
    expect(body.asset.content).toMatch(/<!DOCTYPE html>/i)
  })

  it('serves the same file as an attachment with nosniff for download', async () => {
    const res = await GET(
      new NextRequest(
        'http://localhost/api/marketing-kit/ad-creative?asset=assets/creative-review-template.html&download=1',
      ),
      ctx('ad-creative'),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="creative-review-template.html"')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-type')).toMatch(/^text\/html/)
  })

  it('answers 404 for traversal and unknown assets', async () => {
    const trav = await GET(
      new NextRequest('http://localhost/api/marketing-kit/ad-creative?asset=../../package.json'),
      ctx('ad-creative'),
    )
    expect(trav.status).toBe(404)
    const unknown = await GET(
      new NextRequest('http://localhost/api/marketing-kit/ad-creative?asset=assets/nope.html'),
      ctx('ad-creative'),
    )
    expect(unknown.status).toBe(404)
  })
})
