/**
 * Scene exporters — SVG fragment and self-contained HTML document.
 *
 * Mirrors the design system's output contract: a diagram ships as a single
 * file with inline SVG, embedded CSS limited to the font link, no JavaScript,
 * and the accessible SVG contract intact (title first, slug-prefixed IDs).
 */

import { iconMarkup } from './icons'
import { FONT_LINK, FONT_STACK, STROKE, alpha, nodeTreatment, type RoleTokens } from './tokens'
import { RADIUS } from './tokens'
import type { LegendItem, Prim, Scene } from './spec'
import { resolveSkin } from './tokens'

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function primToSvg(prim: Prim, uid: (n: string) => string): string {
  const n = (v: number | undefined) => (v === undefined ? undefined : Math.round(v * 100) / 100)
  switch (prim.t) {
    case 'rect':
      return `<rect${a('x', n(prim.x))}${a('y', n(prim.y))}${a('width', n(prim.w))}${a('height', n(prim.h))}${a('rx', prim.rx)} fill="${prim.fill ?? 'none'}"${a('stroke', prim.stroke)}${a('stroke-width', prim.strokeWidth)}${a('stroke-dasharray', prim.dash)}${a('opacity', prim.opacity)}/>`
    case 'path':
      return `<path d="${prim.d}" fill="${prim.fill ?? 'none'}"${a('stroke', prim.stroke)}${a('stroke-width', prim.strokeWidth)}${a('stroke-dasharray', prim.dash)}${a('opacity', prim.opacity)} stroke-linecap="round"${
        prim.marker
          ? ` marker-end="url(#${uid(prim.marker === 'accent' ? 'arrow-accent' : prim.marker === 'link' ? 'arrow-link' : 'arrow')})"`
          : ''
      }/>`
    case 'line':
      return `<line x1="${n(prim.x1)}" y1="${n(prim.y1)}" x2="${n(prim.x2)}" y2="${n(prim.y2)}"${a('stroke', prim.stroke)}${a('stroke-width', prim.strokeWidth)}${a('stroke-dasharray', prim.dash)}${a('opacity', prim.opacity)}/>`
    case 'circle':
      return `<circle cx="${n(prim.cx)}" cy="${n(prim.cy)}" r="${n(prim.r)}" fill="${prim.fill ?? 'none'}"${a('stroke', prim.stroke)}${a('stroke-width', prim.strokeWidth)}${a('opacity', prim.opacity)}/>`
    case 'polygon':
      return `<polygon points="${prim.points}" fill="${prim.fill ?? 'none'}"${a('stroke', prim.stroke)}${a('stroke-width', prim.strokeWidth)}${a('stroke-dasharray', prim.dash)}${a('opacity', prim.opacity)}/>`
    case 'mask':
      return `<rect x="${n(prim.x)}" y="${n(prim.y)}" width="${n(prim.w)}" height="${n(prim.h)}"${a('rx', prim.rx)} fill="var(--dd-paper)"/>`
    case 'icon':
      return `<g color="${prim.color}">${iconMarkup(prim.name, prim.x, prim.y, prim.size)}</g>`
    case 'text':
      return `<text x="${n(prim.x)}" y="${n(prim.y)}" fill="${prim.fill ?? 'currentColor'}" font-family="${escapeXml(FONT_STACK[prim.family])}" font-size="${prim.size}" font-weight="${prim.weight ?? 400}"${prim.tracking ? ` letter-spacing="${prim.tracking}em"` : ''}${prim.italic ? ' font-style="italic"' : ''} text-anchor="${prim.anchor ?? 'start'}"${prim.opacity !== undefined ? ` opacity="${prim.opacity}"` : ''}>${escapeXml(prim.text)}</text>`
    default:
      return ''
  }
}

function a(name: string, value: string | number | undefined): string {
  if (value === undefined) return ''
  const v = typeof value === 'number' ? Math.round(value * 100) / 100 : value
  if (name === 'opacity') return ` opacity="${v}"`
  if (name === 'stroke-width') return ` stroke-width="${v}"`
  return ` ${name}="${v}"`
}

/** Serialise a scene to a standalone `<svg>` element. */
export function sceneToSvg(scene: Scene, opts: { sketchy?: boolean } = {}): string {
  const uid = (n: string) => `${scene.aria.slug}-${n}`
  const tokens: RoleTokens = resolveSkin(scene.skin, scene.theme)
  const legendH = scene.legend.length ? 44 : 0
  const height = scene.height + legendH
  const items = [...scene.items].sort((x, y) => x.layer - y.layer)

  const marker = (id: string, color: string) =>
    `<marker id="${uid(id)}" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="${color}"/></marker>`

  const legend = scene.legend.length
    ? (() => {
        let cursor = 40
        const parts = scene.legend.map((item: LegendItem) => {
          const x = cursor + 92
          cursor = x + Math.max(120, item.label.length * 6 + 40)
          const swatch =
            item.kind === 'arrow' || item.kind === 'arrow-accent' || item.kind === 'arrow-link' || item.kind === 'dash'
              ? `<line x1="${x}" y1="${scene.height + 15}" x2="${x + 16}" y2="${scene.height + 15}" stroke="${
                  item.kind === 'arrow-accent' ? tokens.accent : item.kind === 'arrow-link' ? tokens.link : tokens.muted
                }" stroke-width="1"${item.kind === 'dash' ? ' stroke-dasharray="5,4"' : ''}/>`
              : (() => {
                  const treat = nodeTreatment(item.kind as never, tokens)
                  return `<rect x="${x}" y="${scene.height + 10}" width="16" height="10" rx="${RADIUS.sm - 2}" fill="${treat.fill === 'transparent' ? 'none' : treat.fill}" stroke="${treat.stroke}" stroke-width="${treat.strokeWidth}"${treat.dash ? ` stroke-dasharray="${treat.dash}"` : ''}/>`
                })()
          return `${swatch}<text x="${x + 22}" y="${scene.height + 19}" fill="${tokens.muted}" font-family="${FONT_STACK.mono}" font-size="8">${escapeXml(item.label)}</text>`
        })
        return `<line x1="40" y1="${scene.height + 8}" x2="${scene.width - 40}" y2="${scene.height + 8}" stroke="${tokens.rule}" stroke-width="0.8"/><text x="40" y="${scene.height + 28}" fill="${tokens.muted}" font-family="${FONT_STACK.mono}" font-size="8" letter-spacing="0.14em">LEGEND</text>${parts.join('')}`
      })()
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="${uid('title')} ${uid('desc')}" viewBox="0 0 ${scene.width} ${height}" width="${scene.width}" height="${height}">
  <title id="${uid('title')}">${escapeXml(scene.aria.title)}</title>
  <desc id="${uid('desc')}">${escapeXml(scene.aria.desc)}</desc>
  <style>svg{--dd-paper:${tokens.paper};background:${tokens.paper}}</style>
  <defs>
    ${marker('arrow', tokens.muted)}
    ${marker('arrow-accent', tokens.accent)}
    ${marker('arrow-link', tokens.link)}
    ${opts.sketchy ? `<filter id="${uid('sketchy')}" x="-2%" y="-2%" width="104%" height="104%"><feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="1.5"/></filter>` : ''}
  </defs>
  <rect width="${scene.width}" height="${height}" fill="${tokens.paper}"/>
  ${opts.sketchy
    ? `<g filter="url(#${uid('sketchy')})">${items.filter((i) => i.prim.t !== 'text').map((i) => primToSvg(i.prim, uid)).join('\n  ')}</g>\n  ${items.filter((i) => i.prim.t === 'text').map((i) => primToSvg(i.prim, uid)).join('\n  ')}`
    : items.map((i) => primToSvg(i.prim, uid)).join('\n  ')}
  ${legend}
</svg>`
}

/** Self-contained HTML document (embedded CSS, inline SVG, no JS). */
export function sceneToHtml(scene: Scene): string {
  const tokens = resolveSkin(scene.skin, scene.theme)
  const svg = sceneToSvg(scene)
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeXml(scene.aria.title)}</title>
<link href="${FONT_LINK}" rel="stylesheet">
<style>
  :root { color-scheme: ${scene.theme}; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 48px 24px; background: ${tokens.paper}; color: ${tokens.ink};
    font: 16px/1.6 ${FONT_STACK.sans};
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: ${scene.width + 80}px; margin: 0 auto; }
  .eyebrow {
    font-family: ${FONT_STACK.mono}; font-size: 8px; font-weight: 500;
    letter-spacing: .18em; text-transform: uppercase; color: ${tokens.soft}; margin: 0 0 8px;
  }
  h1 {
    font-family: ${FONT_STACK.serif}; font-size: 32px; font-weight: 400;
    margin: 0 0 6px; letter-spacing: -.01em;
  }
  .sub { color: ${tokens.muted}; margin: 0 0 32px; max-width: 68ch; }
  .figure { overflow-x: auto; }
  .footer {
    margin-top: 40px; padding-top: 12px; border-top: 1px solid ${tokens.rule};
    font-family: ${FONT_STACK.mono}; font-size: 9px; color: ${tokens.soft};
    display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap;
  }
  @media (max-width: 640px) { body { padding: 24px 16px; } h1 { font-size: 24px; } }
</style>
</head>
<body>
  <main class="wrap">
    <p class="eyebrow">${escapeXml(scene.aria.slug.replace(/-/g, ' '))}</p>
    <h1>${escapeXml(scene.aria.title)}</h1>
    <p class="sub">${escapeXml(scene.aria.desc)}</p>
    <div class="figure">${svg}</div>
    <footer class="footer">
      <span>Diagram Design · AgentOS editorial system</span>
      <span>${scene.width}×${scene.height} · ${scene.theme} · ${scene.variant}</span>
    </footer>
  </main>
</body>
</html>`
}

export { alpha, STROKE }
