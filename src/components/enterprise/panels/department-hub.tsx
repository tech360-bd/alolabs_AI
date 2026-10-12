'use client'

import React, { useState, useEffect } from 'react'
import { fetchApi } from '@/lib/api'
import { Building2, Search, Users, Bot, ChevronDown, ChevronUp, Filter, Target, Briefcase, ArrowUpRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import type { EnterpriseView } from '../enterprise-shell'

interface Division {
  id: string
  name: string
  mission: string
  vpAgent: string
  departmentCount: number
  kpis: string[]
}

interface Department {
  id: string
  name: string
  code: string
  division: string
  divisionName: string
  type: string
  mission: string
  objectives: string[]
  capabilities: string[]
  reportingTo: string
}

interface Agent {
  id: string
  name: string
  department: string
  role: string
  type: string
  status: string
}

const typeOptions = ['All', 'Core', 'Support', 'Innovation', 'Compliance']

const typeColors: Record<string, string> = {
  Core: 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
  Support: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
  Innovation: 'bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400',
  Compliance: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
}

export default function DepartmentHub() {
  const [divisions, setDivisions] = useState<Division[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [type, setType] = useState('All')
  const [divisionFilter, setDivisionFilter] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 20

  useEffect(() => {
    const controller = new AbortController()
    async function fetchData() {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          page: String(page), limit: String(pageSize), search,
          type: type === 'All' ? '' : type,
          division: divisionFilter,
        })
        const [deptsResult, agentsResult] = await Promise.allSettled([
          fetchApi(`/api/enterprise/departments?${params}`, { signal: controller.signal }),
          fetchApi('/api/enterprise/agents?limit=200', { signal: controller.signal }),
        ])
        if (deptsResult.status === 'fulfilled') {
          const data = deptsResult.value
          setDepartments(data.departments || [])
          setDivisions(data.divisions || [])
          setTotal(data.total || 0)
        }
        if (agentsResult.status === 'fulfilled') {
          const data = agentsResult.value
          setAgents(data.agents || [])
        }
      } catch { /* empty */ } finally { setLoading(false) }
    }
    fetchData()
    return () => controller.abort()
  }, [page, search, type, divisionFilter])

  useEffect(() => { setPage(1) }, [search, type, divisionFilter])

  const totalPages = Math.ceil(total / pageSize)

  // Build agents-per-department map for quick lookup
  const deptAgentsMap = React.useMemo(() => {
    const map: Record<string, Agent[]> = {}
    for (const a of agents) {
      const deptName = a.department
      if (!map[deptName]) map[deptName] = []
      if (map[deptName].length < 5) map[deptName].push(a)
    }
    return map
  }, [agents])

  if (loading && departments.length === 0) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Department Hub</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">100 departments across 12 enterprise divisions</p>
      </div>

      {/* Division Overview Cards */}
      {divisions.length > 0 && (
        <ScrollArea className="w-full">
          <div className="flex gap-3 pb-2">
            {divisions.map(div => (
              <Card
                key={div.id}
                className={`shrink-0 w-56 rounded-xl shadow-sm border-0 bg-white dark:bg-slate-800 cursor-pointer transition-all hover:shadow-md ${divisionFilter === div.id ? 'ring-2 ring-[#FF6A00]' : ''}`}
                onClick={() => setDivisionFilter(divisionFilter === div.id ? '' : div.id)}
              >
                <CardContent className="p-3">
                  <p className="text-xs font-bold text-[#003ABC] dark:text-blue-400 truncate">{div.name.replace(' Division', '')}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{div.departmentCount} depts &middot; {div.vpAgent}</p>
                  <p className="text-[10px] text-slate-500 mt-1.5 line-clamp-2">{div.kpis[0]}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Divisions', value: divisions.length, icon: Building2, color: 'text-[#003ABC]' },
          { label: 'Departments', value: total, icon: Target, color: 'text-purple-600' },
          { label: 'Core', value: departments.filter(d => d.type === 'Core').length, icon: Briefcase, color: 'text-blue-600' },
          { label: 'AI Agents', value: agents.length, icon: Bot, color: 'text-[#FF6A00]' },
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
          <Input placeholder="Search departments by name, code, or mission..." className="pl-9 rounded-lg" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2 flex-wrap">
          {typeOptions.map(t => (
            <Button key={t} variant={type === t ? 'default' : 'outline'} size="sm" className="rounded-lg text-xs" onClick={() => setType(t)}>
              {t}
            </Button>
          ))}
          {divisionFilter && (
            <Button variant="outline" size="sm" className="rounded-lg text-xs text-[#FF6A00]" onClick={() => setDivisionFilter('')}>
              Clear Division Filter
            </Button>
          )}
        </div>
      </div>

      {/* Department Cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {departments.map(dept => {
          const isExpanded = expanded === dept.id
          const deptAgents = deptAgentsMap[dept.name] || []
          const typeColor = typeColors[dept.type] || 'bg-slate-100 text-slate-700'

          return (
            <Card key={dept.id} className="rounded-xl shadow-sm border-0 bg-white dark:bg-slate-800 overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-slate-400">{dept.code}</span>
                      <Badge className={`text-[10px] ${typeColor}`}>{dept.type}</Badge>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">{dept.name}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{dept.divisionName}</p>
                  </div>
                  <Button
                    variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0"
                    onClick={() => setExpanded(isExpanded ? null : dept.id)}
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 line-clamp-2">{dept.mission}</p>

                {isExpanded && (
                  <div className="mt-3 space-y-3">
                    <Separator />
                    <div>
                      <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1.5">Strategic Objectives</p>
                      <ul className="space-y-1">
                        {dept.objectives.slice(0, 3).map((obj, i) => (
                          <li key={i} className="text-xs text-slate-600 dark:text-slate-300 flex items-start gap-1.5">
                            <ArrowUpRight className="h-3 w-3 text-[#FF6A00] mt-0.5 shrink-0" />
                            <span className="line-clamp-1">{obj}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1.5">Key Capabilities</p>
                      <div className="flex flex-wrap gap-1">
                        {dept.capabilities.slice(0, 5).map((cap, i) => (
                          <Badge key={i} variant="outline" className="text-[10px]">{cap.length > 40 ? cap.substring(0, 40) + '...' : cap}</Badge>
                        ))}
                      </div>
                    </div>
                    {deptAgents.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1.5">AI Agents</p>
                        <div className="space-y-1">
                          {deptAgents.map((a, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                              <Bot className="h-3 w-3 text-[#FF6A00]" />
                              <span className="truncate">{a.name}</span>
                              <Badge variant="secondary" className="text-[10px] ml-auto shrink-0">{a.role}</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <span className="text-xs text-slate-500">Page {page} of {totalPages} ({total} departments)</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  )
}
