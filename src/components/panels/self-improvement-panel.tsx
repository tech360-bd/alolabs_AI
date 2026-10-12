'use client'

import { useEffect, useState, useRef } from 'react'
import { TrendingUp, FileText, Lightbulb, CheckCircle2, Clock, XCircle, Search, ChevronRight, Filter } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

// ─── Types ───────────────────────────────────────────────────────────────────

interface LearningReport {
  id: string
  taskId: string | null
  agentId: string | null
  whatWorked: string
  whatFailed: string
  corrections: string
  pattern: string | null
  suggestion: string | null
  createdAt: string
}

interface AutomationSuggestion {
  id: string
  title: string
  description: string | null
  departmentId: string | null
  frequency: string | null
  status: string
  createdAt: string
  updatedAt: string
}

interface WorkflowImprovement {
  id: string
  workflowId: string | null
  title: string
  description: string | null
  status: string
  createdAt: string
}

interface ReportData {
  summary: {
    learningReports: number
    automationSuggestions: number
    workflowImprovements: number
  }
  suggestionStats: {
    approved: number
    implemented: number
    rejected: number
    suggested: number
  }
  improvementStats: {
    approved: number
    rejected: number
    pending: number
  }
  recentLearningReports: LearningReport[]
  recentSuggestions: AutomationSuggestion[]
  recentImprovements: WorkflowImprovement[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const statusColor = (status: string) => {
  switch (status) {
    case 'approved': case 'implemented': case 'applied': return 'bg-emerald-600/10 text-emerald-600'
    case 'rejected': return 'bg-red-600/10 text-red-600'
    case 'suggested': case 'pending': return 'bg-amber-600/10 text-amber-600'
    default: return 'bg-gray-100 text-[#64748B]'
  }
}

const PIE_COLORS = ['#22D3EE', '#10B981', '#F59E0B', '#EF4444']

// ─── Component ───────────────────────────────────────────────────────────────

export default function SelfImprovementPanel() {
  const [report, setReport] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // Debounced search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null)
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setSearch(searchInput)
    }, 300)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [searchInput])

  useEffect(() => {
    let cancelled = false
     
    setLoading(true)
    fetch('/api/self-improvement/report')
      .then((r) => r.json())
      .then((res) => {
        if (!cancelled) setReport(res)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Client-side filtering
  const filteredSuggestions = (report?.recentSuggestions || []).filter((s) => {
    const matchSearch = !search || s.title.toLowerCase().includes(search.toLowerCase()) || (s.description || '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = !statusFilter || s.status === statusFilter
    return matchSearch && matchStatus
  })

  const filteredReports = (report?.recentLearningReports || []).filter((r) => {
    const matchSearch = !search || (r.pattern || '').toLowerCase().includes(search.toLowerCase()) || (r.suggestion || '').toLowerCase().includes(search.toLowerCase())
    return matchSearch
  })

  const filteredImprovements = (report?.recentImprovements || []).filter((wi) => {
    const matchSearch = !search || wi.title.toLowerCase().includes(search.toLowerCase())
    const matchStatus = !statusFilter || wi.status === statusFilter
    return matchSearch && matchStatus
  })

  const s = report?.summary
  const sug = report?.suggestionStats
  const imp = report?.improvementStats

  // Build suggestion pie data
  const sugPie = sug ? [
    { name: 'Implemented', value: sug.implemented },
    { name: 'Approved', value: sug.approved },
    { name: 'Suggested', value: sug.suggested },
    { name: 'Rejected', value: sug.rejected },
  ].filter((d) => d.value > 0) : []

  // Build improvement pie data
  const impPie = imp ? [
    { name: 'Approved', value: imp.approved },
    { name: 'Pending', value: imp.pending },
    { name: 'Rejected', value: imp.rejected },
  ].filter((d) => d.value > 0) : []

  // Build trend data from recent reports (group by date)
  const reportsByDate: Record<string, number> = {}
  ;(report?.recentLearningReports || []).forEach((r) => {
    const date = r.createdAt?.slice(0, 10) || 'unknown'
    reportsByDate[date] = (reportsByDate[date] || 0) + 1
  })
  const trendData = Object.entries(reportsByDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }))

  const statCards = [
    { icon: FileText, label: 'Learning Reports', value: s?.learningReports ?? 0, desc: 'Task analysis reports', color: 'text-[#FF6A00]', bgColor: 'bg-[#FF6A00]/10' },
    { icon: Lightbulb, label: 'Suggestions', value: s?.automationSuggestions ?? 0, desc: 'Automation ideas', color: 'text-amber-600', bgColor: 'bg-amber-600/10' },
    { icon: TrendingUp, label: 'Improvements', value: s?.workflowImprovements ?? 0, desc: 'Workflow enhancements', color: 'text-[#003ABC]', bgColor: 'bg-[#003ABC]/10' },
  ]

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48 bg-[#F8FAFC]" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg bg-gray-50" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <TrendingUp className="w-6 h-6 text-[#003ABC]" />
        <h2 className="text-xl font-semibold text-[#1E293B]">Self-Improvement Center</h2>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.label} className={`bg-white rounded-xl border border-[#E2E8F0] shadow-sm hover:shadow-md transition-shadow p-5 ${card.bgColor}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center">
                  <Icon className={`w-5 h-5 ${card.color}`} />
                </div>
                <h3 className="text-sm font-semibold text-[#1E293B]">{card.label}</h3>
              </div>
              <p className="text-3xl font-bold text-[#003ABC] mb-1">{card.value.toLocaleString()}</p>
              <p className="text-xs text-[#64748B]">{card.desc}</p>
            </div>
          )
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Trend */}
        <Card className="bg-white rounded-xl border border-[#E2E8F0] lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-[#1E293B]">Improvement Trends</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(37,99,235,0.1)" />
                    <XAxis dataKey="date" tick={{ fill: '#94A3B8', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#94A3B8', fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12 }} />
                    <Line type="monotone" dataKey="count" stroke="#22D3EE" strokeWidth={2} dot={{ fill: '#22D3EE', r: 3 }} name="Reports" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-[#64748B] text-sm">No trend data yet</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Suggestion Status Pie */}
        <Card className="bg-white rounded-xl border border-[#E2E8F0]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-[#1E293B]">Suggestion Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              {sugPie.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={sugPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {sugPie.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-[#64748B] text-sm">No data</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Suggestion Status Breakdown */}
      {sug && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
          <h3 className="text-sm font-semibold text-[#1E293B] mb-3">Suggestion Breakdown</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Implemented', value: sug.implemented, color: 'text-emerald-600', icon: CheckCircle2 },
              { label: 'Approved', value: sug.approved, color: 'text-[#FF6A00]', icon: CheckCircle2 },
              { label: 'Suggested', value: sug.suggested, color: 'text-amber-600', icon: Clock },
              { label: 'Rejected', value: sug.rejected, color: 'text-red-600', icon: XCircle },
            ].map((item) => {
              const Icon = item.icon
              return (
                <div key={item.label} className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${item.color}`} />
                  <span className="text-xs text-[#64748B]">{item.label}:</span>
                  <span className={`text-sm font-bold ${item.color}`}>{item.value}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Search / Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
          <Input
            placeholder="Search reports, suggestions..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 bg-gray-50 border-[#E2E8F0] text-[#1E293B] placeholder:text-gray-400"
          />
        </div>
        <Select value={statusFilter || '__all__'} onValueChange={(v) => setStatusFilter(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-[150px] bg-gray-50 border-[#E2E8F0] text-[#1E293B] text-xs">
            <Filter className="w-3.5 h-3.5 mr-1 text-[#64748B]" />
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent className="bg-white border-[#E2E8F0]">
            <SelectItem value="__all__" className="text-[#1E293B]">All Status</SelectItem>
            <SelectItem value="suggested" className="text-[#1E293B]">Suggested</SelectItem>
            <SelectItem value="approved" className="text-[#1E293B]">Approved</SelectItem>
            <SelectItem value="implemented" className="text-[#1E293B]">Implemented</SelectItem>
            <SelectItem value="rejected" className="text-[#1E293B]">Rejected</SelectItem>
            <SelectItem value="pending" className="text-[#1E293B]">Pending</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Recent Suggestions Table */}
      <Card className="bg-white rounded-xl border border-[#E2E8F0]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-[#1E293B]">Recent Suggestions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-72 overflow-y-auto custom-scrollbar">
            <Table className="text-sm">
              <TableHeader>
                <TableRow className="bg-[#F8FAFC] hover:bg-[#F8FAFC] border-[#E2E8F0]">
                  <TableHead className="text-[#64748B]">Title</TableHead>
                  <TableHead className="text-[#64748B] hidden sm:table-cell">Frequency</TableHead>
                  <TableHead className="text-[#64748B]">Status</TableHead>
                  <TableHead className="text-[#64748B] hidden md:table-cell">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSuggestions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-[#64748B] py-8">No suggestions found</TableCell>
                  </TableRow>
                ) : (
                  filteredSuggestions.map((s) => (
                    <TableRow key={s.id} className="border-[#E2E8F0] hover:bg-gray-50">
                      <TableCell className="text-[#1E293B]">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{s.title}</span>
                          {s.description && (
                            <span className="text-[10px] text-[#64748B] truncate max-w-[200px] hidden lg:inline">— {s.description}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-[#64748B] text-xs hidden sm:table-cell">{s.frequency || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`text-[10px] py-0 ${statusColor(s.status)}`}>{s.status}</Badge>
                      </TableCell>
                      <TableCell className="text-[#64748B] text-xs hidden md:table-cell">{new Date(s.createdAt).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Recent Learning Reports */}
      <Card className="bg-white rounded-xl border border-[#E2E8F0]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-[#1E293B]">Recent Learning Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-72 overflow-y-auto custom-scrollbar">
            <Table className="text-sm">
              <TableHeader>
                <TableRow className="bg-[#F8FAFC] hover:bg-[#F8FAFC] border-[#E2E8F0]">
                  <TableHead className="text-[#64748B]">Pattern</TableHead>
                  <TableHead className="text-[#64748B]">Suggestion</TableHead>
                  <TableHead className="text-[#64748B] hidden sm:table-cell">Task</TableHead>
                  <TableHead className="text-[#64748B] hidden md:table-cell">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReports.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-[#64748B] py-8">No learning reports found</TableCell>
                  </TableRow>
                ) : (
                  filteredReports.map((r) => (
                    <TableRow key={r.id} className="border-[#E2E8F0] hover:bg-gray-50">
                      <TableCell className="text-[#1E293B] text-xs max-w-[200px] truncate">{r.pattern || '—'}</TableCell>
                      <TableCell className="text-[#1E293B] text-xs max-w-[200px] truncate">{r.suggestion || '—'}</TableCell>
                      <TableCell className="text-[#64748B] font-mono text-[10px] hidden sm:table-cell">{r.taskId ? r.taskId.slice(0, 8) : '—'}</TableCell>
                      <TableCell className="text-[#64748B] text-xs hidden md:table-cell">{new Date(r.createdAt).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Workflow Improvements */}
      <Card className="bg-white rounded-xl border border-[#E2E8F0]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-[#1E293B]">Workflow Improvements</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {imp && [
              { label: 'Approved', value: imp.approved, color: 'text-emerald-600' },
              { label: 'Pending', value: imp.pending, color: 'text-amber-600' },
              { label: 'Rejected', value: imp.rejected, color: 'text-red-600' },
            ].map((item) => (
              <div key={item.label} className="text-center p-3 bg-white rounded-xl border border-[#E2E8F0]">
                <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
                <p className="text-[10px] text-[#64748B]">{item.label}</p>
              </div>
            ))}
          </div>
          <div className="max-h-48 overflow-y-auto custom-scrollbar">
            {filteredImprovements.length === 0 ? (
              <p className="text-center text-[#64748B] text-sm py-6">No improvement requests found</p>
            ) : (
              filteredImprovements.map((wi) => (
                <div key={wi.id} className="flex items-center gap-3 py-2 border-b border-[#E2E8F0] last:border-0">
                  <ChevronRight className="w-3 h-3 text-[#64748B] flex-shrink-0" />
                  <span className="text-sm text-[#1E293B] flex-1 truncate">{wi.title}</span>
                  <Badge variant="secondary" className={`text-[10px] py-0 ${statusColor(wi.status)}`}>{wi.status}</Badge>
                  <span className="text-[10px] text-[#64748B]">{new Date(wi.createdAt).toLocaleDateString()}</span>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}