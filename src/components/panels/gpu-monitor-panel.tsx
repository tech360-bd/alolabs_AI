'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Cpu,
  HardDrive,
  Wifi,
  WifiOff,
  Thermometer,
  Zap,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  MemoryStick,
  Server,
  Activity,
  ShieldAlert,
  Clock,
  CircleDot,
  Gauge,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Card,
  CardContent,
  CardDescription,
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

// ── Types ───────────────────────────────────────────────────────────────────

interface SystemResource {
  label: string
  used: number
  total: number
  unit: string
  percent: number
  color: string
  icon: React.ElementType
}

interface GpuCard {
  id: number
  name: string
  utilization: number
  memoryUsed: number
  memoryTotal: number
  temperature: number
  maxTemp: number
  powerDraw: number
  maxPower: number
  fanSpeed: number
  modelAssigned: string
  status: 'active' | 'idle' | 'error'
}

interface ModelAllocation {
  id: string
  modelName: string
  gpuAssigned: string
  vramAllocated: string
  cpuCores: number
  ramAllocated: string
  status: 'running' | 'idle' | 'starting' | 'stopping'
  uptime: string
}

interface ResourceAlert {
  id: string
  type: 'critical' | 'warning' | 'info'
  title: string
  description: string
  source: string
  timestamp: string
  acknowledged: boolean
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getTempColor(temp: number, max: number) {
  const ratio = temp / max
  if (ratio >= 0.9) return 'text-red-500'
  if (ratio >= 0.75) return 'text-amber-500'
  return 'text-green-500'
}

function getUtilColor(util: number) {
  if (util >= 90) return '[&>div]:bg-red-500'
  if (util >= 70) return '[&>div]:bg-amber-500'
  return '[&>div]:bg-[#003ABC]'
}

function getGpuStatus(status: string) {
  switch (status) {
    case 'active':
      return <Badge className="bg-green-50 text-green-700 border-green-200 text-xs"><CircleDot className="w-3 h-3 mr-1" />Active</Badge>
    case 'idle':
      return <Badge className="bg-slate-100 text-slate-500 border-slate-200 text-xs"><Clock className="w-3 h-3 mr-1" />Idle</Badge>
    case 'error':
      return <Badge className="bg-red-50 text-red-700 border-red-200 text-xs"><XCircle className="w-3 h-3 mr-1" />Error</Badge>
    default: return null
  }
}

function getModelStatus(status: string) {
  switch (status) {
    case 'running':
      return <Badge className="bg-green-50 text-green-700 border-green-200 text-[10px] px-1.5 py-0"><CheckCircle className="w-2.5 h-2.5 mr-1" />Running</Badge>
    case 'idle':
      return <Badge className="bg-slate-100 text-slate-500 border-slate-200 text-[10px] px-1.5 py-0"><Clock className="w-2.5 h-2.5 mr-1" />Idle</Badge>
    case 'starting':
      return <Badge className="bg-blue-50 text-[#003ABC] border-blue-200 text-[10px] px-1.5 py-0"><Activity className="w-2.5 h-2.5 mr-1 animate-pulse" />Starting</Badge>
    case 'stopping':
      return <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0"><Activity className="w-2.5 h-2.5 mr-1 animate-pulse" />Stopping</Badge>
    default: return null
  }
}

function getAlertStyle(type: string) {
  switch (type) {
    case 'critical':
      return {
        bg: 'bg-red-50 border-red-200',
        icon: <ShieldAlert className="w-4 h-4 text-red-500" />,
        badge: <Badge className="bg-red-100 text-red-700 border-red-300 text-[10px]">Critical</Badge>,
      }
    case 'warning':
      return {
        bg: 'bg-amber-50 border-amber-200',
        icon: <AlertTriangle className="w-4 h-4 text-amber-500" />,
        badge: <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-[10px]">Warning</Badge>,
      }
    case 'info':
      return {
        bg: 'bg-blue-50 border-blue-200',
        icon: <CheckCircle className="w-4 h-4 text-blue-500" />,
        badge: <Badge className="bg-blue-100 text-blue-700 border-blue-300 text-[10px]">Info</Badge>,
      }
    default:
      return {
        bg: 'bg-slate-50 border-slate-200',
        icon: <CheckCircle className="w-4 h-4 text-slate-400" />,
        badge: null,
      }
  }
}

// ── Component ───────────────────────────────────────────────────────────────

export default function GpuMonitorPanel() {
  const [resources, setResources] = useState<SystemResource[]>([])
  const [gpus, setGpus] = useState<GpuCard[]>([])
  const [allocations, setAllocations] = useState<ModelAllocation[]>([])
  const [alerts, setAlerts] = useState<ResourceAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<string>('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const loadData = useCallback(() => {
    setIsRefreshing(true)
    fetch('/api/gpu-monitor')
      .then((r) => r.json())
      .then((data) => {
        if (data.resources) setResources(data.resources)
        if (data.gpus) setGpus(data.gpus)
        if (data.allocations) setAllocations(data.allocations)
        if (data.alerts) setAlerts(data.alerts)
      })
      .catch(() => {
        // Keep current state (empty on first load)
      })
      .finally(() => {
        setIsRefreshing(false)
        setLastRefresh(new Date().toLocaleTimeString())
      })
  }, [])

  useEffect(() => {
    loadData()
    setLoading(false)
  }, [loadData])

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(loadData, 5000)
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [autoRefresh, loadData])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#003ABC]/10 flex items-center justify-center">
            <Gauge className="w-5 h-5 text-[#003ABC]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#1E293B]">GPU & System Monitor</h2>
            <p className="text-sm text-[#64748B]">Real-time hardware resource monitoring and model allocation</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className="text-xs text-[#64748B]">Updated {lastRefresh}</span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`h-8 text-xs ${autoRefresh ? 'bg-green-50 text-green-700 border-green-200' : 'border-[#E2E8F0] text-[#64748B]'}`}
          >
            <CircleDot className={`w-3.5 h-3.5 mr-1.5 ${autoRefresh ? 'animate-pulse' : ''}`} />
            Auto-Refresh {autoRefresh ? 'ON' : 'OFF'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={isRefreshing}
            className="h-8 text-xs border-[#E2E8F0] text-[#64748B]"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* System Resources */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {resources.map((res) => {
          const ResIcon = res.icon
          return (
            <Card key={res.label} className="border-[#E2E8F0]">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#F8FAFC] flex items-center justify-center">
                      <ResIcon className="w-4 h-4 text-[#64748B]" />
                    </div>
                    <span className="text-sm font-medium text-[#1E293B]">{res.label}</span>
                  </div>
                  <span className="text-lg font-bold text-[#1E293B]">
                    {res.unit === '%' ? `${Math.round(res.used)}%` : `${res.used} / ${res.total} ${res.unit}`}
                  </span>
                </div>
                <Progress value={res.percent} className={`h-2 ${res.color}`} />
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* GPU Cards Grid */}
      <div>
        <h3 className="text-sm font-semibold text-[#1E293B] mb-3 flex items-center gap-2">
          <Server className="w-4 h-4 text-[#003ABC]" />
          GPU Cards ({gpus.length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {gpus.map((gpu) => (
            <Card key={gpu.id} className="border-[#E2E8F0] hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-sm text-[#1E293B]">GPU {gpu.id}</CardTitle>
                      {getGpuStatus(gpu.status)}
                    </div>
                    <CardDescription className="text-xs text-[#64748B] mt-0.5">{gpu.name}</CardDescription>
                  </div>
                  <div className={`text-right ${getTempColor(gpu.temperature, gpu.maxTemp)}`}>
                    <Thermometer className="w-4 h-4 ml-auto" />
                    <p className="text-lg font-bold">{gpu.temperature}°C</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Utilization */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-[#64748B]">Utilization</span>
                    <span className="text-xs font-semibold text-[#1E293B]">{gpu.utilization}%</span>
                  </div>
                  <Progress value={gpu.utilization} className={`h-2 ${getUtilColor(gpu.utilization)}`} />
                </div>

                {/* Memory */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-[#64748B]">VRAM</span>
                    <span className="text-xs font-semibold text-[#1E293B]">
                      {gpu.memoryUsed} / {gpu.memoryTotal} GB
                    </span>
                  </div>
                  <Progress
                    value={(gpu.memoryUsed / gpu.memoryTotal) * 100}
                    className={`h-2 ${gpu.memoryUsed / gpu.memoryTotal > 0.85 ? '[&>div]:bg-red-500' : gpu.memoryUsed / gpu.memoryTotal > 0.6 ? '[&>div]:bg-amber-500' : '[&>div]:bg-[#003ABC]'}`}
                  />
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#E2E8F0]">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-0.5">
                      <Zap className="w-3 h-3 text-[#FF6A00]" />
                      <span className="text-[10px] text-[#64748B]">Power</span>
                    </div>
                    <p className="text-xs font-semibold text-[#1E293B]">{gpu.powerDraw}W</p>
                    <p className="text-[9px] text-[#64748B]">/ {gpu.maxPower}W</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-0.5">
                      <Activity className="w-3 h-3 text-[#003ABC]" />
                      <span className="text-[10px] text-[#64748B]">Fan</span>
                    </div>
                    <p className="text-xs font-semibold text-[#1E293B]">{gpu.fanSpeed}%</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-0.5">
                      <Server className="w-3 h-3 text-violet-500" />
                      <span className="text-[10px] text-[#64748B]">Model</span>
                    </div>
                    <p className="text-[10px] font-medium text-[#1E293B] truncate max-w-[80px]">{gpu.modelAssigned || '—'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Model Resource Allocation Table */}
      <div>
        <h3 className="text-sm font-semibold text-[#1E293B] mb-3 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-[#003ABC]" />
          Model Resource Allocation
        </h3>
        <Card className="border-[#E2E8F0]">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-[#E2E8F0]">
                  <TableHead className="text-xs text-[#64748B] font-medium">Model Name</TableHead>
                  <TableHead className="text-xs text-[#64748B] font-medium">GPU Assigned</TableHead>
                  <TableHead className="text-xs text-[#64748B] font-medium">VRAM</TableHead>
                  <TableHead className="text-xs text-[#64748B] font-medium">CPU Cores</TableHead>
                  <TableHead className="text-xs text-[#64748B] font-medium">RAM</TableHead>
                  <TableHead className="text-xs text-[#64748B] font-medium">Status</TableHead>
                  <TableHead className="text-xs text-[#64748B] font-medium">Uptime</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allocations.map((alloc) => (
                  <TableRow key={alloc.id} className="border-[#E2E8F0] hover:bg-[#F8FAFC]">
                    <TableCell className="text-sm font-medium text-[#1E293B]">{alloc.modelName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-slate-50 text-[#64748B] border-slate-200">
                        {alloc.gpuAssigned}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-[#64748B]">{alloc.vramAllocated}</TableCell>
                    <TableCell className="text-sm text-[#64748B]">{alloc.cpuCores > 0 ? `${alloc.cpuCores} cores` : '—'}</TableCell>
                    <TableCell className="text-sm text-[#64748B]">{alloc.ramAllocated}</TableCell>
                    <TableCell>{getModelStatus(alloc.status)}</TableCell>
                    <TableCell className="text-sm text-[#64748B]">{alloc.uptime}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Resource Alerts */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[#1E293B] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Resource Alerts ({alerts.filter((a) => !a.acknowledged).length} unacknowledged)
          </h3>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">
              {alerts.filter((a) => a.type === 'critical').length} Critical
            </Badge>
            <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
              {alerts.filter((a) => a.type === 'warning').length} Warning
            </Badge>
            <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
              {alerts.filter((a) => a.type === 'info').length} Info
            </Badge>
          </div>
        </div>
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {alerts.map((alert) => {
            const style = getAlertStyle(alert.type)
            return (
              <div
                key={alert.id}
                className={`flex items-start gap-3 p-3 rounded-xl border ${style.bg} ${
                  alert.acknowledged ? 'opacity-60' : ''
                }`}
              >
                <div className="mt-0.5">{style.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-[#1E293B]">{alert.title}</p>
                      {style.badge}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-[#64748B]">{alert.source}</span>
                      <span className="text-[10px] text-[#64748B]">{alert.timestamp}</span>
                    </div>
                  </div>
                  <p className="text-xs text-[#64748B] mt-0.5">{alert.description}</p>
                </div>
                {!alert.acknowledged && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-[10px] h-6 shrink-0 text-[#64748B] hover:text-[#1E293B] hover:bg-white/60"
                    onClick={() => {
                      setAlerts((prev) =>
                        prev.map((a) => (a.id === alert.id ? { ...a, acknowledged: true } : a))
                      )
                    }}
                  >
                    Acknowledge
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}