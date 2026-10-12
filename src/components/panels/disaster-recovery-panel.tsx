'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import {
  ShieldAlert,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HardDrive,
  RefreshCw,
  Zap,
  ChevronLeft,
  ChevronRight,
  Search,
  RotateCcw,
  Loader2,
  Save,
  Timer,
  ShieldCheck,
  Database,
  Wifi,
  WifiOff,
  Inbox,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
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

interface DRConfig {
  id: string
  rtoTargetMinutes: number
  rpoTargetMinutes: number
  failoverZone: string
  backupFrequency: string
  autoFailover: boolean
  createdAt: string
  updatedAt: string | null
}

interface RecoveryRun {
  id: string
  type: string
  status: string
  triggeredBy: string
  createdAt: string
  updatedAt: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const runStatusColor = (status: string) => {
  switch (status) {
    case 'success': case 'completed': return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    case 'failed': return 'bg-red-100 text-red-700 border-red-200'
    case 'running': return 'bg-amber-100 text-amber-700 border-amber-200'
    case 'cancelled': return 'bg-slate-100 text-slate-500 border-slate-200'
    case 'pending': return 'bg-blue-100 text-blue-700 border-blue-200'
    default: return 'bg-gray-100 text-gray-600 border-gray-200'
  }
}

const runStatusIcon = (status: string) => {
  switch (status) {
    case 'success': case 'completed': return CheckCircle2
    case 'failed': return XCircle
    case 'running': return Loader2
    case 'cancelled': return AlertTriangle
    default: return Clock
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

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

// ─── Component ───────────────────────────────────────────────────────────────

export default function DisasterRecoveryPanel() {
  const [config, setConfig] = useState<DRConfig | null>(null)
  const [recoveryRuns, setRecoveryRuns] = useState<RecoveryRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [failoverDialogOpen, setFailoverDialogOpen] = useState(false)
  const [failoverRunning, setFailoverRunning] = useState(false)

  const limit = 10
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null)

  const fetchData = useCallback(async () => {
    let cancelled = false
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/disaster-recovery')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (!cancelled) {
        setConfig(json.config || null)
        setRecoveryRuns(Array.isArray(json.recoveryRuns) ? json.recoveryRuns : [])
      }
    } catch (err) {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : 'Failed to load disaster recovery data')
        setConfig(null)
        setRecoveryRuns([])
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
  const successfulRuns = recoveryRuns.filter((r) => r.status === 'success' || r.status === 'completed').length
  const failedRuns = recoveryRuns.filter((r) => r.status === 'failed').length
  const lastTestDate = recoveryRuns.length > 0
    ? formatDate(recoveryRuns[0].createdAt)
    : 'Never'

  const statsCards = [
    {
      label: 'RTO Target',
      value: config ? `${config.rtoTargetMinutes} min` : '—',
      icon: Timer,
      color: 'text-blue-500',
      bg: 'bg-blue-50',
      sub: 'Recovery Time',
    },
    {
      label: 'RPO Target',
      value: config ? `${config.rpoTargetMinutes} min` : '—',
      icon: Save,
      color: 'text-amber-500',
      bg: 'bg-amber-50',
      sub: 'Data Loss Window',
    },
    {
      label: 'Last Test',
      value: lastTestDate,
      icon: ShieldCheck,
      color: 'text-emerald-500',
      bg: 'bg-emerald-50',
      sub: `of ${recoveryRuns.length} total runs`,
    },
    {
      label: 'Success / Failed',
      value: `${successfulRuns} / ${failedRuns}`,
      icon: Database,
      color: 'text-violet-500',
      bg: 'bg-violet-50',
      sub: 'Run outcomes',
    },
  ]

  // Filter
  const filtered = recoveryRuns.filter((r) => {
    if (search && !r.type.toLowerCase().includes(search.toLowerCase())) return false
    if (statusFilter && r.status !== statusFilter) return false
    return true
  })

  const totalPages = Math.ceil(filtered.length / limit)
  const paginated = filtered.slice((page - 1) * limit, page * limit)

  const handleFailoverTest = async () => {
    setFailoverRunning(true)
    try {
      const res = await fetch('/api/disaster-recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'Full Failover', triggeredBy: 'Manual Test' }),
      })
      if (res.ok) {
        await fetchData()
        setFailoverDialogOpen(false)
      } else {
        const err = await res.json().catch(() => ({}))
        setError(err.error || 'Failed to start failover test')
      }
    } catch {
      setError('Network error while starting failover test')
    } finally {
      setFailoverRunning(false)
    }
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[#1E293B]">Disaster Recovery</h2>
          <p className="text-sm text-[#64748B] mt-1">Configure and test disaster recovery procedures</p>
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
          <Dialog open={failoverDialogOpen} onOpenChange={setFailoverDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-red-600 text-white hover:bg-red-700">
                <ShieldAlert className="w-4 h-4 mr-2" />
                Failover Test
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white border-[#E2E8F0] text-[#1E293B]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                  Confirm Failover Test
                </DialogTitle>
              </DialogHeader>
              <div className="py-4 space-y-4">
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 space-y-2">
                  <p className="text-sm text-red-300 font-medium">Warning: This is a live test</p>
                  <p className="text-xs text-[#64748B]">
                    This will initiate a full failover test to the standby zone ({config?.failoverZone || 'standby'}).
                    The test will create a recovery run record.
                  </p>
                </div>
                {config && (
                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-[#64748B]">Target RTO</span>
                      <span className="text-[#1E293B] font-mono">{config.rtoTargetMinutes} min</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#64748B]">Target RPO</span>
                      <span className="text-[#1E293B] font-mono">{config.rpoTargetMinutes} min</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#64748B]">Failover Mode</span>
                      <span className="text-[#1E293B] capitalize">{config.autoFailover ? 'Automatic' : 'Manual'}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#64748B]">Failover Zone</span>
                      <span className="text-[#1E293B]">{config.failoverZone}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#64748B]">Backup Frequency</span>
                      <span className="text-[#1E293B] capitalize">{config.backupFrequency}</span>
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost" className="text-[#64748B] hover:text-[#1E293B]">Cancel</Button>
                </DialogClose>
                <Button
                  onClick={handleFailoverTest}
                  disabled={failoverRunning}
                  className="bg-red-600 text-white hover:bg-red-700"
                >
                  {failoverRunning ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <ShieldAlert className="w-4 h-4 mr-2" />
                  )}
                  {failoverRunning ? 'Initiating...' : 'Start Failover Test'}
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
      ) : config || recoveryRuns.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {statsCards.map((stat) => {
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
          <p className="text-sm text-[#64748B] font-medium">No data yet</p>
          <p className="text-xs text-[#64748B] mt-1">Disaster recovery configuration and run history will appear here</p>
        </div>
      ) : null}

      {/* DR Configuration Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl bg-gray-50" />
          ))}
        </div>
      ) : config ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* RTO/RPO Card */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Timer className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-[#1E293B]">Recovery Objectives</h3>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#64748B]">RTO</span>
                <span className="text-sm font-mono font-bold text-[#1E293B]">{config.rtoTargetMinutes} min</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#64748B]">RPO</span>
                <span className="text-sm font-mono font-bold text-[#1E293B]">{config.rpoTargetMinutes} min</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#64748B]">Backup Frequency</span>
                <Badge variant="outline" className="text-[10px] py-0 bg-gray-50 text-[#1E293B] border-[#E2E8F0] capitalize">
                  {config.backupFrequency}
                </Badge>
              </div>
            </div>
          </div>

          {/* Failover Status Card */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <RotateCcw className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-semibold text-[#1E293B]">Failover Status</h3>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#64748B]">Mode</span>
                <Badge variant="outline" className={`text-[10px] py-0 ${config.autoFailover ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                  {config.autoFailover ? <Wifi className="w-3 h-3 mr-1" /> : <WifiOff className="w-3 h-3 mr-1" />}
                  {config.autoFailover ? 'Automatic' : 'Manual'}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#64748B]">Failover Zone</span>
                <span className="text-sm font-mono text-[#64748B]">{config.failoverZone}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#64748B]">Total Runs</span>
                <span className="text-sm font-mono text-[#1E293B]">{recoveryRuns.length}</span>
              </div>
            </div>
          </div>

          {/* Run Summary Card */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <HardDrive className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-semibold text-[#1E293B]">Run Summary</h3>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#64748B]">Successful</span>
                <span className="text-sm font-mono text-emerald-400">{successfulRuns}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#64748B]">Failed</span>
                <span className="text-sm font-mono text-red-400">{failedRuns}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#64748B]">Config Created</span>
                <span className="text-sm text-[#64748B]">{timeAgo(config.createdAt)}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Recovery Run History */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#1E293B]">Recovery Run History</h3>
          {!loading && <span className="text-xs text-[#64748B]">{filtered.length} runs total</span>}
        </div>

        {/* Filters */}
        {!loading && recoveryRuns.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
              <Input
                placeholder="Search runs..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9 bg-gray-50 border-[#E2E8F0] text-[#1E293B] placeholder:text-gray-400"
              />
            </div>
            <Select value={statusFilter || '__all__'} onValueChange={(v) => { setStatusFilter(v === '__all__' ? '' : v); setPage(1) }}>
              <SelectTrigger className="w-[140px] bg-gray-50 border-[#E2E8F0] text-[#1E293B] text-xs">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent className="bg-white border-[#E2E8F0]">
                <SelectItem value="__all__" className="text-[#1E293B]">All Status</SelectItem>
                <SelectItem value="success" className="text-[#1E293B]">Success</SelectItem>
                <SelectItem value="completed" className="text-[#1E293B]">Completed</SelectItem>
                <SelectItem value="failed" className="text-[#1E293B]">Failed</SelectItem>
                <SelectItem value="running" className="text-[#1E293B]">Running</SelectItem>
                <SelectItem value="pending" className="text-[#1E293B]">Pending</SelectItem>
                <SelectItem value="cancelled" className="text-[#1E293B]">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <Skeleton className="h-64 rounded-lg bg-gray-50" />
        ) : recoveryRuns.length === 0 ? (
          <div className="bg-white rounded-xl border border-[#E2E8F0] flex flex-col items-center justify-center py-20 text-center">
            <ShieldAlert className="w-12 h-12 text-[#64748B] mb-3" />
            <p className="text-sm text-[#64748B] font-medium">No data yet</p>
            <p className="text-xs text-[#64748B] mt-1">Recovery runs from failover tests will appear here</p>
            <Button
              size="sm"
              className="mt-4 bg-red-600 text-white hover:bg-red-700"
              onClick={() => setFailoverDialogOpen(true)}
            >
              <ShieldAlert className="w-4 h-4 mr-2" />
              Run First Test
            </Button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
            <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow className="bg-[#F8FAFC] hover:bg-[#F8FAFC] border-[#E2E8F0]">
                    <TableHead className="text-[#64748B]">Type</TableHead>
                    <TableHead className="text-[#64748B]">Status</TableHead>
                    <TableHead className="text-[#64748B] hidden sm:table-cell">Triggered By</TableHead>
                    <TableHead className="text-[#64748B] hidden md:table-cell">Started</TableHead>
                    <TableHead className="text-[#64748B] hidden lg:table-cell">Started At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-[#64748B] py-12">
                        No recovery runs match your filters
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginated.map((run) => {
                      const StatusIcon = runStatusIcon(run.status)
                      const isAnimated = run.status === 'running'
                      return (
                        <TableRow key={run.id} className="border-[#E2E8F0] hover:bg-gray-50">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <RotateCcw className="w-4 h-4 text-[#64748B] flex-shrink-0" />
                              <span className="text-[#1E293B] font-medium">{run.type}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] py-0 ${runStatusColor(run.status)}`}>
                              <StatusIcon className={`w-3 h-3 mr-1 ${isAnimated ? 'animate-spin' : ''}`} />
                              {run.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-[#64748B] text-xs hidden sm:table-cell">
                            {run.triggeredBy || 'system'}
                          </TableCell>
                          <TableCell className="text-[#64748B] text-xs hidden md:table-cell">
                            {formatDate(run.createdAt)}
                          </TableCell>
                          <TableCell className="text-[#64748B] text-xs hidden lg:table-cell">
                            {formatTime(run.createdAt)}
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
              Page {page} of {totalPages}
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
    </div>
  )
}