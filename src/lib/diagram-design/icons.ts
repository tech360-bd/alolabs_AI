/**
 * Icon lookup and placement markup for the `icon` primitive.
 *
 * The icon set itself is generated from the upstream reference by
 * scripts/sync-diagram-icons.mjs (see icons.generated.ts for attribution).
 * Markup is trusted: it comes only from that generated module, never from user input.
 * User input selects an icon by name; unknown names render nothing.
 */

import { DIAGRAM_ICONS, type DiagramIcon } from './icons.generated'

const BY_NAME = new Map<string, DiagramIcon>(DIAGRAM_ICONS.map((i) => [i.name, i]))

export function hasIcon(name: string | undefined): boolean {
  return Boolean(name && BY_NAME.has(name))
}

export function getIcon(name: string): DiagramIcon | undefined {
  return BY_NAME.get(name)
}

export function iconNames(): string[] {
  return DIAGRAM_ICONS.map((i) => i.name)
}

/**
 * Nested <svg> placed at (x, y) and sized to `size`. The icon keeps its own viewBox,
 * so brand marks with 100×100 or 128×128 canvases scale without distortion.
 */
export function iconMarkup(name: string, x: number, y: number, size: number): string {
  const icon = BY_NAME.get(name)
  if (!icon) return ''
  return icon.markup.replace(
    /^<svg\b/,
    `<svg x="${round(x)}" y="${round(y)}" width="${round(size)}" height="${round(size)}" data-icon="${icon.name}"`,
  )
}

function round(v: number): number {
  return Math.round(v * 100) / 100
}
