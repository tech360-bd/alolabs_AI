'use client'

/**
 * BrandBook — the living version of the supplied “Final Brand & System
 * Guideline” sheet.
 *
 * Everything on the page is generated from `@/lib/brand/tokens`: lockups, the
 * colour system and gradients, the usage guide, Inter/Poppins specimens, the
 * orange-and-blue system flow, the mobile command centre, the agent
 * specification cards, the letterhead, and the brand usage rules.
 */

import * as React from 'react'
import Link from 'next/link'
import {
  AloLabsLogo,
  Badge as BrandBadge,
  BrandRibbon,
  BrandRule,
  Mark,
} from './alo-logo'
import { SystemFlow } from './system-flow'
import { CommandCenterMobile } from './command-center-mobile'
import { AgentSpecCard, SPEC_SAMPLE } from './agent-spec-card'
import { Letterhead } from './letterhead'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  BRAND,
  BRAND_FONTS,
  BRAND_RULES,
  BRAND_VERSION,
  COMPANY,
  GRADIENTS,
  HEADLINE_STATS,
  USAGE_RULES,
} from '@/lib/brand/tokens'
import {
  CheckCircle2,
  Download,
  FileText,
  Layers,
  Palette,
  Type as TypeIcon,
  XCircle,
  Printer,
} from 'lucide-react'

const TABS = [
  { id: 'logo', label: 'Logo', icon: Layers },
  { id: 'color', label: 'Colour', icon: Palette },
  { id: 'type', label: 'Typography', icon: TypeIcon },
  { id: 'system', label: 'System flow', icon: Layers },
  { id: 'documents', label: 'Documents', icon: FileText },
] as const

type Tab = (typeof TABS)[number]['id']

export function BrandBook() {
  const [tab, setTab] = React.useState<Tab>('logo')

  return (
    <div className="min-h-screen" style={{ background: BRAND.canvas, fontFamily: BRAND_FONTS.primary.stack }}>
      <header className="border-b bg-white" style={{ borderColor: BRAND.grayLine }}>
        <div className="mx-auto max-w-[1400px] px-6 py-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: BRAND.gray }}>
                ALO Labs · brand &amp; system guideline
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight" style={{ color: BRAND.blue }}>
                {BRAND_VERSION.label}
              </h1>
              <p className="mt-2 max-w-[78ch] text-sm leading-relaxed" style={{ color: BRAND.gray }}>
                The official lockups, the orange and blue colour system with its gradients, the Inter and Poppins
                registers, the command-centre system flow, the mobile surface, the agent specification cards and the
                letterhead every document is printed on. Everything below renders from one tokens module —{' '}
                <code className="font-mono text-[12px]" style={{ color: BRAND.orange }}>
                  src/lib/brand/tokens.ts
                </code>
                .
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge className="font-mono text-[10px] uppercase tracking-wider" style={{ background: BRAND.orange }}>
                  {BRAND_VERSION.revision}
                </Badge>
                <Badge variant="secondary" className="font-mono text-[10px] uppercase tracking-wider">
                  {BRAND_VERSION.marks.length} official lockups
                </Badge>
                <Badge variant="secondary" className="font-mono text-[10px] uppercase tracking-wider">
                  Inter + Poppins
                </Badge>
                <Badge variant="secondary" className="font-mono text-[10px] uppercase tracking-wider">
                  A4 letterhead
                </Badge>
              </div>
            </div>
            <div className="flex flex-col items-end gap-3">
              <AloLabsLogo size={72} tagline />
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link href="/design">
                    <Layers className="size-3.5" /> Editorial design system
                  </Link>
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" asChild>
                  <Link href="/site">Public website</Link>
                </Button>
                <Button asChild size="sm" className="gap-1.5" style={{ background: BRAND.orange }}>
                  <Link href="/invoice">
                    <Printer className="size-3.5" /> Invoice on letterhead
                  </Link>
                </Button>
              </div>
            </div>
          </div>

          <dl className="mt-8 grid grid-cols-2 gap-4 border-t pt-6 sm:grid-cols-4" style={{ borderColor: BRAND.grayLine }}>
            {HEADLINE_STATS.map((stat) => (
              <div key={stat.label}>
                <dt className="text-2xl font-bold" style={{ color: BRAND.blue }}>
                  {stat.value}
                </dt>
                <dd className="font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: BRAND.gray }}>
                  {stat.label}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      <nav className="sticky top-0 z-20 border-b bg-white/95 backdrop-blur" style={{ borderColor: BRAND.grayLine }}>
        <div className="mx-auto flex max-w-[1400px] gap-1 overflow-x-auto px-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-medium transition-colors"
              style={{
                borderColor: tab === t.id ? BRAND.orange : 'transparent',
                color: tab === t.id ? BRAND.blue : BRAND.gray,
              }}
            >
              <t.icon className="size-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-[1400px] px-6 py-8">
        {tab === 'logo' && <LogosSection />}
        {tab === 'color' && <ColourSection />}
        {tab === 'type' && <TypeSection />}
        {tab === 'system' && <SystemSection />}
        {tab === 'documents' && <DocumentsSection />}
      </main>

      <footer className="border-t bg-white" style={{ borderColor: BRAND.grayLine }}>
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-6 py-6 font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: BRAND.graySoft }}>
          <span>
            {COMPANY.legalName} {COMPANY.product} · {COMPANY.tagline}
          </span>
          <span>{COMPANY.promise}</span>
        </div>
      </footer>
    </div>
  )
}

// ─── Logo ────────────────────────────────────────────────────────────────────

function LogosSection() {
  return (
    <div className="space-y-6">
      <Section
        title="1 · Official logo — full versions"
        note="Four lockups are approved. Never re-draw, re-space or re-colour them; scale proportionally only."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <LockupCard label="Primary logo (horizontal)" file="/brand/alo-logo-horizontal.svg">
            <AloLabsLogo size={64} tagline />
          </LockupCard>
          <LockupCard label="Stacked logo" file="/brand/alo-logo-stacked.svg">
            <AloLabsLogo variant="stacked" size={58} tagline />
          </LockupCard>
          <LockupCard label="Icon (symbol only)" file="/brand/alo-mark.svg">
            <div className="flex items-end gap-6">
              <Mark size={72} />
              <Mark size={48} />
              <Mark size={32} />
              <Mark size={20} />
            </div>
          </LockupCard>
          <LockupCard label="Wordmark" file="/brand/alo-wordmark.svg">
            <AloLabsLogo variant="wordmark" size={56} />
          </LockupCard>
          <LockupCard label="Circular badge (seal)" file="/brand/alo-badge.svg">
            <div className="flex items-center gap-6">
              <BrandBadge size={150} />
              <BrandBadge size={96} />
            </div>
          </LockupCard>
          <LockupCard label="Divider — rule with dot" file="BrandRule component">
            <div className="flex flex-col gap-5">
              <BrandRule width={220} />
              <AloLabsLogo variant="stacked" size={44} tagline={false} />
              <BrandRule width={160} />
            </div>
          </LockupCard>
        </div>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Clear space & minimum size" note="Clear space equals one quarter of the mark's height on every side.">
          <div className="flex items-center gap-8">
            <div
              className="relative inline-flex items-center justify-center"
              style={{ outline: `1px dashed ${BRAND.graySoft}`, padding: 18 }}
            >
              <Mark size={72} />
              <span className="absolute -top-2 left-2 bg-white px-1 font-mono text-[8px]" style={{ color: BRAND.graySoft }}>
                25% clear space
              </span>
            </div>
            <ul className="space-y-1.5 text-[12px]" style={{ color: BRAND.gray }}>
              <li>Icon minimum: 20 px digital, 8 mm print.</li>
              <li>Horizontal lockup minimum: 140 px wide.</li>
              <li>Do not place the logo below 20 px — use the icon instead.</li>
            </ul>
          </div>
        </Section>

        <Section title="Placement" note="Light ground is default; the dark ground uses white for the product name.">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-white p-5" style={{ borderColor: BRAND.grayLine }}>
              <AloLabsLogo size={44} tagline />
            </div>
            <div className="rounded-lg p-5" style={{ background: BRAND.navy }}>
              <AloLabsLogo size={44} tagline theme="dark" />
            </div>
            <div className="rounded-lg p-5" style={{ background: BRAND.canvas }}>
              <AloLabsLogo variant="stacked" size={40} />
            </div>
            <div className="rounded-lg p-5" style={{ background: 'rgba(255,106,0,0.08)' }}>
              <AloLabsLogo size={40} />
            </div>
          </div>
        </Section>
      </div>

      <Section title="Misuse" note="The four failures seen most often in the wild.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MisuseCard label="Don't stretch or squash" />
          <MisuseCard label="Don't re-colour the mark" />
          <MisuseCard label="Don't outline or add shadows" />
          <MisuseCard label="Don't rebuild the wordmark" />
        </div>
      </Section>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="gap-1.5" asChild>
          <a href="/brand/alo-logo-horizontal.svg" download>
            <Download className="size-3.5" /> Horizontal SVG
          </a>
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" asChild>
          <a href="/brand/alo-logo-stacked.svg" download>
            <Download className="size-3.5" /> Stacked SVG
          </a>
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" asChild>
          <a href="/brand/alo-mark.svg" download>
            <Download className="size-3.5" /> Mark SVG
          </a>
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" asChild>
          <a href="/brand/alo-icon.svg" download>
            <Download className="size-3.5" /> App icon SVG
          </a>
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" asChild>
          <a href="/brand/alo-badge.svg" download>
            <Download className="size-3.5" /> Badge SVG
          </a>
        </Button>
      </div>
    </div>
  )
}

function LockupCard({ label, file, children }: { label: string; file: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-white p-5" style={{ borderColor: BRAND.grayLine }}>
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: BRAND.gray }}>
        {label}
      </p>
      <div className="mt-4 flex min-h-[120px] items-center">{children}</div>
      <p className="mt-3 font-mono text-[9px]" style={{ color: BRAND.graySoft }}>
        {file}
      </p>
    </div>
  )
}

function MisuseCard({ label }: { label: string }) {
  return (
    <div className="rounded-lg border p-4" style={{ borderColor: 'rgba(255,106,0,0.4)', background: 'rgba(255,106,0,0.05)' }}>
      <div className="flex items-start gap-2">
        <XCircle className="mt-0.5 size-4 shrink-0" style={{ color: BRAND.orange }} />
        <p className="text-[12px] font-semibold" style={{ color: BRAND.ink }}>
          {label}
        </p>
      </div>
      <div className="mt-4 flex h-16 items-center justify-center overflow-hidden opacity-60">
        <div style={{ transform: 'scaleX(1.7)' }}>
          <Mark size={44} />
        </div>
      </div>
    </div>
  )
}

// ─── Colour ──────────────────────────────────────────────────────────────────

function ColourSection() {
  const swatches = [
    { name: 'Orange', hex: BRAND.orange, role: 'Primary brand', on: '#FFFFFF' },
    { name: 'Blue', hex: BRAND.blue, role: 'System & trust', on: '#FFFFFF' },
    { name: 'Blue (alt)', hex: BRAND.blueAlt, role: 'Second revision', on: '#FFFFFF' },
    { name: 'Orange light', hex: BRAND.orangeLight, role: 'Gradient stop', on: '#FFFFFF' },
    { name: 'Blue light', hex: BRAND.blueLight, role: 'Gradient stop', on: '#FFFFFF' },
    { name: 'Blue deep', hex: BRAND.blueDeep, role: 'Mark shadow', on: '#FFFFFF' },
    { name: 'White', hex: BRAND.white, role: 'Cards & content', on: BRAND.ink },
    { name: 'Gray', hex: BRAND.gray, role: 'Text & borders', on: '#FFFFFF' },
    { name: 'Gray soft', hex: BRAND.graySoft, role: 'Disabled', on: '#FFFFFF' },
    { name: 'Canvas', hex: BRAND.canvas, role: 'Page ground', on: BRAND.ink },
  ]

  return (
    <div className="space-y-6">
      <Section title="3 · Colour system" note="Primary colours, gradients and the usage guide from the brand sheet.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {swatches.map((s) => (
            <div key={s.name} className="overflow-hidden rounded-lg border bg-white" style={{ borderColor: BRAND.grayLine }}>
              <div className="flex h-24 items-end p-3" style={{ background: s.hex, borderBottom: `1px solid ${BRAND.grayLine}` }}>
                <span className="font-mono text-[10px] font-semibold" style={{ color: s.on }}>
                  {s.hex}
                </span>
              </div>
              <div className="p-3">
                <p className="text-[12px] font-semibold" style={{ color: BRAND.ink }}>
                  {s.name}
                </p>
                <p className="text-[10px]" style={{ color: BRAND.gray }}>
                  {s.role}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Gradients" note="Two approved gradients; the diagonal ribbon form is reserved for the mark.">
          <div className="space-y-4">
            {Object.entries(GRADIENTS).map(([name, g]) => (
              <div key={name}>
                <div className="h-14 rounded-lg" style={{ background: g.css }} />
                <p className="mt-2 font-mono text-[10px]" style={{ color: BRAND.gray }}>
                  {name}: {g.from} → {g.to}
                </p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Usage guide" note="Where each colour is allowed to appear.">
          <ul className="space-y-3">
            {USAGE_RULES.map((rule) => (
              <li key={rule.label} className="flex items-start gap-3">
                <span
                  className="mt-0.5 size-5 shrink-0 rounded-[4px] border"
                  style={{ background: rule.swatch, borderColor: BRAND.grayLine }}
                  aria-hidden="true"
                />
                <div>
                  <p className="text-[12px] font-semibold" style={{ color: BRAND.ink }}>
                    {rule.label}
                  </p>
                  <p className="text-[11px]" style={{ color: BRAND.gray }}>
                    {rule.detail}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section title="Contrast pairs (WCAG)" note="Every shipped pairing keeps text legible at body size.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ContrastPair fg="#FFFFFF" bg={BRAND.orange} label="White on Orange" />
          <ContrastPair fg="#FFFFFF" bg={BRAND.blue} label="White on Blue" />
          <ContrastPair fg={BRAND.blue} bg="#FFFFFF" label="Blue on White" />
          <ContrastPair fg={BRAND.orange} bg="#FFFFFF" label="Orange on White" />
        </div>
      </Section>
    </div>
  )
}

/** Relative luminance + contrast ratio, so the claim above is computed not asserted. */
function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const v = hex.replace('#', '')
    const rgb = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255)
    const lin = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
  }
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x)
  return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100
}

function ContrastPair({ fg, bg, label }: { fg: string; bg: string; label: string }) {
  const ratio = contrastRatio(fg, bg)
  const level = ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA large' : 'decorative only'
  return (
    <div className="overflow-hidden rounded-lg border" style={{ borderColor: BRAND.grayLine }}>
      <div className="p-4 text-[13px] font-semibold" style={{ background: bg, color: fg }}>
        {label}
      </div>
      <p className="bg-white p-2 font-mono text-[10px]" style={{ color: BRAND.gray }}>
        {ratio}:1 · {level}
      </p>
    </div>
  )
}

// ─── Typography ──────────────────────────────────────────────────────────────

function TypeSection() {
  return (
    <div className="space-y-6">
      <Section title="4 · Typography" note="Inter is the primary face. Poppins is the secondary face and carries the wordmark.">
        <div className="grid gap-6 lg:grid-cols-2">
          {[BRAND_FONTS.primary, BRAND_FONTS.secondary].map((font, i) => (
            <div key={font.name} className="rounded-lg border bg-white p-6" style={{ borderColor: BRAND.grayLine }}>
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em]" style={{ color: BRAND.gray }}>
                {i === 0 ? 'Primary font' : 'Secondary font'}
              </p>
              <p className="mt-2 text-4xl font-bold" style={{ color: BRAND.blue, fontFamily: font.stack }}>
                {font.name}
              </p>
              <p className="mt-1 text-[11px]" style={{ color: BRAND.gray }}>
                {font.use}
              </p>
              <p className="mt-4 break-words text-[15px] leading-relaxed" style={{ color: BRAND.ink, fontFamily: font.stack }}>
                {BRAND_FONTS.specimen}
              </p>
              <div className="mt-4 flex flex-wrap gap-4" style={{ fontFamily: font.stack }}>
                <span className="text-lg font-normal">Regular 400</span>
                <span className="text-lg font-medium">Medium 500</span>
                <span className="text-lg font-semibold">Semibold 600</span>
                <span className="text-lg font-bold">Bold 700</span>
              </div>
              <p className="mt-3 font-mono text-[9px]" style={{ color: BRAND.graySoft }}>
                css var {font.cssVar}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Type ramp" note="Sizes used across the product and the documents.">
        <div className="space-y-2 rounded-lg border bg-white p-6" style={{ borderColor: BRAND.grayLine }}>
          {[
            { label: 'Display · 32/700', cls: 'text-[32px] font-bold' },
            { label: 'Heading · 24/700', cls: 'text-[24px] font-bold' },
            { label: 'Subhead · 18/600', cls: 'text-[18px] font-semibold' },
            { label: 'Body · 14/400', cls: 'text-[14px]' },
            { label: 'Caption · 12/500', cls: 'text-[12px] font-medium' },
            { label: 'Technical · 10 mono', cls: 'font-mono text-[10px] uppercase tracking-[0.16em]' },
          ].map((row) => (
            <div key={row.label} className="flex flex-wrap items-baseline gap-4 border-b pb-2" style={{ borderColor: BRAND.grayLine }}>
              <span className="w-[190px] shrink-0 font-mono text-[10px]" style={{ color: BRAND.graySoft }}>
                {row.label}
              </span>
              <span className={row.cls} style={{ color: BRAND.ink }}>
                Secure. Smart. Scalable.
              </span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

// ─── System flow ─────────────────────────────────────────────────────────────

function SystemSection() {
  return (
    <div className="space-y-6">
      <Section
        title="2 · System flow (orange & blue)"
        note="Orange is the action path, blue is the system path, outlined chips are the hybrid-RAG branches."
      >
        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          <div className="rounded-lg border bg-white p-6" style={{ borderColor: BRAND.grayLine }}>
            <SystemFlow />
          </div>
          <div className="space-y-6">
            <div className="rounded-lg border bg-white p-6" style={{ borderColor: BRAND.grayLine }}>
              <p className="mb-4 font-mono text-[9px] font-semibold uppercase tracking-[0.18em]" style={{ color: BRAND.gray }}>
                5 · Mobile view (blue theme)
              </p>
              <CommandCenterMobile />
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Agent specification cards"
        note="The Master 1020 Agent Specification layout — orange id bar, blue name bar, labelled fields."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {SPEC_SAMPLE.map((spec) => (
            <AgentSpecCard key={spec.id} spec={spec} />
          ))}
        </div>
      </Section>

      <Section title="Command-centre domains" note="The domains printed along the foot of the guideline sheet.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {COMPANY.domains.map((d) => (
            <div key={d.value} className="rounded-lg border bg-white p-4" style={{ borderColor: BRAND.grayLine }}>
              <p className="font-mono text-[9px] uppercase tracking-[0.16em]" style={{ color: BRAND.graySoft }}>
                {d.label}
              </p>
              <p className="mt-1 font-mono text-[13px] font-semibold" style={{ color: BRAND.blue }}>
                {d.value}
              </p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

// ─── Documents ───────────────────────────────────────────────────────────────

function DocumentsSection() {
  return (
    <div className="space-y-6">
      <Section
        title="Letterhead — the A4 pad"
        note="Orange outer rule, blue bands top and bottom, the horizontal lockup in the masthead, and the four-item contact strip across the foot."
      >
        <div className="alo-sheet-frame">
          <Letterhead printSheet={false}>
            <div className="max-w-[520px]">
              <h2 className="text-[22px] font-bold" style={{ color: BRAND.blue }}>
                A4 letterhead
              </h2>
              <BrandRibbon className="mt-3" />
              <p className="mt-4 text-[12px] leading-relaxed" style={{ color: BRAND.gray }}>
                Every outgoing document is printed on this pad — invoices, statements, proposals and letters. The sheet
                is authored at 794 × 1123 px (A4 at 96 dpi) and collapses to true A4 with zero margin when printed.
              </p>
              <p className="mt-3 text-[12px] leading-relaxed" style={{ color: BRAND.gray }}>
                Content sits inside the frame with {74}px side padding and {132}px at the foot, so the contact strip is
                never crowded and the page stays inside the safe area.
              </p>
            </div>
          </Letterhead>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild size="sm" className="gap-1.5" style={{ background: BRAND.orange }}>
            <Link href="/invoice">
              <FileText className="size-3.5" /> Open the invoice on this pad
            </Link>
          </Button>
        </div>
      </Section>

      <Section title="7 · Brand usage rules" note="Follow these on every surface.">
        <ul className="grid gap-2 sm:grid-cols-2">
          {BRAND_RULES.map((rule) => (
            <li key={rule} className="flex items-start gap-2 rounded-lg border bg-white p-3" style={{ borderColor: BRAND.grayLine }}>
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" style={{ color: BRAND.orange }} />
              <span className="text-[12px]" style={{ color: BRAND.ink }}>
                {rule}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="6 · AI studio build prompt" note="The master prompt from the sheet, kept with the brand so it travels with the assets.">
        <div className="rounded-lg border bg-white p-6" style={{ borderColor: BRAND.grayLine }}>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: BRAND.orange }}>
            Use this master prompt to build ALO Labs AgentOS
          </p>
          <p className="mt-3 text-[12px] leading-relaxed" style={{ color: BRAND.gray }}>
            Build a complete enterprise AI Operating System named ALO Labs AgentOS for domain alolabs.net. It must
            include a Command Center, Master Router, Department Router, Workflow Engine, Approval Engine, Learning
            Engine, Agent Registry, Memory System, Audit System and a Hybrid RAG Engine. Create 1020 AI Agents across
            100+ Departments. Every agent must have an ID, name, role, mission, skills, tools, memory, workflow, QA,
            protection rules, approval rules, audit logs and self-improvement. Use orange (#FF6A00) for primary actions
            and highlights, blue (#003ABC) for system, navigation and trust, white for clean UI, and gray for text and
            borders. Tech stack: Next.js, TailwindCSS, NestJS, PostgreSQL, Redis, Qdrant, Neo4j, n8n, Docker. Provide a
            complete folder structure, database schema, API routes, flows, UI design, security, deployment and a
            mobile-responsive interface. Make it production ready.
          </p>
        </div>
      </Section>
    </div>
  )
}

// ─── Shared shell ────────────────────────────────────────────────────────────

function Section({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border bg-white p-6" style={{ borderColor: BRAND.grayLine }}>
      <div className="mb-5">
        <h2 className="text-[15px] font-bold uppercase tracking-[0.06em]" style={{ color: BRAND.blue }}>
          {title}
        </h2>
        {note ? (
          <p className="mt-1 max-w-[92ch] text-[12px]" style={{ color: BRAND.gray }}>
            {note}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  )
}
