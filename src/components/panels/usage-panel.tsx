'use client'

import { useEffect, useState, useRef } from 'react'
import { BarChart3, CheckCircle, XCircle, Shield, Search, DollarSign, Clock, Zap, Filter } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts'

// ─── Types ───────────────────────────────────────────────────────────────────

interface UsageStats {
  total: number
  completed: number
  failed: number
  blocked: number
  totalTokens: number
}

interface UsageLog {
  id: string
  companyName?: string
  agentName?: string
  workflowName?: string
  status: string
  tokensOrLocalUsed: number
  paidApiUsed: boolean
  startedAt: string
  createdAt: string
}

interface DashboardData {
  byCompany: { companyId: string; companyName: string; _count: { id: number }; _sum: { tokensOrLocalUsed: number | null } }[]
  byAgent: { agentId: string; agentName: string; _count: { id: number }; _sum: { tokensOrLocalUsed: number | null } }[]
  byWorkflow: { workflowId: string; workflowName: string; _count: { id: number }; _sum: { tokensOrLocalUsed: number | null } }[]
  companySummaries: { companyId: string; period: string; totalRequests: number; totalTokensUsed: number; totalCostEstimate: number; paidApiUsed: number; blockedCount: number; calculatedAt: string }[]
  agentSummaries: { agentId: string; period: string; totalRuns: number; successCount: number; failureCount: number; avgRuntimeMs: number; totalTokensUsed: number; calculatedAt: string }[]
  workflowSummaries: { workflowId: string; period: string; totalRuns: number; successCount: number; failureCount: number; avgDurationMs: number; calculatedAt: string }[]
  totals: {
    totalLogs: number
    paidApiCount: number
    blockedCount: number
  }
}

const PIE_COLORS = ['#22D3EE', '#10B981', '#EF4444', '#F59E0B']

// ─── Component ───────────────────────────────────────────────────────────────

export default function UsagePanel() {
  const [stats, setStats] = useState<UsageStats | null>(null)
  const [logs, setLogs] = useState<UsageLog[]>([])
  const [companies, setCompanies] = useState<{ name: string; slug: string }[]>([])
  const [selectedCompany, setSelectedCompany] = useState('')
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
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

  // Fetch companies
  useEffect(() => {
    fetch('/api/companies')
      .then((r) => r.json())
      .then((res) => setCompanies(res.data || []))
      .catch(() => {})
  }, [])

  // Fetch usage data
  useEffect(() => {
    let cancelled = false
     
    setLoading(true)
    const params = selectedCompany ? `?company=${selectedCompany}` : ''
    Promise.all([
      fetch(`/api/usage${params}`).then((r) => r.json()),
      fetch('/api/dashboard/usage').then((r) => r.json()),
    ])
      .then(([usageRes, dashRes]) => {
        if (!cancelled) {
          setStats(usageRes.stats)
          setLogs(usageRes.logs || [])
          setDashboard(dashRes)
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [selectedCompany])

  // Client-side filtering
  const filteredLogs = logs.filter((log) => {
    const matchSearch = !search ||
      (log.companyName || '').toLowerCase().includes(search.toLowerCase()) ||
      (log.agentName || '').toLowerCase().includes(search.toLowerCase()) ||
      (log.workflowName || '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = !statusFilter || log.status === statusFilter
    return matchSearch && matchStatus
  })

  // Build daily usage trend from companySummaries
  const dailyTrend: Record<string, { requests: number; tokens: number }> = {}
  ;(dashboard?.companySummaries || []).forEach((s) => {
    const date = s.calculatedAt?.slice(0, 10) || 'unknown'
    if (!dailyTrend[date]) dailyTrend[date] = { requests: 0, tokens: 0 }
    dailyTrend[date].requests += s.totalRequests
    dailyTrend[date].tokens += s.totalTokensUsed
  })
  const trendData = Object.entries(dailyTrend)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-30)
    .map(([date, d]) => ({ date, requests: d.requests, tokens: d.tokens }))

  // Usage by company for bar chart
  const companyChartData = (dashboard?.byCompany || []).slice(0, 10).map((c) => ({
    name: c.companyName || c.companyId.slice(0, 8),
    requests: c._count.id,
    tokens: c._sum.tokensOrLocalUsed || 0,
  }))

  // Usage by agent for chart
  const agentChartData = (dashboard?.byAgent || []).slice(0, 10).map((a) => ({
    name: a.agentName || a.agentId.slice(0, 8),
    requests: a._count.id,
    tokens: a._sum.tokensOrLocalUsed || 0,
  }))

  // Status pie data
  const statusPie = stats ? [
    { name: 'Completed', value: stats.completed || 0 },
    { name: 'Failed', value: stats.failed || 0 },
    { name: 'Blocked', value: stats.blocked || 0 },
  ].filter((d) => d.value > 0) : []

  // Dashboard totals for extra stats
  const dashTotals = dashboard?.totals

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48 bg-[#F8FAFC]" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg bg-gray-50" />
          ))}
        </div>
      </div>
    )
  }

  const statCards = [
    { icon: BarChart3, label: 'Total Tokens', value: stats?.totalTokens?.toLocaleString() ?? '0', color: 'text-[#003ABC]', bgColor: 'bg-[#003ABC]/10' },
    { icon: CheckCircle, label: 'Completed', value: stats?.completed?.toLocaleString() ?? '0', color: 'text-emerald-600', bgColor: 'bg-emerald-600/10' },
    { icon: XCircle, label: 'Blocked', value: stats?.blocked?.toLocaleString() ?? '0', color: 'text-red-600', bgColor: 'bg-red-600/10' },
    { icon: Shield, label: 'Total Logs', value: stats?.total?.toLocaleString() ?? '0', color: 'text-[#FF6A00]', bgColor: 'bg-[#FF6A00]/10' },
    { icon: Zap, label: 'Paid API Calls', value: dashTotals?.paidApiCount?.toLocaleString() ?? '0', color: 'text-amber-600', bgColor: 'bg-amber-600/10' },
  ]

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-[#003ABC]" />
          <h2 className="text-xl font-semibold text-[#1E293B]">Usage Analytics</h2>
        </div>
        <Select value={selectedCompany || '__all__'} onValueChange={(v) => setSelectedCompany(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-[200px] bg-gray-50 border-[#E2E8F0] text-[#1E293B] text-xs">
            <SelectValue placeholder="All Companies" />
          </SelectTrigger>
          <SelectContent className="bg-white border-[#E2E8F0] max-h-64">
            <SelectItem value="__all__" className="text-[#1E293B]">All Companies</SelectItem>
            {companies.map((c) => (
              <SelectItem key={c.slug} value={c.slug} className="text-[#1E293B]">{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.label} className={`bg-white rounded-xl border border-[#E2E8F0] shadow-sm hover:shadow-md transition-shadow p-4 ${card.bgColor}`}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-[#64748B]" />
                <span className="text-xs text-[#64748B]">{card.label}</span>
              </div>
              <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
            </div>
          )
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Daily Trend */}
        <Card className="bg-white rounded-xl border border-[#E2E8F0] lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-[#1E293B]">Daily Usage Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(37,99,235,0.1)" />
                    <XAxis dataKey="date" tick={{ fill: '#94A3B8', fontSize: 10 }} />
                    <YAxis yAxisId="left" tick={{ fill: '#94A3B8', fontSize: 10 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: '#94A3B8', fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12 }} />
                    <Line yAxisId="left" type="monotone" dataKey="requests" stroke="#22D3EE" strokeWidth={2} dot={{ fill: '#22D3EE', r: 3 }} name="Requests" />
                    <Line yAxisId="right" type="monotone" dataKey="tokens" stroke="#10B981" strokeWidth={2} dot={{ fill: '#10B981', r: 3 }} name="Tokens" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-[#64748B] text-sm">No usage trend data</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Status Pie */}
        <Card className="bg-white rounded-xl border border-[#E2E8F0]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-[#1E293B]">Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              {statusPie.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {statusPie.map((_, i) => (
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

      {/* Search / Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
          <Input
            placeholder="Search by company, agent, or workflow..."
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
            <SelectItem value="completed" className="text-[#1E293B]">Completed</SelectItem>
            <SelectItem value="failed" className="text-[#1E293B]">Failed</SelectItem>
            <SelectItem value="blocked" className="text-[#1E293B]">Blocked</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-[#64748B]">
          {filteredLogs.length} of {logs.length} logs
        </span>
      </div>

      {/* Usage by Company Bar Chart */}
      {companyChartData.length > 0 && (
        <Card className="bg-white rounded-xl border border-[#E2E8F0]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-[#1E293B]">Usage by Company</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={companyChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(37,99,235,0.1)" />
                  <XAxis dataKey="name" tick={{ fill: '#94A3B8', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#94A3B8', fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="requests" fill="#22D3EE" name="Requests" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="tokens" fill="#10B981" name="Tokens" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Usage by Agent Chart */}
      {agentChartData.length > 0 && (
        <Card className="bg-white rounded-xl border border-[#E2E8F0]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-[#1E293B]">Usage by Agent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={agentChartData} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(37,99,235,0.1)" />
                  <XAxis type="number" tick={{ fill: '#94A3B8', fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#94A3B8', fontSize: 10 }} width={70} />
                  <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="requests" fill="#22D3EE" name="Requests" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        <div className="max-h-96 overflow-y-auto custom-scrollbar">
          <Table className="text-sm">
            <TableHeader>
              <TableRow className="bg-[#F8FAFC] hover:bg-[#F8FAFC] border-[#E2E8F0]">
                <TableHead className="text-[#64748B]">{selectedCompany ? 'Agent' : 'Company'}</TableHead>
                <TableHead className="text-[#64748B] hidden md:table-cell">Workflow</TableHead>
                <TableHead className="text-[#64748B]">Status</TableHead>
                <TableHead className="text-[#64748B] hidden sm:table-cell">Tokens</TableHead>
                <TableHead className="text-[#64748B]">Paid</TableHead>
                <TableHead className="text-[#64748B] hidden lg:table-cell">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-[#64748B] py-12">No usage logs found</TableCell>
                </TableRow>
              ) : (
                filteredLogs.map((log) => (
                  <TableRow key={log.id} className="border-[#E2E8F0] hover:bg-gray-50">
                    <TableCell className="text-[#1E293B]">{selectedCompany ? log.agentName : log.companyName}</TableCell>
                    <TableCell className="text-[#64748B] text-xs hidden md:table-cell max-w-[150px] truncate">{log.workflowName || '—'}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={`text-[10px] py-0 ${log.status === 'completed' ? 'bg-emerald-600/10 text-emerald-600' : log.status === 'blocked' ? 'bg-red-600/10 text-red-600' : 'bg-amber-600/10 text-amber-600'}`}
                      >
                        {log.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[#64748B] font-mono text-xs hidden sm:table-cell">{log.tokensOrLocalUsed.toLocaleString()}</TableCell>
                    <TableCell>
                      {log.paidApiUsed ? (
                        <DollarSign className="w-3.5 h-3.5 text-amber-600" />
                      ) : (
                        <span className="text-[10px] text-[#64748B]">local</span>
                      )}
                    </TableCell>
                    <TableCell className="text-[#64748B] text-xs hidden lg:table-cell">{new Date(log.startedAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}