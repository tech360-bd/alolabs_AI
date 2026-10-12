'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Bot,
  Search,
  Clock,
  CheckCircle2,
  Activity,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  Inbox,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ─── Types ───────────────────────────────────────────────────────────────────

interface AgentUsage {
  id: string
  agentId: string
  period: string
  totalRuns: number
  successCount: number
  failureCount: number
  avgRuntimeMs: number
  totalTokensUsed: number
  calculatedAt: string
}

interface UsageStats {
  totalRuns: number
  successRate: number
  avgTimeMs: number
  activeAgents: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AgentUsagePanel() {
  const [usageData, setUsageData] = useState<AgentUsage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [periodFilter, setPeriodFilter] = useState('')
  const [page, setPage] = useState(1)

  const limit = 10
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null)

  const fetchData = useCallback(async () => {
    let cancelled = false
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (periodFilter) params.set('period', periodFilter)

      const res = await fetch(`/api/usage/agents?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (!cancelled) {
        setUsageData(Array.isArray(json.data) ? json.data : [])
      }
    } catch (err) {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : 'Failed to load agent usage data')
        setUsageData([])
      }
    } finally {
      if (!cancelled) setLoading(false)
    }

    return () => { cancelled = true }
  }, [periodFilter])

  // Initial fetch
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Debounced search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [searchInput])

  // Compute stats from real data
  const stats: UsageStats | null = usageData.length > 0
    ? (() => {
        const totalRuns = usageData.reduce((sum, u) => sum + u.totalRuns, 0)
        const totalSuccess = usageData.reduce((sum, u) => sum + u.successCount, 0)
        const totalFailure = usageData.reduce((sum, u) => sum + u.failureCount, 0)
        const totalRuntime = usageData.reduce((sum, u) => sum + (u.avgRuntimeMs * u.totalRuns), 0)
        const successRate = totalRuns > 0 ? Math.round((totalSuccess / totalRuns) * 1000) / 10 : 0
        const avgTimeMs = totalRuns > 0 ? Math.round(totalRuntime / totalRuns) : 0
        return {
          totalRuns,
          successRate,
          avgTimeMs,
          activeAgents: usageData.length,
        }
      })()
    : null

  // Collect unique periods from data
  const periods = [...new Set(usageData.map((u) => u.period))].filter(Boolean)

  // Filter
  const filtered = usageData.filter((u) => {
    if (search && !u.agentId.toLowerCase().includes(search.toLowerCase())) return false
    if (periodFilter && u.period !== periodFilter) return false
    return true
  })

  const totalPages = Math.ceil(filtered.length / limit)
  const paginated = filtered.slice((page - 1) * limit, page * limit)

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[#1E293B]">Agent Usage Dashboard</h2>
          <p className="text-sm text-[#64748B] mt-1">Track agent execution metrics and performance trends</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="bg-gray-50 border-[#E2E8F0] text-[#1E293B] hover:bg-[#F8FAFC]"
          onClick={fetchData}
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300 flex-1">{error}</p>
          <Button variant="ghost" size="sm" onClick={() => setError(null)} className="text-red-300 hover:text-red-200">
            Dismiss
          </Button>
        </div>
      )}

      {/* Stats Cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl bg-gray-50" />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Runs', value: formatNumber(stats.totalRuns), icon: Zap, color: 'text-blue-500', bg: 'bg-blue-50', sub: 'All time' },
            { label: 'Success Rate', value: `${stats.successRate}%`, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50', sub: 'Across agents' },
            { label: 'Avg Time', value: stats.avgTimeMs > 0 ? `${(stats.avgTimeMs / 1000).toFixed(1)}s` : '—', icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50', sub: 'Per execution' },
            { label: 'Tracked Agents', value: stats.activeAgents, icon: Bot, color: 'text-violet-500', bg: 'bg-violet-50', sub: 'With usage data' },
          ].map((stat) => {
            const Icon = stat.icon
            return (
              <div key={stat.label} className={`${stat.bg} border border-gray-100 rounded-xl p-4 flex items-center gap-3 transition-all hover:shadow-sm`}>
                <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">{stat.label}</p>
                  <p className="text-xl font-bold text-gray-900">{stat.value}</p>
                  <p className="text-[10px] text-gray-400">{stat.sub}</p>
                </div>
              </div>
            )
          })}
        </div>
      ) : !loading && !error ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Inbox className="w-12 h-12 text-[#64748B] mb-3" />
          <p className="text-sm text-[#64748B] font-medium">No usage data yet</p>
          <p className="text-xs text-[#64748B] mt-1">Agent usage metrics will appear as agents run</p>
        </div>
      ) : null}

      {/* Filters */}
      {!loading && usageData.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
            <Input
              placeholder="Search agents..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9 bg-gray-50 border-[#E2E8F0] text-[#1E293B] placeholder:text-gray-400"
            />
          </div>
          <Select value={periodFilter || '__all__'} onValueChange={(v) => { setPeriodFilter(v === '__all__' ? '' : v); setPage(1) }}>
            <SelectTrigger className="w-[160px] bg-gray-50 border-[#E2E8F0] text-[#1E293B] text-xs">
              <SelectValue placeholder="All Periods" />
            </SelectTrigger>
            <SelectContent className="bg-white border-[#E2E8F0] max-h-64">
              <SelectItem value="__all__" className="text-[#1E293B]">All Periods</SelectItem>
              {periods.map((p) => (
                <SelectItem key={p} value={p} className="text-[#1E293B]">{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <Skeleton className="h-96 rounded-lg bg-gray-50" />
      ) : usageData.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] flex flex-col items-center justify-center py-20 text-center">
          <Bot className="w-12 h-12 text-[#64748B] mb-3" />
          <p className="text-sm text-[#64748B] font-medium">No data yet</p>
          <p className="text-xs text-[#64748B] mt-1">Agent usage metrics will populate as agents execute</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
          <div className="max-h-[480px] overflow-y-auto custom-scrollbar">
            <Table className="text-sm">
              <TableHeader>
                <TableRow className="bg-[#F8FAFC] hover:bg-[#F8FAFC] border-[#E2E8F0]">
                  <TableHead className="text-[#64748B]">Agent</TableHead>
                  <TableHead className="text-[#64748B] hidden md:table-cell">Period</TableHead>
                  <TableHead className="text-[#64748B]">Runs</TableHead>
                  <TableHead className="text-[#64748B]">Success %</TableHead>
                  <TableHead className="text-[#64748B] hidden sm:table-cell">Avg Time</TableHead>
                  <TableHead className="text-[#64748B] hidden lg:table-cell">Failures</TableHead>
                  <TableHead className="text-[#64748B] hidden sm:table-cell">Last Calculated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-[#64748B] py-12">
                      No usage data matches your filters
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((row) => {
                    const successRate = row.totalRuns > 0
                      ? Math.round((row.successCount / row.totalRuns) * 1000) / 10
                      : 0
                    return (
                      <TableRow key={row.id} className="border-[#E2E8F0] hover:bg-gray-50">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Bot className="w-4 h-4 text-[#64748B] flex-shrink-0" />
                            <span className="text-[#1E293B] font-medium">{row.agentId}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-[#64748B] hidden md:table-cell text-xs">
                          {row.period || '—'}
                        </TableCell>
                        <TableCell className="text-[#1E293B] font-mono text-xs">
                          {formatNumber(row.totalRuns)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-[80px]">
                            <Progress
                              value={successRate}
                              className="h-1.5 w-12 bg-slate-100 [&>div]:bg-emerald-500"
                            />
                            <span className={`text-xs font-semibold ${successRate >= 95 ? 'text-emerald-400' : successRate >= 90 ? 'text-amber-400' : 'text-red-400'}`}>
                              {successRate}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-[#64748B] text-xs hidden sm:table-cell">
                          {row.avgRuntimeMs > 0
                            ? row.avgRuntimeMs >= 60000
                              ? `${(row.avgRuntimeMs / 60000).toFixed(1)}m`
                              : `${(row.avgRuntimeMs / 1000).toFixed(1)}s`
                            : '—'}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <span className={`text-xs font-medium ${row.failureCount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                            {row.failureCount > 0 ? (
                              <span className="flex items-center gap-1">
                                <ArrowUpRight className="w-3 h-3" />
                                {row.failureCount}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <Activity className="w-3 h-3" />
                                0
                              </span>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-[#64748B] text-xs hidden sm:table-cell">
                          {timeAgo(row.calculatedAt)}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-[#64748B]">
            Page {page} of {totalPages} &middot; {filtered.length} agents
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}