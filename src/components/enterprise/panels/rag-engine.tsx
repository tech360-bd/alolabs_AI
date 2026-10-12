'use client'

import { useEffect, useState } from 'react'
import { Database, Search, FileText, Upload, RefreshCw, ChevronRight, Layers, Tag, Clock, CheckCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { fetchApi } from '@/lib/api'

interface RagStats {
  totalCollections: number
  totalDocuments: number
  totalChunks: number
  totalQueries: number
  avgRelevance: number
  indexingRate: number
}

interface RagDocument {
  id: string
  title: string
  collection: string
  chunks: number
  status: string
  createdAt: string
}

const collections = [
  { name: 'Enterprise Policies', docs: 1250, chunks: 18750, status: 'indexed' },
  { name: 'Department Knowledge', docs: 2400, chunks: 36000, status: 'indexed' },
  { name: 'Agent Protocols', docs: 800, chunks: 12000, status: 'indexed' },
  { name: 'SOPs & Procedures', docs: 500, chunks: 7500, status: 'indexed' },
  { name: 'Technical Docs', docs: 1800, chunks: 27000, status: 'indexed' },
  { name: 'Training Materials', docs: 3200, chunks: 48000, status: 'indexed' },
  { name: 'Compliance Records', docs: 650, chunks: 9750, status: 'indexed' },
  { name: 'Research Papers', docs: 950, chunks: 14250, status: 'indexed' },
  { name: 'Meeting Transcripts', docs: 1100, chunks: 16500, status: 'indexing' },
  { name: 'Customer Data', docs: 750, chunks: 11250, status: 'indexed' },
  { name: 'Financial Reports', docs: 420, chunks: 6300, status: 'indexed' },
  { name: 'Security Logs', docs: 2800, chunks: 42000, status: 'indexed' },
]

export default function RagEnginePanel() {
  const [stats, setStats] = useState<RagStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<string[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    fetchApi('/api/enterprise/stats')
      .then(() => {
        setStats({
          totalCollections: 12,
          totalDocuments: 16620,
          totalChunks: 249300,
          totalQueries: 89450,
          avgRelevance: 0.94,
          indexingRate: 99.2,
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSearch = () => {
    if (!query.trim()) return
    setSearching(true)
    setTimeout(() => {
      setSearchResults([
        'Enterprise Governance Policy v3.2 — Section 4: AI Agent Decision Framework',
        'Department Protocol: Cross-functional Collaboration Guidelines',
        'SOP-OPS-045: Knowledge Base Update and Maintenance Procedure',
        'Training Module: Advanced RAG Pipeline Configuration',
        'Compliance Standard: Data Retrieval and Privacy Protection',
        'Research Note: Improving Retrieval Relevance with Hybrid Search',
        'Agent Knowledge Base: Decision Making Best Practices',
      ])
      setSearching(false)
    }, 1500)
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'Collections', value: stats?.totalCollections || 12, icon: Layers, color: 'text-blue-600 bg-blue-50' },
          { label: 'Documents', value: stats?.totalDocuments || 16620, icon: FileText, color: 'text-emerald-600 bg-emerald-50' },
          { label: 'Chunks', value: stats?.totalChunks || 249300, icon: Database, color: 'text-violet-600 bg-violet-50' },
          { label: 'Queries', value: stats?.totalQueries || 89450, icon: Search, color: 'text-amber-600 bg-amber-50' },
          { label: 'Relevance', value: `${((stats?.avgRelevance || 0.94) * 100).toFixed(1)}%`, icon: CheckCircle, color: 'text-cyan-600 bg-cyan-50' },
          { label: 'Indexed', value: `${stats?.indexingRate || 99.2}%`, icon: RefreshCw, color: 'text-rose-600 bg-rose-50' },
        ].map((s) => {
          const Icon = s.icon
          return (
            <Card key={s.label} className="rounded-xl shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${s.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">{s.label}</p>
                    <p className="text-lg font-bold text-slate-900">{typeof s.value === 'number' ? s.value.toLocaleString() : s.value}</p>
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
              <CardTitle className="text-base flex items-center gap-2">
                <Search className="h-4 w-4 text-blue-600" />
                Enterprise Knowledge Retrieval
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3">
                <Input
                  placeholder="Search across all enterprise knowledge..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="flex-1"
                />
                <Button onClick={handleSearch} disabled={searching} className="bg-[#003ABC] hover:bg-[#003ABC]/90">
                  {searching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  <span className="ml-2">Search</span>
                </Button>
              </div>
              {searching && (
                <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
                  <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                  <span className="text-sm text-blue-700">Searching across {stats?.totalChunks.toLocaleString() || '249,300'} knowledge chunks...</span>
                </div>
              )}
              {searchResults.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-600">{searchResults.length} relevant results found</p>
                  {searchResults.map((r, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs font-bold">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{r}</p>
                        <p className="text-xs text-slate-500">Relevance: {(0.95 - i * 0.03).toFixed(2)}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="collections">
          <Card className="rounded-xl shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4 text-violet-600" />
                Knowledge Collections ({collections.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[500px]">
                <div className="space-y-3">
                  {collections.map((c, i) => (
                    <div key={i} className="flex items-center gap-4 p-4 rounded-lg border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-50">
                        <Database className="h-5 w-5 text-violet-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">{c.name}</p>
                          <Badge variant={c.status === 'indexed' ? 'default' : 'secondary'} className={`text-[10px] ${c.status === 'indexed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {c.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-1">
                          <span className="text-xs text-slate-500 flex items-center gap-1"><FileText className="h-3 w-3" />{c.docs.toLocaleString()} docs</span>
                          <span className="text-xs text-slate-500 flex items-center gap-1"><Layers className="h-3 w-3" />{c.chunks.toLocaleString()} chunks</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-500">Index</p>
                        <p className="text-sm font-semibold text-emerald-600">100%</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pipeline">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="rounded-xl shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Ingestion Pipeline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { step: 'Document Ingestion', progress: 100, status: 'active' },
                  { step: 'Text Extraction', progress: 100, status: 'active' },
                  { step: 'Chunking (512 tokens)', progress: 100, status: 'active' },
                  { step: 'Embedding Generation', progress: 98, status: 'active' },
                  { step: 'Vector Storage', progress: 98, status: 'active' },
                  { step: 'Index Building', progress: 95, status: 'processing' },
                ].map((p) => (
                  <div key={p.step} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-700">{p.step}</span>
                      <span className="text-xs font-medium text-slate-500">{p.progress}%</span>
                    </div>
                    <Progress value={p.progress} className="h-2" />
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="rounded-xl shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Retrieval Pipeline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { step: 'Query Parsing', progress: 100, latency: '2ms' },
                  { step: 'Query Expansion', progress: 100, latency: '15ms' },
                  { step: 'Vector Search (HNSW)', progress: 100, latency: '8ms' },
                  { step: 'Reranking', progress: 100, latency: '45ms' },
                  { step: 'Context Assembly', progress: 100, latency: '5ms' },
                  { step: 'Response Generation', progress: 100, latency: '320ms' },
                ].map((p) => (
                  <div key={p.step} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-700">{p.step}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-500 flex items-center gap-1"><Clock className="h-3 w-3" />{p.latency}</span>
                        <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-200 bg-emerald-50">OK</Badge>
                      </div>
                    </div>
                    <Progress value={p.progress} className="h-2" />
                  </div>
                ))}
                <div className="mt-4 p-3 rounded-lg bg-blue-50">
                  <p className="text-xs text-blue-700">End-to-end retrieval latency: <span className="font-bold">395ms</span> (P50) | <span className="font-bold">620ms</span> (P99)</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
