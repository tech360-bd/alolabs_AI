'use client'

/**
 * /site/press — the marketing kit: every asset a journalist, partner or
 * reseller needs to represent ALO Labs correctly. Boilerplate copy, official
 * lockups, the colour system, typography, the fact sheet and the diagram
 * library — all generated from the same brand tokens as the product.
 */

import * as React from 'react'
import Link from 'next/link'
import { Badge, BrandRule } from '@/components/brand/alo-logo'
import { Button } from '@/components/ui/button'
import {
  BRAND,
  BRAND_FONTS,
  BRAND_RULES,
  COMPANY,
  HEADLINE_STATS,
  USAGE_RULES,
} from '@/lib/brand/tokens'
import { MARKETING_CATALOG, marketingCategories, marketingKitStats } from '@/lib/marketing-kit'
import { ArrowRight, Copy, Download, FileText, Mail, Palette, Quote, Shapes, Type } from 'lucide-react'
import { CtaBand, CheckList, PageHero, Pill, Section } from '@/components/site/chrome'

const LOGO_ASSETS = [
  { file: '/brand/alo-logo-horizontal.svg', label: 'Horizontal lockup', note: 'Primary — website headers, letterhead' },
  { file: '/brand/alo-logo-stacked.svg', label: 'Stacked lockup', note: 'Square placements, social avatars' },
  { file: '/brand/alo-mark.svg', label: 'Mark only', note: 'Favicon, app icon, watermarks' },
  { file: '/brand/alo-wordmark.svg', label: 'Wordmark', note: 'Text-only contexts' },
  { file: '/brand/alo-icon.svg', label: 'App icon', note: 'PWA, home screen, store listings' },
  { file: '/brand/alo-badge.svg', label: 'Badge seal', note: 'Certifications, documents, merchandise' },
]

const BOILERPLATE = {
  short:
    'ALO Labs builds AgentOS — the AI Agent Operating System: one command centre for 1020 AI agents across 100+ departments, with an approval gate and a complete audit trail on every action.',
  long:
    'ALO Labs is a technology company headquartered in Harrisonville, Missouri. Its flagship product, AgentOS, is an enterprise AI operating system: a single command centre routes every owner command through a master router and department routers to a specified workforce of 1020 AI agents across 100+ departments. Retrieval runs through a hybrid RAG engine (classic, graph and agentic), and nothing executes without passing the approval engine. Secure, smart and scalable — built for the future.',
  founderQuote:
    '“Teams do not need more AI demos. They need AI that does specified work, is checked before it acts, and can be audited after it does.” — ALO Labs',
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = React.useState(false)
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1600)
        } catch {
          /* clipboard unavailable */
        }
      }}
    >
      <Copy className="size-3.5" /> {done ? 'Copied' : 'Copy'}
    </Button>
  )
}

export function PressPage() {
  const stats = React.useMemo(() => marketingKitStats(), [])
  const categories = React.useMemo(() => marketingCategories(), [])

  return (
    <>
      <PageHero
        crumbs={[{ href: '/site/press', label: 'Marketing kit' }]}
        eyebrow="Marketing & press kit"
        title={<>Everything you need to represent ALO Labs.</>}
        lead="Official lockups, colours, typography, boilerplate copy and the fact sheet — plus the marketing kit itself: 50 playbooks, sync'd from the open skill library and installable as agents inside AgentOS."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" className="gap-2" style={{ background: BRAND.orange }} asChild>
            <a href="/brand/alo-logo-horizontal.svg" download>
              <Download className="size-4" /> Download the primary logo
            </a>
          </Button>
          <Button size="lg" variant="outline" className="gap-2" asChild>
            <Link href="/brand">
              Open the full brand book <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </PageHero>

      {/* Logo assets */}
      <Section
        id="logos"
        eyebrow="Official lockups"
        title="Use the official logo. Do not alter its proportions."
        lead="Vector SVG, on transparent ground. Keep clear space of at least half the mark's height on every side, and never recolour the mark outside the brand palette."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LOGO_ASSETS.map((asset) => (
            <div key={asset.file} className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex h-[110px] items-center justify-center rounded-xl border border-slate-100 bg-slate-50 p-4">
                <img src={asset.file} alt={asset.label} className="max-h-full max-w-full object-contain" />
              </div>
              <p className="mt-4 text-[14px] font-semibold" style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
                {asset.label}
              </p>
              <p className="mt-1 text-[11px]" style={{ color: BRAND.gray }}>
                {asset.note}
              </p>
              <div className="mt-4 flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" asChild>
                  <a href={asset.file} download>
                    <Download className="size-3.5" /> SVG
                  </a>
                </Button>
                <span className="font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: BRAND.graySoft }}>
                  {asset.file.replace('/brand/', '')}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Boilerplate */}
      <Section
        id="boilerplate"
        eyebrow="Boilerplate"
        title="Approved copy — paste as-is."
        lead="For articles, partner pages, listings and event programmes. If you need a variant, the media contact below will turn one around within a day."
        ground="canvas"
      >
        <div className="space-y-4">
          {[
            { icon: Quote, label: 'Short description (≈40 words)', body: BOILERPLATE.short },
            { icon: FileText, label: 'Full description (≈100 words)', body: BOILERPLATE.long },
            { icon: Quote, label: 'Founder quote', body: BOILERPLATE.founderQuote },
          ].map((block) => (
            <div key={block.label} className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <block.icon className="size-4" style={{ color: BRAND.orange }} />
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: BRAND.gray }}>
                    {block.label}
                  </p>
                </div>
                <CopyButton text={block.body} />
              </div>
              <p className="mt-3 text-[13.5px] leading-relaxed" style={{ color: BRAND.ink }}>
                {block.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* Fact sheet */}
      <Section id="facts" eyebrow="Fact sheet" title="The numbers we publish.">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <div className="grid grid-cols-2 gap-4">
              {HEADLINE_STATS.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-6">
                  <p className="text-[30px] font-bold" style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
                    {stat.value}
                  </p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: BRAND.gray }}>
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: BRAND.gray }}>
                Company facts
              </p>
              <ul className="mt-3 space-y-1.5 text-[12.5px]" style={{ color: BRAND.ink }}>
                <li><strong>Legal name:</strong> {COMPANY.legalName} · {COMPANY.entity}</li>
                <li><strong>Headquarters:</strong> {COMPANY.addressOneLine}</li>
                <li><strong>Product:</strong> {COMPANY.product} — {COMPANY.tagline}</li>
                <li><strong>Promise:</strong> {COMPANY.promise}</li>
                <li><strong>Domains:</strong> {COMPANY.domains.map((d) => d.value).join(' · ')}</li>
              </ul>
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-center gap-2">
                <Palette className="size-4" style={{ color: BRAND.orange }} />
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: BRAND.gray }}>
                  Colour system
                </p>
              </div>
              <div className="mt-4 space-y-2.5">
                {USAGE_RULES.map((rule) => (
                  <div key={rule.label} className="flex items-center gap-3">
                    <span className="size-8 shrink-0 rounded-md border border-slate-200" style={{ background: rule.swatch }} />
                    <div>
                      <p className="text-[12px] font-semibold" style={{ color: BRAND.ink }}>
                        {rule.label}
                      </p>
                      <p className="text-[11px]" style={{ color: BRAND.gray }}>
                        {rule.detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-center gap-2">
                <Type className="size-4" style={{ color: BRAND.orange }} />
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: BRAND.gray }}>
                  Typography
                </p>
              </div>
              <p className="mt-3 text-[22px] font-semibold" style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
                {BRAND_FONTS.secondary.name}
              </p>
              <p className="text-[11px]" style={{ color: BRAND.gray }}>
                {BRAND_FONTS.secondary.use}
              </p>
              <p className="mt-3 text-[16px]" style={{ color: BRAND.ink, fontFamily: BRAND_FONTS.primary.stack }}>
                {BRAND_FONTS.primary.name}
              </p>
              <p className="text-[11px]" style={{ color: BRAND.gray }}>
                {BRAND_FONTS.primary.use}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-center gap-2">
                <Shapes className="size-4" style={{ color: BRAND.orange }} />
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: BRAND.gray }}>
                  Usage rules
                </p>
              </div>
              <div className="mt-3">
                <CheckList items={BRAND_RULES} />
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* The marketing kit itself */}
      <Section
        id="marketing-kit"
        eyebrow="The marketing kit"
        title="50 playbooks, versioned and installable."
        lead="The kit is not a folder of PDFs: every skill carries its SKILL.md body, reference documents, a semantic version and an install path into the AgentOS agent registry. Categories below; browse and install inside the product."
        ground="navy"
      >
        <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((cat) => (
              <div key={cat.name} className="rounded-xl border border-white/10 bg-white/5 p-5">
                <p className="text-[13.5px] font-semibold text-white" style={{ fontFamily: BRAND_FONTS.secondary.stack }}>
                  {cat.name}
                </p>
                <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-white/55">
                  {cat.count} skills
                </p>
              </div>
            ))}
          </div>
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <dl className="space-y-3">
                {[
                  ['Skills', String(stats.skills ?? MARKETING_CATALOG.totalSkills)],
                  ['Categories', String(stats.categories ?? MARKETING_CATALOG.categories.length)],
                  ['Licence', MARKETING_CATALOG.license],
                  ['Synced', new Date(MARKETING_CATALOG.syncedAt).toISOString().slice(0, 10)],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-4">
                    <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/50">{label}</dt>
                    <dd className="text-[12.5px] font-semibold text-white/90">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button className="gap-2" style={{ background: BRAND.orange }} asChild>
                <Link href="/">
                  Browse in the product <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
            <p className="text-[11px] leading-relaxed text-white/60">
              Source: <span className="font-mono">{MARKETING_CATALOG.source}</span>. Imported under its open licence
              with attribution carried in every skill record.
            </p>
          </div>
        </div>
      </Section>

      {/* Diagrams as assets */}
      <Section
        id="figures"
        eyebrow="Figures & diagrams"
        title="Need a figure? We generate them — not screenshot them."
        lead="Every diagram in our materials comes from the editorial diagram library: 45 visual types, taste-gated in CI, exportable as self-contained SVG or HTML. Browse the public gallery or the full studio."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Shapes, label: '45 diagram types', note: 'Architecture to waterfall, one example each' },
            { icon: Palette, label: 'Taste-gated', note: 'Zero fail, zero warn findings — enforced in tests' },
            { icon: FileText, label: 'SVG + HTML export', note: 'Self-contained, accessible, script-free' },
            { icon: Type, label: 'Editorial buttons & cards', note: 'The same design language as the site' },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-6">
              <item.icon className="size-4" style={{ color: BRAND.orange }} />
              <p className="mt-3 text-[14px] font-semibold" style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
                {item.label}
              </p>
              <p className="mt-1 text-[11.5px] leading-relaxed" style={{ color: BRAND.gray }}>
                {item.note}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button className="gap-2" style={{ background: BRAND.orange }} asChild>
            <Link href="/site/diagrams">
              Open the diagram gallery <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button variant="outline" className="gap-2" asChild>
            <Link href="/design">Design system studio</Link>
          </Button>
        </div>
      </Section>

      {/* Media contact */}
      <Section id="media" eyebrow="Media contact" title="Working on a story?" ground="canvas">
        <div className="flex flex-wrap items-center justify-between gap-8 rounded-2xl border border-slate-200 bg-white p-8">
          <div className="max-w-[560px]">
            <div className="flex items-center gap-4">
              <Badge size={88} />
              <div>
                <p className="text-[15px] font-semibold" style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
                  ALO Labs media desk
                </p>
                <p className="mt-1 text-[12px]" style={{ color: BRAND.gray }}>
                  Interviews, screenshots, diagrams, product demos and fact checks — one business day turnaround.
                </p>
              </div>
            </div>
            <BrandRule width={160} className="mt-5" />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" className="gap-2" style={{ background: BRAND.orange }} asChild>
              <a href={`${COMPANY.emailHref}?subject=Press%20request`}>
                <Mail className="size-4" /> Email the media desk
              </a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/site/contact">Or use the contact form</Link>
            </Button>
          </div>
        </div>
      </Section>

      <CtaBand
        title="Partners, resellers and event organisers:"
        lead="Co-branded decks, booth kits and campaign assets ship from the same tokens — tell us what you need and the timeline."
      />
    </>
  )
}
