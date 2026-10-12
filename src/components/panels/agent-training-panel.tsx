'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import {
  GraduationCap,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Loader2,
  XCircle,
  BarChart3,
  Target,
  Trophy,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  RefreshCw,
  Play,
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

interface TrainingRecord {
  id: string
  agentId: string
  trainingType: string
  curriculumId: string | null
  status: string
  createdAt: string
  updatedAt: string | null
  agent?: { id: string; name: string; type: string } | null
}

interface TrainingStats {
  programs: number
  active: number
  completed: number
  failed: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const statusColor = (status: string) => {
  switch (status) {
    case 'active': case 'running': return 'bg-amber-100 text-amber-700 border-amber-200'
    case 'completed': return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    case 'failed': return 'bg-red-100 text-red-700 border-red-200'
    case 'pending': case 'queued': return 'bg-slate-100 text-slate-600 border-slate-200'
    case 'paused': return 'bg-orange-100 text-orange-700 border-orange-200'
    default: return 'bg-gray-100 text-gray-600 border-gray-200'
  }
}

const statusIcon = (status: string) => {
  switch (status) {
    case 'active': case 'running': return Loader2
    case 'completed': return CheckCircle2
    case 'failed': return XCircle
    case 'pending': case 'queued': return Clock
    case 'paused': return AlertCircle
    default: return Clock
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AgentTrainingPanel() {
  const [programs, setPrograms] = useState<TrainingRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [newProgram, setNewProgram] = useState({ agentId: '', type: 'Fine-tune' })

  const limit = 10
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null)

  const fetchData = useCallback(async () => {
    let cancelled = false
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (statusFilter && statusFilter !== '__all__') params.set('status', statusFilter)
      if (typeFilter && typeFilter !== '__all__') params.set('type', typeFilter)

      const res = await fetch(`/api/training?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (!cancelled) {
        setPrograms(Array.isArray(json.data) ? json.data : [])
      }
    } catch (err) {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : 'Failed to load training programs')
        setPrograms([])
      }
    } finally {
      if (!cancelled) setLoading(false)
    }

    return () => { cancelled = true }
  }, [statusFilter, typeFilter])

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
  const stats: TrainingStats | null = programs.length > 0
    ? (() => {
        const total = programs.length
        const completed = programs.filter((p) => p.status === 'completed').length
        const active = programs.filter((p) => p.status === 'active' || p.status === 'running').length
        const failed = programs.filter((p) => p.status === 'failed').length
        return { programs: total, active, completed, failed }
      })()
    : null

  // Collect unique types from data
  const types = [...new Set(programs.map((p) => p.trainingType))].filter(Boolean)

  // Filter programs
  const filtered = programs.filter((p) => {
    const name = p.agent?.name || p.agentId
    if (search && !name.toLowerCase().includes(search.toLowerCase())) return false
    if (statusFilter && statusFilter !== '__all__' && p.status !== statusFilter) return false
    if (typeFilter && typeFilter !== '__all__' && p.trainingType !== typeFilter) return false
    return true
  })

  const totalPages = Math.ceil(filtered.length / limit)
  const paginated = filtered.slice((page - 1) * limit, page * limit)

  const handleCreateTraining = async () => {
    if (!newProgram.agentId) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: newProgram.agentId,
          trainingType: newProgram.type,
        }),
      })
      if (res.ok) {
        await fetchData()
        setDialogOpen(false)
        setNewProgram({ agentId: '', type: 'Fine-tune' })
      } else {
        const err = await res.json().catch(() => ({}))
        setError(err.error || 'Failed to create training program')
      }
    } catch {
      setError('Network error while creating training program')
    } finally {
      setSubmitting(false)
    }
  }

  const getAgentName = (p: TrainingRecord): string => {
    return p.agent?.name || p.agentId
  }

  const getAgentType = (p: TrainingRecord): string => {
    return p.agent?.type || '—'
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[#1E293B]">Agent Training Center</h2>
          <p className="text-sm text-[#64748B] mt-1">Manage and monitor agent training programs</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="bg-gray-50 border-[#E2E8F0] text-[#1E293B] hover:bg-[#F8FAFC]"
            onClick={() => fetchData()}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-[#003ABC] text-white hover:bg-[#003ABC]/90">
                <Plus className="w-4 h-4 mr-2" />
                New Training
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white border-[#E2E8F0] text-[#1E293B]">
              <DialogHeader>
                <DialogTitle>Create Training Program</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label className="text-[#64748B]">Agent ID</Label>
                  <Input
                    placeholder="e.g. agent-support-pro"
                    value={newProgram.agentId}
                    onChange={(e) => setNewProgram({ ...newProgram, agentId: e.target.value })}
                    className="bg-gray-50 border-[#E2E8F0] text-[#1E293B] placeholder:text-gray-400"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[#64748B]">Training Type</Label>
                  <Select value={newProgram.type} onValueChange={(v) => setNewProgram({ ...newProgram, type: v })}>
                    <SelectTrigger className="bg-gray-50 border-[#E2E8F0] text-[#1E293B]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-[#E2E8F0]">
                      <SelectItem value="Fine-tune" className="text-[#1E293B]">Fine-tune</SelectItem>
                      <SelectItem value="Prompt Tuning" className="text-[#1E293B]">Prompt Tuning</SelectItem>
                      <SelectItem value="Alignment" className="text-[#1E293B]">Alignment</SelectItem>
                      <SelectItem value="RAG Injection" className="text-[#1E293B]">RAG Injection</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-[#64748B]">
                    The training program will be created with <span className="text-[#1E293B] font-medium">{newProgram.type}</span> type
                    and will start in <span className="text-amber-400 font-medium">pending</span> status.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost" className="text-[#64748B] hover:text-[#1E293B]">Cancel</Button>
                </DialogClose>
                <Button
                  onClick={handleCreateTraining}
                  disabled={!newProgram.agentId || submitting}
                  className="bg-[#003ABC] text-white hover:bg-[#003ABC]/90"
                >
                  {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Create Program
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
            { label: 'Programs', value: stats.programs, icon: BookOpen, color: 'text-blue-500', bg: 'bg-blue-50' },
            { label: 'Active', value: stats.active, icon: Play, color: 'text-amber-500', bg: 'bg-amber-50' },
            { label: 'Completed', value: stats.completed, icon: Trophy, color: 'text-emerald-500', bg: 'bg-emerald-50' },
            { label: 'Failed', value: stats.failed, icon: XCircle, color: 'text-red-500', bg: 'bg-red-50' },
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
          <p className="text-sm text-[#64748B] font-medium">No training programs yet</p>
          <p className="text-xs text-[#64748B] mt-1">Create your first training program to see stats here</p>
        </div>
      ) : null}

      {/* Filters */}
      {!loading && programs.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
            <Input
              placeholder="Search programs or agents..."
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
              <SelectItem value="active" className="text-[#1E293B]">Active</SelectItem>
              <SelectItem value="completed" className="text-[#1E293B]">Completed</SelectItem>
              <SelectItem value="failed" className="text-[#1E293B]">Failed</SelectItem>
              <SelectItem value="pending" className="text-[#1E293B]">Pending</SelectItem>
              <SelectItem value="paused" className="text-[#1E293B]">Paused</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter || '__all__'} onValueChange={(v) => { setTypeFilter(v === '__all__' ? '' : v); setPage(1) }}>
            <SelectTrigger className="w-[160px] bg-gray-50 border-[#E2E8F0] text-[#1E293B] text-xs">
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
      ) : programs.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] flex flex-col items-center justify-center py-20 text-center">
          <GraduationCap className="w-12 h-12 text-[#64748B] mb-3" />
          <p className="text-sm text-[#64748B] font-medium">No data yet</p>
          <p className="text-xs text-[#64748B] mt-1">Training programs you create will appear here</p>
          <Button
            size="sm"
            className="mt-4 bg-[#003ABC] text-white hover:bg-[#003ABC]/90"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            Create First Program
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
                  <TableHead className="text-[#64748B] hidden lg:table-cell">Agent Type</TableHead>
                  <TableHead className="text-[#64748B]">Status</TableHead>
                  <TableHead className="text-[#64748B] hidden md:table-cell">Curriculum</TableHead>
                  <TableHead className="text-[#64748B] hidden lg:table-cell">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-[#64748B] py-12">
                      No training programs match your filters
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((prog) => {
                    const StatusIcon = statusIcon(prog.status)
                    const isAnimated = prog.status === 'active' || prog.status === 'running'
                    return (
                      <TableRow key={prog.id} className="border-[#E2E8F0] hover:bg-gray-50">
                        <TableCell className="text-[#1E293B] font-medium max-w-[200px] truncate">
                          {getAgentName(prog)}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge variant="outline" className="text-[10px] py-0 bg-gray-50 text-[#64748B] border-[#E2E8F0]">
                            {prog.trainingType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[#64748B] hidden lg:table-cell text-xs">
                          {getAgentType(prog)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] py-0 ${statusColor(prog.status)}`}>
                            <StatusIcon className={`w-3 h-3 mr-1 ${isAnimated ? 'animate-spin' : ''}`} />
                            {prog.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-[#64748B] text-xs">
                          {prog.curriculumId ? (
                            <span className="font-mono">{prog.curriculumId.slice(0, 12)}</span>
                          ) : (
                            <span className="text-[#64748B]">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-[#64748B] text-xs hidden lg:table-cell">
                          {formatDate(prog.createdAt)}
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
            Page {page} of {totalPages} &middot; {filtered.length} programs
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