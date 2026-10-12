'use client'

import React, { useState, useEffect } from 'react'
import { ClipboardList, Search, Clock, ChevronDown, ChevronUp, Check } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import type { EnterpriseView } from '../enterprise-shell'

interface SOP {
  id: string
  title: string
  category: string
  priority: string
  department: string
  status: string
  estimatedTime: string
  version: string
  steps: { step: number; description: string; completed: boolean }[]
}

const sopCategories = ['All', 'Onboarding', 'Operations', 'Security', 'Incident', 'Deployment', 'Compliance', 'Communication', 'Quality']
const priorityOptions = ['All', 'critical', 'high', 'medium', 'low']

const priorityConfig: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
}

export default function SOPSystem() {
  const [sops, setSops] = useState<SOP[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [priority, setPriority] = useState('All')
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    async function fetchSOPs() {
      setLoading(true)
      try {
        const params = new URLSearchParams({ page: String(page), limit: '50', search, category: category === 'All' ? '' : category, priority: priority === 'All' ? '' : priority })
        const data = await fetchApi(`/api/enterprise/sops?${params}`, { signal: controller.signal })
        setSops(data.sops)
        setTotal(data.total)
      } catch { /* empty */ } finally { setLoading(false) }
    }
    fetchSOPs()
    return () => controller.abort()
  }, [page, search, category, priority])

  useEffect(() => { setPage(1) }, [search, category, priority])

  const totalPages = Math.ceil(total / 50)

  if (loading && sops.length === 0) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">SOPs System</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Standard Operating Procedures for enterprise operations</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total SOPs', value: total, icon: ClipboardList },
          { label: 'Active', value: sops.filter(s => s.status === 'active').length, icon: Check },
          { label: 'Categories', value: sopCategories.length - 1, icon: ClipboardList },
          { label: 'Avg Steps', value: Math.round(sops.reduce((sum, s) => sum + s.steps.length, 0) / (sops.length || 1)), icon: Clock },
        ].map(s => {
          const Icon = s.icon
          return (
            <Card key={s.label} className="rounded-xl shadow-sm border-0 bg-white dark:bg-slate-800">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#003ABC]/8">
                  <Icon className="h-5 w-5 text-[#003ABC]" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{s.label}</p>
                  <p className="text-xl font-bold text-slate-900 dark:text-white">{s.value.toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search SOPs by title or ID..." className="pl-9 rounded-lg" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          {sopCategories.map(c => (
            <Button key={c} variant={category === c ? 'default' : 'outline'} size="sm" className="rounded-lg text-xs" onClick={() => setCategory(c)}>{c}</Button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          {priorityOptions.map(p => (
            <Button key={p} variant={priority === p ? 'default' : 'outline'} size="sm" className="rounded-lg text-xs" onClick={() => setPriority(p)}>{p === 'All' ? 'All Priorities' : p}</Button>
          ))}
        </div>
      </div>

      {/* SOPs Table */}
      <Card className="rounded-xl shadow-sm border-0 bg-white dark:bg-slate-800 overflow-hidden">
        <ScrollArea className="max-h-[500px]">
          <div className="min-w-[800px]">
            <div className="grid grid-cols-[80px_1fr_110px_80px_120px_80px_70px_60px] gap-2 px-4 py-3 bg-slate-50 dark:bg-slate-700/30 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <span>ID</span><span>Title</span><span>Category</span><span>Priority</span><span>Department</span><span>Status</span><span>Est. Time</span><span>Version</span>
            </div>
            {sops.map(sop => {
              const isExpanded = expanded === sop.id
              const completedSteps = sop.steps.filter(s => s.completed).length
              return (
                <React.Fragment key={sop.id}>
                  <div
                    className="grid grid-cols-[80px_1fr_110px_80px_120px_80px_70px_60px] gap-2 px-4 py-3 border-t border-slate-100 dark:border-slate-700/50 text-xs items-center hover:bg-slate-50 dark:hover:bg-slate-700/20 cursor-pointer transition-colors"
                    onClick={() => setExpanded(isExpanded ? null : sop.id)}
                  >
                    <span className="font-mono text-slate-400">{sop.id.replace('SOP-', '')}</span>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate text-slate-700 dark:text-slate-200 font-medium">{sop.title}</span>
                      {isExpanded ? <ChevronUp className="h-3 w-3 text-slate-300 shrink-0" /> : <ChevronDown className="h-3 w-3 text-slate-300 shrink-0" />}
                    </div>
                    <Badge variant="outline" className="text-[10px] w-fit">{sop.category}</Badge>
                    <Badge className={`text-[10px] w-fit capitalize ${priorityConfig[sop.priority] || ''}`}>{sop.priority}</Badge>
                    <span className="text-slate-500 truncate">{sop.department}</span>
                    <Badge variant={sop.status === 'active' ? 'default' : 'secondary'} className="text-[10px] w-fit capitalize">{sop.status}</Badge>
                    <span className="text-slate-400">{sop.estimatedTime}</span>
                    <span className="text-slate-400 font-mono">{sop.version}</span>
                  </div>
                  {isExpanded && (
                    <div className="px-8 py-3 border-t border-slate-200 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/50">
                      <div className="flex items-center gap-2 mb-3">
                        <p className="text-xs font-semibold text-slate-500">Steps Checklist</p>
                        <Badge variant="outline" className="text-[10px]">{completedSteps}/{sop.steps.length} done</Badge>
                      </div>
                      <div className="space-y-1.5">
                        {sop.steps.map(step => (
                          <div key={step.step} className="flex items-center gap-2.5 text-xs">
                            <Checkbox checked={step.completed} disabled />
                            <span className={step.completed ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-200'}>
                              {step.description}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </React.Fragment>
              )
            })}
          </div>
        </ScrollArea>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <span className="text-xs text-slate-500">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  )
}
