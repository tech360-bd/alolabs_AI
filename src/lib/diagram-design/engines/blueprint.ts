/**
 * Service blueprint engine — the customer/hidden-service census (type-service-blueprint.md).
 *
 * The load-bearing element is the **line of visibility**: customer and
 * frontstage actions sit above it, backstage and support below it, on one
 * shared stage grid. There are no connector arrows — stage order is the
 * sequence, and wait times are cell text. Empty required cells print `—`.
 *
 * Layer order, top → bottom:
 *   evidence? → customer → interaction hairline → frontstage →
 *   visibility line (2px ink @ 0.55) → backstage → internal hairline → support?
 */

import { snap } from '../geometry'
import { RADIUS, STROKE, alpha } from '../tokens'
import type { BlueprintLayerId, DiagramSpec } from '../spec'
import { SceneBuilder } from '../scene'
import { fixedLegend, rampOf } from './shared'

/** Layer bands in draw order. Required layers complete every stage column. */
const LAYER_ORDER: BlueprintLayerId[] = ['evidence', 'customer', 'frontstage', 'backstage', 'support']

const LAYER_LABEL: Record<BlueprintLayerId, string> = {
  evidence: 'PHYSICAL EVIDENCE',
  customer: 'CUSTOMER ACTIONS',
  frontstage: 'FRONTSTAGE ACTIONS',
  backstage: 'BACKSTAGE ACTIONS',
  support: 'SUPPORT PROCESSES',
}

const LAYER_H: Record<BlueprintLayerId, number> = {
  evidence: 48,
  customer: 64,
  frontstage: 64,
  backstage: 64,
  support: 48,
}

/** Hairline bands (8px including stroke) between layers. */
const LINE_BAND = 8
const HEADER_H = 48
const MARGIN_LEFT = 96
const GUTTER = 16

export function renderServiceBlueprint(spec: DiagramSpec, b: SceneBuilder): void {
  const data = spec.blueprint
  const stages = data?.stages ?? []
  const cells = data?.cells ?? []
  const requested = data?.layers
  const fallback: BlueprintLayerId[] = ['customer', 'frontstage', 'backstage']
  const layers: BlueprintLayerId[] = (requested && requested.length ? requested : fallback).filter((l) =>
    LAYER_ORDER.includes(l),
  )
  // Preserve the canonical top→bottom order regardless of authoring order.
  layers.sort((x, y) => LAYER_ORDER.indexOf(x) - LAYER_ORDER.indexOf(y))
  if (!layers.includes('customer')) layers.unshift('customer')
  if (!layers.includes('frontstage')) layers.splice(layers.indexOf('customer') + 1, 0, 'frontstage')
  if (!layers.includes('backstage')) layers.push('backstage')

  const ramp = rampOf(b)
  const colCount = Math.max(stages.length, 1)
  const gridW = b.width - MARGIN_LEFT - 40
  const colW = snap((gridW - GUTTER * (colCount - 1)) / colCount)
  const colX = (i: number) => snap(MARGIN_LEFT + i * (colW + GUTTER))

  // ── Stage headers ─────────────────────────────────────────────────────────
  const headerY = 24
  stages.forEach((stage, i) => {
    b.rect({ x: colX(i), y: headerY, w: colW, h: HEADER_H }, { fill: 'transparent', layer: 12, id: `stage-${stage.id}` })
    b.text(colX(i) + colW / 2, headerY + HEADER_H / 2 + 4, stage.label, {
      role: 'nodeName',
      fill: b.t.ink,
      anchor: 'middle',
      layer: 13,
    })
  })

  // ── Layer bands ───────────────────────────────────────────────────────────
  let cursor = headerY + HEADER_H
  const bandY = new Map<BlueprintLayerId, number>()
  const lineY: { interaction?: number; visibility?: number; internal?: number } = {}

  for (const layer of layers) {
    bandY.set(layer, cursor)
    cursor += LAYER_H[layer]
    const next = layers[layers.indexOf(layer) + 1]
    // Hairlines only between layers that have a named line between them.
    if (layer === 'customer' && next === 'frontstage') {
      lineY.interaction = snap(cursor + LINE_BAND / 2)
      cursor += LINE_BAND
    } else if (layer === 'frontstage' && next === 'backstage') {
      lineY.visibility = snap(cursor + LINE_BAND / 2)
      cursor += LINE_BAND
    } else if (layer === 'backstage' && next === 'support') {
      lineY.internal = snap(cursor + LINE_BAND / 2)
      cursor += LINE_BAND
    }
  }

  const plotRight = colX(colCount - 1) + colW

  // Interaction + internal-interaction: 1px rule. Visibility: 2px ink @ 0.55 —
  // it must clear 3:1 on paper; 0.45 fails that bar on light paper.
  if (lineY.interaction !== undefined) {
    b.line(MARGIN_LEFT, lineY.interaction, plotRight, lineY.interaction, {
      stroke: b.t.rule,
      width: STROKE.default,
      layer: 15,
    })
  }
  if (lineY.visibility !== undefined) {
    b.line(MARGIN_LEFT, lineY.visibility, plotRight, lineY.visibility, {
      stroke: alpha(b.t.ink, 0.55),
      width: 2,
      layer: 15,
    })
  }
  if (lineY.internal !== undefined) {
    b.line(MARGIN_LEFT, lineY.internal, plotRight, lineY.internal, {
      stroke: b.t.rule,
      width: STROKE.default,
      layer: 15,
    })
  }

  // ── Layer labels (left margin, mono, uppercase, horizontal only) ──────────
  for (const layer of layers) {
    const y = (bandY.get(layer) ?? 0) + LAYER_H[layer] / 2 + 3
    b.text(88, y, LAYER_LABEL[layer], {
      role: 'zoneLabel',
      fill: b.t.soft,
      anchor: 'end',
      layer: 13,
    })
  }

  // ── Cells — one action per stage per layer ────────────────────────────────
  for (const layer of layers) {
    const y = bandY.get(layer) ?? 0
    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i]
      const cell = cells.find((c) => c.stage === stage.id && c.layer === layer)
      const empty = !cell || !cell.name
      const name = cell?.name ?? '—'
      const focal = Boolean(cell?.focal)
      const below = layer === 'backstage' || layer === 'support'

      // Focal cell: accent fill + accent stroke, ≤1 per diagram. Above-line
      // layers are paper/white on ink; below-line layers take a light ink tint
      // so hidden work reads as hidden.
      const fill = focal ? b.t.accentTint : below ? alpha(b.t.ink, 0.06) : '#ffffff'
      const stroke = focal ? b.t.accent : b.t.ink
      b.rect({ x: colX(i), y, w: colW, h: LAYER_H[layer] }, {
        fill,
        stroke,
        width: focal ? STROKE.strong : STROKE.default,
        rx: RADIUS.sm,
        layer: 41,
        id: `cell-${stage.id}-${layer}`,
      })

      const hasSub = Boolean(cell?.sublabel)
      const nameY = y + LAYER_H[layer] / 2 + (hasSub ? -2 : 4)
      b.text(colX(i) + colW / 2, nameY, name, {
        role: 'nodeName',
        fill: focal ? b.t.accent : empty ? b.t.soft : b.t.ink,
        anchor: 'middle',
        layer: 45,
      })
      if (cell?.sublabel) {
        b.text(colX(i) + colW / 2, y + LAYER_H[layer] / 2 + 16, cell.sublabel, {
          role: 'sublabel',
          fill: b.t.muted,
          anchor: 'middle',
          layer: 45,
        })
      }
    }
  }

  // Legend: visibility line, backstage layer, focal cell — in that order.
  fixedLegend(spec, b, [
    { kind: 'arrow', label: 'Line of visibility' },
    { kind: 'store', label: 'Backstage layer' },
    { kind: 'focal', label: 'Focal cell' },
  ])
}
