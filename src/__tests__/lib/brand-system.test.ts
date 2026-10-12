/**
 * Brand system — integrity tests.
 *
 * The brand sheet is a contract: the palette, the gradients, the corporate
 * contact block, the two typefaces, the flow and the documents all have to match
 * it. These tests are the executable form of that contract, plus the invoice
 * arithmetic (which is real money maths, even when the balance is zero).
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  BRAND,
  BRAND_FONTS,
  BRAND_RULES,
  COMPANY,
  GRADIENTS,
  HEADLINE_STATS,
  COMMAND_TILES,
  COMMAND_TAB_BAR,
  SYSTEM_FLOW,
  LETTERHEAD,
  USAGE_RULES,
} from '@/lib/brand/tokens'
import {
  computeInvoice,
  formatMoney,
  sampleInvoice,
  invoiceToText,
  type Invoice,
} from '@/lib/brand/invoice'
import { invoiceToHtml, invoiceEmailSubject, invoiceEmailText } from '@/lib/brand/invoice-html'

const root = process.cwd()
const readSvg = (rel: string) => readFileSync(join(root, rel), 'utf8')

// ─── Palette ─────────────────────────────────────────────────────────────────

describe('brand — palette', () => {
  it('carries the two primary brand colours from the guideline', () => {
    expect(BRAND.orange).toBe('#FF6A00')
    expect(BRAND.blue).toBe('#003ABC')
  })

  it('keeps the alternate blue and the gradient stops named', () => {
    expect(BRAND.blueAlt).toBe('#0D47A1')
    expect(BRAND.blueLight).toBe('#0077FF')
    expect(BRAND.orangeLight).toBe('#FF8A2B')
    expect(BRAND.blueDeep).toBe('#001C6B')
  })

  it('publishes both approved gradients with their stops', () => {
    expect(GRADIENTS.orange.from).toBe('#FF6A00')
    expect(GRADIENTS.orange.to).toBe('#FFB300')
    expect(GRADIENTS.blue.from).toBe('#003ABC')
    expect(GRADIENTS.blue.to).toBe('#0077FF')
  })

  it('documents the usage guide for orange, blue, white and gray', () => {
    expect(USAGE_RULES.map((r) => r.label)).toEqual(['Orange', 'Blue', 'White', 'Gray'])
    expect(USAGE_RULES[0].detail).toMatch(/primary buttons/i)
    expect(USAGE_RULES[1].detail).toMatch(/navigation/i)
  })

  it('has an alpha-valid hex for every swatch', () => {
    const all = [...USAGE_RULES.map((r) => r.swatch), BRAND.orange, BRAND.blue, BRAND.canvas, BRAND.ink]
    for (const hex of all) expect(hex).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })
})

// ─── Typography ──────────────────────────────────────────────────────────────

describe('brand — typography', () => {
  it('uses Inter as the primary face and Poppins as the secondary', () => {
    expect(BRAND_FONTS.primary.name).toBe('Inter')
    expect(BRAND_FONTS.secondary.name).toBe('Poppins')
    expect(BRAND_FONTS.primary.stack).toContain('Inter')
    expect(BRAND_FONTS.secondary.stack).toContain('Poppins')
  })

  it('exposes a specimen covering the full alphabet and digits', () => {
    expect(BRAND_FONTS.specimen).toContain('Aa Bb Cc')
    expect(BRAND_FONTS.specimen).toContain('0123456789')
  })

  it('loads both faces in the root layout', () => {
    const layout = readFileSync(join(root, 'src/app/layout.tsx'), 'utf8')
    expect(layout).toContain('family=Inter')
    expect(layout).toContain('family=Poppins')
    expect(layout).toContain('/brand/alo-icon.svg')
  })

  it('registers the brand font variables in globals.css', () => {
    const css = readFileSync(join(root, 'src/app/globals.css'), 'utf8')
    expect(css).toContain("--font-inter-brand: 'Inter'")
    expect(css).toContain("--font-poppins: 'Poppins'")
    expect(css).toContain('@page')
  })
})

// ─── Corporate identity ──────────────────────────────────────────────────────

describe('brand — corporate identity', () => {
  it('matches the letterhead contact block exactly', () => {
    expect(COMPANY.entity).toBe('SOLE MBR')
    expect(COMPANY.address).toEqual(['117 S LEXINGTON ST STE 100', 'HARRISONVILLE, MO 64701'])
    expect(COMPANY.phone).toBe('+1 (347) 433 1200')
    expect(COMPANY.website).toBe('www.alolabs.net')
    expect(COMPANY.email).toBe('info@alolabs.net')
  })

  it('lists the four domains from the guideline footer', () => {
    expect(COMPANY.domains.map((d) => d.value)).toEqual([
      'alolabs.net',
      'command.alolabs.net',
      'agents.alolabs.net',
      'api.alolabs.net',
    ])
  })

  it('carries the headline statistics', () => {
    expect(HEADLINE_STATS.map((s) => `${s.value} ${s.label}`)).toEqual([
      '1 Command Center',
      '1020 AI Agents',
      '100+ Departments',
      'Unlimited Possibilities',
    ])
  })

  it('keeps the eight brand usage rules', () => {
    expect(BRAND_RULES).toHaveLength(8)
    expect(BRAND_RULES[0]).toMatch(/official logo/i)
    expect(BRAND_RULES.join(' ')).toMatch(/mobile-first/i)
  })
})

// ─── System flow & mobile surface ────────────────────────────────────────────

describe('brand — system flow', () => {
  it('walks admin → command centre → routers → agents → RAG → approval → execution', () => {
    const main = SYSTEM_FLOW.filter((n) => !n.branch).map((n) => n.label)
    expect(main).toEqual([
      'YOU (SUPER ADMIN)',
      'ALO COMMAND CENTER',
      'MASTER ROUTER',
      'DEPARTMENT ROUTER',
      '1020 AI AGENTS',
      'MEMORY SYSTEM',
      'HYBRID RAG ENGINE',
      'APPROVAL ENGINE',
      'EXECUTION & AUTOMATION',
      'RESULT / REPORT / ACTION',
    ])
  })

  it('marks the action path orange and the system path blue', () => {
    const tone = (id: string) => SYSTEM_FLOW.find((n) => n.id === id)?.tone
    expect(tone('admin')).toBe('orange')
    expect(tone('agents')).toBe('orange')
    expect(tone('rag')).toBe('orange')
    expect(tone('execution')).toBe('orange')
    expect(tone('command')).toBe('blue')
    expect(tone('master')).toBe('blue')
    expect(tone('approval')).toBe('blue')
    expect(tone('memory')).toBe('blue')
  })

  it('branches into five departments and three RAG families', () => {
    const branches = SYSTEM_FLOW.filter((n) => n.branch)
    expect(branches.filter((b) => b.tone === 'blue').map((b) => b.label)).toEqual([
      'WEBSITE DEPARTMENT',
      'CRM DEPARTMENT',
      'MARKETING DEPARTMENT',
      'STUDENT OPS DEPARTMENT',
      'FINANCE DEPARTMENT',
    ])
    expect(branches.filter((b) => b.tone === 'outline').map((b) => b.label)).toEqual([
      'CLASSIC RAG',
      'GRAPH RAG',
      'AGENTIC RAG',
    ])
  })

  it('ships the twelve-tile mobile command centre with a four-tab bar', () => {
    expect(COMMAND_TILES).toHaveLength(12)
    expect(COMMAND_TILES.slice(0, 3)).toEqual(['Dashboard', 'Agents', 'Tasks'])
    expect(COMMAND_TILES).toContain('Students')
    expect(COMMAND_TAB_BAR).toEqual(['Home', 'Chat', 'Notifications', 'Profile'])
  })
})

// ─── Assets ──────────────────────────────────────────────────────────────────

describe('brand — assets', () => {
  const assets = [
    'public/brand/alo-mark.svg',
    'public/brand/alo-icon.svg',
    'public/brand/alo-wordmark.svg',
    'public/brand/alo-logo-horizontal.svg',
    'public/brand/alo-logo-stacked.svg',
    'public/brand/alo-badge.svg',
    'public/icons/icon-192.svg',
    'public/icons/icon-512.svg',
  ]

  it.each(assets)('%s exists and is well-formed SVG', (rel) => {
    expect(existsSync(join(root, rel)), `${rel} missing`).toBe(true)
    const svg = readSvg(rel)
    expect(svg.trimStart().startsWith('<svg')).toBe(true)
    expect(svg).toContain('</svg>')
    expect(svg).toContain('viewBox=')
    expect(svg).not.toContain('<script')
  })

  it('uses only brand colours and gradients inside the mark', () => {
    // Strip XML comments: the header comment documents the gradient stops.
    const mark = readSvg('public/brand/alo-mark.svg').replace(/<!--[\s\S]*?-->/g, '')
    expect(mark).toContain('#FF6A00')
    expect(mark).toContain('#0077FF')
    expect(mark).toContain('#003ABC')
    expect(mark).toContain('#001C6B')
    // No off-brand hues: every hex in the mark must be one of the four stops.
    const hexes = new Set(mark.match(/#[0-9A-Fa-f]{6}/g) ?? [])
    for (const hex of hexes) {
      expect(
        ['#FF6A00', '#FF8A2B', '#0077FF', '#0047A1', '#003ABC', '#001C6B', '#0053C8'],
        `${hex} is off-brand`,
      ).toContain(hex)
    }
  })

  it('draws the hexagon shell in brand orange in every lockup', () => {
    for (const rel of ['public/brand/alo-mark.svg', 'public/brand/alo-icon.svg', 'public/brand/alo-logo-horizontal.svg', 'public/brand/alo-logo-stacked.svg']) {
      const svg = readSvg(rel)
      expect(svg, rel).toMatch(/stroke="#FF6A00"/)
    }
  })

  it('builds the circular badge from the sheet: traces, swooshes, rule and dot', () => {
    const svg = readSvg('public/brand/alo-badge.svg')
    expect(svg).toContain('<circle cx="256" cy="256" r="252"')
    expect(svg).toContain('stroke="#E4EAF3"')          // circuit traces
    expect(svg).toContain('fill="#FF6A00"')            // orange rim + swoosh
    expect(svg).toContain('fill="#003ABC"')            // blue swoosh + wordmark
    expect(svg).toContain('<circle cx="256" cy="400" r="6"')  // the orange dot
    expect(svg).toContain('AI AGENT OPERATING SYSTEM')
    expect(svg).toContain('AGENTOS')
  })

  it('carries the rule-and-dot divider in the stacked lockup', () => {
    const svg = readSvg('public/brand/alo-logo-stacked.svg')
    expect(svg).toMatch(/stroke="#003ABC" stroke-width="2"/)
    expect(svg).toContain('<circle cx="240" cy="368" r="6" fill="#FF6A00"')
  })

  it('exposes the badge and the rule as React lockups', () => {
    const src = readFileSync(join(root, 'src/components/brand/alo-logo.tsx'), 'utf8')
    expect(src).toContain("variant === 'badge'")
    expect(src).toContain('export function Badge(')
    expect(src).toContain('export function BrandRule(')
    expect(src).toContain("| 'badge'")
  })

  it('keeps the app icons on a rounded white tile', () => {
    for (const rel of ['public/icons/icon-192.svg', 'public/icons/icon-512.svg']) {
      const svg = readSvg(rel)
      expect(svg).toContain('rx="52"')
      expect(svg).toContain('fill="#FFFFFF"')
    }
  })
})

// ─── Letterhead geometry ─────────────────────────────────────────────────────

describe('brand — letterhead', () => {
  it('is an A4 sheet', () => {
    expect(LETTERHEAD.widthMm).toBe(210)
    expect(LETTERHEAD.heightMm).toBe(297)
    // 794 × 1123 px is A4 at 96 dpi
    expect(Math.round((LETTERHEAD.widthMm / 25.4) * 96)).toBe(794)
    expect(Math.round((LETTERHEAD.heightMm / 25.4) * 96)).toBe(1123)
  })

  it('specifies the orange and blue frame rules', () => {
    expect(LETTERHEAD.frame.orange).toBe(BRAND.orange)
    expect(LETTERHEAD.frame.blue).toBe(BRAND.blue)
  })

  it('renders the masthead, the frame and the four contact items', () => {
    const src = readFileSync(join(root, 'src/components/brand/letterhead.tsx'), 'utf8')
    expect(src).toContain('AloLabsLogo')
    expect(src).toContain('ContactStrip')
    // The four items on the printed pad.
    for (const label of ['Address', 'Phone', 'Website', 'Email']) expect(src).toContain(`label: '${label}'`)
    // The frame bands use the brand colours, not literals.
    expect(src).toContain('BRAND.orange')
    expect(src).toContain('BRAND.blue')
  })

  it('prints to true A4 and hides chrome', () => {
    const css = readFileSync(join(root, 'src/app/globals.css'), 'utf8')
    expect(css).toMatch(/@media print/)
    expect(css).toMatch(/size:\s*A4/)
    expect(css).toContain('.no-print')
    expect(css).toContain('.alo-print-sheet')
  })
})

// ─── Invoice arithmetic ──────────────────────────────────────────────────────

describe('invoice — arithmetic', () => {
  const base: Invoice = {
    meta: { number: 'T-1', issued: '2026-10-08', project: 'Test', currency: 'USD' },
    from: { name: 'ALO Labs', lines: [] },
    to: { name: 'Client', lines: [] },
    lines: [
      { id: 'a', description: 'Tokens', quantity: 1000, unit: 'k tokens', rate: 0.01 },
      { id: 'b', description: 'Calls', quantity: 2500, unit: 'calls', rate: 0.002 },
    ],
    policy: { discountRate: 1, taxRate: 0, chargeable: false, note: '' },
  }

  it('sums the lines', () => {
    expect(computeInvoice(base).subtotal).toBe(15)
  })

  it('writes off the full subtotal under the house policy and bills nothing', () => {
    const t = computeInvoice(base)
    expect(t.discount).toBe(15)
    expect(t.net).toBe(0)
    expect(t.total).toBe(0)
    expect(t.avoided).toBe(0)
  })

  it('reports the avoided amount when the subtotal is billed at zero', () => {
    const invoice: Invoice = { ...base, policy: { ...base.policy, discountRate: 0 } }
    const t = computeInvoice(invoice)
    expect(t.total).toBe(0)
    expect(t.avoided).toBe(15)
  })

  it('bills the net plus tax when the invoice is chargeable', () => {
    const invoice: Invoice = { ...base, policy: { ...base.policy, discountRate: 0.5, taxRate: 0.2, chargeable: true } }
    const t = computeInvoice(invoice)
    expect(t.subtotal).toBe(15)
    expect(t.discount).toBe(7.5)
    expect(t.net).toBe(7.5)
    expect(t.tax).toBe(1.5)
    expect(t.total).toBe(9)
    expect(t.avoided).toBe(0)
  })

  it('rounds once, at the cent, and never goes negative', () => {
    const invoice: Invoice = {
      ...base,
      lines: [{ id: 'c', description: 'Odd', quantity: 3, unit: 'units', rate: 0.3333 }],
      policy: { discountRate: -1, taxRate: -5, chargeable: true, note: '' },
    }
    const t = computeInvoice(invoice)
    expect(t.subtotal).toBe(1)
    expect(t.discount).toBe(0)
    expect(t.tax).toBe(0)
    expect(t.total).toBe(1)
  })

  it('formats money and dates in the invoice locale', () => {
    expect(formatMoney(1234.5)).toBe('$1,234.50')
    expect(formatMoney(0)).toBe('$0.00')
  })

  it('carries the no-fee policy note on the sample invoice', () => {
    const invoice = sampleInvoice()
    expect(invoice.policy.chargeable).toBe(false)
    expect(invoice.policy.discountRate).toBe(1)
    expect(invoice.policy.note).toMatch(/No fee/i)
    expect(invoice.lines.length).toBeGreaterThanOrEqual(6)
  })

  it('states the avoided cost on the sample invoice', () => {
    const totals = computeInvoice(sampleInvoice())
    expect(totals.total).toBe(0)
    expect(totals.avoided).toBe(0) // fully discounted ⇒ the avoided figure is the net
    expect(totals.net).toBe(0)
    expect(totals.subtotal).toBeGreaterThan(1000)
    expect(totals.subtotal).toBeLessThan(20000)
  })

  it('renders a plain-text version with every line, the balance and the policy', () => {
    const text = invoiceToText(sampleInvoice())
    expect(text).toContain('Invoice ALO-2026-0001')
    expect(text).toContain('Total due $0.00')
    expect(text).toContain('Cost avoided')
    expect(text).toContain('No fee is charged')
    expect(text.split('\n').filter(Boolean).length).toBeGreaterThan(10)
  })

  it('accepts a zero-line invoice without dividing by zero', () => {
    const empty: Invoice = { ...base, lines: [] }
    const t = computeInvoice(empty)
    expect(t.subtotal).toBe(0)
    expect(t.lineCount).toBe(0)
    expect(t.total).toBe(0)
  })
})

// ─── Surfaces ────────────────────────────────────────────────────────────────

describe('brand — surfaces', () => {
  it('exposes the brand book and the invoice as routes', () => {
    expect(existsSync(join(root, 'src/app/brand/page.tsx'))).toBe(true)
    expect(existsSync(join(root, 'src/app/invoice/page.tsx'))).toBe(true)
  })

  it('registers both surfaces in the enterprise shell', () => {
    const shell = readFileSync(join(root, 'src/components/enterprise/enterprise-shell.tsx'), 'utf8')
    expect(shell).toContain("| 'brand-book'")
    expect(shell).toContain("| 'invoice'")
    expect(shell).toContain("'brand-book': lazy(")
    expect(shell).toContain('invoice: lazy(')
  })

  it('builds the brand book from tokens, not literals', () => {
    const book = readFileSync(join(root, 'src/components/brand/brand-book.tsx'), 'utf8')
    for (const token of ['BRAND.orange', 'BRAND.blue', 'GRADIENTS', 'BRAND_FONTS', 'USAGE_RULES', 'BRAND_RULES', 'HEADLINE_STATS']) {
      expect(book, token).toContain(token)
    }
    // The only hex literals in the book are the two quoted inside the AI-studio
    // master prompt; every style value comes from the tokens module.
    expect((book.match(/#FF6A00/g) ?? []).length).toBeLessThanOrEqual(2)
    expect((book.match(/#003ABC/g) ?? []).length).toBeLessThanOrEqual(2)
    expect(book).not.toMatch(/style=\{\{[^}]*#[0-9A-Fa-f]{6}/)
  })

  it('offers the badge in the brand book, with a download', () => {
    const book = readFileSync(join(root, 'src/components/brand/brand-book.tsx'), 'utf8')
    expect(book).toContain('Circular badge (seal)')
    expect(book).toContain('/brand/alo-badge.svg')
    expect(book).toContain('Badge SVG')
  })

  it('renders the sample agent specification cards from the list sheet', () => {
    const src = readFileSync(join(root, 'src/components/brand/agent-spec-card.tsx'), 'utf8')
    expect(src).toContain('AGENT-0801')
    expect(src).toContain('Master Command Router Agent')
    expect(src).toContain('AGENT-0804')
    expect(src).toContain('Memory Search Agent')
  })
})

// ─── Portable letterhead (HTML) ──────────────────────────────────────────────

describe('invoice — portable HTML pad', () => {
  const invoice = sampleInvoice()
  const html = invoiceToHtml(invoice)

  it('is a standalone document with a title', () => {
    expect(html.trimStart().startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).toContain('<title>Invoice ALO-2026-0001')
    expect(html).toContain('</html>')
  })

  it('carries the letterhead: mark, contact strip and every contact detail', () => {
    expect(html).toContain('<svg') // the mark is inline, no asset fetch
    for (const value of [COMPANY.address[0], COMPANY.address[1], COMPANY.phone, COMPANY.website, COMPANY.email, COMPANY.entity]) {
      expect(html, value).toContain(value)
    }
    for (const label of ['Address', 'Phone', 'Website', 'Email']) expect(html).toContain(`>${label}<`)
  })

  it('uses table layout and inline styles only — no classes, flex or grid', () => {
    expect(html).toContain('<table role="presentation"')
    expect(html).not.toMatch(/class="[^"]*\b(flex|grid)\b/)
    expect(html).not.toContain('@tailwind')
  })

  it('prints to A4 with colours preserved', () => {
    expect(html).toContain('@page{size:A4;margin:0}')
    expect(html).toContain('print-color-adjust:exact')
  })

  it('contains the arithmetic: every line, the balance and the avoided cost', () => {
    const totals = computeInvoice(invoice)
    expect(html).toContain('Balance due')
    expect(html).toContain('Cost avoided')
    expect(html).toContain(formatMoney(totals.subtotal))
    expect(html).toContain(formatMoney(totals.total))
    const escaped = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    for (const line of invoice.lines) expect(html).toContain(escaped(line.description))
  })

  it('states the no-fee policy and escapes user content', () => {
    expect(html).toContain('No fee is charged')
    const risky = invoiceToHtml({
      ...invoice,
      meta: { ...invoice.meta, project: '<script>alert(1)</script>' },
    })
    expect(risky).toContain('&lt;script&gt;')
    expect(risky).not.toContain('<script>alert(1)</script>')
  })

  it('can omit the contact strip and the print styles', () => {
    const bare = invoiceToHtml(invoice, { contactStrip: false, printStyles: false })
    expect(bare).not.toContain('>Address<')
    expect(bare).not.toContain('@page')
  })

  it('provides subject and plain-text alternatives for the email', () => {
    expect(invoiceEmailSubject(invoice)).toContain('ALO-2026-0001')
    const text = invoiceEmailText(invoice)
    expect(text).toContain('Balance due: $0.00')
    expect(text).toContain('Cost avoided')
    expect(text).toContain(COMPANY.email)
  })
})

// ─── Public website built from the shared designs ────────────────────────────

describe('site — the designs used on the website', () => {
  const src = readFileSync(join(root, 'src/components/site/marketing-site.tsx'), 'utf8')
  const page = readFileSync(join(root, 'src/app/site/page.tsx'), 'utf8')

  it('exposes the marketing site as a route', () => {
    expect(page).toContain('MarketingSite')
    expect(page).toContain('export const metadata')
  })

  it('composes the shared designs: flow, agent cards, mobile view, contact strip', () => {
    for (const part of ['SystemFlow', 'AgentSpecCard', 'SPEC_SAMPLE', 'CommandCenterMobile', 'AloLabsLogo']) {
      expect(src, part).toContain(part)
    }
  })

  it('renders every section from tokens rather than literals', () => {
    for (const token of ['HEADLINE_STATS', 'COMPANY', 'SYSTEM_FLOW', 'BRAND_FONTS']) {
      expect(src, token).toContain(token)
    }
    expect(src).not.toMatch(/#FF6A00/)
    expect(src).not.toMatch(/#003ABC/)
  })

  it('prints the four letterhead contact details in the footer', () => {
    for (const token of ['COMPANY.address[0]', 'COMPANY.address[1]', 'COMPANY.phone', 'COMPANY.website', 'COMPANY.email', 'COMPANY.entity']) {
      expect(src, token).toContain(token)
    }
    expect(src).toContain('COMPANY.domains')
  })

  it('uses the badge as a seal and the rule-and-dot divider', () => {
    expect(src).toContain('<Badge size={96} />')
    expect(src).toContain('<BrandRule width={150}')
  })

  it('links the app, the brand book and the invoice', () => {
    expect(src).toContain('href="/"')
    expect(src).toContain('href="/brand"')
    expect(src).toContain('href="/invoice"')
  })
})

// ─── Sending the invoice ─────────────────────────────────────────────────────

describe('invoice — sending', () => {
  const dialog = readFileSync(join(root, 'src/components/brand/send-invoice-dialog.tsx'), 'utf8')

  it('sends through the platform mail accounts, not a third party', () => {
    expect(dialog).toContain("fetchApi<{ data: EmailAccount[] }>('/api/email/accounts')")
    expect(dialog).toContain("fetchApi('/api/email/send'")
  })

  it('posts the letterhead HTML and the text alternative', () => {
    expect(dialog).toContain('invoiceToHtml(invoice')
    expect(dialog).toContain('invoiceEmailText(invoice)')
    expect(dialog).toContain('invoiceEmailSubject(invoice)')
  })

  it('validates the recipient before sending', () => {
    expect(dialog).toContain('Enter a valid recipient address')
    expect(dialog).toContain('@[^@')
  })

  it('is reachable from the invoice panel', () => {
    const panel = readFileSync(join(root, 'src/components/brand/invoice-panel.tsx'), 'utf8')
    expect(panel).toContain('SendInvoiceDialog')
  })
})
