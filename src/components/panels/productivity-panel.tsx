'use client'

import { useEffect, useState, useRef } from 'react'
import { Gauge, Zap, Target, Shield, BarChart2, Clock, TrendingUp, Award, Search, Filter } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProductivityReportItem {
  id: string
  taskId: string | null
  speedScore: number
  qualityScore: number
  reuseScore: number
  errorScore: number
  finalProductivityScore: number
  recommendations: string
  createdAt: string
}

interface PerformanceScore {
  id: string
  agentId: string
  period: string
  successRate: number
  errorRate: number
  avgRuntimeMs: number
  outputQualityScore: number
  userCorrectionCount: number
  blockedActionCount: number
  approvalRequiredCount: number
  productivityScore: number
  calculatedAt: string
}

interface ReportData {
  summary: {
    totalReports: number
    averageScores: {
      speed: number
      quality: number
      reuse: number
      error: number
      overall: number
    }
    averagePerformance: {
      successRate: number
      errorRate: number
      avgRuntimeMs: number
      outputQuality: number
      productivityScore: number
      totalCorrections: number
      totalBlockedActions: number
      totalApprovalRequired: number
    }
  }
  productivityReports: ProductivityReportItem[]
  performanceScores: PerformanceScore[]
  topPerformers: PerformanceScore[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round((n || 0) * 100) / 100

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProductivityPanel() {
  const [report, setReport] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [scoreFilter, setScoreFilter] = useState('')

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
    fetch('/api/productivity/report')
      .then((r) => r.json())
      .then((res) => {
        if (!cancelled) setReport(res)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Client-side filtering for reports table
  const filteredReports = (report?.productivityReports || []).filter((r) => {
    const matchSearch = !search || (r.taskId || '').toLowerCase().includes(search.toLowerCase())
    const matchScore = !scoreFilter || (
      scoreFilter === 'high' ? r.finalProductivityScore >= 70 :
      scoreFilter === 'medium' ? r.finalProductivityScore >= 40 && r.finalProductivityScore < 70 :
      r.finalProductivityScore < 40
    )
    return matchSearch && matchScore
  })

  // Client-side filtering for top performers
  const filteredPerformers = (report?.topPerformers || []).filter((p) => {
    const matchSearch = !search || p.agentId.toLowerCase().includes(search.toLowerCase())
    return matchSearch
  })

  const avg = report?.summary?.averageScores
  const perf = report?.summary?.averagePerformance
  const overallScore = Math.round(avg?.overall || 0)

  const scores = [
    { icon: Zap, label: 'Speed Score', value: Math.round(avg?.speed || 0), desc: 'Task completion velocity', color: 'text-[#003ABC]', barColor: 'from-[#003ABC]/60 to-[#003ABC]' },
    { icon: Target, label: 'Quality Score', value: Math.round(avg?.quality || 0), desc: 'Output accuracy rating', color: 'text-emerald-600', barColor: 'from-emerald-600/60 to-emerald-600' },
    { icon: Gauge, label: 'Reuse Score', value: Math.round(avg?.reuse || 0), desc: 'Skill/knowledge reuse rate', color: 'text-[#FF6A00]', barColor: 'from-[#FF6A00]/60 to-[#FF6A00]' },
    { icon: Shield, label: 'Error Score', value: Math.round(avg?.error || 0), desc: 'Error-free completion rate', color: 'text-[#003ABC]', barColor: 'from-[#003ABC]/60 to-[#003ABC]' },
  ]

  // Radar chart data
  const radarData = [
    { metric: 'Speed', value: Math.round(avg?.speed || 0) },
    { metric: 'Quality', value: Math.round(avg?.quality || 0) },
    { metric: 'Reuse', value: Math.round(avg?.reuse || 0) },
    { metric: 'Error Free', value: Math.round(avg?.error || 0) },
    { metric: 'Success Rate', value: Math.round((perf?.successRate || 0) * 100) },
    { metric: 'Output Quality', value: Math.round((perf?.outputQuality || 0) * 100) },
  ]

  // Trend data from reports (group by date)
  const reportsByDate: Record<string, { sum: number; count: number }> = {}
  ;(report?.productivityReports || []).forEach((r) => {
    const date = r.createdAt?.slice(0, 10) || 'unknown'
    if (!reportsByDate[date]) reportsByDate[date] = { sum: 0, count: 0 }
    reportsByDate[date].sum += r.finalProductivityScore
    reportsByDate[date].count += 1
  })
  const trendData = Object.entries(reportsByDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-20)
    .map(([date, d]) => ({ date, score: round2(d.sum / d.count) }))

  // Performance stats
  const perfCards = [
    { icon: TrendingUp, label: 'Success Rate', value: `${round2((perf?.successRate || 0) * 100)}%`, color: 'text-emerald-600' },
    { icon: Clock, label: 'Avg Runtime', value: `${perf?.avgRuntimeMs || 0}ms`, color: 'text-[#FF6A00]' },
    { icon: BarChart2, label: 'Output Quality', value: `${round2((perf?.outputQuality || 0) * 100)}%`, color: 'text-[#003ABC]' },
    { icon: Award, label: 'Total Reports', value: report?.summary?.totalReports?.toLocaleString() || '0', color: 'text-[#003ABC]' },
  ]

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48 bg-[#F8FAFC]" />
        <div className="grid grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg bg-gray-50" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Gauge className="w-6 h-6 text-[#003ABC]" />
        <h2 className="text-xl font-semibold text-[#1E293B]">Productivity Center</h2>
      </div>

      {/* Overall score + performance cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 flex flex-col items-center justify-center">
          <p className="text-xs text-[#64748B] mb-1">Overall</p>
          <div className="w-20 h-20 rounded-full border-4 border-[#003ABC]/30 flex items-center justify-center mb-2">
            <span className="text-2xl font-bold text-[#003ABC]">{overallScore}</span>
          </div>
          <p className="text-[10px] text-[#64748B]">Productivity Score</p>
        </div>
        {perfCards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.label} className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm hover:shadow-md transition-shadow p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-[#64748B]" />
                <span className="text-xs text-[#64748B]">{card.label}</span>
              </div>
              <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
            </div>
          )
        })}
      </div>

      {/* Score bars */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {scores.map((score) => {
          const Icon = score.icon
          return (
            <div key={score.label} className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm hover:shadow-md transition-shadow p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-[#64748B]" />
                  <span className="text-xs text-[#64748B]">{score.label}</span>
                </div>
                <span className={`text-lg font-bold ${score.color}`}>{score.value}%</span>
              </div>
              <div className="h-2 bg-[#F8FAFC] rounded-full overflow-hidden">
                <div
                  className={`h-full bg-gradient-to-r ${score.barColor} rounded-full transition-all`}
                  style={{ width: `${score.value}%` }}
                />
              </div>
              <p className="text-[10px] text-[#64748B]">{score.desc}</p>
            </div>
          )
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Trend Chart */}
        <Card className="bg-white rounded-xl border border-[#E2E8F0]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-[#1E293B]">Productivity Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(37,99,235,0.1)" />
                    <XAxis dataKey="date" tick={{ fill: '#94A3B8', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#94A3B8', fontSize: 10 }} domain={[0, 100]} />
                    <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12 }} />
                    <Line type="monotone" dataKey="score" stroke="#22D3EE" strokeWidth={2} dot={{ fill: '#22D3EE', r: 3 }} name="Avg Score" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-[#64748B] text-sm">No trend data yet</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Radar Chart */}
        <Card className="bg-white rounded-xl border border-[#E2E8F0]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-[#1E293B]">Score Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="rgba(37,99,235,0.2)" />
                  <PolarAngleAxis dataKey="metric" tick={{ fill: '#94A3B8', fontSize: 10 }} />
                  <PolarRadiusAxis tick={{ fill: '#94A3B8', fontSize: 9 }} domain={[0, 100]} />
                  <Radar name="Score" dataKey="value" stroke="#22D3EE" fill="#22D3EE" fillOpacity={0.15} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search / Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
          <Input
            placeholder="Search by agent ID or task ID..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 bg-gray-50 border-[#E2E8F0] text-[#1E293B] placeholder:text-gray-400"
          />
        </div>
        <Select value={scoreFilter || '__all__'} onValueChange={(v) => setScoreFilter(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-[160px] bg-gray-50 border-[#E2E8F0] text-[#1E293B] text-xs">
            <Filter className="w-3.5 h-3.5 mr-1 text-[#64748B]" />
            <SelectValue placeholder="All Scores" />
          </SelectTrigger>
          <SelectContent className="bg-white border-[#E2E8F0]">
            <SelectItem value="__all__" className="text-[#1E293B]">All Scores</SelectItem>
            <SelectItem value="high" className="text-[#1E293B]">High (≥70)</SelectItem>
            <SelectItem value="medium" className="text-[#1E293B]">Medium (40-69)</SelectItem>
            <SelectItem value="low" className="text-[#1E293B]">Low (&lt;40)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Top Performers */}
      <Card className="bg-white rounded-xl border border-[#E2E8F0]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-[#1E293B]">Agent Productivity Rankings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-72 overflow-y-auto custom-scrollbar">
            <Table className="text-sm">
              <TableHeader>
                <TableRow className="bg-[#F8FAFC] hover:bg-[#F8FAFC] border-[#E2E8F0]">
                  <TableHead className="text-[#64748B] w-12">#</TableHead>
                  <TableHead className="text-[#64748B]">Agent ID</TableHead>
                  <TableHead className="text-[#64748B] hidden sm:table-cell">Period</TableHead>
                  <TableHead className="text-[#64748B]">Success Rate</TableHead>
                  <TableHead className="text-[#64748B] hidden md:table-cell">Avg Runtime</TableHead>
                  <TableHead className="text-[#64748B]">Productivity</TableHead>
                  <TableHead className="text-[#64748B] hidden lg:table-cell">Quality</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPerformers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-[#64748B] py-8">No performance data found</TableCell>
                  </TableRow>
                ) : (
                  filteredPerformers.map((p, i) => (
                    <TableRow key={p.id} className="border-[#E2E8F0] hover:bg-gray-50">
                      <TableCell className="text-[#64748B] font-bold">{i + 1}</TableCell>
                      <TableCell className="font-mono text-xs text-[#FF6A00]">{p.agentId.slice(0, 12)}</TableCell>
                      <TableCell className="text-[#64748B] text-xs hidden sm:table-cell capitalize">{p.period}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px] py-0 bg-emerald-600/10 text-emerald-600">
                          {round2(p.successRate * 100)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[#64748B] text-xs hidden md:table-cell">{p.avgRuntimeMs}ms</TableCell>
                      <TableCell>
                        <span className="text-sm font-bold text-[#003ABC]">{round2(p.productivityScore * 100)}%</span>
                      </TableCell>
                      <TableCell className="text-[#64748B] text-xs hidden lg:table-cell">{round2(p.outputQualityScore * 100)}%</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Recent Reports */}
      <Card className="bg-white rounded-xl border border-[#E2E8F0]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-[#1E293B]">Recent Productivity Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-72 overflow-y-auto custom-scrollbar">
            <Table className="text-sm">
              <TableHeader>
                <TableRow className="bg-[#F8FAFC] hover:bg-[#F8FAFC] border-[#E2E8F0]">
                  <TableHead className="text-[#64748B]">Task</TableHead>
                  <TableHead className="text-[#64748B]">Speed</TableHead>
                  <TableHead className="text-[#64748B] hidden sm:table-cell">Quality</TableHead>
                  <TableHead className="text-[#64748B] hidden md:table-cell">Reuse</TableHead>
                  <TableHead className="text-[#64748B] hidden md:table-cell">Error</TableHead>
                  <TableHead className="text-[#64748B]">Final</TableHead>
                  <TableHead className="text-[#64748B] hidden lg:table-cell">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReports.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-[#64748B] py-8">No reports found</TableCell>
                  </TableRow>
                ) : (
                  filteredReports.slice(0, 50).map((r) => (
                    <TableRow key={r.id} className="border-[#E2E8F0] hover:bg-gray-50">
                      <TableCell className="font-mono text-[10px] text-[#FF6A00]">{r.taskId ? r.taskId.slice(0, 8) : '—'}</TableCell>
                      <TableCell className="text-xs text-[#1E293B]">{round2(r.speedScore)}</TableCell>
                      <TableCell className="text-xs text-[#1E293B] hidden sm:table-cell">{round2(r.qualityScore)}</TableCell>
                      <TableCell className="text-xs text-[#1E293B] hidden md:table-cell">{round2(r.reuseScore)}</TableCell>
                      <TableCell className="text-xs text-[#1E293B] hidden md:table-cell">{round2(r.errorScore)}</TableCell>
                      <TableCell>
                        <span className={`text-sm font-bold ${r.finalProductivityScore >= 70 ? 'text-emerald-600' : r.finalProductivityScore >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                          {round2(r.finalProductivityScore)}
                        </span>
                      </TableCell>
                      <TableCell className="text-[#64748B] text-xs hidden lg:table-cell">{new Date(r.createdAt).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}