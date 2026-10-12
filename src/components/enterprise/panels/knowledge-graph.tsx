'use client'

import React, { useState, useEffect } from 'react'
import { Network, Search, Link2, Sparkles, ArrowRight } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { EnterpriseView } from '../enterprise-shell'

interface KnowledgeNode {
  id: string
  title: string
  type: string
  domain: string
  confidence: number
  version: string
  connections: string[]
}

const nodeTypes = ['All', 'concept', 'entity', 'process', 'rule', 'skill', 'tool', 'document']
const typeColors: Record<string, string> = {
  concept: 'bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400',
  entity: 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
  process: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
  rule: 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400',
  skill: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
  tool: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-400',
  document: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
}

export default function KnowledgeGraph() {
  const [nodes, setNodes] = useState<KnowledgeNode[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [type, setType] = useState('All')
  const [page, setPage] = useState(1)
  const [selectedNode, setSelectedNode] = useState<KnowledgeNode | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    async function fetchNodes() {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          page: String(page), limit: '50', search,
          type: type === 'All' ? '' : type,
        })
        const data = await fetchApi(`/api/enterprise/knowledge?${params}`, { signal: controller.signal })
        setNodes(data.nodes || [])
        setTotal(data.total || 0)
      } catch { /* empty */ } finally { setLoading(false) }
    }
    fetchNodes()
    return () => controller.abort()
  }, [page, search, type])

  useEffect(() => { setPage(1) }, [search, type])

  const totalPages = Math.ceil(total / 50)

  // Compute type distribution
  const typeDistribution = nodeTypes.slice(1).map(t => ({
    type: t,
    count: t === 'All' ? total : nodes.filter(n => n.type === t).length,
  }))

  if (loading && nodes.length === 0) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Enterprise Knowledge Graph</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{total.toLocaleString()} interconnected knowledge nodes</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total Nodes', value: total, icon: Network, color: 'text-[#003ABC]' },
          { label: 'Node Types', value: nodeTypes.length - 1, icon: Sparkles, color: 'text-[#FF6A00]' },
          { label: 'Avg Confidence', value: nodes.length > 0 ? (nodes.reduce((s, n) => s + n.confidence, 0) / nodes.length * 100).toFixed(0) + '%' : '0%', icon: Sparkles, color: 'text-emerald-600' },
          { label: 'Connections', value: nodes.reduce((s, n) => s + n.connections.length, 0), icon: Link2, color: 'text-purple-600' },
        ].map(s => {
          const Icon = s.icon
          return (
            <Card key={s.label} className="rounded-xl shadow-sm border-0 bg-white dark:bg-slate-800">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-700/50">
                  <Icon className={`h-5 w-5 ${s.color}`} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{s.label}</p>
                  <p className="text-xl font-bold text-slate-900 dark:text-white">{typeof s.value === 'number' ? s.value.toLocaleString() : s.value}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Type Distribution */}
      <Card className="rounded-xl shadow-sm border-0 bg-white dark:bg-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Node Distribution by Type</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {typeDistribution.map(t => (
              <div key={t.type} className="flex flex-col items-center gap-1 p-2 rounded-lg bg-slate-50 dark:bg-slate-700/30">
                <Badge className={`text-[10px] ${typeColors[t.type] || ''}`}>{t.type}</Badge>
                <span className="text-lg font-bold text-slate-900 dark:text-white">{t.count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search knowledge nodes..." className="pl-9 rounded-lg" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          {nodeTypes.map(t => (
            <Button key={t} variant={type === t ? 'default' : 'outline'} size="sm" className="rounded-lg text-xs capitalize" onClick={() => setType(t)}>{t}</Button>
          ))}
        </div>
      </div>

      {/* Nodes Grid */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {nodes.map(node => (
          <Dialog key={node.id}>
            <DialogTrigger asChild>
              <Card
                className="rounded-xl shadow-sm hover:shadow-md transition-all border-0 bg-white dark:bg-slate-800 cursor-pointer"
                onClick={() => setSelectedNode(node)}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-2 leading-snug">{node.title}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Badge className={`text-[10px] capitalize ${typeColors[node.type] || ''}`}>{node.type}</Badge>
                        <span className="text-[10px] text-slate-400">{node.domain}</span>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-300 shrink-0 mt-1" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-400">Confidence</span>
                      <span className="font-semibold text-slate-600 dark:text-slate-300">{(node.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <Progress value={node.confidence * 100} className="h-1.5" />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span className="font-mono">{node.version}</span>
                    <span className="flex items-center gap-1"><Link2 className="h-2.5 w-2.5" />{node.connections.length} connections</span>
                  </div>
                </CardContent>
              </Card>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="text-base">{selectedNode?.title}</DialogTitle>
              </DialogHeader>
              {selectedNode && (
                <div className="space-y-4 pt-2">
                  <div className="flex flex-wrap gap-2">
                    <Badge className={`capitalize ${typeColors[selectedNode.type] || ''}`}>{selectedNode.type}</Badge>
                    <Badge variant="outline">{selectedNode.domain}</Badge>
                    <Badge variant="secondary">{selectedNode.version}</Badge>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-1">Confidence Score</p>
                    <div className="flex items-center gap-2">
                      <Progress value={selectedNode.confidence * 100} className="flex-1 h-2" />
                      <span className="text-sm font-bold">{(selectedNode.confidence * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-2">Connected Nodes ({selectedNode.connections.length})</p>
                    <ScrollArea className="max-h-48">
                      <div className="space-y-1.5">
                        {selectedNode.connections.map(connId => (
                          <div key={connId} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-700/50 text-xs">
                            <Network className="h-3 w-3 text-[#003ABC]" />
                            <span className="text-slate-600 dark:text-slate-300">{connId}</span>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        ))}
      </div>

      {nodes.length === 0 && !loading && (
        <div className="text-center py-12">
          <Network className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-sm text-slate-500">No knowledge nodes found</p>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <span className="text-xs text-slate-500">Page {page} of {totalPages} ({total.toLocaleString()} nodes)</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  )
}
