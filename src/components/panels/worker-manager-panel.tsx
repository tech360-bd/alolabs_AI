'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Cpu,
  Play,
  Square,
  RotateCcw,
  Activity,
  MemoryStick,
  Loader2,
  Settings,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'

interface Worker {
  id: string
  name: string
  type: string
  status: string
  currentJob: string | null
  completedCount: number
  uptime: number
  memory: number
  createdAt: string
  updatedAt: string
}

interface PoolConfig {
  minWorkers: number
  maxWorkers: number
  autoScale: boolean
}

const typeColors: Record<string, string> = {
  cpu: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  gpu: 'bg-orange-100 text-orange-700 border-orange-200',
  io: 'bg-purple-100 text-purple-700 border-purple-200',
}

const statusConfig: Record<string, { color: string; dotColor: string; label: string }> = {
  running: { color: 'text-emerald-600', dotColor: 'bg-emerald-500', label: 'Running' },
  stopped: { color: 'text-[#64748B]', dotColor: 'bg-[#CBD5E1]', label: 'Stopped' },
  restarting: { color: 'text-amber-600', dotColor: 'bg-amber-500', label: 'Restarting' },
  idle: { color: 'text-[#003ABC]', dotColor: 'bg-[#003ABC]', label: 'Idle' },
  error: { color: 'text-red-600', dotColor: 'bg-red-500', label: 'Error' },
}

function formatUptime(seconds: number) {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

export default function WorkerManagerPanel() {
  const [workers, setWorkers] = useState<Worker[]>([])
  const [pool, setPool] = useState<PoolConfig>({ minWorkers: 2, maxWorkers: 8, autoScale: true })
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [savingPool, setSavingPool] = useState(false)

  const fetchWorkers = useCallback(async () => {
    try {
      const res = await fetch('/api/workers')
      if (res.ok) {
        const json = await res.json()
        setWorkers(json.data || [])
        if (json.pool) setPool(json.pool)
      }
    } catch {
      toast.error('Error', { description: 'Failed to load workers' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { fetchWorkers() }, [fetchWorkers])

  const handleAction = async (workerId: string, action: 'start' | 'stop' | 'restart') => {
    setActionLoading(`${workerId}-${action}`)
    try {
      const res = await fetch('/api/workers/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, workerId }),
      })
      if (res.ok) {
        toast.success('Success', { description: `Worker ${action}d successfully` })
        fetchWorkers()
      } else {
        toast.error('Error', { description: `Failed to ${action} worker` })
      }
    } catch {
      toast.error('Error', { description: `Failed to ${action} worker` })
    } finally {
      setActionLoading(null)
    }
  }

  const handleSavePool = async () => {
    setSavingPool(true)
    try {
      const res = await fetch('/api/workers/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_pool', config: pool }),
      })
      if (res.ok) {
        toast.success('Success', { description: 'Pool configuration saved'  })
      }
    } catch {
      toast.error('Error', { description: 'Failed to save pool config' })
    } finally {
      setSavingPool(false)
    }
  }

  const runningCount = workers.filter((w) => w.status === 'running' || w.status === 'idle').length
  const totalMemory = workers.reduce((sum, w) => sum + (w.memory || 0), 0)
  const totalCompleted = workers.reduce((sum, w) => sum + (w.completedCount || 0), 0)

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#003ABC]/10 flex items-center justify-center">
            <Cpu className="h-5 w-5 text-[#003ABC]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#1E293B]">Worker Manager</h2>
            <p className="text-xs text-[#94A3B8]">Monitor and manage worker processes</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Active Workers', value: `${runningCount}/${workers.length}`, icon: Activity, color: 'text-emerald-500', bg: 'bg-emerald-50' },
          { label: 'Jobs Completed', value: totalCompleted.toLocaleString(), icon: Cpu, color: 'text-[#003ABC]', bg: 'bg-[#003ABC]/10' },
          { label: 'Total Memory', value: `${(totalMemory / 1024).toFixed(1)} GB`, icon: MemoryStick, color: 'text-purple-500', bg: 'bg-purple-50' },
          { label: 'Auto Scale', value: pool.autoScale ? 'On' : 'Off', icon: Settings, color: pool.autoScale ? 'text-emerald-500' : 'text-[#64748B]', bg: pool.autoScale ? 'bg-emerald-50' : 'bg-gray-100' },
        ].map((stat) => (
          <Card key={stat.label} className="border-[#E2E8F0]">
            <CardContent className="p-3 flex items-center gap-3">
              <div className={`h-9 w-9 rounded-lg ${stat.bg} flex items-center justify-center`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
              <div>
                <p className="text-lg font-bold text-[#1E293B]">{stat.value}</p>
                <p className="text-[10px] text-[#94A3B8]">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pool Config */}
      <Card className="border-[#E2E8F0]">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-[#64748B]" />
            <CardTitle className="text-sm font-semibold text-[#1E293B]">Worker Pool Configuration</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm text-[#1E293B]">Auto Scale</Label>
              <p className="text-xs text-[#94A3B8]">Automatically adjust worker count based on load</p>
            </div>
            <Switch
              checked={pool.autoScale}
              onCheckedChange={(v) => setPool((c) => ({ ...c, autoScale: v }))}
            />
          </div>
          <Separator />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm text-[#1E293B]">Min Workers</Label>
              <Input
                type="number"
                min={1}
                max={pool.maxWorkers}
                value={pool.minWorkers}
                onChange={(e) => setPool((c) => ({ ...c, minWorkers: Math.max(1, parseInt(e.target.value) || 1) }))}
                className="h-9 text-sm border-[#E2E8F0]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-[#1E293B]">Max Workers</Label>
              <Input
                type="number"
                min={pool.minWorkers}
                max={32}
                value={pool.maxWorkers}
                onChange={(e) => setPool((c) => ({ ...c, maxWorkers: Math.max(c.minWorkers, parseInt(e.target.value) || 2) }))}
                className="h-9 text-sm border-[#E2E8F0]"
              />
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleSavePool}
            disabled={savingPool}
            variant="outline"
            className="border-[#E2E8F0] text-[#64748B] hover:text-[#003ABC] hover:border-[#003ABC]"
          >
            {savingPool ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Save Configuration
          </Button>
        </CardContent>
      </Card>

      {/* Worker List */}
      <Card className="border-[#E2E8F0]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-[#1E293B]">Workers</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 bg-gray-100 rounded-lg" />
              ))}
            </div>
          ) : workers.length === 0 ? (
            <div className="text-center py-12">
              <Cpu className="h-10 w-10 text-[#CBD5E1] mx-auto mb-3" />
              <p className="text-sm text-[#94A3B8]">No workers configured</p>
              <p className="text-xs text-[#CBD5E1] mt-1">Workers will be seeded on first setup</p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#E2E8F0]">
                    <TableHead className="text-xs text-[#64748B]">Name</TableHead>
                    <TableHead className="text-xs text-[#64748B]">Type</TableHead>
                    <TableHead className="text-xs text-[#64748B]">Status</TableHead>
                    <TableHead className="text-xs text-[#64748B]">Current Job</TableHead>
                    <TableHead className="text-xs text-[#64748B]">Completed</TableHead>
                    <TableHead className="text-xs text-[#64748B]">Uptime</TableHead>
                    <TableHead className="text-xs text-[#64748B]">Memory</TableHead>
                    <TableHead className="text-xs text-[#64748B] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workers.map((w) => {
                    const sc = statusConfig[w.status] || statusConfig.stopped
                    const isActioning = actionLoading?.startsWith(w.id)
                    return (
                      <TableRow key={w.id} className="border-[#E2E8F0]">
                        <TableCell className="text-xs font-medium text-[#1E293B]">{w.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] capitalize ${typeColors[w.type] || 'border-[#E2E8F0] text-[#64748B]'}`}>
                            {w.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <div className={`h-2 w-2 rounded-full ${sc.dotColor} ${w.status === 'running' ? 'animate-pulse' : ''}`} />
                            <span className={`text-xs ${sc.color}`}>{sc.label}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-[#64748B] max-w-[120px] truncate">
                          {w.currentJob || '—'}
                        </TableCell>
                        <TableCell className="text-xs text-[#1E293B]">{(w.completedCount || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-xs text-[#64748B]">{formatUptime(w.uptime || 0)}</TableCell>
                        <TableCell className="text-xs text-[#64748B]">{(w.memory || 0).toFixed(0)} MB</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {w.status !== 'running' && w.status !== 'idle' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleAction(w.id, 'start')}
                                disabled={isActioning}
                                className="h-7 w-7 p-0 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50"
                              >
                                {isActioning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                              </Button>
                            )}
                            {(w.status === 'running' || w.status === 'idle') && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleAction(w.id, 'stop')}
                                disabled={isActioning}
                                className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                              >
                                {isActioning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3" />}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleAction(w.id, 'restart')}
                              disabled={isActioning}
                              className="h-7 w-7 p-0 text-amber-500 hover:text-amber-600 hover:bg-amber-50"
                            >
                              {isActioning ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}