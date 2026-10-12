'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Ticket,
  Plus,
  Search,
  CircleDot,
  Loader2,
  Clock,
  CheckCircle,
  XCircle,
  Send,
  MessageSquare,
  AlertCircle,
  ChevronRight,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
import { toast } from 'sonner'

interface Comment {
  text: string
  by: string
  at: string
}

interface TimelineEntry {
  event: string
  by: string
  at: string
}

interface Ticket {
  id: string
  ticketId: string
  subject: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  category: string
  assignee: string
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  comments: Comment[]
  timeline: TimelineEntry[]
  createdBy: string
  createdAt: string
  updatedAt: string
}

interface Stats {
  open: number
  in_progress: number
  resolved: number
  closed: number
  total: number
}

const priorityConfig: Record<string, string> = {
  low: 'bg-slate-100 text-slate-700 border-slate-200',
  medium: 'bg-blue-100 text-blue-700 border-blue-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  urgent: 'bg-red-100 text-red-700 border-red-200',
}

const statusConfig: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-slate-100 text-slate-600',
}

const CATEGORIES = ['general', 'bug', 'feature', 'support', 'billing', 'security', 'other']

export default function TicketsPanel() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [stats, setStats] = useState<Stats>({ open: 0, in_progress: 0, resolved: 0, closed: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const [formSubject, setFormSubject] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formPriority, setFormPriority] = useState('medium')
  const [formCategory, setFormCategory] = useState('general')
  const [formAssignee, setFormAssignee] = useState('')

  const [detailStatus, setDetailStatus] = useState('')
  const [detailPriority, setDetailPriority] = useState('')
  const [newComment, setNewComment] = useState('')

  const fetchTickets = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (search) params.set('search', search)
      const res = await fetch(`/api/tickets?${params}`)
      const data = await res.json()
      setTickets(data.tickets || [])
      setStats(data.stats || { open: 0, in_progress: 0, resolved: 0, closed: 0, total: 0 })
    } catch {
      toast.error('Error', { description: 'Failed to load tickets' })
    } finally {
      setLoading(false)
    }
  }, [statusFilter, search, toast])

  useEffect(() => {
    fetchTickets()
  }, [fetchTickets])

  const openCreate = () => {
    setFormSubject('')
    setFormDescription('')
    setFormPriority('medium')
    setFormCategory('general')
    setFormAssignee('')
    setAddOpen(true)
  }

  const handleCreate = async () => {
    if (!formSubject.trim() || !formDescription.trim()) {
      toast.error('Validation Error', { description: 'Subject and description are required' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: formSubject,
          description: formDescription,
          priority: formPriority,
          category: formCategory,
          assignee: formAssignee,
        }),
      })
      if (res.ok) {
        toast.success('Created', { description: 'Ticket has been created'  })
        setAddOpen(false)
        fetchTickets()
      } else {
        const data = await res.json()
        toast.error('Error', { description: data.error })
      }
    } catch {
      toast.error('Error', { description: 'Failed to create ticket' })
    } finally {
      setSaving(false)
    }
  }

  const selectTicket = (ticket: Ticket) => {
    setSelectedTicket(ticket)
    setDetailStatus(ticket.status)
    setDetailPriority(ticket.priority)
    setNewComment('')
  }

  const handleUpdateStatus = async (newStatus: string) => {
    if (!selectedTicket) return
    setDetailStatus(newStatus)
    setSaving(true)
    try {
      const res = await fetch(`/api/tickets/${selectedTicket.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        const data = await res.json()
        setSelectedTicket(data)
        fetchTickets()
        toast.success('Updated', { description: `Status changed to ${newStatus.replace('_', ' ')}` })
      }
    } catch {
      toast.error('Error', { description: 'Failed to update ticket' })
    } finally {
      setSaving(false)
    }
  }

  const handleUpdatePriority = async (newPriority: string) => {
    if (!selectedTicket) return
    setDetailPriority(newPriority)
    setSaving(true)
    try {
      const res = await fetch(`/api/tickets/${selectedTicket.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: newPriority }),
      })
      if (res.ok) {
        const data = await res.json()
        setSelectedTicket(data)
        fetchTickets()
      }
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  const handleAddComment = async () => {
    if (!selectedTicket || !newComment.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/tickets/${selectedTicket.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addComment: newComment }),
      })
      if (res.ok) {
        const data = await res.json()
        setSelectedTicket(data)
        setNewComment('')
        toast.success('Comment added')
      }
    } catch {
      toast.error('Error', { description: 'Failed to add comment' })
    } finally {
      setSaving(false)
    }
  }

  const handleCloseTicket = async () => {
    if (!selectedTicket) return
    setSaving(true)
    try {
      const res = await fetch(`/api/tickets/${selectedTicket.id}`, { method: 'DELETE' })
      if (res.ok) {
        setSelectedTicket(null)
        fetchTickets()
        toast.success('Closed', { description: 'Ticket has been closed'  })
      }
    } catch {
      toast.error('Error', { description: 'Failed to close ticket' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl md:col-span-2" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#1E293B]">Support Tickets</h2>
          <p className="text-sm text-[#64748B] mt-1">Track and manage support requests</p>
        </div>
        <Button onClick={openCreate} className="bg-[#003ABC] hover:bg-[#003ABC]/90">
          <Plus className="w-4 h-4 mr-2" />
          New Ticket
        </Button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Open', value: stats.open, icon: CircleDot, color: 'text-blue-500', bg: 'bg-blue-50' },
          { label: 'In Progress', value: stats.in_progress, icon: Loader2, color: 'text-amber-500', bg: 'bg-amber-50' },
          { label: 'Resolved', value: stats.resolved, icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-50' },
          { label: 'Total', value: stats.total, icon: Ticket, color: 'text-[#003ABC]', bg: 'bg-blue-50' },
        ].map((stat) => (
          <Card key={stat.label} className="border-[#E2E8F0]">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stat.bg}`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-[#1E293B]">{stat.value}</p>
                <p className="text-xs text-[#94A3B8]">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Left: Ticket List */}
        <Card className="border-[#E2E8F0]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-[#1E293B]">Tickets</CardTitle>
            <div className="flex flex-col gap-2 mt-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                <Input
                  placeholder="Search tickets..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
              </div>
              <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[500px]">
              {tickets.length === 0 ? (
                <div className="py-12 text-center">
                  <Ticket className="w-10 h-10 text-[#CBD5E1] mx-auto mb-2" />
                  <p className="text-sm text-[#94A3B8]">No tickets found.</p>
                </div>
              ) : (
                <div className="divide-y divide-[#F1F5F9]">
                  {tickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      onClick={() => selectTicket(ticket)}
                      className={`w-full text-left px-4 py-3 hover:bg-[#F8FAFC] transition-colors ${
                        selectedTicket?.id === ticket.id ? 'bg-[#F0F7FF] border-l-2 border-l-[#003ABC]' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-mono font-semibold text-[#003ABC]">
                              {ticket.ticketId}
                            </span>
                            <Badge className={`text-[9px] ${priorityConfig[ticket.priority] || ''}`}>
                              {ticket.priority}
                            </Badge>
                          </div>
                          <p className="text-sm font-medium text-[#1E293B] truncate">{ticket.subject}</p>
                          <p className="text-[11px] text-[#94A3B8] mt-0.5">
                            {ticket.category} &bull; {new Date(ticket.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-[#CBD5E1] mt-1 shrink-0" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Right: Detail View */}
        <Card className="border-[#E2E8F0] md:col-span-2">
          <CardContent className="p-4 md:p-6">
            {selectedTicket ? (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono font-semibold text-[#003ABC]">
                        {selectedTicket.ticketId}
                      </span>
                      <Badge className={`text-[10px] ${statusConfig[selectedTicket.status] || ''}`}>
                        {selectedTicket.status.replace('_', ' ')}
                      </Badge>
                      <Badge className={`text-[10px] ${priorityConfig[selectedTicket.priority] || ''}`}>
                        {selectedTicket.priority}
                      </Badge>
                    </div>
                    <h3 className="text-lg font-semibold text-[#1E293B]">{selectedTicket.subject}</h3>
                    <p className="text-xs text-[#94A3B8] mt-1">
                      Created by {selectedTicket.createdBy} &bull; {new Date(selectedTicket.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {selectedTicket.status !== 'closed' && (
                    <Button variant="outline" size="sm" onClick={handleCloseTicket} className="text-red-600 border-red-200 hover:bg-red-50">
                      <XCircle className="w-4 h-4 mr-1" />
                      Close
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-[#64748B]">Status</Label>
                    <Select value={detailStatus} onValueChange={handleUpdateStatus} disabled={selectedTicket.status === 'closed'}>
                      <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-[#64748B]">Priority</Label>
                    <Select value={detailPriority} onValueChange={handleUpdatePriority} disabled={selectedTicket.status === 'closed'}>
                      <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-[#64748B]">Assignee</Label>
                    <div className="mt-1 text-sm text-[#1E293B] bg-[#F8FAFC] rounded-md px-3 py-1.5 h-9 flex items-center">
                      {selectedTicket.assignee || <span className="text-[#94A3B8]">Unassigned</span>}
                    </div>
                  </div>
                </div>

                <Separator />

                <div>
                  <Label className="text-xs text-[#64748B]">Description</Label>
                  <div className="mt-1 bg-[#F8FAFC] p-3 rounded-lg">
                    <p className="text-sm text-[#1E293B] whitespace-pre-wrap">{selectedTicket.description}</p>
                  </div>
                </div>

                <Separator />

                <div>
                  <Label className="text-xs text-[#64748B] flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" /> Comments ({(selectedTicket.comments || []).length})
                  </Label>
                  <div className="mt-2 space-y-3">
                    {(selectedTicket.comments || []).length === 0 && (
                      <p className="text-sm text-[#94A3B8] text-center py-4">No comments yet</p>
                    )}
                    {(selectedTicket.comments || []).map((comment, idx) => (
                      <div key={idx} className="flex gap-3">
                        <Avatar className="w-7 h-7 shrink-0">
                          <AvatarFallback className="text-[10px] bg-[#E2E8F0] text-[#64748B]">
                            {(comment.by || '?').charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 bg-[#F8FAFC] rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-[#1E293B]">{comment.by}</span>
                            <span className="text-[10px] text-[#94A3B8]">{new Date(comment.at).toLocaleString()}</span>
                          </div>
                          <p className="text-sm text-[#475569]">{comment.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {selectedTicket.status !== 'closed' && (
                    <div className="flex gap-2 mt-3">
                      <Input
                        placeholder="Write a comment..."
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                        className="flex-1 h-9 text-sm"
                      />
                      <Button size="sm" onClick={handleAddComment} disabled={saving || !newComment.trim()} className="bg-[#003ABC] hover:bg-[#003ABC]/90">
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>

                <Separator />

                <div>
                  <Label className="text-xs text-[#64748B] flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Timeline
                  </Label>
                  <div className="mt-2 space-y-2">
                    {(selectedTicket.timeline || []).map((entry, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#003ABC]" />
                        <span className="text-[#64748B]">{entry.event}</span>
                        <span className="text-[#CBD5E1]">&bull;</span>
                        <span className="text-[#94A3B8]">{entry.by}</span>
                        <span className="text-[#CBD5E1]">&bull;</span>
                        <span className="text-[#94A3B8]">{new Date(entry.at).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20">
                <AlertCircle className="w-12 h-12 text-[#CBD5E1] mb-3" />
                <p className="text-sm text-[#94A3B8]">Select a ticket to view details</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create Ticket Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#003ABC]" />
              New Ticket
            </DialogTitle>
            <DialogDescription>Create a new support ticket</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Subject</Label>
              <Input value={formSubject} onChange={(e) => setFormSubject(e.target.value)} placeholder="Brief summary of the issue..." className="mt-1" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Describe the issue in detail..." rows={5} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Priority</Label>
                <Select value={formPriority} onValueChange={setFormPriority}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Assignee (optional)</Label>
              <Input value={formAssignee} onChange={(e) => setFormAssignee(e.target.value)} placeholder="Name or email..." className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving} className="bg-[#003ABC] hover:bg-[#003ABC]/90">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
