'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import {
  ClipboardCheck,
  Search,
  CheckCircle2,
  Clock,
  Loader2,
  XCircle,
  Target,
  BarChart3,
  Play,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  RefreshCw,
  Star,
  ShieldCheck,
  Zap,
  AlertCircle,
  Inbox,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
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

interface Evaluation {
  id: string
  agentId: string
  level: string
  score: number
  criteria: string
  assessor: string
  createdAt: string
}

interface EvalStats {
  evaluations: number
  avgScore: number
  passRate: number
  passCount: number
  failCount: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getStatus(score: number): string {
  if (score >= 70) return 'passed'
  return 'failed'
}

const statusColor = (status: string) => {
  switch (status) {
    case 'passed': return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    case 'failed': return 'bg-red-100 text-red-700 border-red-200'
    default: return 'bg-gray-100 text-gray-600 border-gray-200'
  }
}

const statusIcon = (status: string) => {
  switch (status) {
    case 'passed': return CheckCircle2
    case 'failed': return XCircle
    default: return Clock
  }
}

function scoreColor(score: number): string {
  if (score >= 90) return 'text-emerald-500'
  if (score >= 70) return 'text-amber-500'
  return 'text-red-500'
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const CRITERIA_MAP: Record<string, string[]> = {
  Functional: ['Accuracy', 'Latency', 'Reliability', 'Consistency'],
  Safety: ['PII Detection', 'Toxicity', 'Hallucination', 'Bias'],
  Compliance: ['Regulation', 'Documentation', 'Audit Trail'],
  UX: ['Clarity', 'Tone', 'Engagement', 'Accessibility'],
  Quality: ['Creativity', 'Brand Voice', 'Grammar', 'Relevance'],
  Regression: ['Flow', 'Error Handling', 'Fallback', 'Context'],
  draft: ['Accuracy', 'Reliability'],
}

function getCriteriaForType(type: string): string[] {
  return CRITERIA_MAP[type] || ['Accuracy', 'Reliability']
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AgentEvaluationPanel() {
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [page, setPage] = useState(1)
  const [evalDialogOpen, setEvalDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [newEval, setNewEval] = useState({ agentId: '', type: 'Functional' })

  const limit = 10
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null)

  const fetchData = useCallback(async () => {
    let cancelled = false
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/evaluations')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (!cancelled) {
        setEvaluations(Array.isArray(json.data) ? json.data : [])
      }
    } catch (err) {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : 'Failed to load evaluations')
        setEvaluations([])
      }
    } finally {
      if (!cancelled) setLoading(false)
    }

    return () => { cancelled = true }
  }, [])

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
  const stats: EvalStats | null = evaluations.length > 0
    ? (() => {
        const total = evaluations.length
        const avgScore = evaluations.reduce((sum, e) => sum + (e.score || 0), 0) / total
        const passed = evaluations.filter((e) => e.score >= 70).length
        return {
          evaluations: total,
          avgScore: Math.round(avgScore * 10) / 10,
          passRate: Math.round((passed / total) * 1000) / 10,
          passCount: passed,
          failCount: total - passed,
        }
      })()
    : null

  // Collect unique types from data
  const types = [...new Set(evaluations.map((e) => e.level))].filter(Boolean)

  // Filter
  const filtered = evaluations.filter((ev) => {
    if (search && !ev.agentId.toLowerCase().includes(search.toLowerCase())) return false
    const evStatus = getStatus(ev.score)
    if (statusFilter && evStatus !== statusFilter) return false
    if (typeFilter && ev.level !== typeFilter) return false
    return true
  })

  const totalPages = Math.ceil(filtered.length / limit)
  const paginated = filtered.slice((page - 1) * limit, page * limit)

  const handleRunEvaluation = async () => {
    if (!newEval.agentId) return
    setSubmitting(true)
    try {
      const criteria = getCriteriaForType(newEval.type)
      const res = await fetch('/api/evaluations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: newEval.agentId,
          type: newEval.type,
          criteria,
        }),
      })
      if (res.ok) {
        await fetchData()
        setEvalDialogOpen(false)
        setNewEval({ agentId: '', type: 'Functional' })
      } else {
        const err = await res.json().catch(() => ({}))
        setError(err.error || 'Failed to create evaluation')
      }
    } catch {
      setError('Network error while creating evaluation')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[#1E293B]">Agent Evaluation Center</h2>
          <p className="text-sm text-[#64748B] mt-1">Run and review agent performance evaluations</p>
        </div>
        <div className="flex items-center gap-2">
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
          <Dialog open={evalDialogOpen} onOpenChange={setEvalDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-[#003ABC] text-white hover:bg-[#003ABC]/90">
                <Play className="w-4 h-4 mr-2" />
                Run Evaluation
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white border-[#E2E8F0] text-[#1E293B]">
              <DialogHeader>
                <DialogTitle>New Evaluation</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label className="text-[#64748B]">Agent ID</Label>
                  <Input
                    placeholder="e.g. agent-support-pro"
                    value={newEval.agentId}
                    onChange={(e) => setNewEval({ ...newEval, agentId: e.target.value })}
                    className="bg-gray-50 border-[#E2E8F0] text-[#1E293B] placeholder:text-gray-400"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[#64748B]">Evaluation Type</Label>
                  <Select value={newEval.type} onValueChange={(v) => setNewEval({ ...newEval, type: v })}>
                    <SelectTrigger className="bg-gray-50 border-[#E2E8F0] text-[#1E293B]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-[#E2E8F0]">
                      <SelectItem value="Functional" className="text-[#1E293B]">Functional</SelectItem>
                      <SelectItem value="Safety" className="text-[#1E293B]">Safety</SelectItem>
                      <SelectItem value="Compliance" className="text-[#1E293B]">Compliance</SelectItem>
                      <SelectItem value="UX" className="text-[#1E293B]">UX</SelectItem>
                      <SelectItem value="Quality" className="text-[#1E293B]">Quality</SelectItem>
                      <SelectItem value="Regression" className="text-[#1E293B]">Regression</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-[#64748B] mb-2">Criteria to evaluate:</p>
                  <div className="flex flex-wrap gap-2">
                    {getCriteriaForType(newEval.type).map((c) => (
                      <Badge key={c} variant="outline" className="text-[10px] bg-[#F8FAFC] text-[#1E293B] border-[#E2E8F0]">
                        <Star className="w-3 h-3 mr-1" />
                        {c}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost" className="text-[#64748B] hover:text-[#1E293B]">Cancel</Button>
                </DialogClose>
                <Button
                  onClick={handleRunEvaluation}
                  disabled={!newEval.agentId || submitting}
                  className="bg-[#003ABC] text-white hover:bg-[#003ABC]/90"
                >
                  {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ClipboardCheck className="w-4 h-4 mr-2" />}
                  Start Evaluation
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
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
            { label: 'Evaluations', value: stats.evaluations, icon: ClipboardCheck, color: 'text-blue-500', bg: 'bg-blue-50' },
            { label: 'Avg Score', value: `${stats.avgScore}%`, icon: Target, color: 'text-emerald-500', bg: 'bg-emerald-50' },
            { label: 'Pass Rate', value: `${stats.passRate}%`, icon: ShieldCheck, color: 'text-violet-500', bg: 'bg-violet-50' },
            { label: 'Passed', value: stats.passCount, icon: CheckCircle2, color: 'text-amber-500', bg: 'bg-amber-50' },
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
                </div>
              </div>
            )
          })}
        </div>
      ) : !loading && !error ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Inbox className="w-12 h-12 text-[#64748B] mb-3" />
          <p className="text-sm text-[#64748B] font-medium">No evaluations yet</p>
          <p className="text-xs text-[#64748B] mt-1">Run your first evaluation to see stats here</p>
        </div>
      ) : null}

      {/* Filters */}
      {!loading && evaluations.length > 0 && (
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
          <Select value={statusFilter || '__all__'} onValueChange={(v) => { setStatusFilter(v === '__all__' ? '' : v); setPage(1) }}>
            <SelectTrigger className="w-[150px] bg-gray-50 border-[#E2E8F0] text-[#1E293B] text-xs">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent className="bg-white border-[#E2E8F0]">
              <SelectItem value="__all__" className="text-[#1E293B]">All Status</SelectItem>
              <SelectItem value="passed" className="text-[#1E293B]">Passed</SelectItem>
              <SelectItem value="failed" className="text-[#1E293B]">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter || '__all__'} onValueChange={(v) => { setTypeFilter(v === '__all__' ? '' : v); setPage(1) }}>
            <SelectTrigger className="w-[150px] bg-gray-50 border-[#E2E8F0] text-[#1E293B] text-xs">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent className="bg-white border-[#E2E8F0]">
              <SelectItem value="__all__" className="text-[#1E293B]">All Types</SelectItem>
              {types.map((t) => (
                <SelectItem key={t} value={t} className="text-[#1E293B]">{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <Skeleton className="h-96 rounded-lg bg-gray-50" />
      ) : evaluations.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] flex flex-col items-center justify-center py-20 text-center">
          <BarChart3 className="w-12 h-12 text-[#64748B] mb-3" />
          <p className="text-sm text-[#64748B] font-medium">No data yet</p>
          <p className="text-xs text-[#64748B] mt-1">Evaluations you run will appear here</p>
          <Button
            size="sm"
            className="mt-4 bg-[#003ABC] text-white hover:bg-[#003ABC]/90"
            onClick={() => setEvalDialogOpen(true)}
          >
            <Play className="w-4 h-4 mr-2" />
            Run First Evaluation
          </Button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
          <div className="max-h-[480px] overflow-y-auto custom-scrollbar">
            <Table className="text-sm">
              <TableHeader>
                <TableRow className="bg-[#F8FAFC] hover:bg-[#F8FAFC] border-[#E2E8F0]">
                  <TableHead className="text-[#64748B]">Agent</TableHead>
                  <TableHead className="text-[#64748B] hidden md:table-cell">Type</TableHead>
                  <TableHead className="text-[#64748B]">Score</TableHead>
                  <TableHead className="text-[#64748B] hidden lg:table-cell">Assessor</TableHead>
                  <TableHead className="text-[#64748B]">Status</TableHead>
                  <TableHead className="text-[#64748B] hidden sm:table-cell">Date</TableHead>
                  <TableHead className="text-[#64748B] hidden lg:table-cell">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-[#64748B] py-12">
                      No evaluations match your filters
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((ev) => {
                    const status = getStatus(ev.score)
                    const StatusIcon = statusIcon(status)
                    return (
                      <TableRow key={ev.id} className="border-[#E2E8F0] hover:bg-gray-50">
                        <TableCell>
                          <div>
                            <p className="text-[#1E293B] font-medium">{ev.agentId}</p>
                            <p className="text-xs text-[#64748B] font-mono">id: {ev.id.slice(0, 8)}</p>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge variant="outline" className="text-[10px] py-0 bg-gray-50 text-[#64748B] border-[#E2E8F0]">
                            <Zap className="w-3 h-3 mr-1" />
                            {ev.level}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={ev.score} className="h-1.5 w-12 bg-slate-100 [&>div]:bg-emerald-500" />
                            <span className={`text-sm font-semibold ${scoreColor(ev.score)}`}>{ev.score}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-[#64748B] text-xs">
                          {ev.assessor || 'system'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] py-0 ${statusColor(status)}`}>
                            <StatusIcon className="w-3 h-3 mr-1" />
                            {status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[#64748B] text-xs hidden sm:table-cell">
                          {formatDate(ev.createdAt)}
                        </TableCell>
                        <TableCell className="text-[#64748B] text-xs hidden lg:table-cell">
                          {formatTime(ev.createdAt)}
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
            Page {page} of {totalPages} &middot; {filtered.length} evaluations
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