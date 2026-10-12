'use client'

import React, { useState, useEffect } from 'react'
import { Wrench, Search, Star, TrendingUp } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { EnterpriseView } from '../enterprise-shell'

interface Skill {
  id: string
  name: string
  category: string
  type: string
  status: string
  usageCount: number
}

const skillCategories = ['All', 'Communication', 'Analysis', 'Coding', 'Writing', 'Research', 'Planning', 'Review', 'Optimization', 'Creative', 'Operations']
const skillTypes = ['All', 'Core', 'Specialized', 'Advanced', 'Expert', 'Foundation']
const skillStatuses = ['All', 'active', 'beta', 'deprecated']

const statusColors: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
  beta: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
  deprecated: 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400',
}

export default function SkillsRegistry() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [type, setType] = useState('All')
  const [status, setStatus] = useState('All')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const controller = new AbortController()
    async function fetchSkills() {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          page: String(page), limit: '50', search,
          category: category === 'All' ? '' : category,
          type: type === 'All' ? '' : type,
          status: status === 'All' ? '' : status,
        })
        const data = await fetchApi(`/api/enterprise/skills?${params}`, { signal: controller.signal })
        setSkills(data.skills || [])
        setTotal(data.total || 0)
      } catch { /* empty */ } finally { setLoading(false) }
    }
    fetchSkills()
    return () => controller.abort()
  }, [page, search, category, type, status])

  useEffect(() => { setPage(1) }, [search, category, type, status])

  const totalPages = Math.ceil(total / 50)

  if (loading && skills.length === 0) {
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
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Skills Registry</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{total.toLocaleString()} registered skills across the enterprise</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total Skills', value: total, icon: Wrench, color: 'text-[#003ABC]' },
          { label: 'Categories', value: skillCategories.length - 1, icon: Star, color: 'text-[#FF6A00]' },
          { label: 'Total Usage', value: skills.reduce((sum, s) => sum + s.usageCount, 0), icon: TrendingUp, color: 'text-emerald-600' },
          { label: 'Active', value: skills.filter(s => s.status === 'active').length, icon: Wrench, color: 'text-purple-600' },
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
          <Input placeholder="Search skills by name or ID..." className="pl-9 rounded-lg" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[140px] h-8 text-xs rounded-lg"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>{skillCategories.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-[120px] h-8 text-xs rounded-lg"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>{skillTypes.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[110px] h-8 text-xs rounded-lg"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>{skillStatuses.map(s => <SelectItem key={s} value={s} className="text-xs capitalize">{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {/* Skills Table */}
      <Card className="rounded-xl shadow-sm border-0 bg-white dark:bg-slate-800 overflow-hidden">
        <ScrollArea className="max-h-[500px]">
          <div className="min-w-[700px]">
            <div className="grid grid-cols-[100px_1fr_120px_100px_80px_100px] gap-2 px-4 py-3 bg-slate-50 dark:bg-slate-700/30 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <span>ID</span><span>Name</span><span>Category</span><span>Type</span><span>Status</span><span>Usage</span>
            </div>
            {skills.map(skill => (
              <div key={skill.id} className="grid grid-cols-[100px_1fr_120px_100px_80px_100px] gap-2 px-4 py-3 border-t border-slate-100 dark:border-slate-700/50 text-xs items-center hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                <span className="font-mono text-slate-400 text-[10px]">{skill.id.replace('SKILL-', '')}</span>
                <span className="truncate text-slate-700 dark:text-slate-200 font-medium">{skill.name}</span>
                <Badge variant="outline" className="text-[10px] w-fit">{skill.category}</Badge>
                <Badge variant="secondary" className="text-[10px] w-fit">{skill.type}</Badge>
                <Badge className={`text-[10px] w-fit capitalize ${statusColors[skill.status] || ''}`}>{skill.status}</Badge>
                <span className="text-slate-600 dark:text-slate-300 font-medium">{skill.usageCount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <span className="text-xs text-slate-500">Page {page} of {totalPages} ({total.toLocaleString()} skills)</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  )
}
