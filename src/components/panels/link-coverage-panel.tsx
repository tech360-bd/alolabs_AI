'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FileCheck2,
  FileX2,
  Files,
  MinusCircle,
  RefreshCw,
  Search,
  ShieldQuestion,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  CoverageReport,
  CoverageSummary,
  CoverageVerdict,
  EntryCheck,
} from '@/lib/link-coverage/types'

/**
 * Link coverage — the super admin view of every reference link in the list.
 *
 * One row per link, one nested row per evidence file. Every file shown here is
 * re-checked on the server (existence, size, line count, SHA-256 prefix); a
 * claim whose file is gone is surfaced as MISSING instead of being quietly
 * dropped.
 */

interface CoverageResponse extends CoverageReport {
  cached: boolean;
  registrySize: number;
  filtered: number;
}

const VERDICT_META: Record<
  CoverageVerdict,
  { label: string; badge: string; hint: string }
> = {
  implemented: {
    label: 'Implemented',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    hint: 'Exists here and is exercised by code or tests.',
  },
  in_kind: {
    label: 'In-kind',
    badge: 'bg-sky-50 text-sky-700 border-sky-200',
    hint: 'An equivalent subsystem exists here; upstream was not copied.',
  },
  reference: {
    label: 'Reference',
    badge: 'bg-slate-50 text-slate-600 border-slate-200',
    hint: 'Design reference only — nothing portable for this codebase.',
  },
  gap: {
    label: 'Gap',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    hint: 'Concrete and implementable, not implemented. The next step is named.',
  },
  not_applicable: {
    label: 'N/A',
    badge: 'bg-zinc-100 text-zinc-500 border-zinc-200',
    hint: 'Native app, model weights, hardware or content-only.',
  },
}

const VERDICT_ORDER: CoverageVerdict[] = [
  'implemented',
  'in_kind',
  'reference',
  'gap',
  'not_applicable',
]

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'text-[#1E293B]',
}: {
  icon: typeof FileCheck2
  label: string
  value: string | number
  hint?: string
  tone?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm hover:shadow-md transition-shadow p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-[#64748B]" />
        <span className="text-xs text-[#64748B]">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
      {hint ? <p className="text-[10px] text-[#94A3B8] mt-1 leading-snug">{hint}</p> : null}
    </div>
  )
}

function VerdictBadge({ verdict }: { verdict: CoverageVerdict }) {
  const meta = VERDICT_META[verdict]
  return (
    <Badge variant="outline" className={`text-[10px] py-0 px-1.5 whitespace-nowrap ${meta.badge}`} title={meta.hint}>
      {meta.label}
    </Badge>
  )
}

function EvidenceRow({ item }: { item: EntryCheck['evidence'][number] }) {
  const ok = item.status === 'verified'
  const unknown = item.status === 'unverifiable'
  return (
    <div className="flex items-start gap-2 py-1.5 px-2 rounded-md hover:bg-[#F8FAFC]">
      <span className="mt-0.5 flex-shrink-0">
        {ok ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
        ) : unknown ? (
          <ShieldQuestion className="w-3.5 h-3.5 text-amber-500" />
        ) : (
          <FileX2 className="w-3.5 h-3.5 text-red-600" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-xs font-medium text-[#1E293B]">{item.label}</span>
          <span className="text-[10px] uppercase tracking-wide text-[#94A3B8]">{item.kind}</span>
        </div>
        <code className="text-[11px] text-[#475569] break-all">{item.path}</code>
        <div className="text-[10px] text-[#94A3B8] flex flex-wrap gap-x-3 mt-0.5">
          {ok ? (
            <>
              <span>{item.isDirectory ? 'directory' : `${item.lines} lines`}</span>
              <span>{formatBytes(item.bytes)}</span>
              {item.sha256Prefix ? <span className="font-mono">sha256:{item.sha256Prefix}</span> : null}
            </>
          ) : (
            <span className={unknown ? 'text-amber-600' : 'text-red-600'}>
              {item.error ?? item.status}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function EntryCard({ entry }: { entry: EntryCheck }) {
  const [open, setOpen] = useState(false)
  const missing = entry.missing.length
  return (
    <div className={`bg-white rounded-xl border overflow-hidden ${missing ? 'border-red-200' : 'border-[#E2E8F0]'}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-4 py-3 hover:bg-[#F8FAFC] transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-start gap-3">
          <span className="mt-1 flex-shrink-0 text-[#94A3B8]">
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <VerdictBadge verdict={entry.verdict} />
              <span className="text-[10px] uppercase tracking-wide text-[#94A3B8]">{entry.category}</span>
              <span className="text-[10px] text-[#94A3B8]">
                {entry.kind} · {entry.verified}/{entry.evidence.length} files
              </span>
              {missing > 0 ? (
                <Badge variant="outline" className="text-[10px] py-0 border-red-200 bg-red-50 text-red-700">
                  {missing} missing
                </Badge>
              ) : null}
            </div>
            <p className="text-xs font-medium text-[#1E293B] break-all">{entry.url}</p>
            <p className="text-xs text-[#64748B] mt-1 leading-relaxed">{entry.claim}</p>
          </div>
        </div>
      </button>

      {open ? (
        <div className="px-4 pb-3 border-t border-[#F1F5F9] pt-2 space-y-2">
          {entry.gap ? (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-800 leading-relaxed">
                <span className="font-semibold">Next step: </span>
                {entry.gap}
              </p>
            </div>
          ) : null}

          <div className="space-y-0.5">
            {entry.evidence.map((item) => (
              <EvidenceRow key={item.path} item={item} />
            ))}
          </div>

          <div className="pt-1">
            <a
              href={entry.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-[#003ACC] hover:underline"
            >
              Open source link <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function LinkCoveragePanel() {
  const [data, setData] = useState<CoverageResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [verdict, setVerdict] = useState<CoverageVerdict | 'all'>('all')
  const [category, setCategory] = useState<string>('all')
  const [onlyMissing, setOnlyMissing] = useState(false)

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true)
    setError(null)
    try {
      const res = await fetch(`/api/super-admin/link-coverage${force ? '?refresh=1' : ''}`, {
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error('Super admin access is required to run the coverage check.')
        }
        throw new Error(`Coverage check failed (HTTP ${res.status})`)
      }
      const json = (await res.json()) as CoverageResponse
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Coverage check failed')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const entries = useMemo(() => {
    if (!data) return []
    const needle = query.trim().toLowerCase()
    return data.entries.filter((entry) => {
      if (verdict !== 'all' && entry.verdict !== verdict) return false
      if (category !== 'all' && entry.category !== category) return false
      if (onlyMissing && entry.missing.length === 0) return false
      if (!needle) return true
      const haystack = [
        entry.url,
        entry.category,
        entry.verdict,
        entry.claim,
        entry.gap ?? '',
        ...entry.evidence.map((item) => `${item.label} ${item.path}`),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(needle)
    })
  }, [data, query, verdict, category, onlyMissing])

  const summary: CoverageSummary | null = data?.summary ?? null
  const verifiedPct =
    summary && summary.evidencePaths > 0
      ? Math.round((summary.evidenceVerified / summary.evidencePaths) * 100)
      : 0

  const exportJson = () => {
    if (!data) return
    const blob = new Blob([JSON.stringify({ ...data, entries }, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `link-coverage-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64 bg-gray-100" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl bg-gray-100" />
          ))}
        </div>
        <Skeleton className="h-16 rounded-xl bg-gray-100" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl bg-gray-100" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#1E293B] flex items-center gap-2">
            <FileCheck2 className="w-5 h-5 text-[#003ACC]" />
            Link coverage
          </h2>
          <p className="text-xs text-[#64748B] mt-1">
            Every reference link, and every file in this repository that backs it. Files are re-read from the
            working tree — not from a list written earlier.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load(true)}
            disabled={refreshing}
            className="gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Checking…' : 'Re-check all files'}
          </Button>
          <Button variant="outline" size="sm" onClick={exportJson} disabled={!data} className="gap-1.5">
            <Download className="w-3.5 h-3.5" />
            Export JSON
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800">Could not run the check</p>
            <p className="text-xs text-red-700 mt-0.5">{error}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => void load(true)}>
              Try again
            </Button>
          </div>
        </div>
      ) : null}

      {data ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#64748B]">
            <Badge
              variant="outline"
              className={
                data.mode === 'live'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }
            >
              {data.mode === 'live' ? 'Working tree verified' : 'Registry only (tree not readable)'}
            </Badge>
            <span>Checked {new Date(data.generatedAt).toLocaleString()}</span>
            {data.cached ? <span>· cached ≤30s</span> : null}
            {data.inventory ? (
              <span>
                · {data.inventory.srcFiles.toLocaleString()} files under src/,{' '}
                {data.inventory.docsFiles.toLocaleString()} under docs/
              </span>
            ) : null}
          </div>

          {summary ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <SummaryCard
                  icon={Files}
                  label="Links in registry"
                  value={summary.links}
                  hint={`${summary.repositories} repos · ${summary.sites} sites`}
                />
                <SummaryCard
                  icon={CheckCircle2}
                  label="Implemented"
                  value={summary.implemented}
                  tone="text-emerald-600"
                  hint="Code or tests exercise it"
                />
                <SummaryCard
                  icon={CheckCircle2}
                  label="In-kind"
                  value={summary.inKind}
                  tone="text-sky-600"
                  hint="Equivalent subsystem exists"
                />
                <SummaryCard
                  icon={AlertTriangle}
                  label="Gaps"
                  value={summary.gap}
                  tone={summary.gap > 0 ? 'text-amber-600' : 'text-emerald-600'}
                  hint="Named next step"
                />
                <SummaryCard
                  icon={MinusCircle}
                  label="Not applicable"
                  value={summary.notApplicable + summary.reference}
                  tone="text-zinc-500"
                  hint={`${summary.reference} reference · ${summary.notApplicable} N/A`}
                />
                <SummaryCard
                  icon={FileX2}
                  label="Missing files"
                  value={summary.missingPaths}
                  tone={summary.missingPaths > 0 ? 'text-red-600' : 'text-emerald-600'}
                  hint={`${summary.entriesFullyVerified}/${summary.links} links fully verified`}
                />
              </div>

              <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-[#1E293B]">
                    Evidence files on disk: {summary.evidenceVerified} / {summary.evidencePaths}
                  </p>
                  <span className="text-xs text-[#64748B]">{verifiedPct}%</span>
                </div>
                <Progress value={verifiedPct} className="h-1.5" />
                {summary.unverifiablePaths > 0 ? (
                  <p className="text-[10px] text-amber-600 mt-2">
                    {summary.unverifiablePaths} path(s) could not be read in this runtime.
                  </p>
                ) : null}
              </div>
            </>
          ) : null}

          {data.warnings.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1">
              {data.warnings.map((warning, i) => (
                <p key={i} className="text-xs text-amber-800 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>{warning}</span>
                </p>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search link, claim, gap or evidence path…"
                className="pl-8 h-8 text-xs bg-white"
                aria-label="Search link coverage"
              />
            </div>
            <Select value={verdict} onValueChange={(v) => setVerdict(v as CoverageVerdict | 'all')}>
              <SelectTrigger className="h-8 w-[150px] text-xs bg-white">
                <SelectValue placeholder="Verdict" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="all">All verdicts</SelectItem>
                {VERDICT_ORDER.map((v) => (
                  <SelectItem key={v} value={v}>
                    {VERDICT_META[v].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-8 w-[190px] text-xs bg-white">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="all">All categories</SelectItem>
                {(data.categories ?? []).map((c) => (
                  <SelectItem key={c.name} value={c.name}>
                    {c.name} ({c.links})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={onlyMissing ? 'default' : 'outline'}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setOnlyMissing((v) => !v)}
            >
              Missing only
            </Button>
            <span className="text-[11px] text-[#64748B]">
              {entries.length} of {data.entries.length} shown
            </span>
          </div>

          <div className="space-y-2">
            {entries.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#E2E8F0] p-10 text-center">
                <FileCheck2 className="w-8 h-8 text-[#CBD5E1] mx-auto mb-2" />
                <p className="text-sm text-[#64748B]">No link matches these filters.</p>
              </div>
            ) : (
              entries.map((entry) => <EntryCard key={entry.id} entry={entry} />)
            )}
          </div>

          <p className="text-[10px] text-[#94A3B8] leading-relaxed pb-2">
            A verdict is a claim that can be disproved by opening a file. Rows marked Gap are listed with the
            missing step; they are not counted as done. Upstream metrics (stars, language) were read from the
            GitHub API on the registry check date, not maintained by hand.
          </p>
        </>
      ) : null}
    </div>
  )
}
