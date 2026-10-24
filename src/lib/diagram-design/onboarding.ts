/**
 * Skin onboarding (upstream `onboarding.md`) — extract a diagram skin from a
 * brand's own material: a URL's CSS, an installed skill's token files, or a
 * folder's design tokens. CSS custom properties take priority over values
 * inferred from HTML or prose. Every run produces a **brand fidelity receipt**:
 * what was sampled, what each role resolved to, and whether each font role is
 * exact or a fallback.
 *
 * Extraction only ever *proposes*: nothing is written until the proposal is
 * approved, and unresolved roles are marked rather than guessed.
 */

import type { RoleTokens, SkinName } from './tokens'

export type TokenRole = 'paper' | 'ink' | 'muted' | 'accent' | 'rule' | 'soft' | 'muted2'

export interface FontRole {
  role: 'title' | 'body' | 'technical-label'
  family: string
  weights: number[]
  sourceUrl?: string
  /** `exact` when the brand's own family was found; `fallback` otherwise. */
  match: 'exact' | 'fallback'
}

export interface BrandFidelityReceipt {
  /** Where the values came from (URLs, filenames, sections). */
  sampled: string[]
  /** Detected semantic roles — only roles actually found. */
  detected: Partial<Record<TokenRole, string>>
  /** Surface value when the source distinguishes it from paper. */
  surface?: string
  fonts: FontRole[]
  /** Page-specific figure styling that should override the global skin. */
  figureOverrides?: Partial<RoleTokens>
}

export interface SkinProposal {
  tokens: Partial<RoleTokens>
  fonts: FontRole[]
  receipt: BrandFidelityReceipt
  /** Roles named by the source but not yet mapped. Never guessed. */
  unmapped: string[]
}

// ─── Color parsing ───────────────────────────────────────────────────────────

function normalizeHex(input: string): string | null {
  const s = input.trim()
  const m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!m) return null
  const h = m[1].toLowerCase()
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return `#${full}`
}

function parseColorValue(value: string): string | null {
  const hex = normalizeHex(value)
  if (hex) return hex
  const rgb = value.match(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i)
  if (rgb) {
    const [r, g, b] = [rgb[1], rgb[2], rgb[3]].map((n) => Math.min(255, Number(n)))
    return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`
  }
  return null
}

/** Name heuristics from onboarding.md § Skill → Step 3. */
const ROLE_HINTS: { re: RegExp; role: TokenRole }[] = [
  { re: /\b(background|bg|paper|surface|canvas)\b/i, role: 'paper' },
  { re: /\b(foreground|text|body|ink|on-surface|on-bg)\b/i, role: 'ink' },
  { re: /\b(muted|subtle|secondary|caption)\b/i, role: 'muted' },
  { re: /\b(accent|brand|primary|cta|highlight)\b/i, role: 'accent' },
  { re: /\b(border|rule|divider|outline|edge)\b/i, role: 'rule' },
  { re: /\b(soft|tertiary|faint|disabled)\b/i, role: 'soft' },
]

function mapNameToRole(name: string): TokenRole | null {
  // Surface is paper's sibling, not its replacement: keep it for the receipt.
  if (/^surface$|surface/i.test(name) && !/on-surface/i.test(name)) return 'paper'
  for (const hint of ROLE_HINTS) {
    if (hint.re.test(name)) return hint.role
  }
  return null
}

// ─── Source extractors ───────────────────────────────────────────────────────

export interface ExtractedSource {
  /** Role candidates in priority order; later sources never override earlier ones. */
  values: Partial<Record<TokenRole, string>>
  surface?: string
  fonts: { family: string; weights: number[]; kind: 'title' | 'body' | 'mono' }[]
  /** Role-like names that carried a color this module will not map. */
  unmapped: string[]
  /** Keys seen, for the receipt. */
  seen: string[]
}

function emptySource(): ExtractedSource {
  return { values: {}, fonts: [], unmapped: [], seen: [] }
}

/** CSS custom properties in `:root { --color-*: … }` (also SCSS `$var: value;`). */
export function extractFromCss(css: string): ExtractedSource {
  const out = emptySource()
  const decls = [
    ...css.matchAll(/(--[\w-]+)\s*:\s*([^;}\n]+)/g),
    ...css.matchAll(/(\$[\w-]+)\s*:\s*([^;}\n]+)/g),
  ]
  for (const [, rawKey, rawValue] of decls) {
    const key = rawKey.replace(/^--|^\$/, '')
    const value = rawValue.trim()
    out.seen.push(key)
    const color = parseColorValue(value)
    if (color) {
      const role = mapNameToRole(key)
      if (role) {
        if (role === 'paper' && /surface/i.test(key) && !out.values.paper) out.surface = color
        if (!out.values[role]) out.values[role] = color
      } else {
        out.unmapped.push(key)
      }
      continue
    }
    const font = value.match(/^(?:var\([^)]*\)\s*,\s*)?['"]?([A-Za-z][\w -]*)['"]?/)
    if (font && /font|mono|code|serif|sans/i.test(key)) {
      out.fonts.push({ family: font[1].trim(), weights: [400], kind: /mono|code/i.test(key) ? 'mono' : /title|display|serif|heading/i.test(key) ? 'title' : 'body' })
    }
  }
  // @font-face and font-family rules.
  for (const m of css.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
    const family = m[1].split(',')[0].replace(/['"]/g, '').trim()
    if (family && !out.fonts.some((f) => f.family === family)) {
      out.fonts.push({ family, weights: [400], kind: /mono/i.test(family) ? 'mono' : /serif/i.test(family) ? 'title' : 'body' })
    }
  }
  // Plain CSS properties (body/element rules) — the same heuristics on the
  // property name. Custom properties above take priority (they fill first).
  for (const m of css.matchAll(/(?:^|[;{])\s*(background-color|background|color|border-color|font-family)\s*:\s*([^;}]+)/gi)) {
    const prop = m[1].toLowerCase()
    const value = m[2].trim()
    const color = parseColorValue(value)
    if (color) {
      const role = mapNameToRole(prop === 'background-color' ? 'background' : prop === 'color' ? 'text' : prop)
      if (role && !out.values[role]) out.values[role] = color
      continue
    }
    if (prop === 'font-family') {
      const family = value.split(',')[0].replace(/['"]/g, '').trim()
      if (family && !out.fonts.some((f) => f.family === family)) {
        out.fonts.push({ family, weights: [400], kind: /mono/i.test(family) ? 'mono' : /serif/i.test(family) ? 'title' : 'body' })
      }
    }
  }
  return out
}

/** Style Dictionary / Figma token JSON — flatten paths, apply the heuristics. */
export function extractFromJson(json: string): ExtractedSource {
  const out = emptySource()
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return out
  }
  const walk = (node: unknown, path: string[]) => {
    if (node === null || typeof node !== 'object') return
    const rec = node as Record<string, unknown>
    const leaf = typeof rec.value === 'string' ? rec.value : typeof rec.hex === 'string' ? rec.hex : null
    if (leaf !== null) {
      const key = path.join('-')
      out.seen.push(key)
      const color = parseColorValue(leaf)
      if (color) {
        const role = mapNameToRole(key)
        if (role && !out.values[role]) out.values[role] = color
        else if (!role) out.unmapped.push(key)
      } else {
        const font = leaf.match(/^[A-Za-z][\w -]*$/)
        if (font && /font/i.test(key)) {
          out.fonts.push({ family: leaf.trim(), weights: [400], kind: /mono/i.test(key) ? 'mono' : /title|heading/i.test(key) ? 'title' : 'body' })
        }
      }
      return
    }
    for (const [k, v] of Object.entries(rec)) walk(v, [...path, k])
  }
  walk(data, [])
  return out
}

/** Markdown tables: rows with hex values adjacent to role-like words. */
export function extractFromMarkdown(md: string): ExtractedSource {
  const out = emptySource()
  for (const line of md.split(/\r?\n/)) {
    const row = line.match(/^\|\s*([^|]+?)\s*\|\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))\s*\|/)
    if (!row) continue
    const key = row[1].replace(/\*/g, '').trim()
    out.seen.push(key)
    const color = parseColorValue(row[2])
    if (!color) continue
    const role = mapNameToRole(key)
    if (role && !out.values[role]) out.values[role] = color
    else if (!role) out.unmapped.push(key)
  }
  // Hex values mentioned in prose next to role words.
  for (const m of md.matchAll(/([A-Za-z][\w -]{2,30})\s*[:=]?\s*(#[0-9a-fA-F]{6})\b/g)) {
    const role = mapNameToRole(m[1])
    if (role && !out.values[role]) out.values[role] = normalizeHex(m[2])!
  }
  return out
}

/** HTML `<style>` blocks and inline style attributes. */
export function extractFromHtml(html: string): ExtractedSource {
  const out = emptySource()
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1])
  const merged = extractFromCss(styles.join('\n'))
  out.values = merged.values
  out.surface = merged.surface
  out.fonts = merged.fonts
  out.unmapped = merged.unmapped
  out.seen = merged.seen
  // body-level colors when :root is missing.
  for (const m of html.matchAll(/<body[^>]*style="([^"]*)"/gi)) {
    const css = extractFromCss(m[1].replace(/;/g, ';\n'))
    for (const [k, v] of Object.entries(css.values)) {
      const role = k as TokenRole
      if (!out.values[role]) out.values[role] = v
    }
  }
  return out
}

// ─── Contrast ────────────────────────────────────────────────────────────────

function relativeLuminance(hex: string): number {
  const h = normalizeHex(hex) ?? '#000000'
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** The visibility-line rule: ink on paper must clear 3:1. */
export function checkContrast(fg: string, bg: string, min = 3): { ratio: number; pass: boolean } {
  const ratio = contrastRatio(fg, bg)
  return { ratio: Math.round(ratio * 100) / 100, pass: ratio >= min }
}

// ─── Proposal + receipt ──────────────────────────────────────────────────────

export interface OnboardSources {
  /** Sampled page URL(s). */
  url?: string
  css?: string
  json?: string
  markdown?: string
  html?: string
}

/**
 * Merge the sources by priority (CSS custom properties > JSON tokens >
 * markdown > HTML inference), map to roles, and emit the receipt.
 */
export function proposeSkin(sources: OnboardSources): SkinProposal {
  const parts: ExtractedSource[] = []
  if (sources.css) parts.push(extractFromCss(sources.css))
  if (sources.json) parts.push(extractFromJson(sources.json))
  if (sources.markdown) parts.push(extractFromMarkdown(sources.markdown))
  if (sources.html) parts.push(extractFromHtml(sources.html))

  const values: Partial<Record<TokenRole, string>> = {}
  const seen: string[] = []
  const unmapped: string[] = []
  const fonts: FontRole[] = []
  let surface: string | undefined

  for (const part of parts) {
    for (const [role, value] of Object.entries(part.values)) {
      const r = role as TokenRole
      if (!values[r]) values[r] = value
    }
    if (part.surface && !surface) surface = part.surface
    seen.push(...part.seen)
    unmapped.push(...part.unmapped)
    for (const f of part.fonts) {
      if (!fonts.some((x) => x.family === f.family)) {
        fonts.push({
          role: f.kind === 'title' ? 'title' : f.kind === 'mono' ? 'technical-label' : 'body',
          family: f.family,
          weights: f.weights,
          match: 'exact',
        })
      }
    }
  }

  // Font roles that were never found fall back to the schematic defaults —
  // marked `fallback` in the receipt, never claimed as exact.
  const FONT_DEFAULTS: { role: FontRole['role']; family: string }[] = [
    { role: 'title', family: 'Instrument Serif' },
    { role: 'body', family: 'Geist' },
    { role: 'technical-label', family: 'Geist Mono' },
  ]
  for (const d of FONT_DEFAULTS) {
    if (!fonts.some((f) => f.role === d.role)) {
      fonts.push({ role: d.role, family: d.family, weights: [400], match: 'fallback' })
    }
  }

  const tokens: Partial<RoleTokens> = {}
  if (values.paper) tokens.paper = values.paper
  if (values.ink) tokens.ink = values.ink
  if (values.muted) tokens.muted = values.muted
  if (values.soft) tokens.soft = values.soft
  if (values.accent) tokens.accent = values.accent
  if (values.rule) tokens.rule = values.rule

  const receipt: BrandFidelityReceipt = {
    sampled: sources.url ? [sources.url] : [],
    detected: { ...values },
    surface,
    fonts,
    figureOverrides: tokens,
  }

  return { tokens, fonts, receipt, unmapped: [...new Set(unmapped)] }
}

/** Fill every missing role from a base skin so the proposal is renderable. */
export function proposalToSkin(proposal: SkinProposal, base: RoleTokens): RoleTokens {
  return { ...base, ...proposal.tokens }
}

/** The terminal skin is fixed and never receives brand tokens (primitive-terminal.md). */
export const TERMINAL_SKIN_IS_FIXED = true

export type { SkinName }
