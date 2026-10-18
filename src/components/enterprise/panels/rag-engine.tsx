'use client'

import { useEffect, useState } from 'react'
import { Database, Search, FileText, RefreshCw, ChevronRight, Layers, Clock, CheckCircle, HardDrive } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { fetchApi } from '@/lib/api'

interface RagEngineStats {
  collections: number
  documents: number
  chunks: number
  qdrantConnected: boolean
  averageChunksPerDoc: number | null
  totalQueries: number
  averageQueryDurationMs: number | null
  indexedDocuments: number
  indexingRate: number | null
  embeddedChunks: number
  embeddingProviderConfigured: boolean
}

interface RagCollection {
  id: string
  name: string
  documentCount: number
  chunkCount: number
}

interface RagSearchResult {
  id: string
  content: string
  score: number
  source?: string
}

interface RagEngineResponse {
  engine: RagEngineStats
  collections: RagCollection[]
}

interface SearchResponse {
  success: boolean
  data: {
    results: RagSearchResult[]
    totalFound: number
    durationMs: number
  }
}

function countLabel(value: number | undefined): string {
  return value == null ? '—' : value.toLocaleString()
}

export default function RagEnginePanel() {
  const [stats, setStats] = useState<RagEngineStats | null>(null)
  const [collections, setCollections] = useState<RagCollection[]>([])
  const [loading, setLoading] = useState(true)
  const [statsError, setStatsError] = useState('')
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<RagSearchResult[]>([])
  const [searchTotal, setSearchTotal] = useState<number | null>(null)
  const [searchDurationMs, setSearchDurationMs] = useState<number | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      setStatsError('')
      try {
        const response = await fetchApi<RagEngineResponse>('/api/rag/engine-stats', { signal: controller.signal })
        setStats(response.engine)
        setCollections(response.collections ?? [])
      } catch (cause) {
        if (cause instanceof Error && cause.name !== 'AbortError') {
          setStats(null)
          setCollections([])
          setStatsError(cause.message)
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [])

  async function handleSearch() {
    const trimmedQuery = query.trim()
    if (!trimmedQuery || searching) return
    setSearching(true)
    setSearchError('')
    setSearchResults([])
    setSearchTotal(null)
    setSearchDurationMs(null)
    try {
      const response = await fetchApi<SearchResponse>('/api/rag/search', {
        method: 'POST',
        body: JSON.stringify({ query: trimmedQuery, limit: 10 }),
      })
      if (!response.success) throw new Error('RAG search request failed')
      setSearchResults(response.data.results ?? [])
      setSearchTotal(response.data.totalFound)
      setSearchDurationMs(response.data.durationMs)
    } catch (cause) {
      setSearchError(cause instanceof Error ? cause.message : 'RAG search failed')
    } finally {
      setSearching(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    )
  }

  const metrics = [
    { label: 'Collections', value: countLabel(stats?.collections), icon: Layers, color: 'text-blue-600 bg-blue-50' },
    { label: 'Documents', value: countLabel(stats?.documents), icon: FileText, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Chunks', value: countLabel(stats?.chunks), icon: Database, color: 'text-violet-600 bg-violet-50' },
    { label: 'Recorded queries', value: countLabel(stats?.totalQueries), icon: Search, color: 'text-amber-600 bg-amber-50' },
    { label: 'Mean query latency', value: stats?.averageQueryDurationMs == null ? 'Not measured' : `${stats.averageQueryDurationMs.toLocaleString()} ms`, icon: Clock, color: 'text-cyan-600 bg-cyan-50' },
  ]

  return (
    <div className="space-y-6 p-6">
      {statsError && <p role="status" className="text-sm text-amber-700">Tenant RAG statistics are unavailable: {statsError}</p>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        {metrics.map((metric) => {
          const Icon = metric.icon
          return (
            <Card key={metric.label} className="rounded-xl shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${metric.color}`}><Icon className="h-5 w-5" /></div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">{metric.label}</p>
                    <p className="text-lg font-bold text-slate-900">{metric.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Tabs defaultValue="search" className="space-y-4">
        <TabsList className="bg-slate-100">
          <TabsTrigger value="search">RAG Query</TabsTrigger>
          <TabsTrigger value="collections">Collections</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline Status</TabsTrigger>
        </TabsList>

        <TabsContent value="search">
          <Card className="rounded-xl shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2"><Search className="h-4 w-4 text-blue-600" />Tenant Knowledge Retrieval</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3">
                <Input
                  placeholder="Search knowledge available to this company..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && void handleSearch()}
                  className="flex-1"
                />
                <Button onClick={() => void handleSearch()} disabled={searching || !query.trim()} className="bg-[#003ABC] hover:bg-[#003ABC]/90">
                  {searching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  <span className="ml-2">Search</span>
                </Button>
              </div>
              {searchError && <p role="status" className="text-sm text-red-600">Search failed: {searchError}</p>}
              {searching && <div className="flex items-center gap-3 rounded-lg bg-blue-50 p-4"><RefreshCw className="h-4 w-4 animate-spin text-blue-600" /><span className="text-sm text-blue-700">Searching the tenant-scoped collections...</span></div>}
              {searchTotal !== null && (
                <p className="text-sm font-medium text-slate-600">
                  {searchTotal.toLocaleString()} matching chunks{searchDurationMs === null ? '' : ` · ${searchDurationMs.toLocaleString()} ms`}
                </p>
              )}
              {searchResults.length > 0 && (
                <div className="space-y-2">
                  {searchResults.map((result, index) => (
                    <div key={result.id} className="flex items-start gap-3 rounded-lg bg-slate-50 p-3 transition-colors hover:bg-slate-100">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="whitespace-pre-wrap text-sm text-slate-800">{result.content}</p>
                        <p className="mt-2 text-xs text-slate-500">{result.source ?? 'Tenant document'} · Recorded relevance score {result.score.toFixed(3)}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                    </div>
                  ))}
                </div>
              )}
              {searchTotal === 0 && <p className="text-sm text-slate-500">No matching tenant documents were found.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="collections">
          <Card className="rounded-xl shadow-sm">
            <CardHeader className="pb-4"><CardTitle className="text-base flex items-center gap-2"><Layers className="h-4 w-4 text-violet-600" />Tenant Collections ({collections.length})</CardTitle></CardHeader>
            <CardContent>
              {collections.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">No RAG collections are recorded for this tenant.</p>
              ) : (
                <ScrollArea className="max-h-[500px]">
                  <div className="space-y-3">
                    {collections.map((collection) => (
                      <div key={collection.id} className="flex items-center gap-4 rounded-lg border border-slate-100 p-4 transition-all hover:border-slate-200 hover:shadow-sm">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-50"><Database className="h-5 w-5 text-violet-600" /></div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">{collection.name}</p>
                          <div className="mt-1 flex items-center gap-4">
                            <span className="flex items-center gap-1 text-xs text-slate-500"><FileText className="h-3 w-3" />{collection.documentCount.toLocaleString()} docs</span>
                            <span className="flex items-center gap-1 text-xs text-slate-500"><Layers className="h-3 w-3" />{collection.chunkCount.toLocaleString()} chunks</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pipeline">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="rounded-xl shadow-sm">
              <CardHeader className="pb-4"><CardTitle className="text-base">Configured retrieval services</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-2"><HardDrive className="h-4 w-4 text-slate-500" /><span className="text-sm">Last observed vector-database probe</span></div>
                  <Badge variant="outline" className={stats?.qdrantConnected ? 'text-emerald-700' : 'text-slate-500'}>{stats ? (stats.qdrantConnected ? 'Reachable' : 'Not reachable') : 'Unavailable'}</Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-2"><Database className="h-4 w-4 text-slate-500" /><span className="text-sm">Embedding provider</span></div>
                  <Badge variant="outline" className={stats?.embeddingProviderConfigured ? 'text-emerald-700' : 'text-slate-500'}>{stats ? (stats.embeddingProviderConfigured ? 'Configured' : 'Not configured') : 'Unavailable'}</Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-slate-500" /><span className="text-sm">Indexed documents</span></div>
                  <span className="text-sm font-semibold">{stats ? `${stats.indexedDocuments.toLocaleString()} / ${stats.documents.toLocaleString()}` : '—'}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-2"><Database className="h-4 w-4 text-slate-500" /><span className="text-sm">Stored chunks with embeddings</span></div>
                  <span className="text-sm font-semibold">{countLabel(stats?.embeddedChunks)}</span>
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-xl shadow-sm">
              <CardHeader className="pb-4"><CardTitle className="text-base">Measured retrieval activity</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800/60">
                  <p className="text-sm text-slate-600 dark:text-slate-300">Recorded query count</p>
                  <p className="mt-1 text-2xl font-bold">{countLabel(stats?.totalQueries)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800/60">
                  <p className="text-sm text-slate-600 dark:text-slate-300">Mean recorded query duration</p>
                  <p className="mt-1 text-2xl font-bold">{stats?.averageQueryDurationMs == null ? 'Not measured' : `${stats.averageQueryDurationMs.toLocaleString()} ms`}</p>
                </div>
                <p className="text-xs text-slate-500">Relevance-quality percentages and per-stage latency are not available because the runtime does not persist those measurements.</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
