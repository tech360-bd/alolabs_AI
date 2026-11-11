'use client'

/**
 * /portal/usage — the caller's API usage.
 *
 * Calls GET /api/v1/ai/usage (the public, tenant-scoped usage surface that
 * ships this phase). Renders a simple units-per-day bar chart per service and
 * a sortable table below. The chart is a pure-CSS bar chart so the portal has
 * no chart library dependency — honest bars, honest numbers.
 *
 * Empty state: "no usage yet". Error state: the banner from <StateList/>.
 */

import * as React from 'react'
import { useApiGet } from '@/hooks/use-api-actions'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  PortalPageHero,
  SectionCard,
  StateList,
  Pill,
} from '@/components/portal/portal-primitives'
import { BRAND } from '@/lib/brand/tokens'
import { Activity } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────

interface UsageRow {
  date: string // ISO date (YYYY-MM-DD)
  service: string // service slug
  units: number
}

interface UsageBucket {
  date: string
  service: string
  units: number
}

interface UsageResponse {
  data?: UsageRow[]
  buckets?: UsageBucket[]
  usage?: UsageRow[]
}

// ── Bar-chart helpers ─────────────────────────────────────────────────────

interface ChartBucket {
  date: string
  total: number
  byService: Record<string, number>
}

function toBuckets(rows: UsageRow[]): ChartBucket[] {
  const map = new Map<string, ChartBucket>()
  for (const row of rows) {
    const date = row.date
    let b = map.get(date)
    if (!b) {
      b = { date, total: 0, byService: {} }
      map.set(date, b)
    }
    b.total += row.units
    b.byService[row.service] = (b.byService[row.service] ?? 0) + row.units
  }
  return Array.from(map.values()).sort((a, b) => (a.date < b.date ? -1 : 1))
}

function fmtDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ── Component ─────────────────────────────────────────────────────────────

export default function PortalUsagePage() {
  const { data, loading, error, refresh } = useApiGet<UsageResponse>('/api/v1/ai/usage')

  const rows: UsageRow[] = React.useMemo(() => {
    if (!data) return []
    // Accept { data: [...] }, { usage: [...] }, or { buckets: [...] } shapes.
    if (Array.isArray(data.data)) {
      return data.data.map((r) => ({ date: r.date, service: r.service, units: r.units }))
    }
    if (Array.isArray(data.usage)) return data.usage
    if (Array.isArray(data.buckets)) {
      return data.buckets.map((b) => ({ date: b.date, service: b.service, units: b.units }))
    }
    return []
  }, [data])

  const buckets = React.useMemo(() => toBuckets(rows), [rows])
  const services = React.useMemo(() => {
    const set = new Set<string>()
    rows.forEach((r) => set.add(r.service))
    return Array.from(set).sort()
  }, [rows])

  const maxTotal = React.useMemo(() => buckets.reduce((m, b) => Math.max(m, b.total), 0), [buckets])
  const totalUnits = React.useMemo(() => rows.reduce((s, r) => s + r.units, 0), [rows])
  const isEmpty = rows.length === 0

  return (
    <>
      <PortalPageHero
        eyebrow="Usage"
        title="How much you’re calling"
        lead="Units consumed per service, per day. Refreshed from your live tenant logs — no sampled data, no rounding."
      />

      {/* Summary tiles */}
      <section className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryTile label="Total units" value={totalUnits.toLocaleString()} />
        <SummaryTile label="Services" value={services.length.toString()} />
        <SummaryTile label="Days" value={buckets.length.toString()} />
        <SummaryTile label="Peak day" value={maxTotal.toLocaleString()} />
      </section>

      {/* Bar chart */}
      <SectionCard
        title="Units per day"
        description="Each bar is one calendar day; height is total units across all services."
        action={
          <button
            onClick={refresh}
            className="text-[12px] font-semibold inline-flex items-center gap-1"
            style={{ color: BRAND.orange }}
            type="button"
          >
            <Activity className="size-3.5" /> Refresh
          </button>
        }
      >
        <StateList
          loading={loading}
          error={error}
          isEmpty={isEmpty}
          onRetry={refresh}
          emptyTitle="No usage yet"
          emptyHint="Once your API keys start calling services, daily unit counts will appear here."
        >
          <UsageChart buckets={buckets} services={services} max={maxTotal} />
        </StateList>
      </SectionCard>

      {/* Detail table */}
      <SectionCard
        title="Daily breakdown"
        description="One row per service per day."
        className="mt-6"
      >
        <StateList
          loading={loading}
          error={error}
          isEmpty={isEmpty}
          onRetry={refresh}
          emptyTitle="No rows to show"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Service</TableHead>
                <TableHead className="text-right">Units</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, idx) => (
                <TableRow key={`${row.date}-${row.service}-${idx}`}>
                  <TableCell className="text-[12px]" style={{ color: BRAND.ink }}>
                    {fmtDay(row.date)}
                  </TableCell>
                  <TableCell>
                    <Pill tone="blue">{row.service}</Pill>
                  </TableCell>
                  <TableCell className="text-right font-mono text-[12px]" style={{ color: BRAND.ink }}>
                    {row.units.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </StateList>
      </SectionCard>
    </>
  )
}

// ── Subcomponents ──────────────────────────────────────────────────────────

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-4" style={{ borderColor: '#E2E8F0', background: '#FFFFFF' }}>
      <p
        className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]"
        style={{ color: BRAND.gray }}
      >
        {label}
      </p>
      <p
        className="mt-1 text-2xl font-bold"
        style={{ color: BRAND.blue }}
      >
        {value}
      </p>
    </div>
  )
}

function UsageChart({
  buckets,
  services,
  max,
}: {
  buckets: ChartBucket[]
  services: string[]
  max: number
}) {
  // Service colour palette — derived from BRAND tokens, never external deps.
  const serviceColours: Record<string, string> = React.useMemo(() => {
    const palette = [BRAND.orange, BRAND.blue, BRAND.blueLight, '#10B981', '#9333EA']
    const out: Record<string, string> = {}
    services.forEach((s, i) => {
      out[s] = palette[i % palette.length]
    })
    return out
  }, [services])

  if (buckets.length === 0) return null

  return (
    <div>
      <div className="flex items-end gap-2 overflow-x-auto pb-2" style={{ minHeight: 160 }}>
        {buckets.map((b) => {
          const heightPct = max > 0 ? Math.max(2, (b.total / max) * 100) : 0
          return (
            <div key={b.date} className="flex flex-col items-center gap-1" style={{ minWidth: 36 }}>
              <div
                className="flex w-7 flex-col justify-end rounded-t-md overflow-hidden"
                style={{ height: 140, background: '#F1F5F9' }}
                title={`${b.date}: ${b.total} units`}
              >
                <div
                  className="w-full rounded-t-md transition-all"
                  style={{
                    height: `${heightPct}%`,
                    background: services.length > 1
                      ? `linear-gradient(180deg, ${services
                          .map((s) => serviceColours[s])
                          .join(' 0%, ')} 0%)`
                      : serviceColours[services[0]] ?? BRAND.blue,
                  }}
                />
              </div>
              <span className="text-[10px] font-mono" style={{ color: BRAND.gray }}>
                {fmtDay(b.date)}
              </span>
              <span className="text-[10px] font-mono" style={{ color: BRAND.ink }}>
                {b.total}
              </span>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      {services.length > 1 ? (
        <div className="mt-3 flex flex-wrap gap-3">
          {services.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: BRAND.ink }}>
              <span
                className="inline-block size-2.5 rounded-sm"
                style={{ background: serviceColours[s] }}
                aria-hidden="true"
              />
              <span className="font-mono">{s}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
