'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Search,
  Plus,
  CheckCircle,
  XCircle,
  ArrowRight,
  Lightbulb,
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

interface CapabilityRequest {
  id: string
  type: string
  title: string
  description: string | null
  proposedBy: string | null
  status: string
  createdAt: string
  updatedAt: string
}

function getTypeBadge(type: string) {
  const map: Record<string, string> = {
    new_agent: 'bg-blue-100 text-blue-700',
    new_skill: 'bg-purple-100 text-purple-700',
    new_workflow: 'bg-green-100 text-green-700',
  }
  return map[type] || 'bg-gray-100 text-gray-700'
}

function getTypeLabel(type: string) {
  const map: Record<string, string> = {
    new_agent: 'New Agent',
    new_skill: 'New Skill',
    new_workflow: 'New Workflow',
  }
  return map[type] || type
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    pending: 'bg-amber-500/10 text-amber-600',
    approved: 'bg-green-500/10 text-green-600',
    rejected: 'bg-red-500/10 text-red-500',
  }
  return map[status] || 'bg-gray-100 text-gray-700'
}

const STATUS_FLOW = ['pending', 'approved', 'rejected']

export default function CapabilityRequestPanel() {
  const [loading, setLoading] = useState(true)
  const [requests, setRequests] = useState<CapabilityRequest[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'approve' | 'reject' | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<CapabilityRequest | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [newRequest, setNewRequest] = useState({ type: '', title: '', description: '' })

  // Filters
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Debounced search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setSearch(searchInput)
    }, 300)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [searchInput])

  const fetchRequests = useCallback(() => {
    setLoading(true)
    fetch('/api/capability/requests')
      .then((r) => r.json())
      .then((data) => {
        setRequests(data.requests || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchRequests()
  }, [fetchRequests])

  const handleCreate = async () => {
    if (!newRequest.type || !newRequest.title.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/capability/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: newRequest.type,
          title: newRequest.title.trim(),
          description: newRequest.description || undefined,
          proposedBy: 'Super Admin',
        }),
      })
      if (!res.ok) throw new Error('Failed to create request')
      toast.success('Capability request created')
      setNewRequest({ type: '', title: '', description: '' })
      setCreateOpen(false)
      fetchRequests()
    } catch {
      toast.error('Failed to create capability request')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAction = (req: CapabilityRequest, action: 'approve' | 'reject') => {
    setConfirmTarget(req)
    setConfirmAction(action)
    setConfirmOpen(true)
  }

  const confirmActionFn = async () => {
    if (!confirmTarget || !confirmAction) return
    setActionLoading(true)
    try {
      const res = await fetch('/api/capability/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: confirmTarget.id,
          action: confirmAction,
        }),
      })
      if (!res.ok) throw new Error('Failed to update request')
      toast.success(`Request ${confirmAction === 'approve' ? 'approved' : 'rejected'}`)
      setConfirmOpen(false)
      setConfirmTarget(null)
      setConfirmAction(null)
      fetchRequests()
    } catch {
      toast.error(`Failed to ${confirmAction} request`)
    } finally {
      setActionLoading(false)
    }
  }

  // Filter logic
  const filteredRequests = requests.filter((r) => {
    const matchSearch = !search ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      (r.description || '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = !statusFilter || r.status === statusFilter
    const matchType = !typeFilter || r.type === typeFilter
    return matchSearch && matchStatus && matchType
  })

  const totalRequests = requests.length
  const pendingCount = requests.filter((r) => r.status === 'pending').length
  const approvedCount = requests.filter((r) => r.status === 'approved').length
  const rejectedCount = requests.filter((r) => r.status === 'rejected').length

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
        <Skeleton className="h-8 w-48 bg-gray-100 rounded-lg" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
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
        <h2 className="text-xl font-semibold text-[#1E293B]">Capability Requests</h2>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#003ABC] hover:bg-[#002A8F] text-white rounded-lg">
              <Plus className="w-4 h-4 mr-2" />
              New Request
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-white border-[#E2E8F0] rounded-xl sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-[#1E293B]">New Capability Request</DialogTitle>
              <DialogDescription className="text-[#64748B]">Request a new agent, skill, or workflow.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label className="text-[#1E293B] text-sm">Type</Label>
                <Select value={newRequest.type} onValueChange={(v) => setNewRequest({ ...newRequest, type: v })}>
                  <SelectTrigger className="bg-[#F8FAFC] border-[#E2E8F0] text-[#1E293B] rounded-lg">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[#E2E8F0] rounded-lg">
                    <SelectItem value="new_agent" className="text-[#1E293B]">New Agent</SelectItem>
                    <SelectItem value="new_skill" className="text-[#1E293B]">New Skill</SelectItem>
                    <SelectItem value="new_workflow" className="text-[#1E293B]">New Workflow</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[#1E293B] text-sm">Title</Label>
                <Input
                  placeholder="e.g., Invoice Processing Agent"
                  className="bg-[#F8FAFC] border-[#E2E8F0] text-[#1E293B] rounded-lg"
                  value={newRequest.title}
                  onChange={(e) => setNewRequest({ ...newRequest, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[#1E293B] text-sm">Description</Label>
                <Textarea
                  placeholder="Describe what this capability should do..."
                  className="bg-[#F8FAFC] border-[#E2E8F0] text-[#1E293B] rounded-lg min-h-[80px]"
                  value={newRequest.description}
                  onChange={(e) => setNewRequest({ ...newRequest, description: e.target.value })}
                />
              </div>
              <Button
                className="w-full bg-[#003ABC] hover:bg-[#002A8F] text-white rounded-lg"
                onClick={handleCreate}
                disabled={!newRequest.type || !newRequest.title.trim() || submitting}
              >
                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Submit Request
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Banner */}
      <div className="bg-[#FF6A00]/5 border border-[#FF6A00]/20 rounded-xl p-4 flex items-start gap-3">
        <Lightbulb className="w-5 h-5 text-[#FF6A00] mt-0.5 flex-shrink-0" />
        <p className="text-sm text-[#1E293B]">
          When no existing agent can handle a query, the system detects the gap and requests a new agent build.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Requests', value: totalRequests, color: 'text-[#003ABC]' },
          { label: 'Pending', value: pendingCount, color: 'text-amber-500' },
          { label: 'Approved', value: approvedCount, color: 'text-green-500' },
          { label: 'Rejected', value: rejectedCount, color: 'text-red-500' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-[#E2E8F0] p-4">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-[#64748B] mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Status Flow Visualization */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
        <h3 className="text-sm font-semibold text-[#1E293B] mb-3">Status Flow</h3>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {STATUS_FLOW.map((status, idx) => (
            <div key={status} className="flex items-center gap-2 flex-shrink-0">
              <div className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize ${
                status === 'pending' ? 'bg-amber-500/10 text-amber-600' :
                status === 'approved' ? 'bg-green-500/10 text-green-600' :
                'bg-red-500/10 text-red-500'
              }`}>
                {status}
              </div>
              {idx < STATUS_FLOW.length - 1 && (
                <ArrowRight className="w-4 h-4 text-[#94A3B8]" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
          <Input
            placeholder="Search requests..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 bg-white border-[#E2E8F0] text-[#1E293B] rounded-lg"
          />
        </div>
        <Select value={typeFilter || '__all__'} onValueChange={(v) => setTypeFilter(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-[140px] bg-white border-[#E2E8F0] text-[#1E293B] rounded-lg text-xs">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent className="bg-white border-[#E2E8F0] rounded-lg">
            <SelectItem value="__all__" className="text-[#1E293B]">All Types</SelectItem>
            <SelectItem value="new_agent" className="text-[#1E293B]">New Agent</SelectItem>
            <SelectItem value="new_skill" className="text-[#1E293B]">New Skill</SelectItem>
            <SelectItem value="new_workflow" className="text-[#1E293B]">New Workflow</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter || '__all__'} onValueChange={(v) => setStatusFilter(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-[140px] bg-white border-[#E2E8F0] text-[#1E293B] rounded-lg text-xs">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent className="bg-white border-[#E2E8F0] rounded-lg">
            <SelectItem value="__all__" className="text-[#1E293B]">All Status</SelectItem>
            <SelectItem value="pending" className="text-[#1E293B]">Pending</SelectItem>
            <SelectItem value="approved" className="text-[#1E293B]">Approved</SelectItem>
            <SelectItem value="rejected" className="text-[#1E293B]">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-[#E2E8F0] hover:bg-transparent sticky top-0 bg-white">
                <TableHead className="text-[#64748B] text-xs font-medium">Title</TableHead>
                <TableHead className="text-[#64748B] text-xs font-medium">Type</TableHead>
                <TableHead className="text-[#64748B] text-xs font-medium hidden sm:table-cell">Proposed By</TableHead>
                <TableHead className="text-[#64748B] text-xs font-medium">Status</TableHead>
                <TableHead className="text-[#64748B] text-xs font-medium hidden md:table-cell">Created</TableHead>
                <TableHead className="text-[#64748B] text-xs font-medium text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRequests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-[#94A3B8] py-12 text-sm">No capability requests</TableCell>
                </TableRow>
              ) : (
                filteredRequests.map((req) => (
                  <TableRow key={req.id} className="border-[#E2E8F0] hover:bg-[#F8FAFC]">
                    <TableCell className="text-[#1E293B] font-medium text-sm">{req.title}</TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] py-0 border-0 ${getTypeBadge(req.type)}`}>
                        {getTypeLabel(req.type)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[#64748B] text-sm hidden sm:table-cell">{req.proposedBy || '—'}</TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] py-0 border-0 capitalize ${getStatusBadge(req.status)}`}>
                        {req.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[#94A3B8] text-xs hidden md:table-cell">{formatDate(req.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      {req.status === 'pending' && (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-green-600 hover:bg-green-500/10 hover:text-green-700"
                            onClick={() => handleAction(req, 'approve')}
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-red-500 hover:bg-red-500/10 hover:text-red-600"
                            onClick={() => handleAction(req, 'reject')}
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

      {/* Confirm Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="bg-white border-[#E2E8F0] rounded-xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B]">
              {confirmAction === 'approve' ? 'Approve Request' : 'Reject Request'}
            </DialogTitle>
            <DialogDescription className="text-[#64748B]">
              Are you sure you want to {confirmAction} &quot;{confirmTarget?.title}&quot;?
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