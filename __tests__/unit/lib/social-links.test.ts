/**
 * Social links are the easiest place to damage a brand: one guessed handle and
 * the footer points at somebody else's account. The brief requires the five
 * named channels to be validated and placeholders removed, so these tests pin
 * both the validator and the exact published set.
 *
 * History: this file originally pinned an *empty* published set because no
 * ALO Labs account could be confirmed. The owner has since supplied the real
 * destinations, so the expectations below are now the supplied URLs — pinned
 * literally, because a silent edit to a social URL is exactly the kind of
 * change that should fail a build.
 */

import { describe, expect, it } from 'vitest'

import {
  SOCIAL_LINKS,
  hasPublishedSocialLinks,
  httpsUpgrade,
  isPublishableSocialLink,
  normaliseSocialUrl,
  publishedSocialLinks,
  stripShareTracking,
  type SocialLink,
} from '@/lib/brand/social'

const facebook: SocialLink = SOCIAL_LINKS.find((l) => l.id === 'facebook')!

function withHref(base: SocialLink, href: string, verified = true): SocialLink {
  return { ...base, href, verified }
}

describe('social links: published set', () => {
  it('publishes one icon per destination, with unique ids', () => {
    const published = publishedSocialLinks()
    expect(published.length).toBe(6)
    const ids = published.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('covers all five networks the brief names', () => {
    const networks = new Set(publishedSocialLinks().map((l) => l.network))
    expect(networks).toEqual(new Set(['facebook', 'facebookCommunity', 'instagram', 'youtube', 'pinterest']))
  })

  it('keeps three distinct Facebook destinations without colliding', () => {
    // The footer keys icons by `id`; duplicate keys would silently drop icons.
    const fb = publishedSocialLinks().filter((l) => l.network === 'facebook')
    expect(fb.length).toBe(2) // page + share
    const all = publishedSocialLinks().filter((l) => l.allowedHosts.includes('www.facebook.com'))
    expect(all.length).toBe(3) // + community group
    for (const link of all) expect(link.label.toLowerCase()).toContain('facebook')
    // The group is labelled as a group, not as a page.
    const group = publishedSocialLinks().find((l) => l.id === 'facebook-community')!
    expect(group.label.toLowerCase()).toContain('community')
  })

  it('pins the exact destinations the owner supplied', () => {
    const byId = Object.fromEntries(publishedSocialLinks().map((l) => [l.id, l.href]))
    expect(byId['facebook']).toBe('https://www.facebook.com/profile.php?id=61591589092035')
    expect(byId['facebook-community']).toBe('https://www.facebook.com/groups/1350668263685186')
    expect(byId['facebook-share']).toBe('https://www.facebook.com/share/1BHE7CzVDd/')
    expect(byId['instagram']).toBe('https://www.instagram.com/alolabs.net2026')
    expect(byId['youtube']).toBe('https://www.youtube.com/@AlOLabs-f7n')
    expect(byId['pinterest']).toBe('https://www.pinterest.com/alolabsnet')
  })

  it('publishes only https, so no icon downgrades the secure page', () => {
    for (const link of publishedSocialLinks()) {
      expect(new URL(link.href).protocol, link.id).toBe('https:')
    }
  })

  it('drops share-tracking parameters', () => {
    // Instagram was supplied with ?igsh=…; the canonical profile is enough.
    for (const link of publishedSocialLinks()) {
      expect(link.href, link.id).not.toContain('igsh')
      expect(link.href, link.id).not.toContain('utm_')
    }
  })

  it('publishes nothing that has not been confirmed', () => {
    for (const link of publishedSocialLinks()) {
      expect(link.verified, `${link.id} is published but unverified`).toBe(true)
    }
    expect(hasPublishedSocialLinks()).toBe(publishedSocialLinks().length > 0)
  })

  it('declares each channel once, in display order, with an accessible label', () => {
    expect(SOCIAL_LINKS.map((l) => l.id)).toEqual([
      'facebook',
      'facebook-community',
      'facebook-share',
      'instagram',
      'youtube',
      'pinterest',
    ])
    for (const link of SOCIAL_LINKS) {
      // Icon-only links are unusable without this; the footer passes it to aria-label.
      expect(link.label.length, link.id).toBeGreaterThan(6)
      expect(link.label.toLowerCase(), link.id).toContain('alo labs')
    }
  })
})

describe('social links: URL normalisation', () => {
  it('upgrades http to https and leaves the path alone', () => {
    expect(httpsUpgrade('http://www.youtube.com/@AlOLabs-f7n')).toBe('https://www.youtube.com/@AlOLabs-f7n')
    expect(httpsUpgrade('https://www.pinterest.com/alolabsnet')).toBe('https://www.pinterest.com/alolabsnet')
  })

  it('strips share and campaign parameters but keeps meaningful ones', () => {
    expect(stripShareTracking('https://www.instagram.com/alolabs.net2026?igsh=aWpz')).toBe(
      'https://www.instagram.com/alolabs.net2026',
    )
    expect(stripShareTracking('https://x.test/p?utm_source=a&utm_medium=b&keep=1')).toContain('keep=1')
    expect(stripShareTracking('https://x.test/p?utm_source=a&utm_medium=b&keep=1')).not.toContain('utm_source')
  })

  it('keeps a query string that carries the account identity', () => {
    // facebook.com/profile.php?id=… needs its query; stripping it would 404.
    expect(normaliseSocialUrl('http://www.facebook.com/profile.php?id=61591589092035')).toBe(
      'https://www.facebook.com/profile.php?id=61591589092035',
    )
  })

  it('returns unparseable input unchanged so validation can reject it', () => {
    expect(httpsUpgrade('not a url')).toBe('not a url')
    expect(stripShareTracking('not a url')).toBe('not a url')
  })
})

describe('social links: validator', () => {
  it.each([
    ['a bare network homepage', 'https://facebook.com/'],
    ['http instead of https', 'http://facebook.com/alolabs'],
    ['a placeholder host', 'https://example.com/alolabs'],
    ['localhost', 'https://localhost/alolabs'],
    ['a host not on the allowlist', 'https://facebook.com.evil.co/alolabs'],
    ['a malformed URL', 'facebook.com/alolabs'],
    ['an empty string', ''],
    ['userinfo disguised host', 'https://facebook.com@evil.example/alolabs'],
  ])('rejects %s', (_label, href) => {
    expect(isPublishableSocialLink(withHref(facebook, href))).toBe(false)
  })

  it('rejects a valid URL that was never verified', () => {
    expect(isPublishableSocialLink(withHref(facebook, 'https://facebook.com/alolabs', false))).toBe(false)
  })

  it('accepts a verified account URL on an allowed host', () => {
    expect(isPublishableSocialLink(withHref(facebook, 'https://facebook.com/alolabs'))).toBe(true)
    expect(isPublishableSocialLink(withHref(facebook, 'https://www.facebook.com/alolabs'))).toBe(true)
  })

  it('never publishes a network link on another network', () => {
    const instagram = SOCIAL_LINKS.find((l) => l.network === 'instagram')!
    // A YouTube URL in the Instagram slot would be a copy-paste bug.
    expect(isPublishableSocialLink(withHref(instagram, 'https://youtube.com/@alolabs'))).toBe(false)
  })
})
