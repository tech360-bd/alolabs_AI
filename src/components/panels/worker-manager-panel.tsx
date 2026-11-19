'use client'

import { apiFetch } from '@/lib/api-client'
import { useState, useEffect, useCallback } from 'react'
import {
  Cpu,
  Activity,
  MemoryStick,
  Loader2,
  Settings,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  host: string
  status: string
  activeJobs: number
  totalProcessed: number
  memoryUsageMb: number
  lastHeartbeatAt: string | null
}

interface PoolConfig {
  minWorkers: number
  maxWorkers: number
  autoScale: boolean
}


const statusConfig: Record<string, { color: string; dotColor: string; label: string }> = {
  running: { color: 'text-emerald-600', dotColor: 'bg-emerald-500', label: 'Running' },
  stopped: { color: 'text-[#64748B]', dotColor: 'bg-[#CBD5E1]', label: 'Stopped' },
  restarting: { color: 'text-amber-600', dotColor: 'bg-amber-500', label: 'Restarting' },
  idle: { color: 'text-[#0066CC]', dotColor: 'bg-[#0066CC]', label: 'Idle' },
  busy: { color: 'text-emerald-600', dotColor: 'bg-emerald-500', label: 'Busy' },
  draining: { color: 'text-amber-600', dotColor: 'bg-amber-500', label: 'Draining' },
  offline: { color: 'text-gray-600', dotColor: 'bg-gray-500', label: 'Offline' },
  error: { color: 'text-red-600', dotColor: 'bg-red-500', label: 'Error' },
}


export default function WorkerManagerPanel() {
  const [workers, setWorkers] = useState<Worker[]>([])
  const [pool, setPool] = useState<PoolConfig>({ minWorkers: 2, maxWorkers: 8, autoScale: true })
  const [loading, setLoading] = useState(true)
  const [savingPool, setSavingPool] = useState(false)

  const fetchWorkers = useCallback(async () => {
    try {
      const res = await apiFetch('/api/workers/action')
      if (res.ok) {
        const json = await res.json()
        setWorkers(json.data || [])
        if (json.pool) setPool(json.pool)
      } else { throw Error() }
    } catch {
      toast.error('Error', { description: 'Failed to load workers' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { fetchWorkers() }, [fetchWorkers])

  const handleSavePool = async () => {
    setSavingPool(true)
    try {
      const res = await apiFetch('/api/workers/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_pool', config: pool }),
      })
      if (res.ok) {
        toast.success('Success', { description: 'Pool preference saved' })
      } else { throw Error() }
    } catch {
      toast.error('Error', { description: 'Failed to save pool config' })
    } finally {
      setSavingPool(false)
    }
  }

  const runningCount = workers.filter((w) => w.status === 'busy' || w.status === 'idle').length
  const totalMemory = workers.reduce((sum, w) => sum + (w.memoryUsageMb || 0), 0)
  const totalCompleted = workers.reduce((sum, w) => sum + (w.totalProcessed || 0), 0)

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#0066CC]/10 flex items-center justify-center">
            <Cpu className="h-5 w-5 text-[#0066CC]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#1E293B]">Worker Manager</h2>
            <p className="text-xs text-[#94A3B8]">Registered worker telemetry. Start, stop and restart processes using the host supervisor.</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Active Workers', value: `${runningCount}/${workers.length}`, icon: Activity, color: 'text-emerald-500', bg: 'bg-emerald-50' },
          { label: 'Jobs Completed', value: totalCompleted.toLocaleString(), icon: Cpu, color: 'text-[#0066CC]', bg: 'bg-[#0066CC]/10' },
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
              <p className="text-xs text-[#94A3B8]">Save a desired scaling policy; this does not launch or stop host processes.</p>
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
            className="border-[#E2E8F0] text-[#64748B] hover:text-[#0066CC] hover:border-[#0066CC]"
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
              <p className="text-xs text-[#CBD5E1] mt-1">Only registered workers appear here.</p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#E2E8F0]">
                    <TableHead className="text-xs text-[#64748B]">Name</TableHead>
                    <TableHead className="text-xs text-[#64748B]">Host</TableHead>
                    <TableHead className="text-xs text-[#64748B]">Status</TableHead>
                    <TableHead className="text-xs text-[#64748B]">Active Jobs</TableHead>
                    <TableHead className="text-xs text-[#64748B]">Completed</TableHead>
                    <TableHead className="text-xs text-[#64748B]">Last heartbeat</TableHead>
                    <TableHead className="text-xs text-[#64748B]">Memory</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workers.map((w) => {
                    const sc = statusConfig[w.status] || statusConfig.stopped
                    return (
                      <TableRow key={w.id} className="border-[#E2E8F0]">
                        <TableCell className="text-xs font-medium text-[#1E293B]">{w.name}</TableCell>
                        <TableCell>
                          {w.host}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <div className={`h-2 w-2 rounded-full ${sc.dotColor} ${w.status === 'running' ? 'animate-pulse' : ''}`} />
                            <span className={`text-xs ${sc.color}`}>{sc.label}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-[#64748B] max-w-[120px] truncate">
                          {w.activeJobs}
                        </TableCell>
                        <TableCell className="text-xs text-[#1E293B]">{(w.totalProcessed || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-xs text-[#64748B]">{w.lastHeartbeatAt ? new Date(w.lastHeartbeatAt).toLocaleString() : '—'}</TableCell>
                        <TableCell className="text-xs text-[#64748B]">{(w.memoryUsageMb || 0).toFixed(0)} MB</TableCell>

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