/**
 * Social links are the easiest place to damage a brand: one guessed handle and
 * the footer points at somebody else's account. The brief requires the five
 * channels to be validated and placeholders removed, so these tests pin both the
 * validator and the current (deliberately empty) published set.
 */

import { describe, expect, it } from 'vitest'

import {
  SOCIAL_LINKS,
  hasPublishedSocialLinks,
  isPublishableSocialLink,
  publishedSocialLinks,
  type SocialLink,
} from '@/lib/brand/social'

const facebook: SocialLink = SOCIAL_LINKS.find((l) => l.network === 'facebook')!

function withHref(base: SocialLink, href: string, verified = true): SocialLink {
  return { ...base, href, verified }
}

describe('social links', () => {
  it('declares each of the five channels exactly once, in display order', () => {
    expect(SOCIAL_LINKS.map((l) => l.network)).toEqual([
      'facebook',
      'facebookCommunity',
      'instagram',
      'youtube',
      'pinterest',
    ])
  })

  it('gives every channel an accessible label', () => {
    for (const link of SOCIAL_LINKS) {
      // Icon-only links are unusable without this; the footer passes it to aria-label.
      expect(link.label.length, link.network).toBeGreaterThan(6)
      expect(link.label.toLowerCase(), link.network).toContain('alo labs')
    }
  })

  it('publishes nothing that has not been confirmed', () => {
    // No official accounts have been confirmed, so the honest published set is
    // empty and the footer renders no icon row. If this changes, every entry
    // must be verified — never a guess.
    for (const link of publishedSocialLinks()) {
      expect(link.verified, `${link.network} is published but unverified`).toBe(true)
    }
    expect(hasPublishedSocialLinks()).toBe(publishedSocialLinks().length > 0)
  })

  it.each([
    ['a bare network homepage', 'https://facebook.com/'],
    ['http instead of https', 'http://facebook.com/alolabs'],
    ['a placeholder host', 'https://example.com/alolabs'],
    ['localhost', 'https://localhost/alolabs'],
    ['a host not on the allowlist', 'https://facebook.com.evil.co/alolabs'],
    ['a malformed URL', 'facebook.com/alolabs'],
    ['an empty string', ''],
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
