'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Telescope,
  RefreshCw,
  Activity,
  Zap,
  AlertTriangle,
  ShieldAlert,
  Clock,
  Cpu,
  Database,
  Layers,
  ArrowUpRight,
  Info,
  Search,
  Download,
  Play,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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

interface HealthData {
  status: string
  timestamp: string
  uptime?: { ms: number; human: string }
  database?: { status: string; provider: string }
  counts?: Record<string, number>
  services?: ServiceCheck[]
}

interface ServiceCheck {
  service: string
  status: string
  responseMs?: number
  details?: string
}

interface DashboardStats {
  agents?: { total: number; active: number }
  usage?: { totalTokens: number; today: number }
}

interface QueueData {
  id: string
  name: string
  counts: Record<string, number>
  totalItems: number
  isActive: boolean
}

interface TokenUsageData {
  data: unknown[]
  aggregates: {
    count: number
    totalTokens: number
    totalCostEstimate: number
  }
}

interface AlertItem {
  id: string
  name: string
  severity: string
  condition: string
  isFiring: boolean
  isSilenced: boolean
  lastFiredAt: string | null
  createdAt: string
}

interface LogEntry {
  id: string
  timestamp: string
  level: string
  source: string
  message: string
}

interface MetricBucket {
  bucket: string
  value: number
  count: number
}

interface MetricQueryResult {
  data: {
    aggregation: string
    name: string | null
    result: number | null
    count: number
    period: string | null
    buckets: MetricBucket[] | null
  }
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BRAND_PRIMARY = '#003ABC'
const BRAND_ACCENT = '#FF6A00'
const COLOR_HEALTHY = '#22C55E'
const COLOR_WARNING = '#EAB308'
const COLOR_CRITICAL = '#EF4444'

const SERVICE_MAP: Record<string, { label: string; icon: typeof Cpu }> = {
  database_write: { label: 'Database', icon: Database },
  agents: { label: 'Agent Service', icon: Cpu },
  workflows: { label: 'Workflow Engine', icon: Layers },
  tenants: { label: 'Tenant Gateway', icon: Activity },
  skills: { label: 'Skill Registry', icon: Zap },
  approvals: { label: 'Approval Queue', icon: ShieldAlert },
  error_rate: { label: 'Error Monitor', icon: AlertTriangle },
  protection: { label: 'Protection Layer', icon: ShieldAlert },
  memory: { label: 'Memory Store', icon: Database },
  webhooks: { label: 'Webhook Delivery', icon: ArrowUpRight },
}

const LOG_LEVELS = ['All', 'error', 'warning', 'info']

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusColor(status: string) {
  if (status === 'healthy') return COLOR_HEALTHY
  if (status === 'degraded') return COLOR_WARNING
  return COLOR_CRITICAL
}

function severityBadge(severity: string) {
  switch (severity) {
    case 'critical':
      return 'bg-red-100 text-red-700 border-red-200'
    case 'warning':
      return 'bg-amber-100 text-amber-700 border-amber-200'
    case 'info':
      return 'bg-blue-50 text-blue-700 border-blue-200'
    default:
      return 'bg-gray-100 text-gray-600 border-gray-200'
  }
}

function logLevelColor(level: string) {
  switch (level) {
    case 'error': return 'text-red-600 bg-red-50 border-red-200'
    case 'warning': return 'text-amber-600 bg-amber-50 border-amber-200'
    case 'info': return 'text-blue-600 bg-blue-50 border-blue-200'
    case 'debug': return 'text-gray-500 bg-gray-50 border-gray-200'
    default: return 'text-gray-600 bg-gray-50 border-gray-200'
  }
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ─── SVG Chart Components ────────────────────────────────────────────────────

function LineChart({ data, label, color }: { data: MetricBucket[]; label: string; color: string }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-[#94A3B8]">
        No data yet. Metrics will appear as the system runs.
      </div>
    )
  }

  const w = 400
  const h = 160
  const pad = { top: 10, right: 10, bottom: 24, left: 44 }
  const chartW = w - pad.left - pad.right
  const chartH = h - pad.top - pad.bottom

  const values = data.map((d) => d.value)
  const maxVal = Math.max(...values, 1)
  const minVal = Math.min(...values, 0)
  const range = maxVal - minVal || 1

  const points = data.map((d, i) => {
    const x = pad.left + (i / Math.max(data.length - 1, 1)) * chartW
    const y = pad.top + chartH - ((d.value - minVal) / range) * chartH
    return `${x},${y}`
  })

  const areaPoints = [
    `${pad.left},${pad.top + chartH}`,
    ...points,
    `${pad.left + chartW},${pad.top + chartH}`,
  ].join(' ')

  // Generate x-axis labels (show max 6)
  const labelCount = Math.min(data.length, 6)
  const labelStep = Math.floor(data.length / labelCount)

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
        const y = pad.top + chartH * (1 - pct)
        const val = minVal + range * pct
        return (
          <g key={pct}>
            <line x1={pad.left} y1={y} x2={w - pad.right} y2={y} stroke="#E2E8F0" strokeWidth={0.5} />
            <text x={pad.left - 4} y={y + 3} textAnchor="end" fontSize={8} fill="#94A3B8">
              {val >= 1000 ? formatNumber(Math.round(val)) : val.toFixed(1)}
            </text>
          </g>
        )
      })}

      {/* Area fill */}
      <polygon points={areaPoints} fill={color} opacity={0.08} />

      {/* Line */}
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Data points */}
      {data.map((d, i) => {
        const x = pad.left + (i / Math.max(data.length - 1, 1)) * chartW
        const y = pad.top + chartH - ((d.value - minVal) / range) * chartH
        return (
          <circle key={i} cx={x} cy={y} r={2.5} fill={color} stroke="white" strokeWidth={1.5} />
        )
      })}

      {/* X-axis labels */}
      {data
        .filter((_, i) => i % labelStep === 0 || i === data.length - 1)
        .map((d, i) => {
          const idx = data.indexOf(d)
          const x = pad.left + (idx / Math.max(data.length - 1, 1)) * chartW
          const date = new Date(d.bucket)
          const label = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          return (
            <text key={i} x={x} y={h - 4} textAnchor="middle" fontSize={7} fill="#94A3B8">
              {label}
            </text>
          )
        })}

      {/* Title */}
      <text x={pad.left} y={pad.top - 1} fontSize={9} fontWeight={600} fill="#1E293B">
        {label}
      </text>
    </svg>
  )
}

function BarChart({ data, label, color }: { data: MetricBucket[]; label: string; color: string }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-[#94A3B8]">
        No data yet. Metrics will appear as the system runs.
      </div>
    )
  }

  const w = 400
  const h = 160
  const pad = { top: 10, right: 10, bottom: 32, left: 44 }
  const chartW = w - pad.left - pad.right
  const chartH = h - pad.top - pad.bottom

  const values = data.map((d) => d.value)
  const maxVal = Math.max(...values, 1)

  const barWidth = Math.max(8, Math.min(40, (chartW / data.length) * 0.7))
  const gap = (chartW - barWidth * data.length) / (data.length + 1)

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
        const y = pad.top + chartH * (1 - pct)
        const val = maxVal * pct
        return (
          <g key={pct}>
            <line x1={pad.left} y1={y} x2={w - pad.right} y2={y} stroke="#E2E8F0" strokeWidth={0.5} />
            <text x={pad.left - 4} y={y + 3} textAnchor="end" fontSize={8} fill="#94A3B8">
              {val >= 1000 ? formatNumber(Math.round(val)) : val.toFixed(1)}
            </text>
          </g>
        )
      })}

      {/* Bars */}
      {data.map((d, i) => {
        const x = pad.left + gap + i * (barWidth + gap)
        const barH = (d.value / maxVal) * chartH
        const y = pad.top + chartH - barH
        return (
          <g key={i}>
            <rect x={x} y={y} width={barWidth} height={barH} rx={2} fill={color} opacity={0.85} />
            <text x={x + barWidth / 2} y={h - 10} textAnchor="middle" fontSize={7} fill="#94A3B8" transform={`rotate(-25, ${x + barWidth / 2}, ${h - 10})`}>
              {new Date(d.bucket).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </text>
          </g>
        )
      })}

      {/* Title */}
      <text x={pad.left} y={pad.top - 1} fontSize={9} fontWeight={600} fill="#1E293B">
        {label}
      </text>
    </svg>
  )
}

// ─── Skeleton Loaders ────────────────────────────────────────────────────────

function StatusCardSkeleton() {
  return (
    <Card className="bg-white border-[#E2E8F0] rounded-xl shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Skeleton className="w-7 h-7 rounded-lg" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-7 w-24 mb-2" />
        <Skeleton className="h-2 w-full rounded-full" />
      </CardContent>
    </Card>
  )
}

function ChartSkeleton() {
  return (
    <Card className="bg-white border-[#E2E8F0] rounded-xl shadow-sm">
      <CardHeader className="pb-2 px-4 pt-4">
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <Skeleton className="h-48 w-full rounded-lg" />
      </CardContent>
    </Card>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ObservatoryPanel() {
  // ── State ──
  const [health, setHealth] = useState<HealthData | null>(null)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [queues, setQueues] = useState<QueueData[]>([])
  const [tokenUsage, setTokenUsage] = useState<TokenUsageData | null>(null)
  const [systemHealth, setSystemHealth] = useState<{ services: ServiceCheck[] } | null>(null)
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [logLevel, setLogLevel] = useState('All')

  // Metrics chart data
  const [requestRateBuckets, setRequestRateBuckets] = useState<MetricBucket[]>([])
  const [tokenBuckets, setTokenBuckets] = useState<MetricBucket[]>([])

  // Metrics explorer
  const [metricName, setMetricName] = useState('')
  const [metricAgg, setMetricAgg] = useState('sum')
  const [metricPeriod, setMetricPeriod] = useState('1h')
  const [metricResults, setMetricResults] = useState<MetricQueryResult | null>(null)
  const [metricLoading, setMetricLoading] = useState(false)

  // UI state
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<string>('')
  const [collecting, setCollecting] = useState(false)
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Data Fetchers ──

  const fetchAll = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const [healthRes, statsRes, queuesRes, tokenRes, alertsRes, logsRes, sysHealthRes, reqRateRes, tokenChartRes] =
        await Promise.all([
          fetch('/api/health').then((r) => r.json()).catch(() => null),
          fetch('/api/dashboard/stats').then((r) => r.json()).catch(() => null),
          fetch('/api/queues').then((r) => r.json()).catch(() => null),
          fetch('/api/token-usage?limit=1').then((r) => r.json()).catch(() => null),
          fetch('/api/alerts').then((r) => r.json()).catch(() => null),
          fetch(`/api/logs?limit=50${logLevel !== 'All' ? `&level=${logLevel}` : ''}`).then((r) => r.json()).catch(() => null),
          fetch('/api/system-health?deep=true').then((r) => r.json()).catch(() => null),
          fetch('/api/metrics?name=request_rate&period=5m&agg=sum&from=' + new Date(Date.now() - 3600000).toISOString()).then((r) => r.json()).catch(() => null),
          fetch('/api/metrics?name=token_usage&period=1h&agg=sum&from=' + new Date(Date.now() - 3600000).toISOString()).then((r) => r.json()).catch(() => null),
        ])

      if (healthRes) setHealth(healthRes)
      if (statsRes) setStats(statsRes)
      if (queuesRes?.data) setQueues(queuesRes.data)
      if (tokenRes) setTokenUsage(tokenRes)
      if (alertsRes?.data) setAlerts(alertsRes.data)
      if (logsRes?.data) setLogs(logsRes.data)
      if (sysHealthRes?.services) setSystemHealth({ services: sysHealthRes.services })
      if (reqRateRes?.data?.buckets) setRequestRateBuckets(reqRateRes.data.buckets)
      if (tokenChartRes?.data?.buckets) setTokenBuckets(tokenChartRes.data.buckets)

      setLastRefresh(new Date().toLocaleTimeString())
    } catch {
      // silently handle
    } finally {
      setLoading(false)
    }
  }, [logLevel])

  // ── Effects ──

  useEffect(() => {
    fetchAll(true)
    refreshTimerRef.current = setInterval(() => fetchAll(false), 30000)
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current)
    }
  }, [fetchAll])

  // Re-fetch logs when filter changes
  useEffect(() => {
    fetch('/api/logs?limit=50' + (logLevel !== 'All' ? `&level=${logLevel}` : ''))
      .then((r) => r.json())
      .then((res) => { if (res?.data) setLogs(res.data) })
      .catch(() => {})
  }, [logLevel])

  // ── Handlers ──

  const handleSilenceAlert = async (id: string) => {
    try {
      const silencedUntil = new Date(Date.now() + 4 * 3600 * 1000).toISOString()
      await fetch('/api/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, silencedUntil }),
      })
      setAlerts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, isSilenced: true } : a))
      )
    } catch { /* ignore */ }
  }

  const handleAckAlert = async (id: string) => {
    try {
      await fetch('/api/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, acknowledge: true }),
      })
      setAlerts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, isSilenced: true } : a))
      )
    } catch { /* ignore */ }
  }

  const handleCollectMetrics = async () => {
    setCollecting(true)
    try {
      await fetch('/api/metrics/collect', { method: 'POST' })
      // Refresh charts after collecting
      const [reqRateRes, tokenChartRes] = await Promise.all([
        fetch('/api/metrics?name=request_rate&period=5m&agg=sum&from=' + new Date(Date.now() - 3600000).toISOString()).then((r) => r.json()),
        fetch('/api/metrics?name=token_usage&period=1h&agg=sum&from=' + new Date(Date.now() - 3600000).toISOString()).then((r) => r.json()),
      ])
      if (reqRateRes?.data?.buckets) setRequestRateBuckets(reqRateRes.data.buckets)
      if (tokenChartRes?.data?.buckets) setTokenBuckets(tokenChartRes.data.buckets)
    } catch { /* ignore */ }
    setCollecting(false)
  }

  const handleMetricQuery = async () => {
    if (!metricName.trim()) return
    setMetricLoading(true)
    try {
      const from = new Date(Date.now() - parsePeriodToMs(metricPeriod)).toISOString()
      const res = await fetch(`/api/metrics?name=${encodeURIComponent(metricName)}&agg=${metricAgg}&period=${metricPeriod}&from=${from}`)
      const data = await res.json()
      setMetricResults(data)
    } catch {
      setMetricResults(null)
    }
    setMetricLoading(false)
  }

  function parsePeriodToMs(p: string): number {
    const match = p.match(/^(\d+)(m|h|d)$/)
    if (!match) return 3600000
    const n = parseInt(match[1])
    switch (match[2]) {
      case 'm': return n * 60000
      case 'h': return n * 3600000
      case 'd': return n * 86400000
      default: return 3600000
    }
  }

  // ── Computed Values ──

  const queueDepth = queues.reduce((sum, q) => {
    return sum + (q.counts?.queued || 0) + (q.counts?.processing || 0)
  }, 0)

  const tokenToday = tokenUsage?.aggregates?.totalTokens || 0

  const activeFiringAlerts = alerts.filter((a) => a.isFiring && !a.isSilenced)

  const serviceChecks = systemHealth?.services || []

  // ── Render ──

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <Skeleton className="w-9 h-9 rounded-xl" />
          <div>
            <Skeleton className="h-6 w-36 mb-1" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatusCardSkeleton key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#003ABC]/10 flex items-center justify-center">
            <Telescope className="w-5 h-5 text-[#003ABC]" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold text-[#1E293B]">Observatory</h2>
              {activeFiringAlerts.length > 0 && (
                <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px] py-0 animate-pulse">
                  {activeFiringAlerts.length} firing
                </Badge>
              )}
            </div>
            <p className="text-xs text-[#94A3B8]">Real-time metrics and monitoring dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => fetchAll(true)}
            variant="outline"
            className="rounded-lg border-[#E2E8F0] text-[#1E293B] hover:bg-[#F8FAFC]"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* ═══ ROW 1: SYSTEM STATUS CARDS ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* System Health */}
        <Card className="bg-white border-[#E2E8F0] rounded-xl shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center">
                <ShieldAlert className="w-4 h-4" style={{ color: statusColor(health?.status || 'healthy') }} />
              </div>
              <span className="text-xs text-[#94A3B8]">System Health</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: statusColor(health?.status || 'healthy') }}>
              {(health?.status || 'healthy').charAt(0).toUpperCase() + (health?.status || 'healthy').slice(1)}
            </p>
            <div className="mt-2">
              <Badge
                variant="secondary"
                className="text-[10px] py-0 border"
                style={{
                  backgroundColor: statusColor(health?.status || 'healthy') + '18',
                  color: statusColor(health?.status || 'healthy'),
                  borderColor: statusColor(health?.status || 'healthy') + '40',
                }}
              >
                {health?.status === 'healthy' ? 'All Systems Go' : health?.status === 'degraded' ? 'Performance Issues' : 'Service Disruption'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Active Agents */}
        <Card className="bg-white border-[#E2E8F0] rounded-xl shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-[#003ABC]/10 flex items-center justify-center">
                <Cpu className="w-4 h-4 text-[#003ABC]" />
              </div>
              <span className="text-xs text-[#94A3B8]">Active Agents</span>
            </div>
            <p className="text-2xl font-bold text-[#003ABC]">
              {stats?.agents?.active?.toLocaleString() ?? '—'}
            </p>
            <p className="text-[10px] text-[#94A3B8] mt-1">
              of {stats?.agents?.total?.toLocaleString() ?? '0'} total agents
            </p>
          </CardContent>
        </Card>

        {/* Queue Depth */}
        <Card className="bg-white border-[#E2E8F0] rounded-xl shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-[#FF6A00]/10 flex items-center justify-center">
                <Layers className="w-4 h-4 text-[#FF6A00]" />
              </div>
              <span className="text-xs text-[#94A3B8]">Queue Depth</span>
            </div>
            <p className="text-2xl font-bold text-[#FF6A00]">
              {queueDepth.toLocaleString()}
            </p>
            <p className="text-[10px] text-[#94A3B8] mt-1">
              {queues.length} queue{queues.length !== 1 ? 's' : ''} active
            </p>
          </CardContent>
        </Card>

        {/* Token Usage Today */}
        <Card className="bg-white border-[#E2E8F0] rounded-xl shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                <Zap className="w-4 h-4 text-emerald-600" />
              </div>
              <span className="text-xs text-[#94A3B8]">Token Usage</span>
            </div>
            <p className="text-2xl font-bold text-emerald-600">
              {formatNumber(tokenToday)}
            </p>
            <p className="text-[10px] text-[#94A3B8] mt-1">
              {tokenUsage?.aggregates?.count || 0} records tracked
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ═══ ROW 2: REAL-TIME METRICS CHARTS ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-white border-[#E2E8F0] rounded-xl shadow-sm">
          <CardHeader className="pb-2 px-4 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#64748B]" />
                <CardTitle className="text-sm font-semibold text-[#1E293B]">Request Rate</CardTitle>
                <Badge variant="secondary" className="text-[10px] bg-[#F8FAFC] text-[#94A3B8]">
                  last 1h · 5m intervals
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <LineChart data={requestRateBuckets} label="Requests per interval" color={BRAND_PRIMARY} />
          </CardContent>
        </Card>

        <Card className="bg-white border-[#E2E8F0] rounded-xl shadow-sm">
          <CardHeader className="pb-2 px-4 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-[#64748B]" />
                <CardTitle className="text-sm font-semibold text-[#1E293B]">Token Consumption</CardTitle>
                <Badge variant="secondary" className="text-[10px] bg-[#F8FAFC] text-[#94A3B8]">
                  last 1h · 1h intervals
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <BarChart data={tokenBuckets} label="Token usage per interval" color={BRAND_ACCENT} />
          </CardContent>
        </Card>
      </div>

      {/* ═══ ROW 3: SERVICE HEALTH GRID ═══ */}
      <Card className="bg-white border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#64748B]" />
          <h3 className="text-sm font-semibold text-[#1E293B]">Service Health</h3>
          <Badge variant="secondary" className="text-[10px] bg-[#F8FAFC] text-[#94A3B8]">
            {serviceChecks.length} services
          </Badge>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {serviceChecks.map((svc) => {
            const meta = SERVICE_MAP[svc.service] || { label: svc.service, icon: Cpu }
            const Icon = meta.icon
            const svcColor = statusColor(svc.status)
            return (
              <div
                key={svc.service}
                className="border border-[#E2E8F0] rounded-lg p-3 hover:bg-[#F8FAFC] transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-[#64748B]" />
                    <span className="text-xs font-medium text-[#1E293B]">{meta.label}</span>
                  </div>
                  <Badge
                    variant="secondary"
                    className="text-[9px] py-0 border"
                    style={{
                      backgroundColor: svcColor + '18',
                      color: svcColor,
                      borderColor: svcColor + '40',
                    }}
                  >
                    {svc.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-[10px] text-[#94A3B8]">
                  <span>{svc.responseMs ? `${svc.responseMs}ms` : '—'}</span>
                  <span className="truncate ml-2 max-w-[140px]">{svc.details || ''}</span>
                </div>
              </div>
            )
          })}
          {serviceChecks.length === 0 && (
            <div className="col-span-full py-8 text-center text-sm text-[#94A3B8]">
              Run a deep health check to see service status
            </div>
          )}
        </div>
      </Card>

      {/* ═══ ROW 4: ACTIVE ALERTS ═══ */}
      <Card className="bg-white border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-[#64748B]" />
            <h3 className="text-sm font-semibold text-[#1E293B]">Active Alerts</h3>
            <Badge variant="secondary" className="text-[10px] bg-[#F8FAFC] text-[#94A3B8]">
              {activeFiringAlerts.length} firing
            </Badge>
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {activeFiringAlerts.length === 0 ? (
            <div className="py-10 text-center">
              <ShieldAlert className="w-8 h-8 text-[#94A3B8] mx-auto mb-2" />
              <p className="text-[#64748B] text-sm">No active alerts</p>
              <p className="text-[#94A3B8] text-xs mt-0.5">All systems are operating normally</p>
            </div>
          ) : (
            <Table className="text-sm">
              <TableHeader>
                <TableRow className="bg-[#F8FAFC] hover:bg-[#F8FAFC] border-[#E2E8F0]">
                  <TableHead className="text-[#64748B] font-medium text-xs">Severity</TableHead>
                  <TableHead className="text-[#64748B] font-medium text-xs">Name</TableHead>
                  <TableHead className="text-[#64748B] font-medium text-xs hidden lg:table-cell">Condition</TableHead>
                  <TableHead className="text-[#64748B] font-medium text-xs">Status</TableHead>
                  <TableHead className="text-[#64748B] font-medium text-xs">Last Fired</TableHead>
                  <TableHead className="text-[#64748B] font-medium text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeFiringAlerts.map((alert) => (
                  <TableRow key={alert.id} className="border-[#E2E8F0]/50 hover:bg-[#F8FAFC]">
                    <TableCell>
                      <Badge variant="secondary" className={`text-[10px] py-0 border ${severityBadge(alert.severity)}`}>
                        {alert.severity === 'critical' && <AlertTriangle className="w-3 h-3 mr-1" />}
                        {alert.severity === 'warning' && <AlertTriangle className="w-3 h-3 mr-1" />}
                        {alert.severity === 'info' && <Info className="w-3 h-3 mr-1" />}
                        {alert.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[#1E293B] text-xs font-medium">{alert.name}</TableCell>
                    <TableCell className="text-[#64748B] text-xs max-w-[250px] truncate hidden lg:table-cell">{alert.condition}</TableCell>
                    <TableCell>
                      <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px] py-0 animate-pulse">
                        Firing
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[#94A3B8] text-xs whitespace-nowrap">{formatTime(alert.lastFiredAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[10px] text-[#64748B] hover:text-[#1E293B] px-2"
                          onClick={() => handleSilenceAlert(alert.id)}
                        >
                          Silence
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[10px] text-[#003ABC] hover:text-[#003ABC] hover:bg-[#003ABC]/10 px-2"
                          onClick={() => handleAckAlert(alert.id)}
                        >
                          Acknowledge
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>

      {/* ═══ ROW 5: RECENT LOGS ═══ */}
      <Card className="bg-white border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#64748B]" />
            <h3 className="text-sm font-semibold text-[#1E293B]">Recent Logs</h3>
            <Badge variant="secondary" className="text-[10px] bg-[#F8FAFC] text-[#94A3B8]">
              {logs.length} entries
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            {LOG_LEVELS.map((lvl) => (
              <Button
                key={lvl}
                variant={logLevel === lvl ? 'default' : 'ghost'}
                size="sm"
                className={
                  logLevel === lvl
                    ? 'h-7 text-[10px] px-2.5 bg-[#003ABC] hover:bg-[#003ABC]/90 text-white'
                    : 'h-7 text-[10px] px-2.5 text-[#64748B] hover:text-[#1E293B] hover:bg-[#F1F5F9]'
                }
                onClick={() => setLogLevel(lvl)}
              >
                {lvl === 'All' ? 'All' : lvl.charAt(0).toUpperCase() + lvl.slice(1)}
              </Button>
            ))}
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto font-mono text-xs">
          {logs.length === 0 ? (
            <div className="py-10 text-center">
              <Clock className="w-8 h-8 text-[#94A3B8] mx-auto mb-2" />
              <p className="text-[#64748B] text-sm">No log entries found</p>
            </div>
          ) : (
            <div className="divide-y divide-[#F1F5F9]">
              {logs.map((entry) => (
                <div key={entry.id} className="px-4 py-2 hover:bg-[#F8FAFC] flex items-start gap-3">
                  <span className="text-[#94A3B8] whitespace-nowrap shrink-0 w-16">
                    {formatTime(entry.timestamp)}
                  </span>
                  <Badge
                    variant="secondary"
                    className={`text-[9px] py-0 border shrink-0 w-16 justify-center ${logLevelColor(entry.level)}`}
                  >
                    {entry.level}
                  </Badge>
                  <span className="text-[#64748B] shrink-0 w-20 truncate">{entry.source}</span>
                  <span className="text-[#1E293B] break-all">{entry.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* ═══ ROW 6: METRICS EXPLORER ═══ */}
      <Card className="bg-white border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center gap-2">
          <Search className="w-4 h-4 text-[#64748B]" />
          <h3 className="text-sm font-semibold text-[#1E293B]">Metrics Explorer</h3>
        </div>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div className="flex-1 min-w-[180px]">
              <Label className="text-xs text-[#64748B] mb-1 block">Metric Name</Label>
              <Input
                placeholder="e.g. request_rate, memory_rss_mb"
                value={metricName}
                onChange={(e) => setMetricName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleMetricQuery()}
                className="h-9 border-[#E2E8F0] text-[#1E293B] text-sm"
              />
            </div>
            <div className="w-[120px]">
              <Label className="text-xs text-[#64748B] mb-1 block">Aggregation</Label>
              <Select value={metricAgg} onValueChange={setMetricAgg}>
                <SelectTrigger className="h-9 border-[#E2E8F0] text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-[#E2E8F0]">
                  <SelectItem value="sum">Sum</SelectItem>
                  <SelectItem value="avg">Average</SelectItem>
                  <SelectItem value="min">Min</SelectItem>
                  <SelectItem value="max">Max</SelectItem>
                  <SelectItem value="count">Count</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-[100px]">
              <Label className="text-xs text-[#64748B] mb-1 block">Period</Label>
              <Select value={metricPeriod} onValueChange={setMetricPeriod}>
                <SelectTrigger className="h-9 border-[#E2E8F0] text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-[#E2E8F0]">
                  <SelectItem value="5m">5 min</SelectItem>
                  <SelectItem value="15m">15 min</SelectItem>
                  <SelectItem value="1h">1 hour</SelectItem>
                  <SelectItem value="6h">6 hours</SelectItem>
                  <SelectItem value="1d">1 day</SelectItem>
                  <SelectItem value="7d">7 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleMetricQuery}
              disabled={!metricName.trim() || metricLoading}
              className="h-9 rounded-lg bg-[#003ABC] hover:bg-[#003ABC]/90 text-white"
            >
              {metricLoading ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Search className="w-4 h-4 mr-1" />}
              Query
            </Button>
          </div>

          {metricResults && (
            <div className="border border-[#E2E8F0] rounded-lg overflow-hidden">
              {/* Summary */}
              <div className="px-4 py-3 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center gap-4">
                <div>
                  <span className="text-[10px] text-[#94A3B8] uppercase tracking-wider">Result</span>
                  <p className="text-lg font-bold text-[#003ABC]">
                    {metricResults.data.result !== null ? metricResults.data.result.toLocaleString() : 'N/A'}
                  </p>
                </div>
                <Separator orientation="vertical" className="h-8" />
                <div>
                  <span className="text-[10px] text-[#94A3B8] uppercase tracking-wider">Data Points</span>
                  <p className="text-lg font-bold text-[#1E293B]">{metricResults.data.count}</p>
                </div>
                <div>
                  <span className="text-[10px] text-[#94A3B8] uppercase tracking-wider">Aggregation</span>
                  <p className="text-sm font-medium text-[#64748B]">{metricResults.data.aggregation}</p>
                </div>
              </div>

              {/* Bucket table */}
              {metricResults.data.buckets && metricResults.data.buckets.length > 0 && (
                <div className="max-h-48 overflow-y-auto">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow className="bg-[#F8FAFC] hover:bg-[#F8FAFC] border-[#E2E8F0]">
                        <TableHead className="text-[#64748B] font-medium text-[10px]">Time</TableHead>
                        <TableHead className="text-[#64748B] font-medium text-[10px] text-right">Value</TableHead>
                        <TableHead className="text-[#64748B] font-medium text-[10px] text-right">Count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {metricResults.data.buckets.map((b, i) => (
                        <TableRow key={i} className="border-[#E2E8F0]/50 hover:bg-[#F8FAFC]">
                          <TableCell className="text-[#64748B]">
                            {new Date(b.bucket).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-[#1E293B] font-mono text-right">
                            {b.value.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-[#94A3B8] text-right">{b.count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          {!metricResults && !metricLoading && metricName.trim() && (
            <p className="text-sm text-[#94A3B8] text-center py-4">
              Enter a metric name and click Query to explore
            </p>
          )}
        </CardContent>
      </Card>

      {/* ═══ FOOTER ═══ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="rounded-lg border-[#E2E8F0] text-[#1E293B] hover:bg-[#F8FAFC]"
            onClick={() => window.open('/api/metrics/prometheus', '_blank')}
          >
            <Download className="w-4 h-4 mr-2" />
            Export Prometheus
          </Button>
          <Button
            variant="outline"
            className="rounded-lg border-[#E2E8F0] text-[#1E293B] hover:bg-[#F8FAFC]"
            onClick={handleCollectMetrics}
            disabled={collecting}
          >
            {collecting ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            Collect Metrics
          </Button>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-[#94A3B8]">
          <Clock className="w-3 h-3" />
          <span>Last refresh: {lastRefresh || '—'}</span>
          <span className="mx-1">·</span>
          <span>Auto-refresh every 30s</span>
        </div>
      </div>
    </div>
  )
}