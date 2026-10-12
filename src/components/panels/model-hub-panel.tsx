'use client'

import { useEffect, useState, useMemo } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  Search,
  Download,
  Trash2,
  RefreshCw,
  RotateCcw,
  Cpu,
  Thermometer,
  HardDrive,
  Zap,
  Activity,
  LayoutGrid,
  BarChart3,
  GitBranch,
  Brain,
  CheckCircle2,
  Circle,
  Loader2,
  Server,
  MemoryStick,
  Gauge,
  Clock,
  TrendingUp,
  Network,
  ChevronRight,
  AlertCircle,
  Package,
  ExternalLink,
  Globe,
} from 'lucide-react'

// ─── Open Source Models Types ───────────────────────────────────────────────

interface OpenSourceModel {
  id: string
  name: string
  family: string
  developer: string
  license: string
  parameterCount: string
  contextLength: number
  capabilities: string[]
  description: string
  huggingFaceUrl: string
  released: string
}

interface OpenSourceData {
  models: OpenSourceModel[]
  total: number
  page: number
  limit: number
  families: string[]
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Model {
  id: string
  name: string
  family: string
  category: string
  parameters: string
  contextWindow: string
  status: 'installed' | 'available' | 'installing'
  installedVersion: string | null
  latestVersion: string
  sizeGB: number
  capabilities: string[]
  description: string
}

interface GpuEntry {
  id: number
  name: string
  utilization: number
  memoryUsed: number
  memoryTotal: number
  temperature: number
  powerW: number
  maxPowerW: number
  models: string[]
}

interface BenchmarkEntry {
  modelId: string
  modelName: string
  latencyP50: number
  latencyP99: number
  throughput: number
  qualityScore: number
  lastRun: string
}

interface LoadBalanceRoute {
  route: string
  primaryModel: string
  fallbackChain: string[]
  weights: Record<string, number>
  activeConnections: number
  totalRequests: number
  errorRate: number
}

interface CapabilityModel {
  model: string
  chat: boolean
  code: boolean
  vision: boolean
  imageGen: boolean
  audio: boolean
  embeddings: boolean
}

interface ModelHubData {
  models: Model[]
  categories: string[]
  stats: {
    totalModels: number
    installedModels: number
    availableModels: number
    installingModels: number
    totalDiskUsage: number
    gpuCount: number
    totalGpuMemory: number
    usedGpuMemory: number
  }
  gpu: GpuEntry[]
  benchmarks: BenchmarkEntry[]
  loadBalancing: LoadBalanceRoute[]
  capabilityMatrix: CapabilityModel[]
}

// No fallback data — panel shows empty state when API returns no data.

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(status: string) {
  switch (status) {
    case 'installed': return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    case 'available': return 'bg-slate-100 text-slate-600 border-slate-200'
    case 'installing': return 'bg-amber-100 text-amber-700 border-amber-200'
    default: return 'bg-slate-100 text-slate-600 border-slate-200'
  }
}

function statusIcon(status: string) {
  switch (status) {
    case 'installed': return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
    case 'available': return <Circle className="h-3.5 w-3.5 text-slate-400" />
    case 'installing': return <Loader2 className="h-3.5 w-3.5 text-amber-500 animate-spin" />
    default: return <Circle className="h-3.5 w-3.5 text-slate-400" />
  }
}

function categoryIcon(category: string) {
  switch (category) {
    case 'LLM': return <Brain className="h-4 w-4" />
    case 'Coding': return <Cpu className="h-4 w-4" />
    case 'Vision': return <LayoutGrid className="h-4 w-4" />
    case 'Image': return <Zap className="h-4 w-4" />
    case 'Voice': return <Activity className="h-4 w-4" />
    case 'Embedding': return <HardDrive className="h-4 w-4" />
    default: return <Package className="h-4 w-4" />
  }
}

function categoryColor(category: string) {
  switch (category) {
    case 'LLM': return 'bg-blue-50 text-blue-700 border-blue-200'
    case 'Coding': return 'bg-violet-50 text-violet-700 border-violet-200'
    case 'Vision': return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'Image': return 'bg-pink-50 text-pink-700 border-pink-200'
    case 'Voice': return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'Embedding': return 'bg-orange-50 text-orange-700 border-orange-200'
    default: return 'bg-slate-50 text-slate-700 border-slate-200'
  }
}

function temperatureColor(temp: number) {
  if (temp >= 75) return 'text-red-600'
  if (temp >= 60) return 'text-amber-600'
  return 'text-emerald-600'
}

function qualityBadge(score: number) {
  if (score >= 93) return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Excellent</Badge>
  if (score >= 85) return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Good</Badge>
  if (score >= 75) return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Fair</Badge>
  return <Badge className="bg-red-100 text-red-700 border-red-200">Low</Badge>
}

// ─── Model Card ───────────────────────────────────────────────────────────────

function ModelCard({ model, onAction }: { model: Model; onAction: (id: string, action: string) => void }) {
  const hasUpdate = model.installedVersion && model.installedVersion !== model.latestVersion

  return (
    <Card className="group hover:shadow-md transition-shadow border-slate-200 bg-white">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-sm text-slate-900 truncate">{model.name}</h3>
              {hasUpdate && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-orange-300 text-orange-600 bg-orange-50 shrink-0">
                  Update
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${categoryColor(model.category)}`}>
                {model.category}
              </Badge>
              <span className="text-slate-300">·</span>
              <span>{model.family}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {statusIcon(model.status)}
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusColor(model.status)}`}>
              {model.status}
            </Badge>
          </div>
        </div>

        <p className="text-xs text-slate-500 mb-3 line-clamp-2">{model.description}</p>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <Cpu className="h-3 w-3 text-slate-400" />
            <span>{model.parameters}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <MemoryStick className="h-3 w-3 text-slate-400" />
            <span>{model.contextWindow}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <HardDrive className="h-3 w-3 text-slate-400" />
            <span>{model.sizeGB} GB</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <Package className="h-3 w-3 text-slate-400" />
            <span>v{model.installedVersion || model.latestVersion}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1 mb-3">
          {model.capabilities.map(cap => (
            <Badge key={cap} variant="secondary" className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-600">
              {cap}
            </Badge>
          ))}
        </div>

        <div className="flex gap-1.5">
          {model.status === 'available' && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs flex-1 border-slate-300 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300"
              onClick={() => onAction(model.id, 'install')}
            >
              <Download className="h-3 w-3 mr-1" />
              Install
            </Button>
          )}
          {model.status === 'installed' && (
            <>
              {hasUpdate && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-slate-300 hover:bg-orange-50 hover:text-orange-700 hover:border-orange-300"
                  onClick={() => onAction(model.id, 'update')}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Update
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-slate-300 hover:bg-slate-100"
                onClick={() => onAction(model.id, 'rollback')}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Rollback
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-slate-300 hover:bg-red-50 hover:text-red-600 hover:border-red-300"
                onClick={() => onAction(model.id, 'remove')}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </>
          )}
          {model.status === 'installing' && (
            <div className="flex items-center gap-2 flex-1 h-7 px-3">
              <Progress value={65} className="h-1.5 flex-1" />
              <span className="text-[10px] text-amber-600">65%</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── GPU Card ─────────────────────────────────────────────────────────────────

function GpuCard({ gpu }: { gpu: GpuEntry }) {
  const memPercent = Math.round((gpu.memoryUsed / gpu.memoryTotal) * 100)
  const powerPercent = Math.round((gpu.powerW / gpu.maxPowerW) * 100)

  return (
    <Card className="border-slate-200 bg-white">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-slate-900 flex items-center justify-center">
              <Server className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">GPU {gpu.id}</p>
              <p className="text-[11px] text-slate-500">{gpu.name}</p>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
            Active
          </Badge>
        </div>

        {/* Utilization */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-slate-500">Utilization</span>
            <span className="text-[11px] font-medium text-slate-700">{gpu.utilization}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${gpu.utilization > 80 ? 'bg-red-500' : gpu.utilization > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${gpu.utilization}%` }}
            />
          </div>
        </div>

        {/* Memory */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-slate-500">Memory</span>
            <span className="text-[11px] font-medium text-slate-700">{gpu.memoryUsed}/{gpu.memoryTotal} GB</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${memPercent > 85 ? 'bg-red-500' : memPercent > 60 ? 'bg-blue-500' : 'bg-cyan-500'}`}
              style={{ width: `${memPercent}%` }}
            />
          </div>
        </div>

        {/* Temperature & Power */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="flex items-center gap-1.5">
            <Thermometer className={`h-3.5 w-3.5 ${temperatureColor(gpu.temperature)}`} />
            <span className={`text-xs font-medium ${temperatureColor(gpu.temperature)}`}>{gpu.temperature}°C</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs font-medium text-slate-600">{gpu.powerW}/{gpu.maxPowerW}W</span>
          </div>
        </div>

        {/* Power bar */}
        <div className="mb-3">
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-orange-400 transition-all"
              style={{ width: `${powerPercent}%` }}
            />
          </div>
        </div>

        {/* Allocated models */}
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">Allocated Models</p>
          <div className="flex flex-wrap gap-1">
            {gpu.models.map(m => (
              <Badge key={m} variant="secondary" className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-600">
                {m}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ModelHubPanel() {
  const [data, setData] = useState<ModelHubData | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [benchmarking, setBenchmarking] = useState(false)

  // Open Source Models state
  const [osData, setOsData] = useState<OpenSourceData | null>(null)
  const [osLoading, setOsLoading] = useState(false)
  const [osSearch, setOsSearch] = useState('')
  const [osFamilyFilter, setOsFamilyFilter] = useState<string>('all')

  const [error, setError] = useState<string | null>(null)

  // Fetch open source models when the tab is activated
  const fetchOpenSourceModels = (family?: string, search?: string) => {
    setOsLoading(true)
    const params = new URLSearchParams()
    if (family && family !== 'all') params.set('family', family)
    if (search) params.set('search', search)
    fetch(`/api/open-source-models?${params.toString()}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(json => {
        if (json.success && json.data) {
          setOsData(json.data)
        }
      })
      .catch(() => {
        // Silent fail — user can retry by changing filter
      })
      .finally(() => setOsLoading(false))
  }

  useEffect(() => {
    fetch('/api/model-hub')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(json => {
        if (json.models) {
          setData(json)
        } else {
          setData(null)
        }
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to load model data')
        setData(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const handleModelAction = (modelId: string, action: string) => {
    if (!data) return
    setData(prev => {
      if (!prev) return prev
      return {
        ...prev,
        models: prev.models.map(m => {
          if (m.id !== modelId) return m
          if (action === 'install') return { ...m, status: 'installing' as const }
          if (action === 'remove') return { ...m, status: 'available' as const, installedVersion: null }
          if (action === 'update') return { ...m, installedVersion: m.latestVersion }
          if (action === 'rollback') return { ...m }
          return m
        }),
      }
    })
  }

  const handleRunBenchmark = () => {
    setBenchmarking(true)
    setTimeout(() => setBenchmarking(false), 2500)
  }

  // Filtered models for catalog
  const filteredModels = useMemo(() => {
    if (!data) return []
    return data.models.filter(m => {
      if (categoryFilter !== 'all' && m.category !== categoryFilter) return false
      if (statusFilter !== 'all' && m.status !== statusFilter) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return m.name.toLowerCase().includes(q) || m.family.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)
      }
      return true
    })
  }, [data, categoryFilter, statusFilter, searchQuery])

  // Group models by category
  const modelsByCategory = useMemo(() => {
    const groups: Record<string, Model[]> = {}
    filteredModels.forEach(m => {
      if (!groups[m.category]) groups[m.category] = []
      groups[m.category].push(m)
    })
    return groups
  }, [filteredModels])

  const categoryOrder = ['LLM', 'Coding', 'Vision', 'Image', 'Voice', 'Embedding']

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-lg" />)}
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[400px] gap-3">
        <AlertCircle className="h-10 w-10 text-[#94A3B8]" />
        <p className="text-sm font-medium text-[#64748B]">{error || 'No model data available'}</p>
        <p className="text-xs text-[#94A3B8]">Models will appear here once configured via the Model Router or Model Hub API.</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => window.location.reload()}>Retry</Button>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">AI Model Hub</h2>
          <p className="text-sm text-slate-500">Manage, monitor, and benchmark your AI model fleet</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="border-slate-300"
          onClick={() => window.location.reload()}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <Package className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-[11px] text-slate-500 uppercase tracking-wider">Total Models</p>
              <p className="text-lg font-bold text-slate-900">{data.stats.totalModels}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-[11px] text-slate-500 uppercase tracking-wider">Installed</p>
              <p className="text-lg font-bold text-emerald-700">{data.stats.installedModels}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
              <HardDrive className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-[11px] text-slate-500 uppercase tracking-wider">Disk Usage</p>
              <p className="text-lg font-bold text-slate-900">{data.stats.totalDiskUsage.toLocaleString()} GB</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
              <Server className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <p className="text-[11px] text-slate-500 uppercase tracking-wider">GPU Memory</p>
              <p className="text-lg font-bold text-slate-900">{data.stats.usedGpuMemory}/{data.stats.totalGpuMemory} GB</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="catalog" className="space-y-4">
        <TabsList className="bg-slate-100 border border-slate-200">
          <TabsTrigger value="catalog" className="text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <LayoutGrid className="h-3.5 w-3.5 mr-1.5" />
            Model Catalog
          </TabsTrigger>
          <TabsTrigger value="gpu" className="text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Cpu className="h-3.5 w-3.5 mr-1.5" />
            GPU Monitoring
          </TabsTrigger>
          <TabsTrigger value="benchmark" className="text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
            Benchmarking
          </TabsTrigger>
          <TabsTrigger value="loadbalance" className="text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <GitBranch className="h-3.5 w-3.5 mr-1.5" />
            Load Balancing
          </TabsTrigger>
          <TabsTrigger value="capabilities" className="text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Brain className="h-3.5 w-3.5 mr-1.5" />
            Capabilities
          </TabsTrigger>
          <TabsTrigger value="opensource" className="text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Globe className="h-3.5 w-3.5 mr-1.5" />
            Open Source
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB 1: Model Catalog                                              */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="catalog" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search models by name, family, or description..."
                className="pl-9 h-9 border-slate-200 bg-white"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-9 w-full sm:w-44 border-slate-200 bg-white">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categoryOrder.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-full sm:w-40 border-slate-200 bg-white">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="installed">Installed</SelectItem>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="installing">Installing</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Showing {filteredModels.length} of {data.models.length} models
            </p>
          </div>

          {/* Models grouped by category */}
          {categoryOrder.map(cat => {
            const models = modelsByCategory[cat]
            if (!models || models.length === 0) return null
            return (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`h-6 w-6 rounded-md flex items-center justify-center ${categoryColor(cat)}`}>
                    {categoryIcon(cat)}
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900">{cat} Models</h3>
                  <Badge variant="secondary" className="text-[10px] bg-slate-100 text-slate-500">{models.length}</Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
                  {models.map(m => (
                    <ModelCard key={m.id} model={m} onAction={handleModelAction} />
                  ))}
                </div>
              </div>
            )
          })}

          {filteredModels.length === 0 && (
            <Card className="border-slate-200 bg-white">
              <CardContent className="p-12 text-center">
                <Search className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-600">No models match your filters</p>
                <p className="text-xs text-slate-400 mt-1">Try adjusting your search or filter criteria</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB 2: GPU Monitoring                                              */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="gpu" className="space-y-4">
          {/* GPU Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-slate-200 bg-white">
              <CardContent className="p-4">
                <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-1">Avg Utilization</p>
                <p className="text-2xl font-bold text-slate-900">
                  {data.gpu.length > 0
                    ? Math.round(data.gpu.reduce((s, g) => s + g.utilization, 0) / data.gpu.length)
                    : 0}%
                </p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-white">
              <CardContent className="p-4">
                <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-1">Avg Temperature</p>
                <p className={`text-2xl font-bold ${data.gpu.length > 0 ? temperatureColor(Math.round(data.gpu.reduce((s, g) => s + g.temperature, 0) / data.gpu.length)) : 'text-slate-900'}`}>
                  {data.gpu.length > 0
                    ? Math.round(data.gpu.reduce((s, g) => s + g.temperature, 0) / data.gpu.length)
                    : 0}°C
                </p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-white">
              <CardContent className="p-4">
                <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-1">Total Power</p>
                <p className="text-2xl font-bold text-slate-900">
                  {data.gpu.reduce((s, g) => s + g.powerW, 0).toLocaleString()}W
                </p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-white">
              <CardContent className="p-4">
                <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-1">Memory Used</p>
                <p className="text-2xl font-bold text-slate-900">
                  {data.stats.usedGpuMemory}/{data.stats.totalGpuMemory} GB
                </p>
                <Progress value={(data.stats.usedGpuMemory / data.stats.totalGpuMemory) * 100} className="h-1.5 mt-1.5" />
              </CardContent>
            </Card>
          </div>

          {/* GPU Utilization Bar Chart */}
          {data.gpu.length > 0 && (
            <Card className="border-slate-200 bg-white">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-slate-900">GPU Utilization Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.gpu.map(gpu => (
                    <div key={gpu.id} className="flex items-center gap-3">
                      <span className="text-xs font-medium text-slate-600 w-12 shrink-0">GPU {gpu.id}</span>
                      <div className="flex-1 h-6 bg-slate-100 rounded-md overflow-hidden relative">
                        <div
                          className={`h-full rounded-md transition-all ${gpu.utilization > 80 ? 'bg-red-500' : gpu.utilization > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${gpu.utilization}%` }}
                        />
                        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-medium text-slate-700">
                          {gpu.name.split(' ').slice(1).join(' ')} — {gpu.utilization}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* GPU Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {data.gpu.map(gpu => (
              <GpuCard key={gpu.id} gpu={gpu} />
            ))}
          </div>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB 3: Benchmarking                                               */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="benchmark" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">
              Performance benchmarks for installed models. Last run: {data.benchmarks.length > 0 ? new Date(data.benchmarks[0].lastRun).toLocaleDateString() : 'N/A'}
            </p>
            <Button
              size="sm"
              onClick={handleRunBenchmark}
              disabled={benchmarking}
              className="bg-slate-900 hover:bg-slate-800"
            >
              {benchmarking ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Running...</>
              ) : (
                <><BarChart3 className="h-3.5 w-3.5 mr-1.5" /> Run Benchmarks</>
              )}
            </Button>
          </div>

          <Card className="border-slate-200 bg-white">
            <CardContent className="p-0">
              <div className="max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 hover:bg-slate-50">
                      <TableHead className="text-xs font-semibold text-slate-600">Model</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-600 text-center">
                        <div className="flex items-center justify-center gap-1"><Clock className="h-3 w-3" /> P50 Latency</div>
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-slate-600 text-center">
                        <div className="flex items-center justify-center gap-1"><Clock className="h-3 w-3" /> P99 Latency</div>
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-slate-600 text-center">
                        <div className="flex items-center justify-center gap-1"><TrendingUp className="h-3 w-3" /> Throughput</div>
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-slate-600 text-center">
                        <div className="flex items-center justify-center gap-1"><Gauge className="h-3 w-3" /> Quality</div>
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-slate-600 text-center">Rating</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.benchmarks.map(b => (
                      <TableRow key={b.modelId} className="hover:bg-slate-50/50">
                        <TableCell className="font-medium text-sm text-slate-900">{b.modelName}</TableCell>
                        <TableCell className="text-center text-sm text-slate-600">{b.latencyP50}ms</TableCell>
                        <TableCell className="text-center text-sm text-slate-600">{b.latencyP99}ms</TableCell>
                        <TableCell className="text-center text-sm text-slate-600">{b.throughput} tok/s</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Progress value={b.qualityScore} className="h-2 w-16" />
                            <span className="text-sm font-medium text-slate-700">{b.qualityScore}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{qualityBadge(b.qualityScore)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB 4: Load Balancing                                             */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="loadbalance" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-slate-200 bg-white">
              <CardContent className="p-4">
                <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-1">Active Routes</p>
                <p className="text-2xl font-bold text-slate-900">{data.loadBalancing.length}</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-white">
              <CardContent className="p-4">
                <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-1">Total Connections</p>
                <p className="text-2xl font-bold text-slate-900">
                  {data.loadBalancing.reduce((s, r) => s + r.activeConnections, 0).toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-white">
              <CardContent className="p-4">
                <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-1">Total Requests</p>
                <p className="text-2xl font-bold text-slate-900">
                  {(data.loadBalancing.reduce((s, r) => s + r.totalRequests, 0) / 1000).toFixed(0)}K
                </p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-white">
              <CardContent className="p-4">
                <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-1">Avg Error Rate</p>
                <p className="text-2xl font-bold text-emerald-600">
                  {(data.loadBalancing.reduce((s, r) => s + r.errorRate, 0) / data.loadBalancing.length * 100).toFixed(2)}%
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            {data.loadBalancing.map(route => {
              const totalWeight = Object.values(route.weights).reduce((s, w) => s + w, 0)

              return (
                <Card key={route.route} className="border-slate-200 bg-white">
                  <CardContent className="p-4">
                    <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                      {/* Route Info */}
                      <div className="lg:w-64 shrink-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Network className="h-4 w-4 text-blue-600" />
                          <h4 className="text-sm font-semibold text-slate-900 truncate">{route.route}</h4>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <ChevronRight className="h-3 w-3" />
                            <span>Primary: <span className="font-medium text-slate-700">{route.primaryModel}</span></span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <Activity className="h-3 w-3" />
                            <span>{route.activeConnections} connections</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <TrendingUp className="h-3 w-3" />
                            <span>{route.totalRequests.toLocaleString()} requests</span>
                          </div>
                        </div>
                      </div>

                      {/* Weight Distribution */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">Weight Distribution</p>
                        <div className="h-6 rounded-md overflow-hidden flex bg-slate-100">
                          {Object.entries(route.weights).map(([model, weight], idx) => {
                            const colors = ['bg-blue-500', 'bg-violet-500', 'bg-amber-500', 'bg-emerald-500', 'bg-pink-500', 'bg-cyan-500']
                            return (
                              <div
                                key={model}
                                className={`${colors[idx % colors.length]} transition-all relative group`}
                                style={{ width: `${(weight / totalWeight) * 100}%` }}
                                title={`${model}: ${weight}%`}
                              />
                            )
                          })}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                          {Object.entries(route.weights).map(([model, weight], idx) => {
                            const colors = ['bg-blue-500', 'bg-violet-500', 'bg-amber-500', 'bg-emerald-500', 'bg-pink-500', 'bg-cyan-500']
                            return (
                              <div key={model} className="flex items-center gap-1.5 text-[11px]">
                                <div className={`h-2 w-2 rounded-full ${colors[idx % colors.length]}`} />
                                <span className="text-slate-600">{model}</span>
                                <span className="text-slate-400">({weight}%)</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Fallback Chain */}
                      <div className="lg:w-56 shrink-0">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">Fallback Chain</p>
                        <div className="space-y-1">
                          {route.fallbackChain.map((model, idx) => (
                            <div key={model} className="flex items-center gap-2">
                              <div className="h-5 w-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-medium text-slate-500">
                                {idx + 1}
                              </div>
                              <span className="text-xs text-slate-700">{model}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB 5: Capability Registry                                        */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="capabilities" className="space-y-4">
          <p className="text-sm text-slate-600">
            Matrix view of model capabilities across the fleet. Checkmarks indicate support for each capability type.
          </p>

          <Card className="border-slate-200 bg-white">
            <CardContent className="p-0">
              <div className="max-h-[600px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 hover:bg-slate-50">
                      <TableHead className="text-xs font-semibold text-slate-600 sticky left-0 bg-slate-50 z-10 min-w-[160px]">Model</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-600 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <Brain className="h-3.5 w-3.5" />
                          <span>Chat</span>
                        </div>
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-slate-600 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <Cpu className="h-3.5 w-3.5" />
                          <span>Code</span>
                        </div>
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-slate-600 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <LayoutGrid className="h-3.5 w-3.5" />
                          <span>Vision</span>
                        </div>
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-slate-600 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <Zap className="h-3.5 w-3.5" />
                          <span>Image Gen</span>
                        </div>
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-slate-600 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <Activity className="h-3.5 w-3.5" />
                          <span>Audio</span>
                        </div>
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-slate-600 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <HardDrive className="h-3.5 w-3.5" />
                          <span>Embeddings</span>
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.capabilityMatrix.map((row, idx) => {
                      const capCount = [row.chat, row.code, row.vision, row.imageGen, row.audio, row.embeddings].filter(Boolean).length
                      return (
                        <TableRow key={idx} className="hover:bg-slate-50/50">
                          <TableCell className="font-medium text-sm text-slate-900 sticky left-0 bg-white z-10">
                            {row.model}
                          </TableCell>
                          <TableCell className="text-center">
                            {row.chat ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" /> : <Circle className="h-4 w-4 text-slate-200 mx-auto" />}
                          </TableCell>
                          <TableCell className="text-center">
                            {row.code ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" /> : <Circle className="h-4 w-4 text-slate-200 mx-auto" />}
                          </TableCell>
                          <TableCell className="text-center">
                            {row.vision ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" /> : <Circle className="h-4 w-4 text-slate-200 mx-auto" />}
                          </TableCell>
                          <TableCell className="text-center">
                            {row.imageGen ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" /> : <Circle className="h-4 w-4 text-slate-200 mx-auto" />}
                          </TableCell>
                          <TableCell className="text-center">
                            {row.audio ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" /> : <Circle className="h-4 w-4 text-slate-200 mx-auto" />}
                          </TableCell>
                          <TableCell className="text-center">
                            {row.embeddings ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" /> : <Circle className="h-4 w-4 text-slate-200 mx-auto" />}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Capability Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Chat', icon: Brain, count: data.capabilityMatrix.filter(r => r.chat).length },
              { label: 'Code', icon: Cpu, count: data.capabilityMatrix.filter(r => r.code).length },
              { label: 'Vision', icon: LayoutGrid, count: data.capabilityMatrix.filter(r => r.vision).length },
              { label: 'Image Gen', icon: Zap, count: data.capabilityMatrix.filter(r => r.imageGen).length },
              { label: 'Audio', icon: Activity, count: data.capabilityMatrix.filter(r => r.audio).length },
              { label: 'Embeddings', icon: HardDrive, count: data.capabilityMatrix.filter(r => r.embeddings).length },
            ].map(cap => (
              <Card key={cap.label} className="border-slate-200 bg-white">
                <CardContent className="p-3 flex flex-col items-center text-center">
                  <cap.icon className="h-5 w-5 text-slate-400 mb-1.5" />
                  <p className="text-lg font-bold text-slate-900">{cap.count}</p>
                  <p className="text-[11px] text-slate-500">{cap.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="opensource" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search models by name, developer, or description..."
                className="pl-9 h-9 border-slate-200 bg-white"
                value={osSearch}
                onChange={e => {
                  setOsSearch(e.target.value)
                  fetchOpenSourceModels(osFamilyFilter, e.target.value)
                }}
              />
            </div>
            <Select value={osFamilyFilter} onValueChange={v => {
              setOsFamilyFilter(v)
              fetchOpenSourceModels(v, osSearch)
            }}>
              <SelectTrigger className="h-9 w-48 border-slate-200 bg-white">
                <SelectValue placeholder="Family" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Families</SelectItem>
                {(osData?.families || []).map(f => (
                  <SelectItem key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Model count */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              {osLoading ? 'Loading...' : osData
                ? `Showing ${osData.models.length} of ${osData.total} models`
                : 'Enter the tab or change filters to load models'}
            </p>
          </div>

          {/* Table */}
          {osLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : osData && osData.models.length > 0 ? (
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    <TableHead className="text-[11px] font-semibold text-slate-600">Model</TableHead>
                    <TableHead className="text-[11px] font-semibold text-slate-600">Family</TableHead>
                    <TableHead className="text-[11px] font-semibold text-slate-600">Developer</TableHead>
                    <TableHead className="text-[11px] font-semibold text-slate-600">Params</TableHead>
                    <TableHead className="text-[11px] font-semibold text-slate-600">Context</TableHead>
                    <TableHead className="text-[11px] font-semibold text-slate-600">Capabilities</TableHead>
                    <TableHead className="text-[11px] font-semibold text-slate-600">License</TableHead>
                    <TableHead className="text-[11px] font-semibold text-slate-600 w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {osData.models.map(model => (
                    <TableRow key={model.id} className="hover:bg-slate-50/50">
                      <TableCell className="py-3">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{model.name}</p>
                          <p className="text-[11px] text-slate-500 truncate max-w-48">{model.description}</p>
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-slate-200 text-slate-600">
                          {model.family}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 text-xs text-slate-600">{model.developer}</TableCell>
                      <TableCell className="py-3 text-xs text-slate-600 font-medium">{model.parameterCount}</TableCell>
                      <TableCell className="py-3 text-xs text-slate-600">{model.contextLength >= 1_000_000 ? `${model.contextLength / 1_000_000}M` : `${(model.contextLength / 1000).toFixed(0)}K`}</TableCell>
                      <TableCell className="py-3">
                        <div className="flex flex-wrap gap-1">
                          {model.capabilities.map(cap => (
                            <Badge key={cap} variant="secondary" className="text-[9px] px-1.5 py-0 bg-slate-100 text-slate-600">
                              {cap}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${model.license === 'MIT' || model.license === 'Apache 2.0' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                          {model.license}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3">
                        <a
                          href={model.huggingFaceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-slate-100 transition-colors"
                          aria-label={`View ${model.name} on HuggingFace`}
                        >
                          <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : osData && osData.models.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <Search className="h-8 w-8 text-slate-300" />
              <p className="text-sm text-slate-500">No models match your filters</p>
              <p className="text-xs text-slate-400">Try adjusting your search or family filter</p>
            </div>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  )
}