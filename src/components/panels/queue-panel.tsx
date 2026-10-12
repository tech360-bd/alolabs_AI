'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import {
  Layers,
  Play,
  Plus,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Ban,
  RefreshCw,
  Clock,
  Loader2,
  AlertTriangle,
  ListTodo,
  Zap,
  Wifi,
  WifiOff,
  RotateCcw,
  Activity,
  BarChart3,
  Pause,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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

interface QueueItem {
  id: string
  queueId: string
  jobType: string
  priority: number
  status: string
  attempts: number
  maxAttempts: number
  payload: string
  error?: string | null
  startedAt?: string | null
  completedAt?: string | null
  createdAt: string
}

interface Queue {
  id: string
  name: string
  description?: string | null
  status: string
  concurrency: number
  maxRetries: number
  totalItems: number
  pendingItems: number
  processingItems: number
  completedItems: number
  failedItems: number
  createdAt: string
  updatedAt: string
}

interface QueueStats {
  queues: number
  queued: number
  processing: number
  completed: number
  failed: number
  cancelled: number
  total: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const statusColor = (status: string) => {
  switch (status) {
    case 'active': return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    case 'paused': return 'bg-amber-100 text-amber-700 border-amber-200'
    case 'draining': return 'bg-orange-100 text-orange-700 border-orange-200'
    default: return 'bg-gray-100 text-gray-600 border-gray-200'
  }
}

const itemStatusColor = (status: string) => {
  switch (status) {
    case 'queued': return 'bg-slate-100 text-slate-600 border-slate-200'
    case 'processing': return 'bg-amber-100 text-amber-700 border-amber-200'
    case 'completed': return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    case 'failed': return 'bg-red-100 text-red-700 border-red-200'
    case 'cancelled': return 'bg-gray-100 text-gray-500 border-gray-200'
    default: return 'bg-gray-100 text-gray-600 border-gray-200'
  }
}

const itemStatusIcon = (status: string) => {
  switch (status) {
    case 'queued': return Clock
    case 'processing': return Loader2
    case 'completed': return CheckCircle2
    case 'failed': return XCircle
    case 'cancelled': return Ban
    default: return Clock
  }
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// ─── Processing Animation Component ──────────────────────────────────────────

function ProcessingAnimation({ item }: { item: QueueItem }) {
  const [progress, setProgress] = useState(0)
  const elapsed = item.startedAt ? Date.now() - new Date(item.startedAt).getTime() : 0

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) return prev // Never reach 100% until complete
        return prev + Math.random() * 8
      })
    }, 500)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex items-center gap-2">
      <div className="w-16">
        <Progress value={Math.min(progress, 95)} className="h-1.5 bg-slate-100 [&>div]:bg-amber-500" />
      </div>
      <Loader2 className="w-3 h-3 text-amber-500 animate-spin" />
    </div>
  )
}

// ─── Stats Card Component ────────────────────────────────────────────────────

function StatsCard({ stats }: { stats: QueueStats | null }) {
  if (!stats) return null

  const statItems = [
    { label: 'Queued', value: stats.queued, icon: Clock, color: 'text-slate-600', bg: 'bg-slate-50' },
    { label: 'Processing', value: stats.processing, icon: Activity, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Completed', value: stats.completed, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Failed', value: stats.failed, icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {statItems.map((stat) => {
        const Icon = stat.icon
        return (
          <div
            key={stat.label}
            className={`${stat.bg} border border-gray-100 rounded-xl p-3 flex items-center gap-3 transition-all hover:shadow-sm`}
          >
            <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center`}>
              <Icon className={`w-4 h-4 ${stat.color}`} />
            </div>
            <div>
              <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-[10px] text-gray-500 font-medium">{stat.label}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function QueuePanel() {
  const [queues, setQueues] = useState<Queue[]>([])
  const [stats, setStats] = useState<QueueStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedQueueId, setExpandedQueueId] = useState<string | null>(null)
  const [enqueueDialogOpen, setEnqueueDialogOpen] = useState(false)
  const [enqueueQueueId, setEnqueueQueueId] = useState('')
  const [enqueueForm, setEnqueueForm] = useState({ jobType: '', priority: '5', payload: '{}' })
  const [socketConnected, setSocketConnected] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null)
  const [queueItemsMap, setQueueItemsMap] = useState<Record<string, QueueItem[]>>({})

  const socketRef = useRef<Socket | null>(null)
  const queueIdToNameRef = useRef<Record<string, string>>({})

  // Build name→id and id→name maps
  useEffect(() => {
    const nameToId: Record<string, string> = {}
    const idToName: Record<string, string> = {}
    for (const q of queues) {
      nameToId[q.name] = q.id
      idToName[q.id] = q.name
    }
    queueIdToNameRef.current = idToName
  }, [queues])

  // ─── Socket.IO Connection ──────────────────────────────────────────────
  useEffect(() => {
    const socketInstance = io('/?XTransformPort=3004', {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 10000,
    })

    socketRef.current = socketInstance

    socketInstance.on('connect', () => {
      setSocketConnected(true)
    })

    socketInstance.on('disconnect', () => {
      setSocketConnected(false)
    })

    // Receive full queue status
    socketInstance.on('queue:status', (data: { queues: Queue[] }) => {
      setQueues(data.queues)
      setLoading(false)
    })

    // Receive aggregate stats
    socketInstance.on('queue:stats', (data: QueueStats) => {
      setStats(data)
    })

    // Receive items for a specific queue (after subscribing)
    socketInstance.on('queue:items', (data: { queueId: string; items: QueueItem[] }) => {
      setQueueItemsMap((prev) => ({ ...prev, [data.queueId]: data.items }))
    })

    // Receive queue update (after enqueue/complete/etc)
    socketInstance.on('queue:update', (data: { queue: Queue; items: QueueItem[] }) => {
      setQueues((prev) => {
        const exists = prev.find((q) => q.id === data.queue.id)
        if (exists) {
          return prev.map((q) => (q.id === data.queue.id ? data.queue : q))
        }
        return [...prev, data.queue]
      })
      setQueueItemsMap((prev) => ({ ...prev, [data.queue.id]: data.items }))
    })

    // Real-time job events
    socketInstance.on('job:queued', () => {
      // Queue update event will handle the data refresh
    })

    socketInstance.on('job:assigned', (data: { item: QueueItem; queue: string }) => {
      // A job started processing - could show a toast
    })

    socketInstance.on('job:completed', (data: { item: QueueItem }) => {
      // Job completed - UI refreshes via queue:update event
    })

    socketInstance.on('job:cancelled', (data: { item: QueueItem }) => {
      // Job cancelled - UI refreshes via queue:update event
    })

    socketInstance.on('job:error', (data: { event: string; error: string }) => {
      // Job error - UI refreshes via queue:update event
    })

    return () => {
      socketInstance.disconnect()
    }
  }, [])

  // ─── Load queues from REST API as fallback ─────────────────────────────
  const loadQueues = useCallback(() => {
    fetch('/api/queues')
      .then((r) => r.json())
      .then((res) => {
        const apiQueues = Array.isArray(res) ? res : res.data || res.queues || []
        // Map API response to our Queue interface
        const mapped = (apiQueues as Array<Record<string, unknown>>).map((q) => ({
          id: String(q.id ?? ''),
          name: String(q.name ?? ''),
          description: q.description != null ? String(q.description) : null,
          status: q.isActive ? 'active' : 'paused',
          concurrency: Number(q.concurrency ?? 1),
          maxRetries: Number(q.maxRetries || 3),
          totalItems: Number(q.totalItems || 0),
          pendingItems: Number((q.counts as Record<string, number> | undefined)?.queued || q.pendingItems || 0),
          processingItems: Number((q.counts as Record<string, number> | undefined)?.processing || q.processingItems || 0),
          completedItems: Number((q.counts as Record<string, number> | undefined)?.completed || q.completedItems || 0),
          failedItems: Number((q.counts as Record<string, number> | undefined)?.failed || q.failedItems || 0),
          createdAt: String(q.createdAt ?? ''),
          updatedAt: String(q.updatedAt ?? ''),
        }))
        setQueues(mapped)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Load from REST initially if socket is slow
  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) loadQueues()
    }, 2000)
    return () => clearTimeout(timer)
  }, [loading, loadQueues])

  // ─── Subscribe to queue items when expanded ────────────────────────────
  useEffect(() => {
    if (expandedQueueId && socketRef.current?.connected) {
      const queueName = queueIdToNameRef.current[expandedQueueId]
      if (queueName) {
        socketRef.current.emit('queue:subscribe', { queue: queueName })
      }
    }
  }, [expandedQueueId])

  // ─── Load queue items via REST if not subscribed via socket ────────────
  const loadQueueItems = useCallback(async (queueId: string) => {
    if (queueItemsMap[queueId]) return // Already have items from socket
    try {
      const res = await fetch(`/api/queues/${queueId}/items`)
      const data = await res.json()
      const items: QueueItem[] = Array.isArray(data) ? data : data.data || data.items || []
      setQueueItemsMap((prev) => ({ ...prev, [queueId]: items }))
    } catch {
      // ignore
    }
  }, [queueItemsMap])

  const toggleExpand = async (queueId: string) => {
    if (expandedQueueId === queueId) {
      setExpandedQueueId(null)
    } else {
      setExpandedQueueId(queueId)
      await loadQueueItems(queueId)
    }
  }

  // ─── Enqueue Job via Socket ────────────────────────────────────────────
  const handleEnqueue = () => {
    if (!enqueueQueueId || !enqueueForm.jobType || !socketRef.current?.connected) return

    const queueName = queueIdToNameRef.current[enqueueQueueId]
    if (!queueName) return

    let payload: Record<string, unknown> = {}
    try { payload = JSON.parse(enqueueForm.payload) } catch { /* keep empty */ }

    socketRef.current.emit('job:enqueue', {
      queue: queueName,
      jobType: enqueueForm.jobType,
      priority: parseInt(enqueueForm.priority) || 5,
      payload,
    })

    setEnqueueDialogOpen(false)
    setEnqueueForm({ jobType: '', priority: '5', payload: '{}' })
  }

  // ─── Process Next Job ──────────────────────────────────────────────────
  const handleProcessNext = (queueId: string) => {
    if (!socketRef.current?.connected) return
    const queueName = queueIdToNameRef.current[queueId]
    if (!queueName) return

    setProcessingId(queueId)
    socketRef.current.emit('job:dequeue', { queue: queueName })
    setTimeout(() => setProcessingId(null), 1000)
  }

  // ─── Update Item Status via Socket ─────────────────────────────────────
  const handleItemStatusChange = (itemId: string, newStatus: string) => {
    if (!socketRef.current?.connected) return

    setUpdatingItemId(itemId)

    if (newStatus === 'cancelled') {
      socketRef.current.emit('job:cancel', { itemId })
    } else if (newStatus === 'completed') {
      socketRef.current.emit('job:complete', { itemId, result: { manual: true } })
    } else if (newStatus === 'failed') {
      socketRef.current.emit('job:complete', { itemId, error: 'Manually marked as failed' })
    }

    setTimeout(() => setUpdatingItemId(null), 1000)
  }

  // ─── Request fresh stats ───────────────────────────────────────────────
  const requestStats = () => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('queue:stats')
      socketRef.current.emit('queue:status')
    }
  }

  // ─── Derived state ─────────────────────────────────────────────────────
  const hasProcessingItems = queues.some((q) => q.processingItems > 0)
  const totalQueued = queues.reduce((sum, q) => sum + q.pendingItems, 0)

  // ─── Loading State ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48 rounded-lg" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <Layers className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Job Queues</h2>
            <p className="text-xs text-gray-500">Real-time job queue management with background workers</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Connection Status Indicator */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
            socketConnected
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-600 border border-red-200'
          }`}>
            {socketConnected ? (
              <Wifi className="w-3 h-3" />
            ) : (
              <WifiOff className="w-3 h-3" />
            )}
            {socketConnected ? 'Live' : 'Offline'}
          </div>

          <Button
            onClick={requestStats}
            variant="outline"
            size="sm"
            className="rounded-lg border-gray-200 text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>

          <Dialog open={enqueueDialogOpen} onOpenChange={setEnqueueDialogOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white">
                <Plus className="w-4 h-4 mr-2" />
                Enqueue Job
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white border-gray-200 sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-gray-900">Enqueue New Job</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label className="text-gray-700 text-sm">Queue</Label>
                  <Select value={enqueueQueueId} onValueChange={setEnqueueQueueId}>
                    <SelectTrigger className="border-gray-200 text-gray-900">
                      <SelectValue placeholder="Select queue" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-gray-200">
                      {queues
                        .filter((q) => q.status === 'active')
                        .map((q) => (
                          <SelectItem key={q.id} value={q.id}>
                            {q.name}
                            <span className="text-gray-400 ml-1.5 text-xs">
                              ({q.pendingItems} pending)
                            </span>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-700 text-sm">Job Type</Label>
                  <Input
                    placeholder="e.g. email_send, data_sync, ai_inference"
                    value={enqueueForm.jobType}
                    onChange={(e) => setEnqueueForm((f) => ({ ...f, jobType: e.target.value }))}
                    className="border-gray-200 text-gray-900"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-700 text-sm">Priority (1-10)</Label>
                  <Select value={enqueueForm.priority} onValueChange={(v) => setEnqueueForm((f) => ({ ...f, priority: v }))}>
                    <SelectTrigger className="border-gray-200 text-gray-900">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-gray-200">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((p) => (
                        <SelectItem key={p} value={String(p)}>
                          {p} {p >= 8 ? '(High)' : p <= 3 ? '(Low)' : '(Normal)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-700 text-sm">Payload (JSON)</Label>
                  <textarea
                    rows={4}
                    className="flex w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500 font-mono"
                    placeholder='{"key": "value"}'
                    value={enqueueForm.payload}
                    onChange={(e) => setEnqueueForm((f) => ({ ...f, payload: e.target.value }))}
                  />
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline" className="rounded-lg border-gray-200 text-gray-700">Cancel</Button>
                </DialogClose>
                <Button
                  onClick={handleEnqueue}
                  disabled={!enqueueQueueId || !enqueueForm.jobType || !socketConnected}
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Zap className="w-4 h-4 mr-1.5" />
                  Enqueue
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Aggregate Stats */}
      <StatsCard stats={stats} />

      {/* Live Processing Banner */}
      {hasProcessingItems && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
          <div className="relative">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping absolute" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500 relative" />
          </div>
          <span className="text-sm text-amber-800 font-medium">
            Background worker is actively processing jobs
          </span>
          <span className="text-xs text-amber-600">
            ({queues.reduce((s, q) => s + q.processingItems, 0)} jobs in progress)
          </span>
          <Loader2 className="w-4 h-4 text-amber-500 animate-spin ml-auto" />
        </div>
      )}

      {/* Queue Cards */}
      {queues.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <ListTodo className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 text-sm">No queues found</p>
          <p className="text-gray-400 text-xs mt-1">Create a queue via the API to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {queues.map((queue) => {
            const isExpanded = expandedQueueId === queue.id
            const items = queueItemsMap[queue.id] || []
            const utilPercent = queue.concurrency > 0
              ? Math.round((queue.processingItems / queue.concurrency) * 100)
              : 0

            return (
              <Card
                key={queue.id}
                className="bg-white border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        onClick={() => toggleExpand(queue.id)}
                        className="text-gray-400 hover:text-gray-700 transition-colors flex-shrink-0"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>
                      <CardTitle className="text-sm font-semibold text-gray-900 truncate">
                        {queue.name}
                      </CardTitle>
                      <Badge
                        variant="secondary"
                        className={`text-[10px] py-0 px-1.5 border flex-shrink-0 ${statusColor(queue.status)}`}
                      >
                        {queue.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {queue.processingItems > 0 && (
                        <div className="relative">
                          <div className="w-2 h-2 rounded-full bg-amber-500 animate-ping absolute" />
                          <div className="w-2 h-2 rounded-full bg-amber-500 relative" />
                        </div>
                      )}
                      <span className="text-[10px] text-gray-400">
                        {queue.concurrency}x
                      </span>
                    </div>
                  </div>
                  {queue.description && (
                    <p className="text-[11px] text-gray-400 mt-1 ml-6 truncate">
                      {queue.description}
                    </p>
                  )}
                </CardHeader>
                <CardContent className="pt-0">
                  {/* Concurrency Utilization */}
                  <div className="mb-3 ml-6">
                    <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
                      <span>Concurrency</span>
                      <span>{queue.processingItems}/{queue.concurrency}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          utilPercent >= 100
                            ? 'bg-red-500'
                            : utilPercent >= 70
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(utilPercent, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Item count stats */}
                  <div className="grid grid-cols-4 gap-2 mb-3 ml-6">
                    {[
                      { label: 'Pending', value: queue.pendingItems, color: 'text-slate-600', bg: 'bg-slate-50', icon: Clock },
                      { label: 'Active', value: queue.processingItems, color: 'text-amber-600', bg: 'bg-amber-50', icon: Activity },
                      { label: 'Done', value: queue.completedItems, color: 'text-emerald-600', bg: 'bg-emerald-50', icon: CheckCircle2 },
                      { label: 'Failed', value: queue.failedItems, color: 'text-red-600', bg: 'bg-red-50', icon: XCircle },
                    ].map((stat) => {
                      const Icon = stat.icon
                      return (
                        <div key={stat.label} className={`${stat.bg} rounded-lg p-1.5 text-center`}>
                          <Icon className={`w-3 h-3 ${stat.color} mx-auto mb-0.5`} />
                          <p className={`text-sm font-bold ${stat.color}`}>{stat.value}</p>
                          <p className="text-[9px] text-gray-400">{stat.label}</p>
                        </div>
                      )
                    })}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleProcessNext(queue.id)}
                      disabled={!socketConnected || processingId === queue.id || queue.pendingItems === 0}
                      size="sm"
                      className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                    >
                      {processingId === queue.id ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5 mr-1.5" />
                      )}
                      Process Next
                    </Button>
                    <Button
                      onClick={() => {
                        if (socketRef.current?.connected) {
                          socketRef.current.emit('queue:subscribe', { queue: queue.name })
                        }
                      }}
                      disabled={!socketConnected}
                      variant="outline"
                      size="sm"
                      className="rounded-lg border-gray-200 text-gray-600 hover:bg-gray-50 text-xs"
                      title="Subscribe to real-time updates"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  {/* Expanded items table */}
                  {isExpanded && (
                    <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
                      <div className="max-h-72 overflow-y-auto scrollbar-thin">
                        <Table className="text-xs">
                          <TableHeader>
                            <TableRow className="bg-gray-50 hover:bg-gray-50 border-gray-200">
                              <TableHead className="text-gray-500 font-medium text-[10px] w-8">P</TableHead>
                              <TableHead className="text-gray-500 font-medium text-[10px]">Type</TableHead>
                              <TableHead className="text-gray-500 font-medium text-[10px]">Status</TableHead>
                              <TableHead className="text-gray-500 font-medium text-[10px]">Retries</TableHead>
                              <TableHead className="text-gray-500 font-medium text-[10px]">Created</TableHead>
                              <TableHead className="text-gray-500 font-medium text-[10px] w-24">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {items.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={6} className="text-center text-gray-400 py-8 text-xs">
                                  <Clock className="w-5 h-5 mx-auto mb-1 opacity-40" />
                                  No items in this queue
                                </TableCell>
                              </TableRow>
                            ) : (
                              items.map((item) => {
                                const StatusIcon = itemStatusIcon(item.status)
                                const isProcessing = item.status === 'processing'
                                return (
                                  <TableRow
                                    key={item.id}
                                    className={`border-gray-100 hover:bg-gray-50/50 transition-colors ${
                                      isProcessing ? 'bg-amber-50/30' : ''
                                    }`}
                                  >
                                    <TableCell className="text-gray-600 font-mono text-[11px]">
                                      {item.priority}
                                    </TableCell>
                                    <TableCell className="text-gray-900 font-medium">
                                      <div className="flex items-center gap-1.5">
                                        {item.jobType}
                                        {isProcessing && <ProcessingAnimation item={item} />}
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <Badge
                                        variant="secondary"
                                        className={`text-[9px] py-0 px-1.5 border ${
                                          itemStatusColor(item.status)
                                        } ${isProcessing ? 'animate-pulse' : ''}`}
                                      >
                                        <StatusIcon className={`w-2.5 h-2.5 mr-0.5 ${
                                          isProcessing ? 'animate-spin' : ''
                                        }`} />
                                        {item.status}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-gray-500">
                                      {item.attempts}/{item.maxAttempts}
                                    </TableCell>
                                    <TableCell className="text-gray-400 whitespace-nowrap text-[11px]">
                                      {formatTimeAgo(item.createdAt)}
                                    </TableCell>
                                    <TableCell>
                                      {item.status !== 'completed' && item.status !== 'cancelled' && (
                                        <div className="flex items-center gap-0.5">
                                          <button
                                            onClick={() => handleItemStatusChange(item.id, 'completed')}
                                            disabled={updatingItemId === item.id || !socketConnected}
                                            className="p-1 rounded hover:bg-emerald-50 text-emerald-600 transition-colors disabled:opacity-30"
                                            title="Complete"
                                          >
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            onClick={() => handleItemStatusChange(item.id, 'failed')}
                                            disabled={updatingItemId === item.id || !socketConnected}
                                            className="p-1 rounded hover:bg-red-50 text-red-600 transition-colors disabled:opacity-30"
                                            title="Fail"
                                          >
                                            <XCircle className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            onClick={() => handleItemStatusChange(item.id, 'cancelled')}
                                            disabled={updatingItemId === item.id || !socketConnected}
                                            className="p-1 rounded hover:bg-gray-100 text-gray-500 transition-colors disabled:opacity-30"
                                            title="Cancel"
                                          >
                                            <Ban className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      )}
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
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}