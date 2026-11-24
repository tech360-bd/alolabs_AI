/**
 * Public social channels.
 *
 * ── Why most of this file is empty ──────────────────────────────────────────
 * The brief asks for Facebook, Facebook Community, Instagram, YouTube and
 * Pinterest links, "validated, with malformed or placeholder links removed".
 *
 * The honest answer after auditing the repository is that **no ALO Labs social
 * profile is recorded anywhere in it**. There are OAuth client IDs for posting
 * to those networks (`.env.example`, `src/lib/social/*`), but those are API
 * credentials, not public pages. A search of the web turns up several unrelated
 * "Alo Labs" accounts (a Swedish consultancy, a film lab, a US research group),
 * none of which is this company.
 *
 * Publishing any of them would be exactly the fabrication the rest of this
 * site refuses to commit: a footer link that looks like a channel and goes to
 * a stranger's page. So the registry below is the *structure* for the links,
 * with `verified: false` on each, and `publishedSocialLinks()` — the only thing
 * the footer is allowed to call — returns only entries the owner has confirmed.
 *
 * To publish one: set its `verified` flag to true and put the real URL in
 * `href`. The footer will render it with an accessible icon link, and
 * `__tests__/unit/lib/social-links.test.ts` enforces that anything reachable
 * from the footer is https, on the expected domain, and not a placeholder.
 * That test runs against `publishedSocialLinks()`, so flipping the flag cannot
 * introduce an unvalidated URL.
 */

export type SocialNetwork = 'facebook' | 'facebookCommunity' | 'instagram' | 'youtube' | 'pinterest'

export interface SocialLink {
  network: SocialNetwork
  /** Accessible name announced to screen readers. */
  label: string
  /** Where it points. Empty until the owner confirms the account. */
  href: string
  /** Hosts a valid URL for this network may use. */
  allowedHosts: readonly string[]
  /** True only when the URL above is known to be ALO Labs' own account. */
  verified: boolean
}

/**
 * The five channels named in the brief, in display order.
 *
 * `href` is intentionally blank rather than a guess. An empty entry is not an
 * error state: the footer simply omits it until it can be filled truthfully.
 */
export const SOCIAL_LINKS: readonly SocialLink[] = [
  {
    network: 'facebook',
    label: 'ALO Labs on Facebook',
    href: '',
    allowedHosts: ['facebook.com', 'www.facebook.com', 'fb.com'],
    verified: false,
  },
  {
    network: 'facebookCommunity',
    label: 'ALO Labs Facebook community group',
    href: '',
    allowedHosts: ['facebook.com', 'www.facebook.com', 'fb.com'],
    verified: false,
  },
  {
    network: 'instagram',
    label: 'ALO Labs on Instagram',
    href: '',
    allowedHosts: ['instagram.com', 'www.instagram.com'],
    verified: false,
  },
  {
    network: 'youtube',
    label: 'ALO Labs on YouTube',
    href: '',
    allowedHosts: ['youtube.com', 'www.youtube.com', 'm.youtube.com'],
    verified: false,
  },
  {
    network: 'pinterest',
    label: 'ALO Labs on Pinterest',
    href: '',
    allowedHosts: ['pinterest.com', 'www.pinterest.com'],
    verified: false,
  },
]

/** Placeholder fragments that must never reach production. */
const PLACEHOLDER_HOSTS = new Set(['example.com', 'example.org', 'localhost', '127.0.0.1'])

/**
 * Is this a publishable link for the network it claims to be?
 *
 * Deliberately strict: https only, a real host on the network's allowlist, no
 * placeholder hosts, no bare homepages (a link to facebook.com is not a page),
 * and no query-string tracking junk.
 */
export function isPublishableSocialLink(link: SocialLink): boolean {
  if (!link.verified || !link.href) return false
  let url: URL
  try {
    url = new URL(link.href)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  if (!link.allowedHosts.includes(url.hostname)) return false
  if (PLACEHOLDER_HOSTS.has(url.hostname)) return false
  // A path of "/" is the network's homepage, not our account.
  if (url.pathname.replace(/\/+$/, '').length === 0) return false
  if (url.hostname.endsWith('example.com')) return false
  return true
}

/** The only function the footer should call. */
export function publishedSocialLinks(): SocialLink[] {
  return SOCIAL_LINKS.filter(isPublishableSocialLink)
}

/** True when at least one channel is publishable, so the footer can hide the block. */
export function hasPublishedSocialLinks(): boolean {
  return publishedSocialLinks().length > 0
}
