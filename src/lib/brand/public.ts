/** Public website edition of the supplied brand sheet. Keep print, invoices and
 * authenticated product themes on their own approved palettes. */
import type { CSSProperties } from 'react'
import { BRAND as base, BRAND_FONTS as fonts, USAGE_RULES as rules } from './tokens'

export { COMPANY, HEADLINE_STATS } from './tokens'

export const BRAND = {
  ...base,
  orange: '#FF6A00',
  orangeInk: '#9E4000', // small text on light surfaces
  sunshine: '#FFB300',
  blue: '#003A8C',
  ink: '#101D33',
  gray: '#526174',
  graySoft: '#65748A',
} as const

export const GRADIENTS = {
  orange: { css: `linear-gradient(95deg, ${BRAND.orange}, ${BRAND.sunshine})` },
  blue: { css: `linear-gradient(95deg, ${BRAND.blue}, ${BRAND.blueLight})` },
}

export const BRAND_FONTS = {
  primary: { ...fonts.primary, stack: `'Studio Inter', ${fonts.primary.stack}` },
  secondary: { ...fonts.secondary, stack: `'Studio Poppins', ${fonts.secondary.stack}` },
}

export const USAGE_RULES = rules.map(rule => ({ ...rule, swatch:
  rule.swatch === base.orange ? BRAND.orange : rule.swatch === base.blue ? BRAND.blue : rule.swatch,
}))

/** Bind once at the public surface boundary; CSS and the 3D renderer share values. */
export const publicBrandStyle = {
  '--alo-orange': BRAND.orange,
  '--alo-orange-ink': BRAND.orangeInk,
  '--alo-blue': BRAND.blue,
  '--alo-blue-light': BRAND.blueLight,
  '--alo-navy': BRAND.navy,
  '--alo-ink': BRAND.ink,
  '--alo-muted': BRAND.gray,
  '--alo-gradient-orange': GRADIENTS.orange.css,
  '--alo-gradient-blue': GRADIENTS.blue.css,
  '--alo-body': BRAND_FONTS.primary.stack,
  '--alo-display': BRAND_FONTS.secondary.stack,
} as CSSProperties

export const publicSiteIcons = {
  icon: [{ url: '/studio/icon-192.png', type: 'image/png', sizes: '192x192' }],
  apple: '/studio/icon-192.png',
  shortcut: '/studio/icon-192.png',
}
