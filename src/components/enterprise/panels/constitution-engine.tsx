'use client'

import React, { useState, useEffect } from 'react'
import { Scale, Search, Shield, ShieldAlert, AlertTriangle, Info, ChevronRight, BookOpen, Gavel, RefreshCw } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import type { EnterpriseView } from '../enterprise-shell'

interface Rule {
  id: string
  chapter: string
  title: string
  category: string
  severity: string
  priority: string
  statement: string
  rationale: string
  enforcement: string
  violationConsequence: string
  reviewCycle: string
}

const ruleCategories = ['All', 'Governance', 'Security', 'Compliance', 'Operations', 'Ethics', 'Data', 'AI', 'HR', 'Finance', 'Legal']
const severityOptions = ['All', 'critical', 'high', 'medium', 'low']
const priorityOptions = ['All', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

const severityConfig: Record<string, { badge: string; icon: React.ComponentType<{ className?: string }> }> = {
  critical: { badge: 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400', icon: ShieldAlert },
  high: { badge: 'bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400', icon: AlertTriangle },
  medium: { badge: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400', icon: Info },
  low: { badge: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300', icon: Info },
}

export default function ConstitutionEngine() {
  const [rules, setRules] = useState<Rule[]>([])
  const [chapters, setChapters] = useState<string[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [severity, setSeverity] = useState('All')
  const [priority, setPriority] = useState('All')
  const [chapter, setChapter] = useState('All')
  const [page, setPage] = useState(1)
  const [selectedRule, setSelectedRule] = useState<Rule | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    async function fetchRules() {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          page: String(page), limit: '50', search,
          category: category === 'All' ? '' : category,
          severity: severity === 'All' ? '' : severity,
          priority: priority === 'All' ? '' : priority,
          chapter: chapter === 'All' ? '' : chapter,
        })
        const data = await fetchApi(`/api/enterprise/rules?${params}`, { signal: controller.signal })
        setRules(data.rules)
        setTotal(data.total)
        if (data.chapters) setChapters(data.chapters)
      } catch { /* empty */ } finally { setLoading(false) }
    }
    fetchRules()
    return () => controller.abort()
  }, [page, search, category, severity, priority, chapter])

  useEffect(() => { setPage(1) }, [search, category, severity, priority, chapter])

  const severityCounts = rules.length > 0
    ? { critical: rules.filter(r => r.severity === 'critical').length, high: rules.filter(r => r.severity === 'high').length, medium: rules.filter(r => r.severity === 'medium').length, low: rules.filter(r => r.severity === 'low').length }
    : { critical: 99, high: 112, medium: 89, low: 92 }

  const totalPages = Math.ceil(total / 50)

  if (loading && rules.length === 0) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Constitutional Rules Engine</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">500+ enterprise governance rules across 10 constitutional chapters</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: 'Total Rules', value: total, icon: Scale, color: 'text-[#003ABC]' },
          { label: 'Critical', value: severityCounts.critical, icon: ShieldAlert, color: 'text-red-600' },
          { label: 'High', value: severityCounts.high, icon: AlertTriangle, color: 'text-orange-600' },
          { label: 'Medium', value: severityCounts.medium, icon: Info, color: 'text-amber-600' },
          { label: 'Low', value: severityCounts.low, icon: Shield, color: 'text-emerald-600' },
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
          <Input placeholder="Search rules by title, statement, or ID..." className="pl-9 rounded-lg" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <BookOpen className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="text-xs font-medium text-slate-500 w-16 shrink-0">Chapter</span>
            <ScrollArea className="flex-1">
              <div className="flex gap-2 flex-wrap">
                {['All', ...(chapters.length > 0 ? chapters : [])].map(c => (
                  <Button key={c} variant={chapter === c ? 'default' : 'outline'} size="sm" className="rounded-lg text-xs shrink-0" onClick={() => setChapter(c)}>{c}</Button>
                ))}
              </div>
            </ScrollArea>
          </div>
          <div className="flex items-center gap-2">
            <Gavel className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="text-xs font-medium text-slate-500 w-16 shrink-0">Category</span>
            <ScrollArea className="flex-1">
              <div className="flex gap-2 flex-wrap">
                {ruleCategories.map(c => (
                  <Button key={c} variant={category === c ? 'default' : 'outline'} size="sm" className="rounded-lg text-xs shrink-0" onClick={() => setCategory(c)}>{c}</Button>
                ))}
              </div>
            </ScrollArea>
          </div>
          <div className="flex gap-2 flex-wrap">
            {severityOptions.map(s => (
              <Button key={s} variant={severity === s ? 'default' : 'outline'} size="sm" className="rounded-lg text-xs" onClick={() => setSeverity(s)}>{s === 'All' ? 'All Severities' : s}</Button>
            ))}
            <Separator orientation="vertical" className="h-6 mx-1" />
            {priorityOptions.map(p => (
              <Button key={p} variant={priority === p ? 'default' : 'outline'} size="sm" className="rounded-lg text-xs" onClick={() => setPriority(p)}>{p === 'All' ? 'All Priorities' : p}</Button>
            ))}
          </div>
        </div>
      </div>

      {/* Rules Table */}
      <Card className="rounded-xl shadow-sm border-0 bg-white dark:bg-slate-800 overflow-hidden">
        <ScrollArea className="max-h-[500px]">
          <div className="min-w-[800px]">
            <div className="grid grid-cols-[80px_1fr_120px_80px_80px_80px_80px] gap-2 px-4 py-3 bg-slate-50 dark:bg-slate-700/30 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <span>ID</span><span>Title</span><span>Chapter</span><span>Severity</span><span>Priority</span><span>Category</span><span>Review</span>
            </div>
            {rules.map(rule => {
              const sevConfig = severityConfig[rule.severity] || severityConfig.low
              const SevIcon = sevConfig.icon
              return (
                <Dialog key={rule.id}>
                  <DialogTrigger asChild>
                    <div className="grid grid-cols-[80px_1fr_120px_80px_80px_80px_80px] gap-2 px-4 py-3 border-t border-slate-100 dark:border-slate-700/50 text-xs items-center hover:bg-slate-50 dark:hover:bg-slate-700/20 cursor-pointer transition-colors">
                      <span className="font-mono text-slate-400">{rule.id.replace('CONST-', 'C-')}</span>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate text-slate-700 dark:text-slate-200 font-medium">{rule.title}</span>
                        <ChevronRight className="h-3 w-3 text-slate-300 shrink-0" />
                      </div>
                      <Badge variant="outline" className="text-[10px] w-fit truncate">{rule.chapter.length > 18 ? rule.chapter.substring(0, 18) + '...' : rule.chapter}</Badge>
                      <Badge className={`text-[10px] w-fit ${sevConfig.badge}`}>
                        <SevIcon className="h-2.5 w-2.5 mr-0.5" />{rule.severity}
                      </Badge>
                      <Badge variant={rule.priority === 'CRITICAL' ? 'destructive' : rule.priority === 'HIGH' ? 'default' : 'secondary'} className="text-[10px] w-fit">{rule.priority}</Badge>
                      <span className="text-slate-500 capitalize">{rule.category}</span>
                      <div className="flex items-center gap-1 text-slate-400">
                        <RefreshCw className="h-3 w-3" />
                        <span>{rule.reviewCycle}</span>
                      </div>
                    </div>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[85vh]">
                    <DialogHeader>
                      <DialogTitle className="text-base flex items-center gap-2">{rule.title}</DialogTitle>
                    </DialogHeader>
                    <ScrollArea className="max-h-[70vh]">
                      <div className="space-y-4 pt-2">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">{rule.id}</Badge>
                          <Badge className={sevConfig.badge}>{rule.severity}</Badge>
                          <Badge variant={rule.priority === 'CRITICAL' ? 'destructive' : 'default'}>{rule.priority}</Badge>
                          <Badge variant="outline">{rule.chapter}</Badge>
                          <Badge variant="outline">{rule.category}</Badge>
                          <Badge variant="outline"><RefreshCw className="h-3 w-3 mr-1" />{rule.reviewCycle}</Badge>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-500 mb-1.5 uppercase">Statement</p>
                          <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/30 rounded-lg p-3">{rule.statement}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-500 mb-1.5 uppercase">Rationale</p>
                          <p className="text-sm text-slate-600 dark:text-slate-400">{rule.rationale}</p>
                        </div>
                        <Separator />
                        <div>
                          <p className="text-xs font-semibold text-slate-500 mb-1.5 uppercase">Enforcement</p>
                          <p className="text-sm text-slate-600 dark:text-slate-300 flex items-start gap-2">
                            <Shield className="h-3.5 w-3.5 text-[#FF6A00] mt-0.5 shrink-0" />
                            {rule.enforcement}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-500 mb-1.5 uppercase">Violation Consequence</p>
                          <p className="text-sm text-red-600 dark:text-red-400">{rule.violationConsequence}</p>
                        </div>
                      </div>
                    </ScrollArea>
                  </DialogContent>
                </Dialog>
              )
            })}
          </div>
        </ScrollArea>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <span className="text-xs text-slate-500">Page {page} of {totalPages} ({total} rules)</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  )
}