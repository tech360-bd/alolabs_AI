'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Rocket,
  Globe,
  CheckCircle,
  XCircle,
  RefreshCw,
  Play,
  Loader2,
  Lock,
  ChevronDown,
  ChevronUp,
  Plus,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'

interface Deployment {
  id: string
  domain: string
  projectType: string | null
  status: string
  deployLog: string
  sslStatus: string
  createdAt: string
  updatedAt: string
}

interface LogEntry {
  step: number
  message: string
  timestamp: string
}

const statusConfig: Record<string, { icon: React.ElementType; color: string; bg: string; badgeClass: string; label: string }> = {
  pending: { icon: Loader2, color: 'text-amber-600', bg: 'bg-amber-50', badgeClass: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Pending' },
  deploying: { icon: RefreshCw, color: 'text-[#003ABC]', bg: 'bg-[#003ABC]/10', badgeClass: 'bg-[#003ABC]/10 text-[#003ABC] border-[#003ABC]/20', label: 'Deploying' },
  success: { icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50', badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Success' },
  failed: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', badgeClass: 'bg-red-100 text-red-700 border-red-200', label: 'Failed' },
}

const sslConfig: Record<string, { color: string; label: string }> = {
  active: { color: 'text-emerald-600', label: 'Active' },
  pending: { color: 'text-amber-600', label: 'Pending' },
  none: { color: 'text-[#94A3B8]', label: 'None' },
  failed: { color: 'text-red-600', label: 'Failed' },
}

const PROJECT_TYPES = ['nextjs', 'react', 'vue', 'static', 'api', 'fullstack']

export default function DeploymentPanel() {
  const [deployments, setDeployments] = useState<Deployment[]>([])
  const [loading, setLoading] = useState(true)
  const [deploying, setDeploying] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [newDialog, setNewDialog] = useState(false)
  const [domain, setDomain] = useState('')
  const [projectType, setProjectType] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('')

  const fetchDeployments = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (filterStatus) params.set('status', filterStatus)
      const res = await fetch(`/api/deploy?${params}`)
      if (res.ok) {
        const json = await res.json()
        setDeployments(json.data || [])
      }
    } catch {
      toast.error('Error', { description: 'Failed to load deployments' })
    } finally {
      setLoading(false)
    }
  }, [filterStatus, toast])

  useEffect(() => { fetchDeployments() }, [fetchDeployments])

  const handleDeploy = async () => {
    if (!domain.trim()) return
    setDeploying(true)
    try {
      const res = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: domain.trim(), projectType: projectType || null }),
      })
      if (res.ok) {
        toast.success('Success', { description: `Deployment to ${domain.trim()} initiated` })
        setNewDialog(false)
        setDomain('')
        setProjectType('')
        fetchDeployments()
      } else {
        const json = await res.json()
        toast.error('Error', { description: json.error || 'Deployment failed' })
      }
    } catch {
      toast.error('Error', { description: 'Deployment failed' })
    } finally {
      setDeploying(false)
    }
  }

  const successCount = deployments.filter((d) => d.status === 'success').length
  const failedCount = deployments.filter((d) => d.status === 'failed').length
  const activeCount = deployments.filter((d) => d.status === 'deploying' || d.status === 'pending').length
  const sslActive = deployments.filter((d) => d.sslStatus === 'active').length

  const parseLog = (logStr: string): LogEntry[] => {
    try { return JSON.parse(logStr) }
    catch { return [] }
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#003ABC]/10 flex items-center justify-center">
            <Rocket className="h-5 w-5 text-[#003ABC]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#1E293B]">Deployment Center</h2>
            <p className="text-xs text-[#94A3B8]">Manage domain deployments and SSL</p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => setNewDialog(true)}
          className="gap-1.5 bg-[#003ABC] hover:bg-[#003ABC]/90 text-white"
        >
          <Plus className="h-3.5 w-3.5" />
          New Deployment
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: deployments.length, icon: Rocket, color: 'text-[#003ABC]', bg: 'bg-[#003ABC]/10' },
          { label: 'Active', value: activeCount, icon: RefreshCw, color: 'text-amber-500', bg: 'bg-amber-50' },
          { label: 'Succeeded', value: successCount, icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-50' },
          { label: 'SSL Active', value: sslActive, icon: Lock, color: 'text-emerald-500', bg: 'bg-emerald-50' },
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

      {/* Deploy History */}
      <Card className="border-[#E2E8F0]">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-[#1E293B]">Deploy History</CardTitle>
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v === '__all__' ? '' : v)}>
              <SelectTrigger className="w-[130px] h-8 text-xs border-[#E2E8F0]">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="deploying">Deploying</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 bg-gray-100 rounded-lg" />
              ))}
            </div>
          ) : deployments.length === 0 ? (
            <div className="text-center py-12">
              <Rocket className="h-10 w-10 text-[#CBD5E1] mx-auto mb-3" />
              <p className="text-sm text-[#94A3B8]">No deployments yet</p>
              <p className="text-xs text-[#CBD5E1] mt-1">Create your first deployment to get started</p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto space-y-2">
              {deployments.map((d) => {
                const sc = statusConfig[d.status] || statusConfig.pending
                const ssl = sslConfig[d.sslStatus] || sslConfig.none
                const logs = parseLog(d.deployLog)
                const isExpanded = expandedId === d.id
                const StatusIcon = sc.icon

                return (
                  <div key={d.id} className="border border-[#E2E8F0] rounded-lg overflow-hidden">
                    {/* Deployment Row */}
                    <div className="flex items-center gap-3 p-3">
                      <div className={`h-8 w-8 rounded-lg ${sc.bg} flex items-center justify-center flex-shrink-0`}>
                        <StatusIcon className={`h-4 w-4 ${sc.color} ${d.status === 'deploying' || d.status === 'pending' ? 'animate-spin' : ''}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Globe className="h-3.5 w-3.5 text-[#94A3B8] flex-shrink-0" />
                          <p className="text-sm font-medium text-[#1E293B] truncate">{d.domain}</p>
                          {d.projectType && (
                            <Badge variant="outline" className="text-[10px] border-[#E2E8F0] text-[#94A3B8] flex-shrink-0">
                              {d.projectType}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-[10px] text-[#94A3B8]">{new Date(d.createdAt).toLocaleString()}</span>
                          <div className="flex items-center gap-1">
                            <Lock className="h-2.5 w-2.5" />
                            <span className={`text-[10px] ${ssl.color}`}>{ssl.label}</span>
                          </div>
                        </div>
                      </div>
                      <Badge variant="outline" className={`text-[10px] ${sc.badgeClass} flex-shrink-0`}>
                        {sc.label}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpandedId(isExpanded ? null : d.id)}
                        className="h-7 w-7 p-0 text-[#94A3B8] hover:text-[#1E293B]"
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>

                    {/* Expanded Log */}
                    {isExpanded && (
                      <div className="border-t border-[#E2E8F0] bg-[#F8FAFC] p-3">
                        {logs.length === 0 ? (
                          <p className="text-xs text-[#94A3B8]">No logs available</p>
                        ) : (
                          <div className="space-y-1.5 max-h-48 overflow-y-auto">
                            {logs.map((log, i) => (
                              <div key={i} className="flex items-start gap-2 text-xs">
                                <span className="text-[#94A3B8] font-mono w-6 flex-shrink-0">{log.step}.</span>
                                <span className="text-[#1E293B] flex-1">{log.message}</span>
                                <span className="text-[#CBD5E1] flex-shrink-0 text-[10px]">
                                  {new Date(log.timestamp).toLocaleTimeString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Deployment Dialog */}
      <Dialog open={newDialog} onOpenChange={setNewDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B]">New Deployment</DialogTitle>
            <DialogDescription className="text-[#64748B]">
              Deploy a project to a domain with automatic SSL configuration.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm text-[#1E293B]">Domain</Label>
              <Input
                placeholder="example.alolabs.io"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="h-9 text-sm border-[#E2E8F0]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-[#1E293B]">Project Type</Label>
              <Select value={projectType} onValueChange={setProjectType}>
                <SelectTrigger className="h-9 text-sm border-[#E2E8F0]">
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewDialog(false)} className="border-[#E2E8F0] text-[#64748B]">
              Cancel
            </Button>
            <Button
              onClick={handleDeploy}
              disabled={deploying || !domain.trim()}
              className="bg-[#003ABC] hover:bg-[#003ABC]/90 text-white"
            >
              {deploying ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Play className="h-4 w-4 mr-1.5" />}
              Deploy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}