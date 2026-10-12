'use client'

import React, { useState, useEffect } from 'react'
import { FileCode, Search, Star, TrendingUp, Sparkles } from 'lucide-react'
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

interface Prompt {
  id: string
  title: string
  category: string
  department: string
  outputFormat: string
  usageCount: number
  rating: number
  description: string
}

const promptCategories = ['All', 'Analysis', 'Generation', 'Coding', 'Writing', 'Research', 'Planning', 'Review', 'Optimization', 'Communication', 'Creative']
const promptDepts = ['All', 'Engineering', 'Product', 'Sales', 'Marketing', 'HR', 'Finance', 'Legal', 'Operations', 'Security']

export default function PromptLibrary() {
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [department, setDepartment] = useState('All')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const controller = new AbortController()
    async function fetchPrompts() {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          page: String(page), limit: '100', search,
          category: category === 'All' ? '' : category,
          department: department === 'All' ? '' : department,
        })
        const data = await fetchApi(`/api/enterprise/prompts?${params}`, { signal: controller.signal })
        setPrompts(data.prompts || [])
        setTotal(data.total || 0)
      } catch { /* empty */ } finally { setLoading(false) }
    }
    fetchPrompts()
    return () => controller.abort()
  }, [page, search, category, department])

  useEffect(() => { setPage(1) }, [search, category, department])

  const totalPages = Math.ceil(total / 100)

  function renderStars(rating: number) {
    const full = Math.floor(rating)
    const half = rating % 1 >= 0.5
    const stars: React.ReactNode[] = []
    for (let i = 0; i < 5; i++) {
      if (i < full) {
        stars.push(<Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />)
      } else if (i === full && half) {
        stars.push(<Star key={i} className="h-3 w-3 fill-amber-400/50 text-amber-400" />)
      } else {
        stars.push(<Star key={i} className="h-3 w-3 text-slate-300 dark:text-slate-600" />)
      }
    }
    return <div className="flex items-center gap-0.5">{stars}</div>
  }

  if (loading && prompts.length === 0) {
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
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Prompt Template Library</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{total.toLocaleString()} engineered prompt templates for enterprise AI</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total Templates', value: total, icon: FileCode, color: 'text-[#003ABC]' },
          { label: 'Categories', value: promptCategories.length - 1, icon: Sparkles, color: 'text-[#FF6A00]' },
          { label: 'Avg Rating', value: prompts.length > 0 ? (prompts.reduce((sum, p) => sum + p.rating, 0) / prompts.length).toFixed(1) : '0', icon: Star, color: 'text-amber-600' },
          { label: 'Total Usage', value: prompts.reduce((sum, p) => sum + p.usageCount, 0), icon: TrendingUp, color: 'text-emerald-600' },
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

      {/* Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search templates by title or description..." className="pl-9 rounded-lg" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          {promptCategories.map(c => (
            <Button key={c} variant={category === c ? 'default' : 'outline'} size="sm" className="rounded-lg text-xs" onClick={() => setCategory(c)}>{c}</Button>
          ))}
        </div>
        <Select value={department} onValueChange={setDepartment}>
          <SelectTrigger className="w-[160px] h-8 text-xs rounded-lg"><SelectValue placeholder="Department" /></SelectTrigger>
          <SelectContent>{promptDepts.map(d => <SelectItem key={d} value={d} className="text-xs">{d}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {prompts.map(prompt => (
          <Card key={prompt.id} className="rounded-xl shadow-sm hover:shadow-md transition-all border-0 bg-white dark:bg-slate-800 cursor-pointer">
            <CardContent className="p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-2 leading-snug">{prompt.title}</p>
                <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">{prompt.description}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" className="text-[10px]">{prompt.category}</Badge>
                <Badge variant="secondary" className="text-[10px]">{prompt.outputFormat}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {renderStars(prompt.rating)}
                  <span className="text-[10px] text-slate-400 ml-1">{prompt.rating}</span>
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{prompt.usageCount.toLocaleString()} uses</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <span className="text-xs text-slate-500">Page {page} of {totalPages} ({total.toLocaleString()} templates)</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  )
}
