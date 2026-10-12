'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Database,
  Search,
  Plus,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Globe,
  HardDrive,
  Activity,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Zap,
  Shield,
  Server,
  Loader2,
  AlertCircle,
  Inbox,
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

interface Model {
  id: string
  modelId: string
  name: string
  provider: string
  costPer1kTokens: number
  maxContext: number
  capabilities: string[]
  status: string
  healthStatus: string
  endpoint: string | null
  deployedAt: string | null
  createdAt: string
}

interface ModelStats {
  models: number
  active: number
  local: number
  external: number
  healthy: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const statusColor = (status: string) => {
  switch (status) {
    case 'active': return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    case 'inactive': case 'standby': return 'bg-slate-100 text-slate-600 border-slate-200'
    case 'deprecated': return 'bg-red-100 text-red-700 border-red-200'
    case 'testing': return 'bg-amber-100 text-amber-700 border-amber-200'
    default: return 'bg-gray-100 text-gray-600 border-gray-200'
  }
}

const healthColor = (health: string) => {
  switch (health) {
    case 'healthy': return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    case 'degraded': return 'bg-amber-100 text-amber-700 border-amber-200'
    case 'down': return 'bg-red-100 text-red-700 border-red-200'
    default: return 'bg-slate-100 text-slate-500 border-slate-200'
  }
}

const healthIcon = (health: string) => {
  switch (health) {
    case 'healthy': return CheckCircle2
    case 'degraded': return AlertTriangle
    case 'down': return XCircle
    default: return Activity
  }
}

function formatContext(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`
  return String(n)
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ModelRegistryPanel() {
  const [models, setModels] = useState<Model[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [providerFilter, setProviderFilter] = useState('')
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [newModel, setNewModel] = useState({
    modelId: '',
    name: '',
    provider: '',
    costPer1kTokens: '',
    maxContext: '',
    endpoint: '',
  })

  const limit = 10
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null)

  const fetchData = useCallback(async () => {
    let cancelled = false
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/models')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (!cancelled) {
        setModels(Array.isArray(json.data) ? json.data : [])
      }
    } catch (err) {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : 'Failed to load models')
        setModels([])
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
  const stats: ModelStats | null = models.length > 0
    ? (() => {
        const total = models.length
        const active = models.filter((m) => m.status === 'active').length
        const local = models.filter((m) => m.provider === 'local').length
        const external = total - local
        const healthy = models.filter((m) => m.healthStatus === 'healthy').length
        return { models: total, active, local, external, healthy }
      })()
    : null

  // Collect unique providers from data
  const providers = [...new Set(models.map((m) => m.provider))].filter(Boolean)

  // Filter
  const filtered = models.filter((m) => {
    if (search && !m.name.toLowerCase().includes(search.toLowerCase()) && !m.provider.toLowerCase().includes(search.toLowerCase()) && !m.modelId.toLowerCase().includes(search.toLowerCase())) return false
    if (statusFilter && m.status !== statusFilter) return false
    if (providerFilter && m.provider !== providerFilter) return false
    return true
  })

  const totalPages = Math.ceil(filtered.length / limit)
  const paginated = filtered.slice((page - 1) * limit, page * limit)

  const handleRegisterModel = async () => {
    if (!newModel.modelId || !newModel.name) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: newModel.modelId,
          name: newModel.name,
          provider: newModel.provider || 'local',
          costPer1kTokens: parseFloat(newModel.costPer1kTokens) || 0,
          maxContext: parseInt(newModel.maxContext, 10) || 4096,
          capabilities: ['chat'],
          endpoint: newModel.endpoint || null,
        }),
      })
      if (res.ok) {
        await fetchData()
        setDialogOpen(false)
        setNewModel({ modelId: '', name: '', provider: '', costPer1kTokens: '', maxContext: '', endpoint: '' })
      } else {
        const err = await res.json().catch(() => ({}))
        setError(err.error || 'Failed to register model')
      }
    } catch {
      setError('Network error while registering model')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[#1E293B]">Model Registry</h2>
          <p className="text-sm text-[#64748B] mt-1">Manage and monitor AI model endpoints</p>
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
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-[#003ABC] text-white hover:bg-[#003ABC]/90">
                <Plus className="w-4 h-4 mr-2" />
                Register Model
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white border-[#E2E8F0] text-[#1E293B]">
              <DialogHeader>
                <DialogTitle>Register New Model</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[#64748B]">Model ID *</Label>
                    <Input
                      placeholder="e.g. gpt-4o"
                      value={newModel.modelId}
                      onChange={(e) => setNewModel({ ...newModel, modelId: e.target.value })}
                      className="bg-gray-50 border-[#E2E8F0] text-[#1E293B] placeholder:text-gray-400 font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[#64748B]">Display Name *</Label>
                    <Input
                      placeholder="e.g. GPT-4o"
                      value={newModel.name}
                      onChange={(e) => setNewModel({ ...newModel, name: e.target.value })}
                      className="bg-gray-50 border-[#E2E8F0] text-[#1E293B] placeholder:text-gray-400"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[#64748B]">Provider</Label>
                  <Input
                    placeholder="e.g. OpenAI, Anthropic, local"
                    value={newModel.provider}
                    onChange={(e) => setNewModel({ ...newModel, provider: e.target.value })}
                    className="bg-gray-50 border-[#E2E8F0] text-[#1E293B] placeholder:text-gray-400"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[#64748B]">Cost per 1K tokens ($)</Label>
                    <Input
                      placeholder="0.005"
                      type="number"
                      step="0.001"
                      value={newModel.costPer1kTokens}
                      onChange={(e) => setNewModel({ ...newModel, costPer1kTokens: e.target.value })}
                      className="bg-gray-50 border-[#E2E8F0] text-[#1E293B] placeholder:text-gray-400"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[#64748B]">Max Context (tokens)</Label>
                    <Input
                      placeholder="e.g. 128000"
                      type="number"
                      value={newModel.maxContext}
                      onChange={(e) => setNewModel({ ...newModel, maxContext: e.target.value })}
                      className="bg-gray-50 border-[#E2E8F0] text-[#1E293B] placeholder:text-gray-400"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[#64748B]">Endpoint URL (optional)</Label>
                  <Input
                    placeholder="https://api.your-llm-provider.com/v1"
                    value={newModel.endpoint}
                    onChange={(e) => setNewModel({ ...newModel, endpoint: e.target.value })}
                    className="bg-gray-50 border-[#E2E8F0] text-[#1E293B] placeholder:text-gray-400 font-mono text-xs"
                  />
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost" className="text-[#64748B] hover:text-[#1E293B]">Cancel</Button>
                </DialogClose>
                <Button
                  onClick={handleRegisterModel}
                  disabled={!newModel.modelId || !newModel.name || submitting}
                  className="bg-[#003ABC] text-white hover:bg-[#003ABC]/90"
                >
                  {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Database className="w-4 h-4 mr-2" />}
                  Register
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
            { label: 'Models', value: stats.models, icon: Database, color: 'text-blue-500', bg: 'bg-blue-50' },
            { label: 'Active', value: stats.active, icon: Zap, color: 'text-emerald-500', bg: 'bg-emerald-50' },
            { label: 'Local', value: stats.local, icon: HardDrive, color: 'text-violet-500', bg: 'bg-violet-50' },
            { label: 'External', value: stats.external, icon: Globe, color: 'text-amber-500', bg: 'bg-amber-50' },
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
          <p className="text-sm text-[#64748B] font-medium">No models registered yet</p>
          <p className="text-xs text-[#64748B] mt-1">Register your first model to see stats here</p>
        </div>
      ) : null}

      {/* Filters */}
      {!loading && models.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
            <Input
              placeholder="Search models, providers, or IDs..."
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
              <SelectItem value="standby" className="text-[#1E293B]">Standby</SelectItem>
              <SelectItem value="testing" className="text-[#1E293B]">Testing</SelectItem>
            </SelectContent>
          </Select>
          <Select value={providerFilter || '__all__'} onValueChange={(v) => { setProviderFilter(v === '__all__' ? '' : v); setPage(1) }}>
            <SelectTrigger className="w-[180px] bg-gray-50 border-[#E2E8F0] text-[#1E293B] text-xs">
              <SelectValue placeholder="All Providers" />
            </SelectTrigger>
            <SelectContent className="bg-white border-[#E2E8F0] max-h-64">
              <SelectItem value="__all__" className="text-[#1E293B]">All Providers</SelectItem>
              {providers.map((p) => (
                <SelectItem key={p} value={p} className="text-[#1E293B]">{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <Skeleton className="h-96 rounded-lg bg-gray-50" />
      ) : models.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] flex flex-col items-center justify-center py-20 text-center">
          <Shield className="w-12 h-12 text-[#64748B] mb-3" />
          <p className="text-sm text-[#64748B] font-medium">No data yet</p>
          <p className="text-xs text-[#64748B] mt-1">Models you register will appear here</p>
          <Button
            size="sm"
            className="mt-4 bg-[#003ABC] text-white hover:bg-[#003ABC]/90"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            Register First Model
          </Button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
          <div className="max-h-[480px] overflow-y-auto custom-scrollbar">
            <Table className="text-sm">
              <TableHeader>
                <TableRow className="bg-[#F8FAFC] hover:bg-[#F8FAFC] border-[#E2E8F0]">
                  <TableHead className="text-[#64748B]">Name</TableHead>
                  <TableHead className="text-[#64748B] hidden md:table-cell">Provider</TableHead>
                  <TableHead className="text-[#64748B] hidden sm:table-cell">Cost/1K</TableHead>
                  <TableHead className="text-[#64748B] hidden lg:table-cell">Context</TableHead>
                  <TableHead className="text-[#64748B]">Status</TableHead>
                  <TableHead className="text-[#64748B]">Health</TableHead>
                  <TableHead className="text-[#64748B] hidden lg:table-cell">Capabilities</TableHead>
                  <TableHead className="text-[#64748B] hidden md:table-cell">Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-[#64748B] py-12">
                      No models match your filters
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((model) => {
                    const HealthIcon = healthIcon(model.healthStatus)
                    const isLocal = model.provider === 'local'
                    return (
                      <TableRow key={model.id} className="border-[#E2E8F0] hover:bg-gray-50">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Server className="w-4 h-4 text-[#64748B] flex-shrink-0" />
                            <div>
                              <p className="text-[#1E293B] font-medium">{model.name}</p>
                              <p className="text-xs text-[#64748B] font-mono">{model.modelId}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-[#64748B] hidden md:table-cell">{model.provider}</TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <span className="text-[#1E293B] font-mono text-xs">
                            {model.costPer1kTokens === 0 ? (
                              <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-200">Free</Badge>
                            ) : (
                              `$${model.costPer1kTokens.toFixed(4)}`
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-[#64748B] font-mono text-xs hidden lg:table-cell">
                          {formatContext(model.maxContext)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] py-0 ${statusColor(model.status)}`}>
                            {model.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] py-0 ${healthColor(model.healthStatus)}`}>
                            <HealthIcon className={`w-3 h-3 mr-1 ${model.healthStatus === 'down' ? 'animate-pulse' : ''}`} />
                            {model.healthStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <div className="flex flex-wrap gap-1 max-w-[180px]">
                            {Array.isArray(model.capabilities) && model.capabilities.slice(0, 3).map((cap) => (
                              <Badge key={cap} variant="outline" className="text-[9px] py-0 bg-gray-50 text-[#64748B] border-[#E2E8F0]">
                                {cap}
                              </Badge>
                            ))}
                            {Array.isArray(model.capabilities) && model.capabilities.length > 3 && (
                              <span className="text-[10px] text-[#64748B]">+{model.capabilities.length - 3}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge variant="outline" className={`text-[10px] py-0 ${isLocal ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                            {isLocal ? <HardDrive className="w-3 h-3 mr-1" /> : <Globe className="w-3 h-3 mr-1" />}
                            {isLocal ? 'Local' : 'External'}
                          </Badge>
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
            Page {page} of {totalPages} &middot; {filtered.length} models
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