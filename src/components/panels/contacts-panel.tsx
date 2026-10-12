'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import {
  Users, Search, Filter, Mail, Phone, Building2, ChevronLeft,
  ChevronRight, ArrowUpDown, UserPlus, Trash2, Eye, X,
} from 'lucide-react'
import { Label } from '@/components/ui/label'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Contact {
  id: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  company?: string
  jobTitle?: string
  source: string
  status: string
  score: number
  tags: string
  metadata: string
  lastContactAt?: string
  createdAt: string
  _count?: { deals: number; activities: number; notes: number }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  lead: 'bg-slate-100 text-slate-700',
  prospect: 'bg-cyan-50 text-cyan-700',
  customer: 'bg-emerald-50 text-emerald-700',
  churned: 'bg-red-50 text-red-700',
}

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'lead', label: 'Lead' },
  { value: 'prospect', label: 'Prospect' },
  { value: 'customer', label: 'Customer' },
  { value: 'churned', label: 'Churned' },
]

function formatDate(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function scoreColor(score: number) {
  if (score >= 70) return 'text-emerald-600'
  if (score >= 40) return 'text-amber-600'
  return 'text-red-500'
}

function scoreBarColor(score: number) {
  if (score >= 70) return '[&>div]:bg-emerald-500'
  if (score >= 40) return '[&>div]:bg-amber-500'
  return '[&>div]:bg-red-400'
}

function getInitials(first: string, last: string) {
  return `${(first || '')[0] || ''}${(last || '')[0] || ''}`.toUpperCase() || '?'
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ContactsPanel() {
  // ── State ──
  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const limit = 20
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [newFirstName, setNewFirstName] = useState('')
  const [newLastName, setNewLastName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleAddContact = async () => {
    if (!newFirstName.trim() || !newEmail.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/crm/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: newFirstName.trim(), lastName: newLastName.trim(), email: newEmail.trim() }),
      })
      if (!res.ok) throw new Error('Failed to create contact')
      setAddDialogOpen(false)
      setNewFirstName('')
      setNewLastName('')
      setNewEmail('')
      fetchContacts(search, statusFilter, page)
    } catch {
      // Error handled silently - dialog stays open for retry
    } finally {
      setSubmitting(false)
    }
  }

  // ── Fetch contacts ──
  const fetchContacts = useCallback(async (searchTerm: string, status: string, pageNum: number) => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams()
      if (searchTerm) params.set('search', searchTerm)
      if (status) params.set('status', status)
      params.set('page', String(pageNum))
      params.set('limit', String(limit))
      const res = await fetch(`/api/crm/contacts?${params}`)
      if (!res.ok) throw new Error('Failed to fetch contacts')
      const json = await res.json()
      setContacts(json.data || [])
      setTotalPages(json.pagination?.pages || 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Initial load ──
  useEffect(() => {
    fetchContacts(search, statusFilter, page)
  }, [])

  // ── Search debounce ──
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setPage(1)
      fetchContacts(search, statusFilter, 1)
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search, statusFilter, fetchContacts])

  // ── Page change ──
  useEffect(() => {
    fetchContacts(search, statusFilter, page)
  }, [page, search, statusFilter, fetchContacts])

  // ── Delete handler ──
  const deleteContact = async (id: string) => {
    if (!confirm('Delete this contact and all related records?')) return
    try {
      await fetch(`/api/crm/contacts/${id}`, { method: 'DELETE' })
      if (selectedContact?.id === id) setSelectedContact(null)
      fetchContacts(search, statusFilter, page)
    } catch (err) {
      console.error(err)
    }
  }

  // ── Status counts ──
  const statusCounts = contacts.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#1E293B] flex items-center gap-2">
            <Users className="w-5 h-5 text-[#003ABC]" />
            Contacts
          </h2>
          <p className="text-sm text-[#64748B] mt-0.5">
            Manage your customer and lead contacts
          </p>
        </div>
        <Button
          className="bg-[#003ABC] hover:bg-[#002A8F] text-white text-sm h-9 gap-1.5"
          onClick={() => setAddDialogOpen(true)}
        >
          <UserPlus className="w-4 h-4" />
          Add Contact
        </Button>
      </div>

      {/* Status Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statusOptions.filter(s => s.value).map(s => (
          <Card key={s.value} className="bg-white border-[#E2E8F0]">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-[#64748B] font-medium">{s.label}s</p>
                <p className="text-xl font-bold text-[#1E293B]">{statusCounts[s.value] || 0}</p>
              </div>
              <Badge className={statusColors[s.value] || ''}>{s.label}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search & Filter Bar */}
      <Card className="bg-white border-[#E2E8F0]">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
              <Input
                placeholder="Search by name, email, or company..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 border-[#E2E8F0] focus:border-[#003ABC] focus:ring-[#003ABC]/20 text-[#1E293B] placeholder:text-[#94A3B8]"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-[#94A3B8] flex-shrink-0" />
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === '__all__' ? '' : v)}>
                <SelectTrigger className="w-[160px] h-9 border-[#E2E8F0] text-[#1E293B] text-sm">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent className="bg-white border-[#E2E8F0]">
                  {statusOptions.map(s => (
                    <SelectItem key={s.value || '__all__'} value={s.value || '__all__'}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error State */}
      {error && !loading && (
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <X className="w-4 h-4 text-red-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-red-700">Error loading contacts</p>
              <p className="text-xs text-red-500">{error}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => fetchContacts(search, statusFilter, page)}
              className="border-red-200 text-red-700 hover:bg-red-100 text-xs h-8">
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Main Content: Table + Detail */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Contact Table */}
        <div className="flex-1 min-w-0">
          <Card className="bg-white border-[#E2E8F0]">
            <CardHeader className="pb-3 px-4 pt-4">
              <CardTitle className="text-sm font-semibold text-[#1E293B] flex items-center gap-2">
                <Users className="w-4 h-4 text-[#64748B]" />
                Contact List
                <span className="text-xs font-normal text-[#94A3B8] ml-1">
                  {contacts.length} result{contacts.length !== 1 ? 's' : ''}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="space-y-3 p-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-9 w-9 rounded-full bg-gray-100" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-40 bg-gray-100" />
                        <Skeleton className="h-3 w-56 bg-gray-100" />
                      </div>
                      <Skeleton className="h-6 w-16 rounded-full bg-gray-100" />
                    </div>
                  ))}
                </div>
              ) : contacts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4">
                  <div className="w-16 h-16 rounded-full bg-[#F1F5F9] flex items-center justify-center mb-4">
                    <Users className="w-8 h-8 text-[#94A3B8]" />
                  </div>
                  <p className="text-sm font-medium text-[#1E293B]">No contacts found</p>
                  <p className="text-xs text-[#64748B] mt-1">
                    {search || statusFilter
                      ? 'Try adjusting your search or filters'
                      : 'Add your first contact to get started'}
                  </p>
                </div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b border-[#E2E8F0] hover:bg-transparent">
                          <TableHead className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Name</TableHead>
                          <TableHead className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Email</TableHead>
                          <TableHead className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Phone</TableHead>
                          <TableHead className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Company</TableHead>
                          <TableHead className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Status</TableHead>
                          <TableHead className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Score</TableHead>
                          <TableHead className="text-xs font-semibold text-[#64748B] uppercase tracking-wider text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {contacts.map((contact) => (
                          <TableRow
                            key={contact.id}
                            className={`border-b border-[#F1F5F9] cursor-pointer transition-colors ${
                              selectedContact?.id === contact.id ? 'bg-[#003ABC]/5' : 'hover:bg-[#F8FAFC]'
                            }`}
                            onClick={() => setSelectedContact(contact)}
                          >
                            <TableCell>
                              <div className="flex items-center gap-2.5">
                                <Avatar className="h-8 w-8 border border-[#E2E8F0]">
                                  <AvatarFallback className="bg-[#003ABC]/10 text-[#003ABC] text-xs font-semibold">
                                    {getInitials(contact.firstName, contact.lastName)}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="text-sm font-medium text-[#1E293B]">
                                    {contact.firstName} {contact.lastName}
                                  </p>
                                  {contact.jobTitle && (
                                    <p className="text-xs text-[#94A3B8]">{contact.jobTitle}</p>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-[#64748B]">{contact.email}</span>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-[#64748B]">{contact.phone || '—'}</span>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-[#64748B]">{contact.company || '—'}</span>
                            </TableCell>
                            <TableCell>
                              <Badge className={`${statusColors[contact.status] || 'bg-gray-100 text-gray-700'} text-xs border-0`}>
                                {contact.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span className={`text-sm font-semibold ${scoreColor(contact.score)}`}>
                                {contact.score}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-[#64748B] hover:text-[#003ABC] hover:bg-[#003ABC]/10"
                                  onClick={(e) => { e.stopPropagation(); setSelectedContact(contact) }}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-[#64748B] hover:text-red-600 hover:bg-red-50"
                                  onClick={(e) => { e.stopPropagation(); deleteContact(contact.id) }}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="md:hidden divide-y divide-[#F1F5F9]">
                    {contacts.map((contact) => (
                      <div
                        key={contact.id}
                        className="p-4 cursor-pointer hover:bg-[#F8FAFC] transition-colors"
                        onClick={() => setSelectedContact(contact)}
                      >
                        <div className="flex items-start gap-3">
                          <Avatar className="h-10 w-10 border border-[#E2E8F0]">
                            <AvatarFallback className="bg-[#003ABC]/10 text-[#003ABC] text-sm font-semibold">
                              {getInitials(contact.firstName, contact.lastName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium text-[#1E293B] truncate">
                                {contact.firstName} {contact.lastName}
                              </p>
                              <Badge className={`${statusColors[contact.status] || 'bg-gray-100 text-gray-700'} text-[10px] border-0 flex-shrink-0 ml-2`}>
                                {contact.status}
                              </Badge>
                            </div>
                            <p className="text-xs text-[#64748B] truncate mt-0.5">{contact.email}</p>
                            {contact.company && (
                              <p className="text-xs text-[#94A3B8] mt-1">{contact.company}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-[#E2E8F0]">
                      <p className="text-xs text-[#94A3B8]">Page {page} of {totalPages}</p>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-[#64748B] hover:text-[#1E293B] hover:bg-[#F1F5F9] disabled:opacity-40"
                          disabled={page <= 1}
                          onClick={() => setPage(p => p - 1)}
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(p => (
                          <Button
                            key={p}
                            variant="ghost"
                            size="icon"
                            className={`h-7 w-7 text-xs ${p === page ? 'bg-[#003ABC] text-white hover:bg-[#002A8F]' : 'text-[#64748B] hover:bg-[#F1F5F9]'}`}
                            onClick={() => setPage(p)}
                          >
                            {p}
                          </Button>
                        ))}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-[#64748B] hover:text-[#1E293B] hover:bg-[#F1F5F9] disabled:opacity-40"
                          disabled={page >= totalPages}
                          onClick={() => setPage(p => p + 1)}
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Contact Detail Sidebar */}
        {selectedContact && (
          <div className="w-full lg:w-[360px] flex-shrink-0">
            <Card className="bg-white border-[#E2E8F0] sticky top-6">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-[#1E293B]">Contact Details</CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-[#94A3B8] hover:text-[#1E293B] hover:bg-[#F1F5F9]"
                    onClick={() => setSelectedContact(null)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Avatar & Name */}
                <div className="text-center">
                  <Avatar className="h-16 w-16 border-2 border-[#E2E8F0] mx-auto">
                    <AvatarFallback className="bg-[#003ABC]/10 text-[#003ABC] text-xl font-bold">
                      {getInitials(selectedContact.firstName, selectedContact.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  <h3 className="text-base font-semibold text-[#1E293B] mt-3">
                    {selectedContact.firstName} {selectedContact.lastName}
                  </h3>
                  {selectedContact.jobTitle && (
                    <p className="text-sm text-[#64748B]">{selectedContact.jobTitle}</p>
                  )}
                  <Badge className={`${statusColors[selectedContact.status] || 'bg-gray-100 text-gray-700'} text-xs border-0 mt-2`}>
                    {selectedContact.status}
                  </Badge>
                </div>

                <Separator className="bg-[#E2E8F0]" />

                {/* Lead Score */}
                <div>
                  <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-2">Lead Score</p>
                  <div className="flex items-center gap-3">
                    <Progress value={selectedContact.score} className={`h-2 flex-1 ${scoreBarColor(selectedContact.score)}`} />
                    <span className={`text-sm font-bold ${scoreColor(selectedContact.score)}`}>
                      {selectedContact.score}
                    </span>
                  </div>
                </div>

                <Separator className="bg-[#E2E8F0]" />

                {/* Contact Info */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Contact Information</p>
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-[#F1F5F9] flex items-center justify-center flex-shrink-0">
                        <Mail className="w-3.5 h-3.5 text-[#64748B]" />
                      </div>
                      <span className="text-sm text-[#1E293B] truncate">{selectedContact.email}</span>
                    </div>
                    {selectedContact.phone && (
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[#F1F5F9] flex items-center justify-center flex-shrink-0">
                          <Phone className="w-3.5 h-3.5 text-[#64748B]" />
                        </div>
                        <span className="text-sm text-[#1E293B]">{selectedContact.phone}</span>
                      </div>
                    )}
                    {selectedContact.company && (
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[#F1F5F9] flex items-center justify-center flex-shrink-0">
                          <Building2 className="w-3.5 h-3.5 text-[#64748B]" />
                        </div>
                        <span className="text-sm text-[#1E293B]">{selectedContact.company}</span>
                      </div>
                    )}
                  </div>
                </div>

                <Separator className="bg-[#E2E8F0]" />

                {/* Stats */}
                {selectedContact._count && (
                  <div>
                    <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-2">Activity</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center p-2 rounded-lg bg-[#F8FAFC]">
                        <p className="text-lg font-bold text-[#1E293B]">{selectedContact._count.deals}</p>
                        <p className="text-[10px] text-[#94A3B8]">Deals</p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-[#F8FAFC]">
                        <p className="text-lg font-bold text-[#1E293B]">{selectedContact._count.activities}</p>
                        <p className="text-[10px] text-[#94A3B8]">Activities</p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-[#F8FAFC]">
                        <p className="text-lg font-bold text-[#1E293B]">{selectedContact._count.notes}</p>
                        <p className="text-[10px] text-[#94A3B8]">Notes</p>
                      </div>
                    </div>
                  </div>
                )}

                <Separator className="bg-[#E2E8F0]" />

                {/* Metadata */}
                <div className="space-y-2 text-xs text-[#94A3B8]">
                  <div className="flex justify-between">
                    <span>Source</span>
                    <span className="text-[#64748B] capitalize">{selectedContact.source}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Last Contact</span>
                    <span className="text-[#64748B]">{formatDate(selectedContact.lastContactAt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Created</span>
                    <span className="text-[#64748B]">{formatDate(selectedContact.createdAt)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 text-xs border-[#E2E8F0] text-[#1E293B] hover:bg-[#F1F5F9]"
                    onClick={() => deleteContact(selectedContact.id)}
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Add Contact Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Contact</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="contact-first">First Name *</Label>
              <Input id="contact-first" value={newFirstName} onChange={e => setNewFirstName(e.target.value)} placeholder="John" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-last">Last Name</Label>
              <Input id="contact-last" value={newLastName} onChange={e => setNewLastName(e.target.value)} placeholder="Doe" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-email">Email *</Label>
              <Input id="contact-email" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="john@company.com" />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              className="bg-[#003ABC] hover:bg-[#002A8F] text-white"
              onClick={handleAddContact}
              disabled={submitting || !newFirstName.trim() || !newEmail.trim()}
            >
              {submitting ? 'Creating...' : 'Add Contact'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}