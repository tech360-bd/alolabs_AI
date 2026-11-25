'use client'

/**
 * Research & verification panel (Phase D).
 *
 * Runs the public-page analyser and shows exactly what it measured: final URL,
 * HTTP status, fetch time, byte count and SHA-256. Inferences (stack hints,
 * suspected CAPTCHA/paywall) are shown separately and labelled as signals.
 *
 * The badge says "HTTP fetch" on purpose: no JavaScript is executed, so this
 * cannot verify anything that only exists after client-side rendering.
 */

import React, { useCallback, useEffect, useState } from 'react'
import {
  Activity, AlertTriangle, CheckCircle2, ExternalLink, Globe, History,
  Loader2, Save, ShieldAlert, ShieldCheck, XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { fetchApi } from '@/lib/api-client'

interface Citation {
  url: string
  finalUrl: string
  title: string
  status: number
  fetchedAt: string
  sha256: string
  bytes: number
}

interface Analysis {
  requestedUrl: string
  finalUrl: string
  status: number
  fetchedAt: string
  bytes: number
  truncated: boolean
  sha256: string
  contentType: string
  title: string
  description: string
  lang: string | null
  canonical: string | null
  robotsMeta: string | null
  headings: { h1: string[]; h2: string[]; h3: string[] }
  links: { total: number; internal: number; external: number }
  images: { total: number; missingAlt: number }
  forms: number
  scripts: number
  stack: string[]
  issues: string[]
  textExcerpt: string
  access: { robots: string; restricted: boolean; signals: string[] }
  citations: Citation[]
  timings: { fetchMs: number; totalMs: number }
  javascriptRendered: false
}

interface ResearchReportMeta {
  id: string
  name: string
  createdAt: string
  url: string
  finalUrl: string
  status: number
  fetchedAt: string
  sha256: string
  bytes: number
  title: string
  note: string | null
  restricted: boolean
  signals: string[]
}

interface ReportResponse {
  success: boolean
  analysis: Analysis
  saved: { id: string; checksum: string } | null
  verification: {
    level: string
    javascriptRendered: boolean
    evidence: { finalUrl: string; status: number; fetchedAt: string; bytes: number; sha256: string; robots: string }
  }
}

function EvidenceRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-[11px]">
      <span className="w-24 shrink-0 text-slate-500">{label}</span>
      <span className="min-w-0 flex-1 break-all font-mono text-slate-700 dark:text-slate-300">{value}</span>
    </div>
  )
}

export default function ResearchVerification() {
  const [url, setUrl] = useState('https://alolabs.net')
  const [note, setNote] = useState('')
  const [save, setSave] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ReportResponse | null>(null)
  const [reports, setReports] = useState<ResearchReportMeta[]>([])
  const [reportsState, setReportsState] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [opened, setOpened] = useState<{ id: string; analysis?: Analysis; note: string | null } | null>(null)

  const loadReports = useCallback(async () => {
    try {
      const data = await fetchApi<{ reports?: ResearchReportMeta[] }>('/api/research/analyze')
      setReports(Array.isArray(data.reports) ? data.reports : [])
      setReportsState('ready')
    } catch {
      setReportsState('unavailable')
    }
  }, [])

  useEffect(() => { void loadReports() }, [loadReports])

  const analyse = useCallback(async () => {
    const target = url.trim()
    if (!target || busy) return
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const data = await fetchApi<ReportResponse>('/api/research/analyze', {
        method: 'POST',
        body: JSON.stringify({ url: target, save, ...(note.trim() ? { note: note.trim() } : {}) }),
      })
      setResult(data)
      if (data.saved) void loadReports()
    } catch (cause) {
      let detail = cause instanceof Error ? cause.message : 'Analysis failed'
      try {
        const parsed = JSON.parse(detail) as { error?: string }
        if (parsed.error) detail = parsed.error
      } catch { /* keep raw */ }
      setError(detail)
    } finally {
      setBusy(false)
    }
  }, [url, note, save, busy, loadReports])

  const openReport = useCallback(async (id: string) => {
    try {
      const data = await fetchApi<{ report?: { analysis?: Analysis; note: string | null } }>(`/api/research/reports/${encodeURIComponent(id)}`)
      if (data.report?.analysis) setOpened({ id, analysis: data.report.analysis, note: data.report.note ?? null })
    } catch {
      setOpened(null)
    }
  }, [])

  const analysis = result?.analysis ?? null

  return (
    <div className="grid gap-3 lg:grid-cols-5">
      <div className="space-y-3 lg:col-span-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <Globe className="h-4 w-4 text-[#00309C]" /> Public page research
              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">HTTP fetch · no JavaScript</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/pricing"
                aria-label="Public page URL"
                className="font-mono text-xs"
                onKeyDown={(event) => { if (event.key === 'Enter') void analyse() }}
              />
              <Button onClick={() => void analyse()} disabled={busy || !url.trim()} className="shrink-0 bg-[#FC5400] hover:bg-[#e04a00]">
                {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Activity className="mr-1.5 h-4 w-4" />}
                Analyse
              </Button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional note stored with the finding" className="text-xs" aria-label="Research note" />
              <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={save} onChange={(event) => setSave(event.target.checked)} /> Save to tenant memory
              </label>
            </div>
            <p className="text-[11px] text-slate-500">
              Obeys <span className="font-mono">robots.txt</span>, blocks private/internal addresses on every redirect, caps the body at 512 KB / 10 s, and never
              attempts to log in, solve a CAPTCHA, or defeat a paywall. Unreadable pages are reported as restricted, not worked around.
            </p>
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                <p className="flex items-center gap-1.5 font-semibold"><XCircle className="h-3.5 w-3.5" /> Analysis failed</p>
                <p className="mt-1 whitespace-pre-wrap">{error}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {analysis && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {analysis.access.restricted ? <ShieldAlert className="h-4 w-4 text-amber-500" /> : <ShieldCheck className="h-4 w-4 text-emerald-500" />}
                Evidence
                <Badge variant="outline" className={`px-1.5 py-0 text-[10px] ${analysis.status === 200 && !analysis.access.restricted ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                  HTTP {analysis.status || 'blocked'} · {analysis.access.restricted ? 'restricted' : 'public'}
                </Badge>
                {analysis.access.robots !== 'allowed' && <Badge variant="outline" className="px-1.5 py-0 text-[10px]">robots: {analysis.access.robots}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              <EvidenceRow label="Final URL" value={<a href={analysis.finalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#00309C] hover:underline dark:text-blue-300">{analysis.finalUrl} <ExternalLink className="h-3 w-3" /></a>} />
              <EvidenceRow label="Fetched at" value={analysis.fetchedAt} />
              <EvidenceRow label="SHA-256" value={analysis.sha256} />
              <EvidenceRow label="Size" value={`${analysis.bytes.toLocaleString()} bytes${analysis.truncated ? ' (truncated at cap)' : ''}`} />
              <EvidenceRow label="Timing" value={`fetch ${analysis.timings.fetchMs}ms · total ${analysis.timings.totalMs}ms`} />
              <EvidenceRow label="Content type" value={analysis.contentType || '—'} />
              <EvidenceRow label="Title" value={analysis.title || '—'} />
              {analysis.description && <EvidenceRow label="Description" value={analysis.description} />}
              {analysis.canonical && <EvidenceRow label="Canonical" value={analysis.canonical} />}
              <EvidenceRow label="Links" value={`${analysis.links.total} total · ${analysis.links.external} external`} />
              <EvidenceRow label="Images" value={`${analysis.images.total} total · ${analysis.images.missingAlt} without alt`} />
              <EvidenceRow label="Forms / scripts" value={`${analysis.forms} form(s) · ${analysis.scripts} script tag(s)`} />
              <EvidenceRow label="Headings" value={`h1 ${analysis.headings.h1.length} · h2 ${analysis.headings.h2.length} · h3 ${analysis.headings.h3.length}`} />
              {analysis.stack.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {analysis.stack.map((item) => <Badge key={item} variant="outline" className="px-1.5 py-0 text-[10px]">{item}</Badge>)}
                </div>
              )}
              {analysis.access.signals.length > 0 && (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                  <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-3.5 w-3.5" /> Signals (heuristics, not verdicts)</p>
                  <p className="mt-1 font-mono">{analysis.access.signals.join(' · ')}</p>
                </div>
              )}
              {analysis.issues.length > 0 && (
                <div className="mt-2 text-[11px] text-slate-600 dark:text-slate-300">
                  <p className="font-semibold text-slate-700 dark:text-slate-200">Findings</p>
                  <ul className="mt-0.5 list-disc pl-4">
                    {analysis.issues.map((issue) => <li key={issue}>{issue}</li>)}
                  </ul>
                </div>
              )}
              {analysis.citations.length > 0 && (
                <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] dark:border-slate-700 dark:bg-slate-800/50">
                  <p className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Citation</p>
                  <p className="mt-0.5">{analysis.citations[0].title || analysis.citations[0].finalUrl}</p>
                  <p className="font-mono text-[10px] text-slate-500">{analysis.citations[0].finalUrl} · {analysis.citations[0].fetchedAt} · sha256 {analysis.citations[0].sha256.slice(0, 16)}…</p>
                </div>
              )}
              {result?.saved && (
                <p className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-300">
                  <Save className="h-3.5 w-3.5" /> Saved to this company only · artifact <span className="font-mono">{result.saved.id}</span>
                </p>
              )}
              <p className="mt-1 text-[10px] text-slate-400">
                Verification level: <span className="font-mono">{result?.verification.level ?? 'http_fetch'}</span> · JavaScript rendered: {String(analysis.javascriptRendered)} — pages that need client-side rendering may appear empty, and are not claimed as verified content.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-3 lg:col-span-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4 text-[#00309C]" /> Stored findings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {reportsState === 'loading' && <p className="flex items-center gap-1.5 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</p>}
            {reportsState === 'unavailable' && <p className="text-xs text-amber-700">Could not read stored findings. Analyses still run; saving may be unavailable.</p>}
            {reportsState === 'ready' && reports.length === 0 && <p className="text-xs text-slate-500">No saved findings yet. Analyse a page with “Save to tenant memory” enabled.</p>}
            {reports.map((report) => (
              <div key={report.id} className="rounded-lg border border-slate-200 p-2 text-[11px] dark:border-slate-700">
                <button onClick={() => void openReport(report.id)} className="w-full text-left">
                  <p className="truncate font-medium text-slate-700 dark:text-slate-200">{report.title || report.url}</p>
                  <p className="truncate font-mono text-[10px] text-slate-500">{report.finalUrl}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
                    <span>HTTP {report.status}</span>
                    <span>· {new Date(report.fetchedAt).toLocaleString()}</span>
                    {report.restricted && <Badge variant="outline" className="border-amber-200 px-1 py-0 text-[9px] text-amber-700">restricted</Badge>}
                  </p>
                </button>
                <p className="mt-1 truncate font-mono text-[9px] text-slate-400">sha256 {report.sha256.slice(0, 20)}…</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {opened?.analysis && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm"><ShieldCheck className="h-4 w-4 text-emerald-500" /> Stored report</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <EvidenceRow label="URL" value={opened.analysis.finalUrl} />
              <EvidenceRow label="Fetched at" value={opened.analysis.fetchedAt} />
              <EvidenceRow label="SHA-256" value={opened.analysis.sha256} />
              {opened.note && <EvidenceRow label="Note" value={opened.note} />}
              <p className="text-[11px] text-slate-500">This is the evidence stored at fetch time — re-analysing may produce a different hash if the page changed.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
