'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  GitBranch,
  Play,
  Pause,
  Archive,
  Plus,
  Search,
  MoreHorizontal,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowUpDown,
  Download,
  Upload,
  Copy,
  Trash2,
  ChevronRight,
  Activity,
  Layers, Filter,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Workflow {
  id: string
  name: string
  slug: string
  description: string | null
  status: string
  stepCount: number
  createdAt: string
}




const METRICS = {
  totalRuns: 1284,
  successRate: 94.7,
  avgDuration: 142,
  activeWorkflows: 12,
  failedToday: 3,
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function WorkflowsPanel() {
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [activeTab, setActiveTab] = useState('workflows')
  const [newWorkflowName, setNewWorkflowName] = useState('')
  const [newWorkflowDesc, setNewWorkflowDesc] = useState('')
  const [newWorkflowCategory, setNewWorkflowCategory] = useState('')

  useEffect(() => {
    fetch('/api/workflows')
      .then((r) => r.json())
      .then((res) => setWorkflows(res.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filteredWorkflows = useMemo(() => {
    let result = workflows
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((w) => w.name.toLowerCase().includes(q) || w.description?.toLowerCase().includes(q))
    }
    if (statusFilter !== 'all') {
      result = result.filter((w) => w.status === statusFilter)
    }
    return result
  }, [workflows, search, statusFilter])

  const statusBadge = (status: string) => {
    const map: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }> = {
      active: { variant: 'default', className: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' },
      paused: { variant: 'secondary', className: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' },
      archived: { variant: 'outline', className: 'bg-slate-50 text-slate-500 border-slate-200' },
    }
    const s = map[status] || map.archived
    return <Badge variant={s.variant} className={`text-[11px] px-2 py-0.5 font-medium ${s.className}`}>{status}</Badge>
  }

  const handleCreateWorkflow = () => {
    if (!newWorkflowName.trim()) return
    toast.success(`Workflow "${newWorkflowName}" created`)
    setShowCreateDialog(false)
    setNewWorkflowName('')
    setNewWorkflowDesc('')
    setNewWorkflowCategory('')
  }

  const handleImportExport = (action: 'import' | 'export') => {
    if (action === 'export') {
      toast.success('Workflow configuration exported as JSON')
    } else {
      toast.info('Import dialog would open for JSON upload')
    }
  }

  const formatDuration = (ms: number) => {
    if (ms === 0) return '—'
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-[500px] rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#003ABC] to-[#0077FF] flex items-center justify-center">
            <GitBranch className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#1E293B]">Workflows</h2>
            <p className="text-sm text-[#64748B]">{workflows.length} workflows · {METRICS.activeWorkflows} active</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-[#003ABC] border-[#003ABC]/30 hover:bg-[#003ABC]/5" onClick={() => handleImportExport('import')}>
            <Upload className="w-3.5 h-3.5" /> Import
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-[#003ABC] border-[#003ABC]/30 hover:bg-[#003ABC]/5" onClick={() => handleImportExport('export')}>
            <Download className="w-3.5 h-3.5" /> Export
          </Button>
          <Button size="sm" className="bg-[#FF6A00] hover:bg-[#E5600A] text-white gap-1.5" onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-3.5 h-3.5" /> New Workflow
          </Button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card className="border-[#E2E8F0] shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[#64748B]">Total Runs</span>
              <Activity className="w-4 h-4 text-[#003ABC]" />
            </div>
            <p className="text-2xl font-bold text-[#1E293B]">{METRICS.totalRuns.toLocaleString()}</p>
            <p className="text-[11px] text-emerald-600 mt-1">+12.5% from last week</p>
          </CardContent>
        </Card>
        <Card className="border-[#E2E8F0] shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[#64748B]">Success Rate</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-2xl font-bold text-[#1E293B]">{METRICS.successRate}%</p>
            <Progress value={METRICS.successRate} className="h-1.5 mt-2" />
          </CardContent>
        </Card>
        <Card className="border-[#E2E8F0] shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[#64748B]">Avg Duration</span>
              <Clock className="w-4 h-4 text-[#FF6A00]" />
            </div>
            <p className="text-2xl font-bold text-[#1E293B]">{formatDuration(METRICS.avgDuration * 1000)}</p>
            <p className="text-[11px] text-[#64748B] mt-1">-8.2% improvement</p>
          </CardContent>
        </Card>
        <Card className="border-[#E2E8F0] shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[#64748B]">Failed Today</span>
              <XCircle className="w-4 h-4 text-red-500" />
            </div>
            <p className="text-2xl font-bold text-[#1E293B]">{METRICS.failedToday}</p>
            <p className="text-[11px] text-red-600 mt-1">2 need attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-slate-100 p-1 h-9">
          <TabsTrigger value="workflows" className="text-sm data-[state=active]:bg-white data-[state=active]:text-[#003ABC] data-[state=active]:shadow-sm rounded-md">
            <GitBranch className="w-3.5 h-3.5 mr-1.5" /> Workflows
          </TabsTrigger>
          <TabsTrigger value="executions" className="text-sm data-[state=active]:bg-white data-[state=active]:text-[#003ABC] data-[state=active]:shadow-sm rounded-md">
            <Activity className="w-3.5 h-3.5 mr-1.5" /> Executions
          </TabsTrigger>
          <TabsTrigger value="templates" className="text-sm data-[state=active]:bg-white data-[state=active]:text-[#003ABC] data-[state=active]:shadow-sm rounded-md">
            <Layers className="w-3.5 h-3.5 mr-1.5" /> Templates
          </TabsTrigger>
        </TabsList>

        {/* ── Workflows Tab ── */}
        <TabsContent value="workflows" className="space-y-4">
          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
              <Input
                placeholder="Search workflows..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-white border-[#E2E8F0]"
              />
            </div>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px] bg-white border-[#E2E8F0]">
                  <Filter className="w-3.5 h-3.5 mr-1 text-[#94A3B8]" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" className="h-9 w-9 border-[#E2E8F0]">
                <ArrowUpDown className="w-4 h-4 text-[#64748B]" />
              </Button>
            </div>
          </div>

          {/* Workflow Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredWorkflows.length === 0 ? (
              <div className="col-span-full text-center py-16">
                <GitBranch className="w-10 h-10 text-[#CBD5E1] mx-auto mb-3" />
                <p className="text-sm text-[#64748B]">No workflows found</p>
                <p className="text-xs text-[#94A3B8] mt-1">Try adjusting your search or filter</p>
              </div>
            ) : (
              filteredWorkflows.map((wf) => (
                <Card key={wf.id} className="border-[#E2E8F0] shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedWorkflow(wf)}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-[#003ABC]/10 flex items-center justify-center flex-shrink-0">
                          <GitBranch className="w-4 h-4 text-[#003ABC]" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-[#1E293B] truncate">{wf.name}</h3>
                          <p className="text-[11px] text-[#94A3B8] font-mono">{wf.slug}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {statusBadge(wf.status)}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-[#94A3B8] hover:text-[#1E293B]">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem className="gap-2"><Play className="w-3.5 h-3.5" /> Run Now</DropdownMenuItem>
                            <DropdownMenuItem className="gap-2"><Pause className="w-3.5 h-3.5" /> Pause</DropdownMenuItem>
                            <DropdownMenuItem className="gap-2"><Copy className="w-3.5 h-3.5" /> Duplicate</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="gap-2 text-red-600"><Archive className="w-3.5 h-3.5" /> Archive</DropdownMenuItem>
                            <DropdownMenuItem className="gap-2 text-red-600"><Trash2 className="w-3.5 h-3.5" /> Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    {wf.description && (
                      <p className="text-xs text-[#64748B] line-clamp-2 leading-relaxed">{wf.description}</p>
                    )}
                    {/* Step Visualization */}
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(wf.stepCount, 6) }).map((_, i) => (
                        <div key={i} className="flex items-center gap-1">
                          <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold ${i < wf.stepCount - 1 ? 'bg-[#003ABC]/10 text-[#003ABC]' : 'bg-[#FF6A00]/10 text-[#FF6A00]'}`}>
                            {i + 1}
                          </div>
                          {i < Math.min(wf.stepCount, 6) - 1 && <ChevronRight className="w-3 h-3 text-[#CBD5E1]" />}
                        </div>
                      ))}
                      {wf.stepCount > 6 && (
                        <span className="text-[10px] text-[#94A3B8] ml-1">+{wf.stepCount - 6}</span>
                      )}
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between text-[11px] text-[#94A3B8]">
                      <span>{wf.stepCount} steps</span>
                      <span>{new Date(wf.createdAt).toLocaleDateString()}</span>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* ── Execution History Tab ── */}
        <TabsContent value="executions" className="space-y-4">
          <Card className="border-[#E2E8F0] shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-[#1E293B]">Recent Executions</CardTitle>
              <CardDescription className="text-xs text-[#64748B]">Timeline of recent workflow runs</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 max-h-[500px] overflow-y-auto">
              <div className="flex flex-col items-center gap-2 py-12 text-[#94A3B8]">
                <Clock className="w-8 h-8" />
                <p className="text-sm">No execution history yet</p>
                <p className="text-xs">Workflow executions will appear here after running</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Templates Tab ── */}
        <TabsContent value="templates" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <div className="col-span-full flex flex-col items-center gap-2 py-12 text-[#94A3B8]"><Layers className="w-8 h-8" /><p className="text-sm">No workflow templates available</p><p className="text-xs">Templates can be created from existing workflows</p></div>          </div>
        </TabsContent>
      </Tabs>

      {/* Workflow Detail Dialog */}
      <Dialog open={!!selectedWorkflow} onOpenChange={() => setSelectedWorkflow(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B]">{selectedWorkflow?.name}</DialogTitle>
            <DialogDescription className="text-[#64748B]">{selectedWorkflow?.description || 'No description'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-[11px] text-[#94A3B8]">Status</p>
                <div className="mt-1">{selectedWorkflow && statusBadge(selectedWorkflow.status)}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-[11px] text-[#94A3B8]">Steps</p>
                <p className="text-sm font-semibold text-[#1E293B] mt-0.5">{selectedWorkflow?.stepCount} steps</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-[11px] text-[#94A3B8]">Total Runs</p>
                <p className="text-sm font-semibold text-[#1E293B] mt-0.5">247</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-[11px] text-[#94A3B8]">Success Rate</p>
                <p className="text-sm font-semibold text-emerald-600 mt-0.5">96.4%</p>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-[#64748B] mb-2">Workflow Steps</p>
              <div className="space-y-1.5">
                {selectedWorkflow && Array.from({ length: selectedWorkflow.stepCount }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold ${i === selectedWorkflow.stepCount - 1 ? 'bg-[#FF6A00]/10 text-[#FF6A00]' : 'bg-[#003ABC]/10 text-[#003ABC]'}`}>{i + 1}</div>
                    <span className="text-xs text-[#1E293B]">Step {i + 1}</span>
                    <ChevronRight className="w-3 h-3 text-[#CBD5E1] ml-auto" />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="text-[#003ABC] border-[#003ABC]/30">Edit Workflow</Button>
            <Button className="bg-[#FF6A00] hover:bg-[#E5600A] text-white gap-1.5"><Play className="w-3.5 h-3.5" /> Run Now</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Workflow Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B]">Create New Workflow</DialogTitle>
            <DialogDescription className="text-[#64748B]">Set up a new automated workflow from scratch or a template.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-[#1E293B]">Workflow Name</Label>
              <Input placeholder="e.g. Customer Onboarding" value={newWorkflowName} onChange={(e) => setNewWorkflowName(e.target.value)} className="bg-white border-[#E2E8F0]" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-[#1E293B]">Description</Label>
              <textarea
                placeholder="Describe what this workflow does..."
                value={newWorkflowDesc}
                onChange={(e) => setNewWorkflowDesc(e.target.value)}
                className="w-full min-h-[80px] rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#FF6A00]/20 focus:border-[#FF6A00] resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-[#1E293B]">Category</Label>
              <Select value={newWorkflowCategory} onValueChange={setNewWorkflowCategory}>
                <SelectTrigger className="bg-white border-[#E2E8F0]">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="crm">CRM</SelectItem>
                  <SelectItem value="data">Data</SelectItem>
                  <SelectItem value="devops">DevOps</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                  <SelectItem value="marketing">Marketing</SelectItem>
                  <SelectItem value="ops">Operations</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} className="text-[#64748B]">Cancel</Button>
            <Button className="bg-[#FF6A00] hover:bg-[#E5600A] text-white" onClick={handleCreateWorkflow} disabled={!newWorkflowName.trim()}>Create Workflow</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}