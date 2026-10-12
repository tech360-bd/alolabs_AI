'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  DollarSign,
  AlertTriangle,
  Plus,
  CheckCircle,
  XCircle,
  Ban,
  ShieldAlert,
  Search,
  Loader2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
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

interface CostEstimate {
  id: string
  companyId: string | null
  taskId: string | null
  provider: string
  modelOrService: string
  estimatedUnits: number
  estimatedCost: number
  currency: string
  localAlternative: string | null
  reasonNeeded: string | null
  status: string
  approvedBy: string | null
  approvedAt: string | null
  actualCost: number | null
  createdAt: string
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    pending: 'bg-amber-500/10 text-amber-600',
    approved: 'bg-green-500/10 text-green-600',
    rejected: 'bg-red-500/10 text-red-500',
    expired: 'bg-gray-100 text-gray-700',
  }
  return map[status] || 'bg-gray-100 text-gray-700'
}

export default function CostEstimatePanel() {
  const [loading, setLoading] = useState(true)
  const [estimates, setEstimates] = useState<CostEstimate[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'approve' | 'reject' | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<CostEstimate | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [newEst, setNewEst] = useState({ provider: '', service: '', cost: '', reason: '', localAlt: '' })

  // Filters
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Debounced search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setSearch(searchInput)
    }, 300)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [searchInput])

  const fetchEstimates = useCallback(() => {
    setLoading(true)
    fetch('/api/cost-estimate')
      .then((r) => r.json())
      .then((data) => {
        setEstimates(Array.isArray(data) ? data : [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchEstimates()
  }, [fetchEstimates])

  const handleCreate = async () => {
    if (!newEst.provider.trim() || !newEst.service.trim() || !newEst.cost) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/cost-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: newEst.provider.trim(),
          modelOrService: newEst.service.trim(),
          estimatedCost: parseFloat(newEst.cost),
          reasonNeeded: newEst.reason || undefined,
          localAlternative: newEst.localAlt || undefined,
        }),
      })
      if (!res.ok) throw new Error('Failed to create estimate')
      toast.success('Cost estimate created')
      setNewEst({ provider: '', service: '', cost: '', reason: '', localAlt: '' })
      setCreateOpen(false)
      fetchEstimates()
    } catch {
      toast.error('Failed to create cost estimate')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAction = (est: CostEstimate, action: 'approve' | 'reject') => {
    setConfirmTarget(est)
    setConfirmAction(action)
    setConfirmOpen(true)
  }

  const confirmActionFn = async () => {
    if (!confirmTarget || !confirmAction) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/cost-estimates/${confirmTarget.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: confirmAction }),
      })
      if (!res.ok) throw new Error('Failed to update estimate')
      toast.success(`Estimate ${confirmAction === 'approve' ? 'approved' : 'rejected'}`)
      setConfirmOpen(false)
      setConfirmTarget(null)
      setConfirmAction(null)
      fetchEstimates()
    } catch {
      toast.error(`Failed to ${confirmAction} estimate`)
    } finally {
      setActionLoading(false)
    }
  }

  // Filter logic
  const filteredEstimates = estimates.filter((e) => {
    const matchSearch = !search ||
      e.provider.toLowerCase().includes(search.toLowerCase()) ||
      e.modelOrService.toLowerCase().includes(search.toLowerCase())
    const matchStatus = !statusFilter || e.status === statusFilter
    return matchSearch && matchStatus
  })

  // Computed stats
  const totalEstimates = estimates.length
  const pendingCount = estimates.filter((e) => e.status === 'pending').length
  const approvedCount = estimates.filter((e) => e.status === 'approved').length
  const rejectedCount = estimates.filter((e) => e.status === 'rejected').length
  const totalCost = estimates.reduce((sum, e) => sum + (e.estimatedCost || 0), 0)
  const blockedTotal = estimates
    .filter((e) => e.status === 'rejected')
    .reduce((sum, e) => sum + (e.estimatedCost || 0), 0)

  // Provider stats for payment guard
  const providerCounts: Record<string, { count: number; total: number }> = {}
  estimates
    .filter((e) => e.status === 'rejected')
    .forEach((e) => {
      if (!providerCounts[e.provider]) providerCounts[e.provider] = { count: 0, total: 0 }
      providerCounts[e.provider].count += 1
      providerCounts[e.provider].total += e.estimatedCost || 0
    })
  const topRejectedProviders = Object.entries(providerCounts)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString()
    } catch {
      return dateStr
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-56 bg-gray-100 rounded-lg" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl bg-gray-100" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl bg-gray-100" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold text-[#1E293B]">Cost Estimation Center</h2>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#003ABC] hover:bg-[#002A8F] text-white rounded-lg">
              <Plus className="w-4 h-4 mr-2" />
              New Estimate
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-white border-[#E2E8F0] rounded-xl sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-[#1E293B]">Create Cost Estimate</DialogTitle>
              <DialogDescription className="text-[#64748B]">Estimate costs for a paid AI service.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[#1E293B] text-sm">Provider</Label>
                  <Input
                    placeholder="e.g., OpenAI"
                    className="bg-[#F8FAFC] border-[#E2E8F0] text-[#1E293B] rounded-lg"
                    value={newEst.provider}
                    onChange={(e) => setNewEst({ ...newEst, provider: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[#1E293B] text-sm">Service</Label>
                  <Input
                    placeholder="e.g., GPT-4o API"
                    className="bg-[#F8FAFC] border-[#E2E8F0] text-[#1E293B] rounded-lg"
                    value={newEst.service}
                    onChange={(e) => setNewEst({ ...newEst, service: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[#1E293B] text-sm">Estimated Cost (USD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  className="bg-[#F8FAFC] border-[#E2E8F0] text-[#1E293B] rounded-lg"
                  value={newEst.cost}
                  onChange={(e) => setNewEst({ ...newEst, cost: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[#1E293B] text-sm">Local Alternative</Label>
                <Input
                  placeholder="e.g., Llama 3.1 (local)"
                  className="bg-[#F8FAFC] border-[#E2E8F0] text-[#1E293B] rounded-lg"
                  value={newEst.localAlt}
                  onChange={(e) => setNewEst({ ...newEst, localAlt: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[#1E293B] text-sm">Reason / Justification</Label>
                <Textarea
                  placeholder="Why is this paid service needed?"
                  className="bg-[#F8FAFC] border-[#E2E8F0] text-[#1E293B] rounded-lg min-h-[80px]"
                  value={newEst.reason}
                  onChange={(e) => setNewEst({ ...newEst, reason: e.target.value })}
                />
              </div>
              <Button
                className="w-full bg-[#003ABC] hover:bg-[#002A8F] text-white rounded-lg"
                onClick={handleCreate}
                disabled={!newEst.provider.trim() || !newEst.service.trim() || !newEst.cost || submitting}
              >
                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Estimate
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Warning Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-[#1E293B]">
          <span className="font-mono font-semibold text-amber-700">PAID_AI_API_ALLOWED=false</span>. All paid services require Super Admin approval.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { icon: DollarSign, label: 'Total Estimates', value: totalEstimates, color: 'text-[#003ABC]' },
          { icon: AlertTriangle, label: 'Pending', value: pendingCount, color: 'text-amber-500' },
          { icon: CheckCircle, label: 'Approved', value: approvedCount, color: 'text-green-500' },
          { icon: DollarSign, label: 'Total Est. Cost', value: `$${totalCost.toFixed(2)}`, color: 'text-[#FF6A00]' },
          { icon: Ban, label: 'Rejected', value: rejectedCount, color: 'text-red-500' },
        ].map((s) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="bg-white rounded-xl border border-[#E2E8F0] p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-[#94A3B8]" />
                <span className="text-xs text-[#64748B]">{s.label}</span>
              </div>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          )
        })}
      </div>

      {/* Search & Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
          <Input
            placeholder="Search by provider or service..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 bg-white border-[#E2E8F0] text-[#1E293B] rounded-lg"
          />
        </div>
        <Select value={statusFilter || '__all__'} onValueChange={(v) => setStatusFilter(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-[150px] bg-white border-[#E2E8F0] text-[#1E293B] rounded-lg text-xs">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent className="bg-white border-[#E2E8F0] rounded-lg">
            <SelectItem value="__all__" className="text-[#1E293B]">All Status</SelectItem>
            <SelectItem value="pending" className="text-[#1E293B]">Pending</SelectItem>
            <SelectItem value="approved" className="text-[#1E293B]">Approved</SelectItem>
            <SelectItem value="rejected" className="text-[#1E293B]">Rejected</SelectItem>
            <SelectItem value="expired" className="text-[#1E293B]">Expired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Estimates Table */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-[#E2E8F0] hover:bg-transparent sticky top-0 bg-white">
                <TableHead className="text-[#64748B] text-xs font-medium">Provider</TableHead>
                <TableHead className="text-[#64748B] text-xs font-medium">Service</TableHead>
                <TableHead className="text-[#64748B] text-xs font-medium text-right">Est. Cost</TableHead>
                <TableHead className="text-[#64748B] text-xs font-medium hidden sm:table-cell">Local Alternative</TableHead>
                <TableHead className="text-[#64748B] text-xs font-medium">Status</TableHead>
                <TableHead className="text-[#64748B] text-xs font-medium hidden lg:table-cell">Reason</TableHead>
                <TableHead className="text-[#64748B] text-xs font-medium hidden md:table-cell">Created</TableHead>
                <TableHead className="text-[#64748B] text-xs font-medium text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEstimates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-[#94A3B8] py-12 text-sm">No cost estimates</TableCell>
                </TableRow>
              ) : (
                filteredEstimates.map((est) => (
                  <TableRow key={est.id} className="border-[#E2E8F0] hover:bg-[#F8FAFC]">
                    <TableCell className="text-[#1E293B] font-medium text-sm">{est.provider}</TableCell>
                    <TableCell className="text-[#64748B] text-sm">{est.modelOrService}</TableCell>
                    <TableCell className="text-right text-[#1E293B] text-sm font-medium">${est.estimatedCost.toFixed(2)}</TableCell>
                    <TableCell className="text-[#94A3B8] text-xs hidden sm:table-cell">{est.localAlternative || '—'}</TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] py-0 border-0 capitalize ${getStatusBadge(est.status)}`}>
                        {est.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[#94A3B8] text-xs hidden lg:table-cell max-w-[200px] truncate">{est.reasonNeeded || '—'}</TableCell>
                    <TableCell className="text-[#94A3B8] text-xs hidden md:table-cell">{formatDate(est.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      {est.status === 'pending' && (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-green-600 hover:bg-green-500/10 hover:text-green-700"
                            onClick={() => handleAction(est, 'approve')}
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-red-500 hover:bg-red-500/10 hover:text-red-600"
                            onClick={() => handleAction(est, 'reject')}
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Payment Guard Report */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        <div className="p-4 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-red-500" />
          <h3 className="text-sm font-semibold text-[#1E293B]">Payment Guard Report</h3>
        </div>
        <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-[#E2E8F0] rounded-lg p-4">
            <h4 className="text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-3">Rejection Summary</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#1E293B]">Total Rejected</span>
                <span className="text-sm font-semibold text-red-500">{rejectedCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#1E293B]">Cost Saved</span>
                <span className="text-sm font-semibold text-green-600">${blockedTotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#1E293B]">Rejection Rate</span>
                <span className="text-sm font-semibold text-amber-500">
                  {totalEstimates > 0 ? `${Math.round((rejectedCount / totalEstimates) * 100)}%` : '0%'}
                </span>
              </div>
            </div>
          </div>

          <div className="border border-[#E2E8F0] rounded-lg p-4">
            <h4 className="text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-3">Top Rejected Providers</h4>
            {topRejectedProviders.length === 0 ? (
              <p className="text-sm text-[#94A3B8]">No rejected providers</p>
            ) : (
              <div className="space-y-2">
                {topRejectedProviders.map(([provider, info], idx) => (
                  <div key={provider} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#94A3B8] w-4">{idx + 1}.</span>
                      <span className="text-sm text-[#1E293B]">{provider}</span>
                    </div>
                    <Badge className="text-[10px] py-0 border-0 bg-red-500/10 text-red-500">{info.count} rejected</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirm Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="bg-white border-[#E2E8F0] rounded-xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B]">
              {confirmAction === 'approve' ? 'Approve Estimate' : 'Reject Estimate'}
            </DialogTitle>
            <DialogDescription className="text-[#64748B]">
              {confirmAction === 'approve'
                ? `Allow $${confirmTarget?.estimatedCost.toFixed(2)} for ${confirmTarget?.provider} — ${confirmTarget?.modelOrService}?`
                : `Reject the cost estimate for ${confirmTarget?.provider} — ${confirmTarget?.modelOrService}?`
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-[#E2E8F0] text-[#64748B] rounded-lg" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              className={`rounded-lg text-white ${
                confirmAction === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-500 hover:bg-red-600'
              }`}
              onClick={confirmActionFn}
              disabled={actionLoading}
            >
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {confirmAction === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}