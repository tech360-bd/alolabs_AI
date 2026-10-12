'use client'

/**
 * Design system reference — diagrams, buttons, cards and tokens.
 *
 * This is the living specification: the diagram gallery (44 visual types), the
 * editorial button language, the varied-width summary card pattern, and the
 * semantic token table every surface draws from.
 */

import * as React from 'react'
import { DiagramStudio } from '@/components/diagrams/diagram-studio'
import { MotionSection } from './motion-section'
import { IconsSection } from './icons-section'
import { DiagramImport } from '@/components/diagrams/diagram-import'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AL0Note } from './alo-note'
import { KINDS, RADIUS, STROKE, TOKENS, NODE_TREATMENT_PREVIEW, TYPE_RAMP_PREVIEW } from './design-tokens'

type Tab = 'diagrams' | 'motion' | 'icons' | 'import' | 'buttons' | 'cards' | 'tokens'

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: 'diagrams', label: 'Diagrams', hint: '44 visual types, three variants' },
  { id: 'motion', label: 'Motion', hint: 'Step, reveal and loop playback' },
  { id: 'icons', label: 'Icons', hint: '87 monochrome and brand icons' },
  { id: 'import', label: 'Import', hint: 'Mermaid, draw.io, Excalidraw' },
  { id: 'buttons', label: 'Buttons', hint: 'Borders in, shadows out' },
  { id: 'cards', label: 'Cards', hint: 'Varied widths, not three clones' },
  { id: 'tokens', label: 'Tokens', hint: 'Semantic roles and type ramp' },
]

export default function DesignSystemPage() {
  const [tab, setTab] = React.useState<Tab>('diagrams')

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1400px] px-6 py-10">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
            ALO Labs · design system
          </p>
          <h1 className="mt-2 font-serif text-4xl font-normal tracking-tight text-slate-900">
            Editorial diagrams and the interface language around them
          </h1>
          <p className="mt-3 max-w-[80ch] text-sm leading-relaxed text-slate-600">
            Ported from the open diagram design system (MIT): semantic colour roles, a 4px structural grid, orthogonal
            connectors, one accent per figure, three typographic registers, and a taste gate that runs as code. Every
            figure on this page is generated from a spec at request time — nothing here is a screenshot.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <a
              href="/brand"
              className="rounded-[6px] px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-white"
              style={{ background: '#FF6A00' }}
            >
              Brand book →
            </a>
            <a
              href="/invoice"
              className="rounded-[6px] border border-slate-300 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-600"
            >
              Invoice on letterhead →
            </a>
            <Badge variant="secondary" className="font-mono text-[10px] uppercase tracking-wider">
              {KINDS.length} visual types
            </Badge>
            <Badge variant="secondary" className="font-mono text-[10px] uppercase tracking-wider">
              5 engines
            </Badge>
            <Badge variant="secondary" className="font-mono text-[10px] uppercase tracking-wider">
              taste gate in CI
            </Badge>
          </div>
        </div>
      </header>

      <nav className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] gap-1 overflow-x-auto px-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                'shrink-0 border-b-2 px-4 py-3 text-left transition-colors ' +
                (tab === t.id
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800')
              }
            >
              <span className="block text-sm font-medium">{t.label}</span>
              <span className="block font-mono text-[9px] uppercase tracking-wider text-slate-400">{t.hint}</span>
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-[1400px] px-6 py-10">
        {tab === 'diagrams' && <DiagramStudio />}
        {tab === 'motion' && <MotionSection />}
        {tab === 'icons' && <IconsSection />}
        {tab === 'import' && <DiagramImport />}
        {tab === 'buttons' && <ButtonsSection />}
        {tab === 'cards' && <CardsSection />}
        {tab === 'tokens' && <TokensSection />}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-6 py-6 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">
          <span>ALO Labs AgentOS · editorial design system</span>
          <span>diagram design © Cathryn Lavery (MIT) · marketing kit © Corey Haines (MIT)</span>
        </div>
      </footer>
    </div>
  )
}

// ─── Buttons ─────────────────────────────────────────────────────────────────

function ButtonsSection() {
  const rows: { title: string; note: string; buttons: React.ReactNode }[] = [
    {
      title: 'Editorial primary',
      note: 'Ink-filled action. No shadow; the border carries the weight.',
      buttons: (
        <>
          <Button variant="editorial">Publish diagram</Button>
          <Button variant="editorial" size="editorialLg">
            Publish diagram
          </Button>
          <Button variant="editorial" size="editorial">
            Medium
          </Button>
          <Button variant="editorial" size="xs">
            Compact
          </Button>
          <Button variant="editorial" disabled>
            Disabled
          </Button>
        </>
      ),
    },
    {
      title: 'Editorial outline',
      note: 'Secondary actions. Paper fill, ink hairline, 6px radius.',
      buttons: (
        <>
          <Button variant="editorialOutline">Copy SVG</Button>
          <Button variant="editorialOutline" size="editorial">
            Export HTML
          </Button>
          <Button variant="editorialOutline" size="xs">
            Small
          </Button>
          <Button variant="editorialOutline" size="iconSm" aria-label="Settings">
            <SettingsIcon />
          </Button>
        </>
      ),
    },
    {
      title: 'Accent — reserved for one action',
      note: 'The accent is editorial, not a flag: at most one accent action per surface.',
      buttons: (
        <>
          <Button variant="editorialAccent">Install playbook</Button>
          <Button variant="editorialAccent" size="editorial">
            Approve run
          </Button>
        </>
      ),
    },
    {
      title: 'Ghost and technical',
      note: 'Mono is for technical content — ports, commands, URLs — never as a blanket “dev” font.',
      buttons: (
        <>
          <Button variant="editorialGhost">Dismiss</Button>
          <Button variant="technical" size="xs">
            npm run build
          </Button>
          <Button variant="technical" size="xs">
            :3011
          </Button>
        </>
      ),
    },
    {
      title: 'Product variants (existing)',
      note: 'The app-wide variants stay untouched so no panel changes appearance.',
      buttons: (
        <>
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
          <Button variant="destructive">Destructive</Button>
        </>
      ),
    },
  ]

  return (
    <div className="space-y-8">
      <AL0Note>
        Buttons follow the diagram system: <strong>shadows are out, borders are in</strong>. Radii stay at 4–8px, the
        accent is spent on a single focal action, and the mono register is reserved for technical labels.
      </AL0Note>

      {rows.map((row) => (
        <section key={row.title} className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="mb-4">
            <h3 className="font-serif text-xl font-normal text-slate-900">{row.title}</h3>
            <p className="mt-1 text-xs text-slate-500">{row.note}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">{row.buttons}</div>
        </section>
      ))}

      <section className="rounded-lg border border-slate-200 bg-[#2d3142] p-6">
        <div className="mb-4">
          <h3 className="font-serif text-xl font-normal text-[#f5f5f5]">Dark paper</h3>
          <p className="mt-1 text-xs text-[#bfc0c0]">
            Same roles, inverted: paper becomes jet-black, ink becomes white-smoke, and the accent lifts one step so it
            still reads as focal.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="editorial">Publish</Button>
          <Button variant="editorialOutline">Copy SVG</Button>
          <Button variant="editorialAccent">Install</Button>
          <Button variant="editorialGhost">Dismiss</Button>
          <Button variant="technical" size="xs">
            pgvector
          </Button>
        </div>
      </section>
    </div>
  )
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-4">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
    </svg>
  )
}

// ─── Cards ───────────────────────────────────────────────────────────────────

function CardsSection() {
  return (
    <div className="space-y-8">
      <AL0Note>
        The summary card pattern exists so a row of three cards never looks like a generic grid: widths vary
        (<span className="font-mono">1.1fr 1fr 0.9fr</span>), the radius stays at 6px, and there is{' '}
        <strong>no box-shadow</strong> — a hairline border does the work.
      </AL0Note>

      <section>
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Summary cards · varied widths</p>
        <div className="grid gap-4 md:grid-cols-[1.1fr_1fr_0.9fr]">
          <article className="rounded-[6px] border border-slate-200 bg-white p-5">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400">Runs today</p>
            <p className="mt-2 font-serif text-3xl tracking-tight text-slate-900">18,402</p>
            <p className="mt-1 text-xs text-slate-500">+12% against the trailing average. Cache hit rate holds at 41%.</p>
          </article>
          <article className="rounded-[6px] border border-slate-200 bg-white p-5">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400">Waiting on approval</p>
            <p className="mt-2 font-serif text-3xl tracking-tight text-slate-900">7</p>
            <p className="mt-1 text-xs text-slate-500">Two older than the 15-minute SLA. Escalation owner notified.</p>
          </article>
          <article className="rounded-[6px] border border-[#eb6c36] bg-[rgba(235,108,54,0.08)] p-5">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#eb6c36]">Focal</p>
            <p className="mt-2 font-serif text-3xl tracking-tight text-slate-900">3</p>
            <p className="mt-1 text-xs text-slate-600">Budget breaches flagged by the taste gate this week.</p>
          </article>
        </div>
      </section>

      <section>
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Node treatments</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {NODE_TREATMENT_PREVIEW.map((n) => (
            <div key={n.kind} className="rounded-[6px] border border-slate-200 bg-white p-4">
              <svg viewBox="0 0 140 56" className="w-full">
                <rect x="4" y="8" width="132" height="40" rx="6" fill={n.fill} stroke={n.stroke} strokeWidth={n.strokeWidth} strokeDasharray={n.dash} />
                <text x="70" y="32" textAnchor="middle" fontSize="12" fontWeight="600" fill="#2d3142" fontFamily="Geist, sans-serif">
                  {n.name}
                </text>
              </svg>
              <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.14em] text-slate-400">{n.role}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

// ─── Tokens ──────────────────────────────────────────────────────────────────

function TokensSection() {
  const roles = Object.entries(TOKENS.light) as [string, string][]
  return (
    <div className="space-y-8">
      <AL0Note>
        Every token is referenced by <strong>semantic role</strong>, never by hex value, so re-skinning is a
        one-file change. The ALO skin maps the same roles onto the product palette.
      </AL0Note>

      <section>
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Semantic roles · light</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {roles.map(([role, value]) => (
            <div key={role} className="rounded-[6px] border border-slate-200 bg-white p-3">
              <div className="h-10 rounded-[4px] border border-slate-200" style={{ background: value }} />
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">{role}</p>
              <p className="font-mono text-[10px] text-slate-400">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Type ramp</p>
        <div className="overflow-hidden rounded-[6px] border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 font-mono text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Family</th>
                <th className="px-4 py-2">Size</th>
                <th className="px-4 py-2">Weight</th>
                <th className="px-4 py-2">Specimen</th>
              </tr>
            </thead>
            <tbody>
              {TYPE_RAMP_PREVIEW.map((r) => (
                <tr key={r.role} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-mono text-[11px] text-slate-500">{r.role}</td>
                  <td className="px-4 py-2 font-mono text-[11px] text-slate-500">{r.family}</td>
                  <td className="px-4 py-2 font-mono text-[11px] text-slate-500">{r.size}px</td>
                  <td className="px-4 py-2 font-mono text-[11px] text-slate-500">{r.weight}</td>
                  <td className="px-4 py-2">
                    <span
                      style={{
                        fontFamily: r.cssFamily,
                        fontSize: `${r.size}px`,
                        fontWeight: r.weight,
                        letterSpacing: r.tracking ? `${r.tracking}em` : undefined,
                        textTransform: r.uppercase ? 'uppercase' : undefined,
                        fontStyle: r.italic ? 'italic' : undefined,
                      }}
                    >
                      {r.sample}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-[1.1fr_1fr_0.9fr]">
        <div className="rounded-[6px] border border-slate-200 bg-white p-5">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400">Stroke</p>
          <ul className="mt-2 space-y-1 font-mono text-xs text-slate-600">
            <li>thin {STROKE.thin} — tag boxes, leaf nodes</li>
            <li>default {STROKE.default} — most strokes</li>
            <li>strong {STROKE.strong} — emphasis, focal path</li>
          </ul>
        </div>
        <div className="rounded-[6px] border border-slate-200 bg-white p-5">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400">Radius</p>
          <ul className="mt-2 space-y-1 font-mono text-xs text-slate-600">
            <li>sm {RADIUS.sm} — tags, bars</li>
            <li>md {RADIUS.md} — node boxes, buttons</li>
            <li>lg {RADIUS.lg} — containers, rings</li>
          </ul>
        </div>
        <div className="rounded-[6px] border border-slate-200 bg-white p-5">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400">Grid</p>
          <ul className="mt-2 space-y-1 font-mono text-xs text-slate-600">
            <li>4px — every structural coordinate</li>
            <li>gaps 20 / 24 / 32 / 40 / 48</li>
            <li>padding 8 / 12 / 16</li>
          </ul>
        </div>
      </section>

      <section>
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
          Complexity budgets · universal
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { k: 'Max nodes', v: '9' },
            { k: 'Max arrows', v: '12' },
            { k: 'Max focal', v: '2' },
            { k: 'Max callouts', v: '2' },
          ].map((b) => (
            <div key={b.k} className="rounded-[6px] border border-slate-200 bg-white p-4">
              <p className="font-serif text-3xl text-slate-900">{b.v}</p>
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-slate-400">{b.k}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Above the type budget, split the figure into an overview and a detail — never shrink the type to fit.
        </p>
      </section>
    </div>
  )
}
