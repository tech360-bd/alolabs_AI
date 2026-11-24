/**
 * `/brand` is an authenticated page group (the brand book), but the site's logo
 * and favicon files are served from the same prefix: /brand/alo-icon.svg,
 * /brand/alo-agentos-mark.png, and so on.
 *
 * Before this exemption the auth guard redirected an anonymous <img src> to
 * /login, so the corporate mark was broken for every logged-out visitor and
 * every favicon request 302'd. These tests pin both halves of the rule: assets
 * are public, and the brand book remains private.
 */

import { describe, expect, it } from 'vitest'

import { isInternalPagePath, isStaticAssetPath } from '@/lib/access/surfaces'

describe('isStaticAssetPath', () => {
  it.each([
    '/brand/alo-icon.svg',
    '/brand/alo-agentos-mark.png',
    '/brand/alo-agentos-badge.jpg',
    '/brand/alo-agentos-badge.webp',
    '/brand/hero.avif',
    '/favicon.ico',
    '/media/clip.mp4',
    '/docs/terms.pdf',
    '/fonts/inter.woff2',
  ])('treats %s as an asset', (path) => {
    expect(isStaticAssetPath(path)).toBe(true)
  })

  it.each([
    '/brand',
    '/brand/',
    '/brand/tokens',
    '/brand/alo-icon',
    '/dashboard',
    '/site/pricing',
    '/site/terms',
    '/',
  ])('does not treat %s as an asset', (path) => {
    expect(isStaticAssetPath(path)).toBe(false)
  })

  it('does not match an extension that is merely part of a page segment', () => {
    // "/brand/svg-editor" must not be read as an .svg file.
    expect(isStaticAssetPath('/brand/svg-editor')).toBe(false)
    expect(isStaticAssetPath('/brand/png')).toBe(false)
  })
})

describe('isInternalPagePath', () => {
  it('keeps the brand book private', () => {
    expect(isInternalPagePath('/brand')).toBe(true)
    expect(isInternalPagePath('/dashboard')).toBe(true)
    expect(isInternalPagePath('/dashboard/settings')).toBe(true)
    expect(isInternalPagePath('/site/pricing')).toBe(true)
    expect(isInternalPagePath('/portal')).toBe(false)
    expect(isInternalPagePath('/site')).toBe(false)
  })

  it('does not require a session for brand assets', () => {
    // Regression: these must stay reachable while logged out, or the logo and
    // favicon break on the public site.
    expect(isInternalPagePath('/brand/alo-icon.svg')).toBe(false)
    expect(isInternalPagePath('/brand/alo-mark.svg')).toBe(false)
    expect(isInternalPagePath('/brand/alo-agentos-badge.webp')).toBe(false)
    expect(isInternalPagePath('/brand/alo-agentos-mark.png')).toBe(false)
  })
})
