/**
 * Public social channels.
 *
 * ── History worth keeping ───────────────────────────────────────────────────
 * This file originally shipped with every link empty and `verified: false`,
 * because at the time no ALO Labs profile could be confirmed anywhere — the
 * repository only holds API credentials for posting to these networks, and a
 * web search turned up several unrelated "Alo Labs" accounts. Publishing a
 * guessed handle would have pointed the footer at a stranger's page, which is
 * the exact fabrication the rest of this site refuses to commit.
 *
 * The owner has since supplied the real destinations, so they are published
 * below. The validation machinery stays, because it is what stops a wrong URL
 * from reaching the footer later.
 *
 * ── On `id` vs `network` ────────────────────────────────────────────────────
 * There are three Facebook destinations (a profile/page, a share link and a
 * community group). Keying the registry by `network` alone would collide, and
 * the footer previously used `link.network` as a React key — two entries with
 * the same key means React silently drops one icon. Every entry therefore has a
 * stable unique `id`, and `SOCIAL_ICON` is keyed by `icon` so two Facebook
 * destinations can still render distinct glyphs (page vs community).
 *
 * ── On the URLs themselves ──────────────────────────────────────────────────
 * Destinations were supplied over http (YouTube, Pinterest). They are upgraded
 * to https because all three hosts serve https and an insecure link from a
 * secure page is both a mixed-content smell and a downgrade. `httpsUpgrade()`
 * does that mechanically rather than by retyping the URL, so the account path
 * cannot drift from what the owner supplied.
 *
 * Instagram arrives with `?igsh=...` — a share-tracking parameter. It is
 * stripped: the canonical profile URL is stable, the tracking token is not
 * useful to us and leaks a share event the visitor did not intend.
 */

export type SocialNetwork = 'facebook' | 'facebookCommunity' | 'instagram' | 'youtube' | 'pinterest'

/** Which glyph to draw. Distinct from `network` so Facebook can appear twice. */
export type SocialIconName = 'facebook' | 'facebookCommunity' | 'facebookShare' | 'instagram' | 'youtube' | 'pinterest'

export interface SocialLink {
  /** Stable unique key for React and for `publishedSocialLinks()` lookups. */
  id: string
  network: SocialNetwork
  icon: SocialIconName
  /** Accessible name announced to screen readers. */
  label: string
  /** Where it points. Empty when the owner has not confirmed the account. */
  href: string
  /** Hosts a valid URL for this network may use. */
  allowedHosts: readonly string[]
  /** True only when the URL above is known to be ALO Labs' own account. */
  verified: boolean
}

/**
 * Upgrade a supplied URL to https, leaving everything else (host, path, query)
 * exactly as given. Returns the input unchanged if it cannot be parsed, so a
 * malformed URL fails validation later rather than being silently rewritten.
 */
export function httpsUpgrade(raw: string): string {
  if (!raw) return ''
  try {
    const url = new URL(raw)
    url.protocol = 'https:'
    return url.toString()
  } catch {
    return raw
  }
}

/**
 * Drop share-tracking query parameters (Instagram's `igsh`, Facebook's `mibextid`,
 * YouTube's `si`, and the usual UTM set). The canonical profile URL is enough.
 */
export function stripShareTracking(raw: string): string {
  if (!raw) return ''
  try {
    const url = new URL(raw)
    for (const key of [...url.searchParams.keys()]) {
      if (/^(igsh|igshid|mibextid|si|utm_.*|fbclid|gclid)$/i.test(key)) url.searchParams.delete(key)
    }
    return url.toString()
  } catch {
    return raw
  }
}

/** Normalise a supplied URL: https, no share-tracking parameters. */
export function normaliseSocialUrl(raw: string): string {
  return stripShareTracking(httpsUpgrade(raw))
}

/** The destinations the owner supplied, normalised once at module load. */
const URLS = {
  facebookShare: normaliseSocialUrl('https://www.facebook.com/share/1BHE7CzVDd/'),
  facebookPage: normaliseSocialUrl('https://www.facebook.com/profile.php?id=61591589092035'),
  facebookGroup: normaliseSocialUrl('https://www.facebook.com/groups/1350668263685186'),
  instagram: normaliseSocialUrl('https://www.instagram.com/alolabs.net2026?igsh=aWpsaGd4aGEzMnNs'),
  youtube: normaliseSocialUrl('http://www.youtube.com/@AlOLabs-f7n'),
  pinterest: normaliseSocialUrl('http://www.pinterest.com/alolabsnet'),
} as const

const FACEBOOK_HOSTS = ['facebook.com', 'www.facebook.com', 'fb.com', 'm.facebook.com'] as const
const INSTAGRAM_HOSTS = ['instagram.com', 'www.instagram.com'] as const
const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com'] as const
const PINTEREST_HOSTS = ['pinterest.com', 'www.pinterest.com'] as const

/**
 * Published channels, in footer display order.
 *
 * Labels are deliberately distinct: a visitor using a screen reader hears
 * "ALO Labs on Facebook" and "ALO Labs Facebook community group" as different
 * things, and the `title` attribute repeats that distinction for sighted users
 * who hover an icon-only link.
 */
export const SOCIAL_LINKS: readonly SocialLink[] = [
  {
    id: 'facebook',
    network: 'facebook',
    icon: 'facebook',
    label: 'ALO Labs on Facebook',
    href: URLS.facebookPage,
    allowedHosts: FACEBOOK_HOSTS,
    verified: true,
  },
  {
    id: 'facebook-community',
    network: 'facebookCommunity',
    icon: 'facebookCommunity',
    label: 'ALO Labs Facebook community group',
    href: URLS.facebookGroup,
    allowedHosts: FACEBOOK_HOSTS,
    verified: true,
  },
  {
    id: 'facebook-share',
    network: 'facebook',
    // A share link is not the page, so it must not reuse the "f" glyph — two
    // identical Facebook icons side by side are indistinguishable to a visitor.
    icon: 'facebookShare',
    label: 'ALO Labs Facebook page (share link)',
    href: URLS.facebookShare,
    allowedHosts: FACEBOOK_HOSTS,
    verified: true,
  },
  {
    id: 'instagram',
    network: 'instagram',
    icon: 'instagram',
    label: 'ALO Labs on Instagram',
    href: URLS.instagram,
    allowedHosts: INSTAGRAM_HOSTS,
    verified: true,
  },
  {
    id: 'youtube',
    network: 'youtube',
    icon: 'youtube',
    label: 'ALO Labs on YouTube',
    href: URLS.youtube,
    allowedHosts: YOUTUBE_HOSTS,
    verified: true,
  },
  {
    id: 'pinterest',
    network: 'pinterest',
    icon: 'pinterest',
    label: 'ALO Labs on Pinterest',
    href: URLS.pinterest,
    allowedHosts: PINTEREST_HOSTS,
    verified: true,
  },
]

/** Placeholder fragments that must never reach production. */
const PLACEHOLDER_HOSTS = new Set(['example.com', 'example.org', 'localhost', '127.0.0.1'])

/**
 * Is this a publishable link for the network it claims to be?
 *
 * Deliberately strict: https only, a real host on the network's allowlist, no
 * placeholder hosts, no bare homepages (a link to facebook.com is not a page),
 * and no userinfo tricks (`@` in the authority) that can disguise a host.
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
  // `https://facebook.com@evil.example/` parses with hostname evil.example, so
  // the allowlist above already rejects it — but reject userinfo outright too.
  if (url.username || url.password) return false
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
