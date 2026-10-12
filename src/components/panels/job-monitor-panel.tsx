'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  XCircle,
  XIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'

// ─── Types ───────────────────────────────────────────────────────────────────

type JobStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'pending'
type JobType = 'Agent' | 'Workflow'

interface JobTimelineEntry {
  label: string
  timestamp: string
  status: 'success' | 'error' | 'info'
}

interface Job {
  id: string
  companyId: string
  companyName: string
  type: JobType
  target: string
  status: JobStatus
  duration: string | null
  createdAt: string
  input: Record<string, unknown>
  output: Record<string, unknown> | null
  timeline?: JobTimelineEntry[]
}

type FilterTab = 'all' | JobStatus

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  JobStatus,
  { color: string; bg: string; icon: React.ReactNode; pulse?: boolean }
> = {
  running: {
    color: 'text-cyan-700',
    bg: 'bg-cyan-50 border-cyan-200',
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
    pulse: true,
  },
  completed: {
    color: 'text-green-700',
    bg: 'bg-green-50 border-green-200',
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  failed: {
    color: 'text-red-700',
    bg: 'bg-red-50 border-red-200',
    icon: <XCircle className="w-3 h-3" />,
  },
  cancelled: {
    color: 'text-gray-500',
    bg: 'bg-gray-50 border-gray-200',
    icon: <Ban className="w-3 h-3" />,
  },
  pending: {
    color: 'text-amber-700',
    bg: 'bg-amber-50 border-amber-200',
    icon: <Clock className="w-3 h-3" />,
  },
}

const FILTER_TABS: { label: string; value: FilterTab }[] = [
  { label: 'All', value: 'all' },
  { label: 'Running', value: 'running' },
  { label: 'Completed', value: 'completed' },
  { label: 'Failed', value: 'failed' },
  { label: 'Cancelled', value: 'cancelled' },
]

// ─── Component ───────────────────────────────────────────────────────────────

export default function JobMonitorPanel() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs')
      const json = await res.json()
      if (json.data && Array.isArray(json.data)) {
        setJobs(json.data)
      } else {
        setJobs([])
      }
    } catch {
      setJobs([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  // Poll every 10 seconds when there are running jobs
  useEffect(() => {
    const hasRunning = jobs.some((j) => j.status === 'running')
    if (!hasRunning) return

    const interval = setInterval(() => {
      fetchJobs()
    }, 10_000)

    return () => clearInterval(interval)
  }, [jobs, fetchJobs])

  const filteredJobs =
    activeFilter === 'all'
      ? jobs
      : jobs.filter((j) => j.status === activeFilter)

  const stats = {
    total: jobs.length,
    running: jobs.filter((j) => j.status === 'running').length,
    completed: jobs.filter((j) => j.status === 'completed').length,
    failed: jobs.filter((j) => j.status === 'failed').length,
    avgDuration: computeAvgDuration(jobs),
  }

  const openJobDetail = (job: Job) => {
    setSelectedJob(job)
    setDialogOpen(true)
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="space-y-1">
          <Skeleton className="h-7 w-40 bg-slate-200" />
          <Skeleton className="h-4 w-80 bg-slate-100" />
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-md bg-slate-100" />
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl bg-slate-100" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl bg-slate-100" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xl font-semibold text-[#1E293B]">Job Monitor</h2>
        <p className="text-sm text-[#64748B] mt-0.5">
          Track agent and workflow execution in real-time
        </p>
      </div>

      {/* ── Filter Tabs ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {FILTER_TABS.map((tab) => {
          const isActive = activeFilter === tab.value
          const count =
            tab.value === 'all'
              ? jobs.length
              : jobs.filter((j) => j.status === tab.value).length
          return (
            <button
              key={tab.value}
              onClick={() => setActiveFilter(tab.value)}
              className={`
                inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${
                  isActive
                    ? 'bg-[#003ABC] text-white shadow-sm'
                    : 'bg-white text-[#64748B] border border-[#E2E8F0] hover:bg-slate-50 hover:text-[#1E293B]'
                }
              `}
            >
              {tab.label}
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 text-[#94A3B8]'
                }`}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── Stats Bar ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {[
          {
            label: 'Total Jobs',
            value: stats.total,
            icon: <Activity className="w-4 h-4" />,
            color: 'text-[#003ABC]',
            bg: 'bg-blue-50',
          },
          {
            label: 'Running',
            value: stats.running,
            icon: <Loader2 className="w-4 h-4 animate-spin" />,
            color: 'text-cyan-600',
            bg: 'bg-cyan-50',
          },
          {
            label: 'Completed',
            value: stats.completed,
            icon: <CheckCircle2 className="w-4 h-4" />,
            color: 'text-green-600',
            bg: 'bg-green-50',
          },
          {
            label: 'Failed',
            value: stats.failed,
            icon: <XCircle className="w-4 h-4" />,
            color: 'text-red-600',
            bg: 'bg-red-50',
          },
          {
            label: 'Avg Duration',
            value: stats.avgDuration,
            icon: <Clock className="w-4 h-4" />,
            color: 'text-[#FF6A00]',
            bg: 'bg-orange-50',
          },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-white rounded-xl border border-[#E2E8F0] p-4 flex flex-col items-center justify-center text-center"
          >
            <div className={`${s.bg} p-2 rounded-lg mb-2 ${s.color}`}>
              {s.icon}
            </div>
            <p className="text-2xl font-bold text-[#1E293B]">{s.value}</p>
            <p className="text-xs text-[#64748B] mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Job List Table ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        <div className="max-h-96 overflow-y-auto custom-scrollbar">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b border-[#E2E8F0]">
                <TableHead className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">
                  ID
                </TableHead>
                <TableHead className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">
                  Company
                </TableHead>
                <TableHead className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">
                  Type
                </TableHead>
                <TableHead className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">
                  Target
                </TableHead>
                <TableHead className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">
                  Status
                </TableHead>
                <TableHead className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">
                  Duration
                </TableHead>
                <TableHead className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">
                  Created
                </TableHead>
                <TableHead className="text-xs font-semibold text-[#64748B] uppercase tracking-wider text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredJobs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center py-12 text-[#94A3B8]"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Activity className="w-8 h-8 text-[#94A3B8]" />
                      <p className="text-sm">No jobs match the current filter</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredJobs.map((job) => {
                  const statusCfg = STATUS_CONFIG[job.status]
                  return (
                    <TableRow
                      key={job.id}
                      className="border-b border-[#E2E8F0] last:border-0 hover:bg-slate-50/50 cursor-pointer transition-colors"
                      onClick={() => openJobDetail(job)}
                    >
                      <TableCell className="text-xs text-[#64748B] font-mono max-w-[120px] truncate">
                        {job.id.slice(0, 12)}…
                      </TableCell>
                      <TableCell className="text-sm font-medium text-[#1E293B]">
                        {job.companyName}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-semibold ${
                            job.type === 'Agent'
                              ? 'border-purple-200 bg-purple-50 text-purple-700'
                              : 'border-blue-200 bg-blue-50 text-blue-700'
                          }`}
                        >
                          {job.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-[#1E293B]">
                        {job.target}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`gap-1 text-[10px] font-semibold border ${statusCfg.bg} ${statusCfg.color} ${statusCfg.pulse ? 'animate-pulse' : ''}`}
                        >
                          {statusCfg.icon}
                          {job.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-[#64748B] font-mono">
                        {job.duration ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs text-[#64748B]">
                        {formatDate(job.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-[#64748B] hover:text-[#003ABC]"
                          onClick={(e) => {
                            e.stopPropagation()
                            openJobDetail(job)
                          }}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ── Job Detail Dialog ───────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-[#1E293B] flex items-center gap-2">
              Job Detail
              {selectedJob && (
                <Badge
                  variant="outline"
                  className={`gap-1 text-[10px] font-semibold border ${STATUS_CONFIG[selectedJob.status].bg} ${STATUS_CONFIG[selectedJob.status].color}`}
                >
                  {STATUS_CONFIG[selectedJob.status].icon}
                  {selectedJob.status}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedJob && (
            <div className="space-y-5 mt-2">
              {/* Meta info */}
              <div className="grid grid-cols-2 gap-3">
                <InfoPill label="ID" value={selectedJob.id} mono />
                <InfoPill label="Company" value={selectedJob.companyName} />
                <InfoPill label="Type" value={selectedJob.type} />
                <InfoPill label="Target" value={selectedJob.target} />
                <InfoPill label="Duration" value={selectedJob.duration ?? 'N/A'} mono />
                <InfoPill label="Created" value={formatDate(selectedJob.createdAt)} />
              </div>

              {/* Input */}
              <div>
                <h4 className="text-sm font-semibold text-[#1E293B] mb-2 flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5 text-[#003ABC]" />
                  Input
                </h4>
                <pre className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3 text-xs text-[#1E293B] font-mono overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(selectedJob.input, null, 2)}
                </pre>
              </div>

              {/* Output */}
              <div>
                <h4 className="text-sm font-semibold text-[#1E293B] mb-2 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                  Output
                </h4>
                {selectedJob.output ? (
                  <pre className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3 text-xs text-[#1E293B] font-mono overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(selectedJob.output, null, 2)}
                  </pre>
                ) : (
                  <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-4 text-center">
                    <Clock className="w-5 h-5 text-[#94A3B8] mx-auto mb-1" />
                    <p className="text-xs text-[#94A3B8]">
                      No output yet — job {selectedJob.status === 'running' ? 'still running' : 'did not produce output'}
                    </p>
                  </div>
                )}
              </div>

              {/* Timeline */}
              {selectedJob.timeline && selectedJob.timeline.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-[#1E293B] mb-3 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-[#FF6A00]" />
                    Execution Timeline
                  </h4>
                  <div className="relative pl-6 space-y-0">
                    {/* Vertical line */}
                    <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[#E2E8F0]" />
                    {selectedJob.timeline.map((entry, idx) => (
                      <div key={idx} className="relative flex items-start gap-3 pb-3 last:pb-0">
                        <div
                          className={`absolute -left-6 top-1 w-3.5 h-3.5 rounded-full border-2 border-white z-10 ${
                            entry.status === 'success'
                              ? 'bg-green-500'
                              : entry.status === 'error'
                                ? 'bg-red-500'
                                : 'bg-[#003ABC]'
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-[#1E293B]">{entry.label}</p>
                          <p className="text-xs text-[#94A3B8]">{entry.timestamp}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t border-[#E2E8F0]">
                {selectedJob.status === 'running' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => {
                      setDialogOpen(false)
                      setSelectedJob(null)
                    }}
                  >
                    <Ban className="w-3.5 h-3.5" />
                    Cancel Job
                  </Button>
                )}
                {(selectedJob.status === 'failed' || selectedJob.status === 'cancelled') && (
                  <Button
                    size="sm"
                    className="gap-1.5 bg-[#003ABC] hover:bg-[#002D9E] text-white"
                    onClick={() => {
                      setDialogOpen(false)
                      setSelectedJob(null)
                    }}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Retry Job
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-[#64748B] ml-auto"
                  onClick={() => setDialogOpen(false)}
                >
                  <XIcon className="w-3.5 h-3.5" />
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function InfoPill({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="bg-[#F8FAFC] rounded-lg p-2.5 border border-[#E2E8F0]">
      <p className="text-[10px] uppercase tracking-wider text-[#94A3B8] font-semibold mb-0.5">
        {label}
      </p>
      <p
        className={`text-sm text-[#1E293B] font-medium truncate ${mono ? 'font-mono text-xs' : ''}`}
        title={value}
      >
        {value}
      </p>
    </div>
  )
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  } catch {
    return iso
  }
}

function computeAvgDuration(jobs: Job[]): string {
  const withDuration = jobs.filter(
    (j) => j.duration && j.duration !== '00:00:00'
  )
  if (withDuration.length === 0) return '—'
  const totalSeconds = withDuration.reduce((acc, j) => {
    const parts = j.duration!.split(':')
    return acc + parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2])
  }, 0)
  const avg = Math.round(totalSeconds / withDuration.length)
  const m = Math.floor(avg / 60)
  const s = avg % 60
  return `${m}m ${s}s`
}