'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Search,
  Filter,
  MoreHorizontal,
  ChevronRight,
  Settings,
  Zap,
  User,
  Bot,
  CreditCard,
  Globe,
  FileText,
  MessageSquare,
  Trash2,
  Copy,
  Eye,
  Play,
  Timer,
  TrendingUp,
  ArrowRight,
  CheckCheck,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Approval {
  id: string
  type: string
  title: string
  description: string
  status: string
  priority: string
  createdAt: string
  slaDeadline: string | null
  user?: { name: string; email: string }
  requester?: { name: string; email: string }
  pipelineStep: number
  pipelineTotal: number
}




const SLA_STATS = {
  avgResponseTime: '2.4h',
  withinSLA: 94.2,
  breachingToday: 1,
  totalPending: 5,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const typeConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; bg: string }> = {
  'Agent Deploy': { icon: Bot, color: 'text-[#003ABC]', bg: 'bg-[#003ABC]/10' },
  'API Key': { icon: Globe, color: 'text-purple-600', bg: 'bg-purple-50' },
  'Budget': { icon: CreditCard, color: 'text-[#FF6A00]', bg: 'bg-orange-50' },
  'User Access': { icon: User, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  'Webhook': { icon: Zap, color: 'text-amber-600', bg: 'bg-amber-50' },
  'Policy': { icon: FileText, color: 'text-slate-600', bg: 'bg-slate-100' },
}

const priorityColor: Record<string, string> = {
  critical: 'bg-red-50 text-red-700',
  high: 'bg-orange-50 text-orange-700',
  medium: 'bg-amber-50 text-amber-700',
  low: 'bg-slate-50 text-slate-600',
}

const getInitials = (name: string) => name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)

const getSLATimeLeft = (deadline: string | null) => {
  if (!deadline) return null
  const diff = new Date(deadline).getTime() - Date.now()
  if (diff < 0) return { label: 'Breached', color: 'text-red-600', pct: 100 }
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  const pct = Math.max(0, Math.min(100, 100 - (diff / (24 * 60 * 60 * 1000)) * 100))
  if (hours < 2) return { label: `${hours}h ${mins}m`, color: 'text-red-600', pct }
  if (hours < 6) return { label: `${hours}h ${mins}m`, color: 'text-amber-600', pct }
  return { label: `${hours}h ${mins}m`, color: 'text-emerald-600', pct }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ApprovalsPanel() {
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('pending')
  const [search, setSearch] = useState('')
  const [selectedForBatch, setSelectedForBatch] = useState<Set<string>>(new Set())
  const [actionDialog, setActionDialog] = useState<{ open: boolean; approval: Approval | null; action: 'approve' | 'reject' }>({ open: false, approval: null, action: 'approve' })
  const [comment, setComment] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/approvals?status=pending&page=1&limit=50')
      .then((r) => r.json())
      .then((res) => {
        if (!cancelled) {
          const apiData = (res.data || []) as Approval[]
          setApprovals(apiData)
        }
      })
      .catch(() => {
        if (!cancelled) setApprovals([])
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [refreshKey])

  const filteredApprovals = approvals.filter((a) => {
    if (tab !== 'all' && a.status !== tab) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return a.title.toLowerCase().includes(q) || a.type.toLowerCase().includes(q) || a.requester?.name.toLowerCase().includes(q)
    }
    return true
  })

  const pendingCount = approvals.filter((a) => a.status === 'pending').length
  const approvedCount = approvals.filter((a) => a.status === 'approved').length
  const rejectedCount = approvals.filter((a) => a.status === 'rejected').length

  const handleAction = useCallback(async (approvalId: string, action: 'approve' | 'reject', commentText?: string) => {
    try {
      const res = await fetch(`/api/approvals?action=${action}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId, comment: commentText }),
      })
      if (!res.ok) throw new Error()
      toast.success(`Approval ${action}d${commentText ? ' with comment' : ''}`)
      setRefreshKey((k) => k + 1)
    } catch {
      toast.error('Action failed')
    }
  }, [])

  const openActionDialog = (approval: Approval, action: 'approve' | 'reject') => {
    setActionDialog({ open: true, approval, action })
    setComment('')
  }

  const confirmAction = () => {
    if (actionDialog.approval) {
      handleAction(actionDialog.approval.id, actionDialog.action, comment)
      setActionDialog({ open: false, approval: null, action: 'approve' })
    }
  }

  const handleBatchApprove = () => {
    if (selectedForBatch.size === 0) return
    toast.success(`${selectedForBatch.size} approvals batch approved`)
    setSelectedForBatch(new Set())
  }

  const toggleBatchSelect = (id: string) => {
    setSelectedForBatch((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const statusBadge = (status: string) => {
    const map: Record<string, { className: string; icon: React.ComponentType<{ className?: string }> }> = {
      pending: { className: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock },
      approved: { className: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
      rejected: { className: 'bg-red-50 text-red-700 border-red-200', icon: XCircle },
    }
    const s = map[status] || map.pending
    const Icon = s.icon
    return (
      <Badge variant="outline" className={`text-[10px] px-2 py-0.5 gap-1 ${s.className}`}>
        <Icon className="w-3 h-3" /> {status}
      </Badge>
    )
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-[400px] rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#003ABC] to-[#0077FF] flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#1E293B]">Approval Queue</h2>
            <p className="text-sm text-[#64748B]">{pendingCount} pending · {approvedCount} approved · {rejectedCount} rejected</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'pending' && selectedForBatch.size > 0 && (
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5" onClick={handleBatchApprove}>
              <CheckCheck className="w-3.5 h-3.5" /> Batch Approve ({selectedForBatch.size})
            </Button>
          )}
        </div>
      </div>

      {/* SLA Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-[#E2E8F0] shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-[#94A3B8]">Pending</span>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-2xl font-bold text-[#1E293B]">{SLA_STATS.totalPending}</p>
          </CardContent>
        </Card>
        <Card className="border-[#E2E8F0] shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-[#94A3B8]">Avg Response</span>
              <Timer className="w-4 h-4 text-[#003ABC]" />
            </div>
            <p className="text-2xl font-bold text-[#1E293B]">{SLA_STATS.avgResponseTime}</p>
          </CardContent>
        </Card>
        <Card className="border-[#E2E8F0] shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-[#94A3B8]">Within SLA</span>
              <TrendingUp className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-2xl font-bold text-[#1E293B]">{SLA_STATS.withinSLA}%</p>
            <Progress value={SLA_STATS.withinSLA} className="h-1.5 mt-1.5" />
          </CardContent>
        </Card>
        <Card className="border-[#E2E8F0] shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-[#94A3B8]">Breaching</span>
              <AlertTriangle className="w-4 h-4 text-red-500" />
            </div>
            <p className="text-2xl font-bold text-red-600">{SLA_STATS.breachingToday}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={(v) => { setTab(v); setSelectedForBatch(new Set()) }} className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <TabsList className="bg-slate-100 p-1 h-9">
            <TabsTrigger value="all" className="text-sm data-[state=active]:bg-white data-[state=active]:text-[#003ABC] data-[state=active]:shadow-sm rounded-md">
              All ({approvals.length})
            </TabsTrigger>
            <TabsTrigger value="pending" className="text-sm data-[state=active]:bg-white data-[state=active]:text-[#003ABC] data-[state=active]:shadow-sm rounded-md">
              Pending ({pendingCount})
            </TabsTrigger>
            <TabsTrigger value="approved" className="text-sm data-[state=active]:bg-white data-[state=active]:text-[#003ABC] data-[state=active]:shadow-sm rounded-md">
              Approved ({approvedCount})
            </TabsTrigger>
            <TabsTrigger value="rejected" className="text-sm data-[state=active]:bg-white data-[state=active]:text-[#003ABC] data-[state=active]:shadow-sm rounded-md">
              Rejected ({rejectedCount})
            </TabsTrigger>
          </TabsList>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
            <Input placeholder="Search approvals..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-white border-[#E2E8F0]" />
          </div>
        </div>

        {/* ── Approvals List ── */}
        <TabsContent value={tab} className="mt-0 space-y-3">
          {filteredApprovals.length === 0 ? (
            <div className="text-center py-16">
              <ShieldCheck className="w-10 h-10 text-[#CBD5E1] mx-auto mb-3" />
              <p className="text-sm text-[#64748B]">No approvals found</p>
              <p className="text-xs text-[#94A3B8] mt-1">Try adjusting your search or filter</p>
            </div>
          ) : (
            filteredApprovals.map((approval) => {
              const tCfg = typeConfig[approval.type] || typeConfig['Policy']
              const TypeIcon = tCfg.icon
              const slaInfo = getSLATimeLeft(approval.slaDeadline)
              const isPending = approval.status === 'pending'
              return (
                <Card key={approval.id} className="border-[#E2E8F0] shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Selection checkbox for pending */}
                      {tab === 'pending' && (
                        <Checkbox
                          checked={selectedForBatch.has(approval.id)}
                          onCheckedChange={() => toggleBatchSelect(approval.id)}
                          className="mt-1 data-[state=checked]:bg-[#003ABC] data-[state=checked]:border-[#003ABC]"
                        />
                      )}
                      {/* Type icon */}
                      <div className={`w-10 h-10 rounded-xl ${tCfg.bg} flex items-center justify-center flex-shrink-0`}>
                        <TypeIcon className={`w-5 h-5 ${tCfg.color}`} />
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Row 1: Type badge + title + status */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${tCfg.bg} ${tCfg.color} border-transparent`}>{approval.type}</Badge>
                              <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${priorityColor[approval.priority] || ''}`}>{approval.priority}</Badge>
                            </div>
                            <h3 className="text-sm font-semibold text-[#1E293B] leading-snug">{approval.title}</h3>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {statusBadge(approval.status)}
                            {isPending && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-[#94A3B8] hover:text-[#1E293B]">
                                    <MoreHorizontal className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem className="gap-2" onClick={() => openActionDialog(approval, 'approve')}>
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Approve
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="gap-2" onClick={() => openActionDialog(approval, 'reject')}>
                                    <XCircle className="w-3.5 h-3.5 text-red-600" /> Reject
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="gap-2"><Eye className="w-3.5 h-3.5" /> View Details</DropdownMenuItem>
                                  <DropdownMenuItem className="gap-2"><Copy className="w-3.5 h-3.5" /> Copy Request</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </div>

                        {/* Row 2: Description */}
                        <p className="text-xs text-[#64748B] mt-1 line-clamp-1">{approval.description}</p>

                        {/* Row 3: Meta info */}
                        <div className="flex items-center gap-4 mt-2.5 flex-wrap">
                          {approval.requester && (
                            <div className="flex items-center gap-1.5">
                              <Avatar className="w-5 h-5">
                                <AvatarFallback className="bg-slate-100 text-[#64748B] text-[8px]">{getInitials(approval.requester.name)}</AvatarFallback>
                              </Avatar>
                              <span className="text-[11px] text-[#94A3B8]">{approval.requester.name}</span>
                            </div>
                          )}
                          <span className="text-[11px] text-[#94A3B8]">{new Date(approval.createdAt).toLocaleString()}</span>

                          {/* Pipeline step indicator */}
                          <div className="flex items-center gap-1">
                            <span className="text-[11px] text-[#94A3B8]">Step</span>
                            <div className="flex items-center gap-0.5">
                              {Array.from({ length: approval.pipelineTotal }).map((_, i) => (
                                <div key={i} className={`w-4 h-1.5 rounded-full ${i < approval.pipelineStep ? (approval.status === 'rejected' && i === approval.pipelineStep - 1 ? 'bg-red-400' : 'bg-[#003ABC]') : 'bg-[#E2E8F0]'}`} />
                              ))}
                            </div>
                          </div>

                          {/* SLA indicator */}
                          {slaInfo && isPending && (
                            <div className="flex items-center gap-1.5 ml-auto">
                              <Timer className={`w-3 h-3 ${slaInfo.color}`} />
                              <span className={`text-[11px] font-medium ${slaInfo.color}`}>{slaInfo.label}</span>
                              <Progress value={slaInfo.pct} className="w-12 h-1" />
                            </div>
                          )}
                        </div>

                        {/* Quick action buttons for pending */}
                        {isPending && (
                          <div className="flex items-center gap-2 mt-3">
                            <Button size="sm" className="h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white gap-1" onClick={() => openActionDialog(approval, 'approve')}>
                              <CheckCircle2 className="w-3 h-3" /> Approve
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-[11px] text-red-600 border-red-200 hover:bg-red-50 gap-1" onClick={() => openActionDialog(approval, 'reject')}>
                              <XCircle className="w-3 h-3" /> Reject
                            </Button>
                            {approval.user && (
                              <div className="ml-auto flex items-center gap-1.5">
                                <span className="text-[11px] text-[#94A3B8]">Assigned to</span>
                                <Avatar className="w-5 h-5">
                                  <AvatarFallback className="bg-[#003ABC]/10 text-[#003ABC] text-[8px]">{getInitials(approval.user.name)}</AvatarFallback>
                                </Avatar>
                                <span className="text-[11px] text-[#1E293B] font-medium">{approval.user.name}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </TabsContent>
      </Tabs>

      {/* Auto-Approval Rules */}
      <Card className="border-[#E2E8F0] shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-[#1E293B]">Auto-Approval Rules</CardTitle>
              <CardDescription className="text-xs text-[#64748B]">Configure rules to automatically approve certain request types</CardDescription>
            </div>
            <Button variant="outline" size="sm" className="text-[#003ABC] border-[#003ABC]/30 hover:bg-[#003ABC]/5 gap-1.5">
              <Settings className="w-3.5 h-3.5" /> Configure
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="col-span-full flex flex-col items-center gap-2 py-8 text-[#94A3B8]">
              <Settings className="w-8 h-8" />
              <p className="text-sm">No auto-approval rules configured</p>
              <p className="text-xs">Create rules to automatically approve certain request types</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Approval Pipeline Visualization */}
      <Card className="border-[#E2E8F0] shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-[#1E293B]">Approval Pipeline</CardTitle>
          <CardDescription className="text-xs text-[#64748B]">Visual overview of the multi-step approval process</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {['Request Submitted', 'Peer Review', 'Manager Approval', 'Security Check', 'Deployed'].map((step, i) => (
              <div key={i} className="flex items-center gap-2 flex-shrink-0">
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold ${i <= 1 ? 'bg-[#003ABC] text-white' : i === 2 ? 'bg-[#FF6A00] text-white' : 'bg-slate-100 text-[#94A3B8]'}`}>
                    {i <= 1 ? <CheckCircle2 className="w-5 h-5" /> : i === 2 ? <Clock className="w-5 h-5" /> : i + 1}
                  </div>
                  <span className={`text-[10px] font-medium whitespace-nowrap ${i <= 2 ? 'text-[#1E293B]' : 'text-[#94A3B8]'}`}>{step}</span>
                </div>
                {i < 4 && <ChevronRight className="w-4 h-4 text-[#CBD5E1] flex-shrink-0" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Action Dialog */}
      <Dialog open={actionDialog.open} onOpenChange={(open) => setActionDialog((d) => ({ ...d, open }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B]">{actionDialog.action === 'approve' ? 'Approve' : 'Reject'} Request</DialogTitle>
            <DialogDescription className="text-[#64748B]">{actionDialog.approval?.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-[#1E293B]">
                Comment {actionDialog.action === 'reject' ? '(required)' : '(optional)'}
              </Label>
              <Textarea
                placeholder={actionDialog.action === 'approve' ? 'Add an optional comment...' : 'Please provide a reason for rejection...'}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="bg-white border-[#E2E8F0] min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setActionDialog((d) => ({ ...d, open: false }))} className="text-[#64748B]">Cancel</Button>
            <Button
              className={actionDialog.action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5' : 'bg-red-600 hover:bg-red-700 text-white gap-1.5'}
              onClick={confirmAction}
              disabled={actionDialog.action === 'reject' && !comment.trim()}
            >
              {actionDialog.action === 'approve' ? <><CheckCircle2 className="w-3.5 h-3.5" /> Approve</> : <><XCircle className="w-3.5 h-3.5" /> Reject</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}