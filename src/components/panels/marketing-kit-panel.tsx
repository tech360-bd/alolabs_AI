'use client'

/**
 * Marketing Kit — browse, read and install the imported marketing playbooks.
 *
 * Reads metadata from `/api/marketing-kit` and pulls a single playbook body on
 * demand from `/api/marketing-kit/:slug`, so the 2.5MB of markdown stays on the
 * server. Installing adds the playbook to the Skills Registry as `mk-<slug>`
 * so it can be granted to agents like any other skill.
 */

import * as React from 'react'
import {
  Search,
  BookOpen,
  Download,
  FileText,
  Sparkles,
  CheckCircle2,
  ExternalLink,
  Layers,
  X,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fetchApi } from '@/lib/api'
import { toast } from 'sonner'
import { Markdown } from '@/components/marketing/markdown'

interface Reference {
  path: string
  name: string
  bytes: number
  heading: string
}

interface KitSkill {
  slug: string
  name: string
  title: string
  description: string
  version: string
  license: string
  category: string
  references: Reference[]
  assets: { path: string; bytes: number }[]
  hasEvals: boolean
  bytes: number
  bodyBytes: number
}

interface Stats {
  skills: number
  categories: number
  references: number
  kilobytes: number
  syncedAt: string
  source: string
  license: string
}

interface ListResponse {
  data: KitSkill[]
  total: number
  catalogTotal: number
  categories: { name: string; count: number }[]
  stats: Stats
  source: string
  license: string
  syncedAt: string
}

interface DetailResponse extends KitSkill {
  body: string
  triggers: string[]
}

export default function MarketingKitPanel() {
  const [skills, setSkills] = React.useState<KitSkill[]>([])
  const [categories, setCategories] = React.useState<{ name: string; count: number }[]>([])
  const [stats, setStats] = React.useState<Stats | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [query, setQuery] = React.useState('')
  const [category, setCategory] = React.useState('all')

  const [openSlug, setOpenSlug] = React.useState<string | null>(null)
  const [detail, setDetail] = React.useState<DetailResponse | null>(null)
  const [detailLoading, setDetailLoading] = React.useState(false)
  const [installing, setInstalling] = React.useState(false)
  const [installed, setInstalled] = React.useState<string[]>([])
  const [activeRef, setActiveRef] = React.useState<{ heading: string; content: string } | null>(null)
  const [activeAsset, setActiveAsset] = React.useState<{ path: string; contentType: string; content: string } | null>(null)
  const [assetLoading, setAssetLoading] = React.useState(false)
  const [refLoading, setRefLoading] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (query) params.set('q', query)
      if (category !== 'all') params.set('category', category)
      const res = await fetchApi<ListResponse>(`/api/marketing-kit?${params.toString()}`)
      setSkills(res.data)
      setCategories(res.categories)
      setStats(res.stats)
    } catch {
      toast.error('Could not load the marketing kit')
    } finally {
      setLoading(false)
    }
  }, [query, category])

  React.useEffect(() => {
    const timer = setTimeout(load, query ? 250 : 0)
    return () => clearTimeout(timer)
  }, [load, query])

  const openSkill = async (slug: string) => {
    setOpenSlug(slug)
    setDetail(null)
    setActiveRef(null)
  setActiveAsset(null)
    setDetailLoading(true)
    try {
      const res = await fetchApi<DetailResponse>(`/api/marketing-kit/${slug}`)
      setDetail(res)
    } catch {
      toast.error('Could not load this playbook')
    } finally {
      setDetailLoading(false)
    }
  }

  const openReference = async (ref: Reference) => {
    if (!openSlug) return
    setRefLoading(true)
    try {
      const res = await fetchApi<{ reference: { heading: string; content: string } }>(
        `/api/marketing-kit/${openSlug}?ref=${encodeURIComponent(ref.path)}`,
      )
      setActiveRef(res.reference)
    } catch {
      toast.error('Could not load this reference')
    } finally {
      setRefLoading(false)
    }
  }

  const openAsset = async (path: string) => {
    if (!openSlug) return
    setAssetLoading(true)
    try {
      const res = await fetchApi<{ asset: { path: string; contentType: string; content: string } }>(
        `/api/marketing-kit/${openSlug}?asset=${encodeURIComponent(path)}`,
      )
      setActiveRef(null)
      setActiveAsset(res.asset)
    } catch {
      toast.error('Could not load this template')
    } finally {
      setAssetLoading(false)
    }
  }

  const install = async (slugs: string[]) => {
    setInstalling(true)
    try {
      const res = await fetchApi<{ installed: number; created: number; updated: number }>('/api/marketing-kit', {
        method: 'POST',
        body: JSON.stringify({ slugs, status: 'private', requiresApproval: true }),
      })
      setInstalled((prev) => [...new Set([...prev, ...slugs])])
      toast.success(
        `${res.installed} playbook${res.installed === 1 ? '' : 's'} in the Skills Registry (${res.created} new, ${res.updated} updated)`,
      )
    } catch {
      toast.error('Install failed — check that you are signed in')
    } finally {
      setInstalling(false)
    }
  }

  const categoryOptions = React.useMemo(
    () => [{ name: 'all', count: stats?.skills ?? 0 }, ...categories],
    [categories, stats],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">Marketing kit</p>
          <h2 className="mt-1 font-serif text-3xl font-normal tracking-tight text-slate-900">
            {stats ? `${stats.skills} marketing playbooks` : 'Marketing playbooks'}
          </h2>
          <p className="mt-1 max-w-[70ch] text-sm text-slate-600">
            Conversion, SEO, paid media, lifecycle and GTM playbooks imported from the open marketing skill library.
            Read one here or install it into the Skills Registry so an agent can be granted it.
          </p>
        </div>
        {stats && (
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
              <p className="font-mono text-lg text-slate-900">{stats.skills}</p>
              <p className="font-mono text-[9px] uppercase tracking-wider text-slate-500">skills</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
              <p className="font-mono text-lg text-slate-900">{stats.references}</p>
              <p className="font-mono text-[9px] uppercase tracking-wider text-slate-500">references</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
              <p className="font-mono text-lg text-slate-900">{stats.categories}</p>
              <p className="font-mono text-[9px] uppercase tracking-wider text-slate-500">categories</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search playbooks — “cold email”, “paywall”, “attribution”…"
            className="h-9 pl-9"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-9 w-[220px]">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            {categoryOptions.map((c) => (
              <SelectItem key={c.name} value={c.name}>
                {c.name === 'all' ? `All categories (${c.count})` : `${c.name} (${c.count})`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="editorialOutline" size="sm" onClick={() => install(skills.slice(0, 10).map((s) => s.slug))} disabled={installing || !skills.length}>
          <Download className="size-3.5" /> Install top 10
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      ) : skills.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-12 text-center text-sm text-slate-500">
          No playbook matches “{query}”.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {skills.map((skill) => (
            <Card key={skill.slug} className="flex flex-col border-slate-200 shadow-none transition-colors hover:border-slate-400">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="secondary" className="font-mono text-[10px] uppercase tracking-wider">
                    {skill.category}
                  </Badge>
                  <span className="font-mono text-[10px] text-slate-400">v{skill.version}</span>
                </div>
                <CardTitle className="mt-2 text-base leading-snug text-slate-900">{skill.title}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-3">
                <p className="line-clamp-3 text-xs leading-relaxed text-slate-600">{skill.description}</p>
                <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  <span className="flex items-center gap-1">
                    <FileText className="size-3" /> {skill.references.length} refs
                  </span>
                  {skill.hasEvals && (
                    <span className="flex items-center gap-1">
                      <Sparkles className="size-3" /> evals
                    </span>
                  )}
                  {installed.includes(skill.slug) && (
                    <span className="flex items-center gap-1 text-emerald-600">
                      <CheckCircle2 className="size-3" /> installed
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="editorialOutline" className="flex-1" onClick={() => openSkill(skill.slug)}>
                    <BookOpen className="size-3.5" /> Read
                  </Button>
                  <Button size="sm" variant="editorialAccent" onClick={() => install([skill.slug])} disabled={installing}>
                    <Download className="size-3.5" /> Install
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={Boolean(openSlug)} onOpenChange={(o) => !o && setOpenSlug(null)}>
        <DialogContent className="max-w-4xl p-0">
          <DialogHeader className="border-b border-slate-200 px-6 py-4">
            <DialogTitle className="flex flex-wrap items-center gap-3 font-serif text-xl font-normal">
              {detail?.title ?? 'Loading…'}
              {detail && (
                <Badge variant="secondary" className="font-mono text-[10px] uppercase tracking-wider">
                  {detail.category}
                </Badge>
              )}
              {detail && <span className="font-mono text-[10px] text-slate-400">v{detail.version}</span>}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-0 md:grid-cols-[220px_1fr]">
            <aside className="border-b border-slate-200 md:border-b-0 md:border-r">
              <ScrollArea className="h-[480px]">
                <div className="space-y-3 p-4">
                  <Button
                    size="sm"
                    variant={activeRef || activeAsset ? 'editorialGhost' : 'editorial'}
                    className="w-full justify-start"
                    onClick={() => {
                      setActiveRef(null)
                      setActiveAsset(null)
                    }}
                  >
                    <Layers className="size-3.5" /> Playbook
                  </Button>
                  <p className="pt-2 font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400">
                    References ({detail?.references.length ?? 0})
                  </p>
                  <div className="space-y-1">
                    {detail?.references.map((ref) => (
                      <button
                        key={ref.path}
                        onClick={() => openReference(ref)}
                        className="block w-full rounded px-2 py-1.5 text-left text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      >
                        <span className="block truncate font-medium">{ref.heading || ref.name}</span>
                        <span className="font-mono text-[9px] uppercase tracking-wider text-slate-400">
                          {(ref.bytes / 1024).toFixed(1)} kb
                        </span>
                      </button>
                    ))}
                    {detail && !detail.references.length && (
                      <p className="px-2 text-xs text-slate-400">No reference documents.</p>
                    )}
                  </div>
                  {detail && detail.assets.length > 0 && (
                    <>
                      <p className="pt-2 font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400">
                        Templates ({detail.assets.length})
                      </p>
                      <div className="space-y-1">
                        {detail.assets.map((asset) => (
                          <button
                            key={asset.path}
                            onClick={() => openAsset(asset.path)}
                            className="block w-full rounded px-2 py-1.5 text-left text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          >
                            <span className="block truncate font-medium">{asset.path.split('/').pop()}</span>
                            <span className="font-mono text-[9px] uppercase tracking-wider text-slate-400">
                              {(asset.bytes / 1024).toFixed(1)} kb
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </ScrollArea>
            </aside>

            <ScrollArea className="h-[480px]">
              <div className="p-6">
                {detailLoading && <Skeleton className="h-64 w-full" />}
                {refLoading && <Skeleton className="h-40 w-full" />}
                {assetLoading && <Skeleton className="h-40 w-full" />}

                {!detailLoading && !assetLoading && activeAsset && openSlug && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">Template</p>
                      <div className="flex gap-2">
                        <a
                          href={`/api/marketing-kit/${openSlug}?asset=${encodeURIComponent(activeAsset.path)}&download=1`}
                          className="inline-flex h-8 items-center rounded-[6px] border border-slate-300 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          <Download className="mr-1 size-3.5" /> Download
                        </a>
                        <Button size="sm" variant="editorialGhost" onClick={() => setActiveAsset(null)}>
                          <X className="size-3.5" /> Close
                        </Button>
                      </div>
                    </div>
                    <h3 className="font-mono text-sm text-slate-900">{activeAsset.path}</h3>
                    <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-700">
                      {activeAsset.content}
                    </pre>
                  </div>
                )}

                {!detailLoading && !refLoading && !assetLoading && activeRef && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">Reference</p>
                      <Button size="sm" variant="editorialGhost" onClick={() => setActiveRef(null)}>
                        <X className="size-3.5" /> Close
                      </Button>
                    </div>
                    <h3 className="font-serif text-2xl font-normal">{activeRef.heading}</h3>
                    <Markdown content={activeRef.content} />
                  </div>
                )}

                {!detailLoading && !refLoading && !assetLoading && !activeRef && !activeAsset && detail && (
                  <div className="space-y-4">
                    {detail.triggers.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {detail.triggers.map((t) => (
                          <span
                            key={t}
                            className="rounded-sm border border-slate-200 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-500"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    <Markdown content={detail.body} />
                    <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
                      <Button
                        variant="editorialAccent"
                        size="sm"
                        onClick={() => openSlug && install([openSlug])}
                        disabled={installing}
                      >
                        <Download className="size-3.5" /> Install into Skills Registry
                      </Button>
                      <a
                        href={`${`https://github.com/coreyhaines31/marketingskills`}/tree/main/skills/${detail.slug}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
                      >
                        <ExternalLink className="size-3" /> Upstream source ({detail.license})
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
