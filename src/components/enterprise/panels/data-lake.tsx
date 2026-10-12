'use client'

import React, { useState, useEffect } from 'react'
import { HardDrive, FolderTree, Database, Clock, Archive, Tag } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'

interface DataLakeEntry {
  id: string; source: string; category: string; format: string; size: number
  department: string; retention: string; createdAt: string
}

const sourceLabels: Record<string, string> = {
  agent_logs: 'Agent Logs', system_metrics: 'System Metrics', interactions: 'Interactions', knowledge: 'Knowledge', compliance: 'Compliance',
}
const formatColors: Record<string, string> = {
  json: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
  parquet: 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
  csv: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
  avro: 'bg-violet-100 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400',
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`
  return `${(bytes / 1073741824).toFixed(2)} GB`
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function DataLakePanel() {
  const [entries, setEntries] = useState<DataLakeEntry[]>([])
  const [stats, setStats] = useState<{ total: number; bySource: Record<string, number>; byCategory: Record<string, number>; totalSize: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')

  useEffect(() => {
    const ctrl = new AbortController()
    async function load() {
      setLoading(true); setError('')
      try {
        const params = new URLSearchParams({ source: sourceFilter, category: categoryFilter })
        const data = await fetchApi(`/api/enterprise/data-lake?${params}`, { signal: ctrl.signal })
        setEntries(data.entries); setStats(data.stats)
      } catch (e) { if (e instanceof Error && e.name !== 'AbortError') setError(e.message) }
      finally { setLoading(false) }
    }
    load(); return () => ctrl.abort()
  }, [sourceFilter, categoryFilter])

  const categories = stats ? Object.keys(stats.byCategory).sort() : []
  const sources = stats ? Object.keys(stats.bySource).sort() : []

  if (loading && entries.length === 0) return (
    <div className="space-y-6 p-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
      </div>
      <Skeleton className="h-80 w-full rounded-xl" />
    </div>
  )

  if (error) return (
    <div className="space-y-6 p-6">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Data Lake</h2>
      <Card className="rounded-xl shadow-sm"><CardContent className="p-6 text-center text-red-500">Failed to load: {error}</CardContent></Card>
    </div>
  )

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-100 dark:bg-cyan-950/30">
          <HardDrive className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Data Lake</h2>
          <p className="text-sm text-slate-500">Centralized data storage across all enterprise sources</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Entries', value: stats?.total.toLocaleString() ?? '—', icon: Database, color: 'text-[#003ABC]' },
          { label: 'Total Size', value: stats ? fmtSize(stats.totalSize) : '—', icon: HardDrive, color: 'text-cyan-600' },
          { label: 'Sources', value: sources.length.toString(), icon: FolderTree, color: 'text-[#FF6A00]' },
          { label: 'Categories', value: categories.length.toString(), icon: Tag, color: 'text-violet-600' },
        ].map((s, i) => (
          <Card key={i} className="rounded-xl shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-slate-500">{s.label}</p><p className={`text-2xl font-bold ${s.color}`}>{s.value}</p></div>
                <s.icon className="h-5 w-5 text-slate-400" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {sources.map(src => (
            <div key={src} className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3">
              <p className="text-xs text-slate-500 mb-1">{sourceLabels[src] || src}</p>
              <p className="text-lg font-bold text-[#003ABC]">{stats.bySource[src]}</p>
            </div>
          ))}
        </div>
      )}

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">Data Entries</CardTitle>
            <div className="flex flex-wrap gap-2">
              <select className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800" value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
                <option value="all">All Sources</option>
                {sources.map(s => <option key={s} value={s}>{sourceLabels[s] || s}</option>)}
              </select>
              <select className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                <option value="all">All Categories</option>
                {categories.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="max-h-96">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Source</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Retention</TableHead>
                  <TableHead className="pr-4 text-right">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-slate-400">No entries found</TableCell></TableRow>}
                {entries.map(e => (
                  <TableRow key={e.id}>
                    <TableCell className="pl-4 text-sm font-medium">{sourceLabels[e.source] || e.source}</TableCell>
                    <TableCell className="text-sm text-slate-600 dark:text-slate-400 capitalize">{e.category.replace(/_/g, ' ')}</TableCell>
                    <TableCell><Badge variant="secondary" className={formatColors[e.format] || ''}>{e.format.toUpperCase()}</Badge></TableCell>
                    <TableCell className="text-right text-sm">{fmtSize(e.size)}</TableCell>
                    <TableCell className="text-sm text-slate-600 dark:text-slate-400">{e.department}</TableCell>
                    <TableCell className="text-sm text-slate-500">{e.retention}</TableCell>
                    <TableCell className="pr-4 text-right text-xs text-slate-400">{fmt(e.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
