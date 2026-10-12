'use client'

import { useState, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import {
  Users, UserPlus, DollarSign, GitBranch, Phone, Mail, Calendar, Clock,
  TrendingUp, Plus, Search, Filter, MoreHorizontal, ChevronRight, Star, Target,
  ArrowLeft, Trash2, Edit, Eye, Activity, MessageSquare, CheckSquare,
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Contact {
  id: string; firstName: string; lastName: string; email: string; phone?: string;
  company?: string; jobTitle?: string; source: string; status: string; score: number;
  tags: string; metadata: string; lastContactAt?: string; createdAt: string;
  _count?: { deals: number; activities: number; notes: number }
  deals?: Deal[]; activities?: CrmActivity[]; notes?: Note[]; scores?: LeadScore[]
}

interface Deal {
  id: string; contactId: string; pipelineId: string; stageId: string;
  title: string; value: number; currency: string; probability: number;
  expectedClose?: string; actualClose?: string; lostReason?: string;
  status: string; createdAt: string;
  contact?: { id: string; firstName: string; lastName: string; email: string }
  pipeline?: { id: string; name: string; stages?: PipelineStage[] }
  stage?: { id: string; name: string; color: string }
  activities?: CrmActivity[]
}

interface Pipeline {
  id: string; name: string; description?: string; isDefault: boolean;
  sortOrder: number; status: string; totalValue: number;
  stages: (PipelineStage & { dealCount: number; totalValue: number })[]
  _count?: { deals: number }
}

interface PipelineStage {
  id: string; pipelineId: string; name: string; color: string;
  sortOrder: number; probability: number; createdAt: string
}

interface CrmActivity {
  id: string; contactId?: string; dealId?: string; type: string;
  subject: string; description?: string; direction?: string; status: string;
  scheduledAt?: string; completedAt?: string; durationMin?: number;
  createdAt: string;
  contact?: { id: string; firstName: string; lastName: string; email: string }
  deal?: { id: string; title: string }
}

interface Note {
  id: string; contactId: string; content: string; createdBy?: string; createdAt: string
}

interface LeadScore {
  id: string; contactId: string; score: number; maxScore: number;
  factors: string; calculatedBy: string; createdAt: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  lead: 'bg-slate-100 text-slate-700',
  prospect: 'bg-cyan-50 text-cyan-700',
  customer: 'bg-emerald-50 text-emerald-700',
  churned: 'bg-red-50 text-red-700',
}

const activityIcons: Record<string, React.ElementType> = {
  call: Phone,
  email: Mail,
  meeting: Users,
  task: CheckSquare,
  note: MessageSquare,
}

const activityColors: Record<string, string> = {
  call: 'text-emerald-600 bg-emerald-50',
  email: 'text-blue-600 bg-blue-50',
  meeting: 'text-purple-600 bg-purple-50',
  task: 'text-amber-600 bg-amber-50',
  note: 'text-slate-600 bg-slate-50',
}

function formatCurrency(val: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(val)
}

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

// ─── Component ───────────────────────────────────────────────────────────────

export default function CrmDealsPanel() {
  const [tab, setTab] = useState('contacts')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [activities, setActivities] = useState<CrmActivity[]>([])
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null)
  const [contactSearch, setContactSearch] = useState('')
  const [contactStatusFilter, setContactStatusFilter] = useState('')
  const [dealPipelineFilter, setDealPipelineFilter] = useState('')
  const [dealStageFilter, setDealStageFilter] = useState('')
  const [dealSearch, setDealSearch] = useState('')
  const [activityTypeFilter, setActivityTypeFilter] = useState('')

  // ── Fetchers ──
  const fetchContacts = async () => {
    try {
      const params = new URLSearchParams()
      if (contactSearch) params.set('search', contactSearch)
      if (contactStatusFilter) params.set('status', contactStatusFilter)
      params.set('limit', '50')
      const res = await fetch(`/api/crm/contacts?${params}`)
      const json = await res.json()
      if (json.data) setContacts(json.data)
    } catch (e) { console.error(e) }
  }

  const fetchDeals = async () => {
    try {
      const params = new URLSearchParams()
      if (dealPipelineFilter) params.set('pipelineId', dealPipelineFilter)
      if (dealStageFilter) params.set('stageId', dealStageFilter)
      if (dealSearch) params.set('search', dealSearch)
      params.set('limit', '50')
      const res = await fetch(`/api/crm/deals?${params}`)
      const json = await res.json()
      if (json.data) setDeals(json.data)
    } catch (e) { console.error(e) }
  }

  const fetchPipelines = async () => {
    try {
      const res = await fetch('/api/crm/pipelines')
      const json = await res.json()
      if (json.data) setPipelines(json.data)
    } catch (e) { console.error(e) }
  }

  const fetchActivities = async () => {
    try {
      const params = new URLSearchParams()
      if (activityTypeFilter) params.set('type', activityTypeFilter)
      params.set('limit', '50')
      const res = await fetch(`/api/crm/activities?${params}`)
      const json = await res.json()
      if (json.data) setActivities(json.data)
    } catch (e) { console.error(e) }
  }

  const [loading, setLoading] = useState(true)

  const initRef = useRef<number | null>(null)
  if (initRef.current === null) {
    initRef.current = 1
    Promise.all([fetchContacts(), fetchDeals(), fetchPipelines(), fetchActivities()])
      .finally(() => setLoading(false))
  }

  // ── Delete handlers ──
  const deleteContact = async (id: string) => {
    if (!confirm('Delete this contact and all related records?')) return
    await fetch(`/api/crm/contacts/${id}`, { method: 'DELETE' })
    setSelectedContact(null)
    fetchContacts()
  }

  const deleteDeal = async (id: string) => {
    if (!confirm('Delete this deal?')) return
    await fetch(`/api/crm/deals/${id}`, { method: 'DELETE' })
    setSelectedDeal(null)
    fetchDeals()
  }

  const createPipeline = async (name: string, description?: string) => {
    await fetch('/api/crm/pipelines', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    })
    fetchPipelines()
  }

  const calculateScore = async (contactId: string) => {
    try {
      const res = await fetch('/api/crm/lead-score', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId }),
      })
      const json = await res.json()
      if (json.data && selectedContact) {
        setSelectedContact({ ...selectedContact, score: json.data.score })
      }
      if (selectedContact) {
        const detail = await fetch(`/api/crm/contacts/${contactId}`)
        const d = await detail.json()
        if (d.data) setSelectedContact(d.data)
      }
      fetchContacts()
    } catch (e) { console.error(e) }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 bg-white min-h-full">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1E293B] flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#003ABC]/10 flex items-center justify-center">
              <Target className="w-5 h-5 text-[#003ABC]" />
            </div>
            CRM Manager
          </h1>
          <p className="text-sm text-[#64748B] mt-1">Manage contacts, deals, pipelines, and activities</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-[#F1F5F9] p-1 h-auto">
          <TabsTrigger value="contacts" className="data-[state=active]:bg-white data-[state=active]:text-[#003ABC] data-[state=active]:shadow-sm gap-1.5 text-sm">
            <Users className="w-4 h-4" /> Contacts
          </TabsTrigger>
          <TabsTrigger value="deals" className="data-[state=active]:bg-white data-[state=active]:text-[#003ABC] data-[state=active]:shadow-sm gap-1.5 text-sm">
            <DollarSign className="w-4 h-4" /> Deals
          </TabsTrigger>
          <TabsTrigger value="pipelines" className="data-[state=active]:bg-white data-[state=active]:text-[#003ABC] data-[state=active]:shadow-sm gap-1.5 text-sm">
            <GitBranch className="w-4 h-4" /> Pipelines
          </TabsTrigger>
          <TabsTrigger value="activities" className="data-[state=active]:bg-white data-[state=active]:text-[#003ABC] data-[state=active]:shadow-sm gap-1.5 text-sm">
            <Activity className="w-4 h-4" /> Activities
          </TabsTrigger>
        </TabsList>

        {/* ════════════════════════════════════════════════════════════════
            CONTACTS TAB
            ════════════════════════════════════════════════════════════════ */}
        <TabsContent value="contacts" className="space-y-4">
          {selectedContact ? (
            <ContactDetailView
              contact={selectedContact}
              onBack={() => setSelectedContact(null)}
              onDelete={deleteContact}
              onScore={() => calculateScore(selectedContact.id)}
              onRefresh={async () => {
                const res = await fetch(`/api/crm/contacts/${selectedContact.id}`)
                const json = await res.json()
                if (json.data) setSelectedContact(json.data)
              }}
            />
          ) : (
            <Card className="border-[#E2E8F0] shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <CardTitle className="text-base font-semibold text-[#1E293B]">
                    All Contacts ({contacts.length})
                  </CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative flex-1 min-w-[180px]">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                      <Input
                        placeholder="Search contacts..."
                        value={contactSearch}
                        onChange={(e) => setContactSearch(e.target.value)}
                        className="pl-8 h-9 text-sm border-[#E2E8F0]"
                      />
                    </div>
                    <Select value={contactStatusFilter} onValueChange={(v) => setContactStatusFilter(v === '__all' ? '' : v)}>
                      <SelectTrigger className="w-[140px] h-9 text-sm border-[#E2E8F0]">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all">All Status</SelectItem>
                        <SelectItem value="lead">Lead</SelectItem>
                        <SelectItem value="prospect">Prospect</SelectItem>
                        <SelectItem value="customer">Customer</SelectItem>
                        <SelectItem value="churned">Churned</SelectItem>
                      </SelectContent>
                    </Select>
                    <AddContactDialog onSave={() => fetchContacts()} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[520px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-[#E2E8F0] hover:bg-transparent">
                        <TableHead className="text-xs font-semibold text-[#64748B]">Name</TableHead>
                        <TableHead className="text-xs font-semibold text-[#64748B]">Email</TableHead>
                        <TableHead className="text-xs font-semibold text-[#64748B] hidden md:table-cell">Company</TableHead>
                        <TableHead className="text-xs font-semibold text-[#64748B]">Status</TableHead>
                        <TableHead className="text-xs font-semibold text-[#64748B] hidden lg:table-cell">Score</TableHead>
                        <TableHead className="text-xs font-semibold text-[#64748B] hidden xl:table-cell">Last Contact</TableHead>
                        <TableHead className="text-xs font-semibold text-[#64748B] w-[60px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <TableRow key={i} className="border-b border-[#F1F5F9]">
                            <TableCell colSpan={7}><div className="h-10 bg-[#F8FAFC] animate-pulse rounded" /></TableCell>
                          </TableRow>
                        ))
                      ) : contacts.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-12 text-[#94A3B8] text-sm">No contacts found</TableCell></TableRow>
                      ) : contacts.map((c) => (
                        <TableRow
                          key={c.id}
                          className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] cursor-pointer"
                          onClick={() => setSelectedContact(c)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <Avatar className="h-8 w-8 border border-[#E2E8F0]">
                                <AvatarFallback className="bg-[#003ABC]/10 text-[#003ABC] text-xs font-semibold">
                                  {c.firstName[0]}{c.lastName[0]}
                                </AvatarFallback>
                              </Avatar>
                              <span className="font-medium text-sm text-[#1E293B]">{c.firstName} {c.lastName}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-[#64748B]">{c.email}</TableCell>
                          <TableCell className="text-sm text-[#64748B] hidden md:table-cell">{c.company || '—'}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={`text-xs font-medium ${statusColors[c.status] || ''}`}>
                              {c.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <div className="flex items-center gap-2 min-w-[100px]">
                              <Progress value={c.score} className={`h-2 flex-1 ${scoreBarColor(c.score)}`} />
                              <span className={`text-xs font-semibold w-7 text-right ${scoreColor(c.score)}`}>{c.score}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-[#94A3B8] hidden xl:table-cell">{formatDate(c.lastContactAt)}</TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                                  <MoreHorizontal className="w-4 h-4 text-[#94A3B8]" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedContact(c) }}>
                                  <Eye className="w-4 h-4 mr-2" /> View
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedContact(c) }}>
                                  <Edit className="w-4 h-4 mr-2" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-red-600" onClick={(e) => { e.stopPropagation(); deleteContact(c.id) }}>
                                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════
            DEALS TAB
            ════════════════════════════════════════════════════════════════ */}
        <TabsContent value="deals" className="space-y-4">
          {selectedDeal ? (
            <DealDetailView
              deal={selectedDeal}
              pipelines={pipelines}
              onBack={() => setSelectedDeal(null)}
              onDelete={deleteDeal}
              onRefresh={async () => {
                const res = await fetch(`/api/crm/deals/${selectedDeal.id}`)
                const json = await res.json()
                if (json.data) setSelectedDeal(json.data)
              }}
            />
          ) : (
            <Card className="border-[#E2E8F0] shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <CardTitle className="text-base font-semibold text-[#1E293B]">
                    All Deals ({deals.length})
                  </CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative flex-1 min-w-[160px]">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                      <Input placeholder="Search deals..." value={dealSearch} onChange={(e) => setDealSearch(e.target.value)} className="pl-8 h-9 text-sm border-[#E2E8F0]" />
                    </div>
                    <Select value={dealPipelineFilter || '__all'} onValueChange={(v) => setDealPipelineFilter(v === '__all' ? '' : v)}>
                      <SelectTrigger className="w-[140px] h-9 text-sm border-[#E2E8F0]"><SelectValue placeholder="Pipeline" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all">All Pipelines</SelectItem>
                        {pipelines.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={dealStageFilter || '__all'} onValueChange={(v) => setDealStageFilter(v === '__all' ? '' : v)}>
                      <SelectTrigger className="w-[130px] h-9 text-sm border-[#E2E8F0]"><SelectValue placeholder="Stage" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all">All Stages</SelectItem>
                        {pipelines.flatMap(p => p.stages).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <AddDealDialog contacts={contacts} pipelines={pipelines} onSave={() => fetchDeals()} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[520px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-[#E2E8F0] hover:bg-transparent">
                        <TableHead className="text-xs font-semibold text-[#64748B]">Title</TableHead>
                        <TableHead className="text-xs font-semibold text-[#64748B] hidden md:table-cell">Contact</TableHead>
                        <TableHead className="text-xs font-semibold text-[#64748B] hidden lg:table-cell">Pipeline</TableHead>
                        <TableHead className="text-xs font-semibold text-[#64748B]">Stage</TableHead>
                        <TableHead className="text-xs font-semibold text-[#64748B]">Value</TableHead>
                        <TableHead className="text-xs font-semibold text-[#64748B] hidden md:table-cell">Prob %</TableHead>
                        <TableHead className="text-xs font-semibold text-[#64748B] hidden xl:table-cell">Exp. Close</TableHead>
                        <TableHead className="text-xs font-semibold text-[#64748B] w-[60px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <TableRow key={i} className="border-b border-[#F1F5F9]">
                            <TableCell colSpan={8}><div className="h-10 bg-[#F8FAFC] animate-pulse rounded" /></TableCell>
                          </TableRow>
                        ))
                      ) : deals.length === 0 ? (
                        <TableRow><TableCell colSpan={8} className="text-center py-12 text-[#94A3B8] text-sm">No deals found</TableCell></TableRow>
                      ) : deals.map((d) => (
                        <TableRow key={d.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] cursor-pointer" onClick={() => setSelectedDeal(d)}>
                          <TableCell className="font-medium text-sm text-[#1E293B]">{d.title}</TableCell>
                          <TableCell className="text-sm text-[#64748B] hidden md:table-cell">
                            {d.contact ? `${d.contact.firstName} ${d.contact.lastName}` : '—'}
                          </TableCell>
                          <TableCell className="text-sm text-[#64748B] hidden lg:table-cell">{d.pipeline?.name || '—'}</TableCell>
                          <TableCell>
                            {d.stage && (
                              <Badge variant="secondary" className="text-xs font-medium" style={{ backgroundColor: d.stage.color + '18', color: d.stage.color, borderColor: d.stage.color + '40', border: '1px solid' }}>
                                {d.stage.name}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-semibold text-sm text-[#1E293B]">{formatCurrency(d.value, d.currency)}</TableCell>
                          <TableCell className="text-sm text-[#64748B] hidden md:table-cell">{d.probability}%</TableCell>
                          <TableCell className="text-xs text-[#94A3B8] hidden xl:table-cell">{formatDate(d.expectedClose)}</TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                                  <MoreHorizontal className="w-4 h-4 text-[#94A3B8]" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedDeal(d) }}>
                                  <Eye className="w-4 h-4 mr-2" /> View
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-red-600" onClick={(e) => { e.stopPropagation(); deleteDeal(d.id) }}>
                                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════
            PIPELINES TAB
            ════════════════════════════════════════════════════════════════ */}
        <TabsContent value="pipelines" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-[#1E293B]">Sales Pipelines ({pipelines.length})</h3>
            <AddPipelineDialog onSave={createPipeline} />
          </div>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-48 bg-[#F8FAFC] animate-pulse rounded-xl" />)}
            </div>
          ) : pipelines.length === 0 ? (
            <Card className="border-[#E2E8F0]"><CardContent className="py-16 text-center text-[#94A3B8] text-sm">No pipelines yet. Create one to get started.</CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pipelines.map((p) => (
                <PipelineCard key={p.id} pipeline={p} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════
            ACTIVITIES TAB
            ════════════════════════════════════════════════════════════════ */}
        <TabsContent value="activities" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={activityTypeFilter || '__all'} onValueChange={(v) => setActivityTypeFilter(v === '__all' ? '' : v)}>
                <SelectTrigger className="w-[140px] h-9 text-sm border-[#E2E8F0]">
                  <Filter className="w-4 h-4 mr-1.5 text-[#94A3B8]" />
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">All Types</SelectItem>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="task">Task</SelectItem>
                  <SelectItem value="note">Note</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <AddActivityDialog contacts={contacts} deals={deals} onSave={() => fetchActivities()} />
          </div>
          <Card className="border-[#E2E8F0] shadow-sm">
            <CardContent className="p-4">
              <div className="max-h-[520px] overflow-y-auto space-y-3">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 bg-[#F8FAFC] animate-pulse rounded-lg" />)
                ) : activities.length === 0 ? (
                  <div className="text-center py-12 text-[#94A3B8] text-sm">No activities found</div>
                ) : (
                  activities.map((a) => {
                    const Icon = activityIcons[a.type] || Activity
                    const colorClass = activityColors[a.type] || 'text-slate-600 bg-slate-50'
                    return (
                      <div key={a.id} className="flex gap-3 p-3 rounded-lg hover:bg-[#F8FAFC] transition-colors">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-[#1E293B]">{a.subject}</span>
                            <Badge variant="secondary" className="text-[10px] font-medium capitalize">{a.type}</Badge>
                            {a.direction && <span className="text-[10px] text-[#94A3B8] uppercase">{a.direction}</span>}
                          </div>
                          <p className="text-xs text-[#64748B] mt-0.5 truncate">
                            {a.contact && `${a.contact.firstName} ${a.contact.lastName}`}
                            {a.contact && a.deal && ' · '}
                            {a.deal && a.deal.title}
                            {!a.contact && !a.deal && 'No linked contact/deal'}
                          </p>
                          {a.description && <p className="text-xs text-[#94A3B8] mt-1 line-clamp-2">{a.description}</p>}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs text-[#94A3B8]">{formatDate(a.createdAt)}</p>
                          {a.durationMin && <p className="text-[10px] text-[#94A3B8] mt-0.5">{a.durationMin}min</p>}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Contact Detail View ─────────────────────────────────────────────────────

function ContactDetailView({ contact, onBack, onDelete, onScore, onRefresh }: {
  contact: Contact; onBack: () => void; onDelete: (id: string) => void;
  onScore: () => void; onRefresh: () => void
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({ ...contact, tags: JSON.parse(contact.tags || '[]') })
  const [noteText, setNoteText] = useState('')

  const saveEdit = async () => {
    await fetch(`/api/crm/contacts/${contact.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...editForm, tags: editForm.tags }),
    })
    setEditOpen(false)
    onRefresh()
  }

  const addNote = async () => {
    if (!noteText.trim()) return
    await fetch('/api/crm/activities', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactId: contact.id, type: 'note', subject: 'Note added', description: noteText }),
    })
    setNoteText('')
    onRefresh()
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="text-[#64748B] hover:text-[#003ABC] -ml-2">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Contacts
      </Button>

      <Card className="border-[#E2E8F0] shadow-sm">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-14 w-14 border-2 border-[#E2E8F0]">
                <AvatarFallback className="bg-[#003ABC]/10 text-[#003ABC] text-lg font-bold">
                  {contact.firstName[0]}{contact.lastName[0]}
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-lg font-bold text-[#1E293B]">{contact.firstName} {contact.lastName}</h2>
                <p className="text-sm text-[#64748B]">{contact.jobTitle || 'No title'} {contact.company ? `at ${contact.company}` : ''}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className={`text-xs font-medium ${statusColors[contact.status] || ''}`}>{contact.status}</Badge>
                  <Badge variant="outline" className="text-xs">{contact.source}</Badge>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onScore} className="gap-1.5 text-sm">
                <Star className="w-4 h-4 text-[#FF6A00]" /> Score Lead
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="gap-1.5 text-sm">
                <Edit className="w-4 h-4" /> Edit
              </Button>
              <Button variant="outline" size="sm" onClick={() => onDelete(contact.id)} className="gap-1.5 text-sm text-red-600 hover:text-red-700">
                <Trash2 className="w-4 h-4" /> Delete
              </Button>
            </div>
          </div>

          <Separator className="my-4" />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div><span className="text-[#94A3B8] block text-xs">Email</span><span className="text-[#1E293B] flex items-center gap-1.5 mt-0.5"><Mail className="w-3.5 h-3.5" />{contact.email}</span></div>
            <div><span className="text-[#94A3B8] block text-xs">Phone</span><span className="text-[#1E293B] flex items-center gap-1.5 mt-0.5"><Phone className="w-3.5 h-3.5" />{contact.phone || '—'}</span></div>
            <div><span className="text-[#94A3B8] block text-xs">Score</span><div className="flex items-center gap-2 mt-1"><Progress value={contact.score} className={`h-2 flex-1 ${scoreBarColor(contact.score)}`} /><span className={`text-sm font-bold ${scoreColor(contact.score)}`}>{contact.score}/100</span></div></div>
            <div><span className="text-[#94A3B8] block text-xs">Last Contact</span><span className="text-[#1E293B] flex items-center gap-1.5 mt-0.5"><Clock className="w-3.5 h-3.5" />{formatDate(contact.lastContactAt)}</span></div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="bg-[#F8FAFC] rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-[#003ABC]">{contact._count?.deals ?? contact.deals?.length ?? 0}</p>
              <p className="text-xs text-[#94A3B8]">Deals</p>
            </div>
            <div className="bg-[#F8FAFC] rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-[#FF6A00]">{contact._count?.activities ?? contact.activities?.length ?? 0}</p>
              <p className="text-xs text-[#94A3B8]">Activities</p>
            </div>
            <div className="bg-[#F8FAFC] rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-emerald-600">{contact._count?.notes ?? contact.notes?.length ?? 0}</p>
              <p className="text-xs text-[#94A3B8]">Notes</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Related Deals */}
      <Card className="border-[#E2E8F0] shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-[#1E293B]">Related Deals</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(!contact.deals || contact.deals.length === 0) ? (
            <p className="text-sm text-[#94A3B8] p-4">No deals yet</p>
          ) : (
            <div className="max-h-48 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-[#E2E8F0] hover:bg-transparent">
                    <TableHead className="text-xs font-semibold text-[#64748B]">Title</TableHead>
                    <TableHead className="text-xs font-semibold text-[#64748B]">Stage</TableHead>
                    <TableHead className="text-xs font-semibold text-[#64748B]">Value</TableHead>
                    <TableHead className="text-xs font-semibold text-[#64748B]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contact.deals.map((d) => (
                    <TableRow key={d.id} className="border-b border-[#F1F5F9]">
                      <TableCell className="text-sm font-medium text-[#1E293B]">{d.title}</TableCell>
                      <TableCell>
                        {d.stage && <Badge variant="secondary" className="text-xs" style={{ backgroundColor: d.stage.color + '18', color: d.stage.color }}>{d.stage.name}</Badge>}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{formatCurrency(d.value, d.currency)}</TableCell>
                      <TableCell><Badge variant="secondary" className={`text-xs ${d.status === 'active' ? 'bg-emerald-50 text-emerald-700' : d.status === 'won' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{d.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity Timeline */}
      <Card className="border-[#E2E8F0] shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-[#1E293B]">Activity Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-64 overflow-y-auto space-y-3">
            {(!contact.activities || contact.activities.length === 0) ? (
              <p className="text-sm text-[#94A3B8]">No activities yet</p>
            ) : contact.activities.map((a) => {
              const Icon = activityIcons[a.type] || Activity
              const colorClass = activityColors[a.type] || 'text-slate-600 bg-slate-50'
              return (
                <div key={a.id} className="flex gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[#1E293B]">{a.subject}</p>
                    {a.description && <p className="text-xs text-[#64748B] mt-0.5">{a.description}</p>}
                    <p className="text-[10px] text-[#94A3B8] mt-0.5">{formatDate(a.createdAt)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Lead Score History */}
      {contact.scores && contact.scores.length > 0 && (
        <Card className="border-[#E2E8F0] shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-[#1E293B]">Lead Score History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {contact.scores.map((s) => (
                <div key={s.id} className="flex items-center gap-3 p-2 rounded-lg bg-[#F8FAFC]">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm ${s.score >= 70 ? 'bg-emerald-50 text-emerald-600' : s.score >= 40 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-500'}`}>
                    {s.score}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Progress value={s.score} className={`h-1.5 flex-1 ${scoreBarColor(s.score)}`} />
                    </div>
                    <p className="text-[10px] text-[#94A3B8] mt-0.5">{formatDate(s.createdAt)} · {s.calculatedBy}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Note */}
      <Card className="border-[#E2E8F0] shadow-sm">
        <CardContent className="p-4">
          <Label className="text-sm font-medium text-[#1E293B]">Add a Note</Label>
          <Textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Write a note about this contact..."
            className="mt-2 min-h-[80px] border-[#E2E8F0] text-sm"
          />
          <Button size="sm" onClick={addNote} disabled={!noteText.trim()} className="mt-2 bg-[#003ABC] hover:bg-[#003ABC]/90 text-white gap-1.5">
            <Plus className="w-4 h-4" /> Add Note
          </Button>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B]">Edit Contact</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">First Name</Label><Input value={editForm.firstName} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} className="h-9 text-sm mt-1" /></div>
            <div><Label className="text-xs">Last Name</Label><Input value={editForm.lastName} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} className="h-9 text-sm mt-1" /></div>
            <div className="col-span-2"><Label className="text-xs">Email</Label><Input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="h-9 text-sm mt-1" /></div>
            <div><Label className="text-xs">Phone</Label><Input value={editForm.phone || ''} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className="h-9 text-sm mt-1" /></div>
            <div><Label className="text-xs">Company</Label><Input value={editForm.company || ''} onChange={(e) => setEditForm({ ...editForm, company: e.target.value })} className="h-9 text-sm mt-1" /></div>
            <div><Label className="text-xs">Job Title</Label><Input value={editForm.jobTitle || ''} onChange={(e) => setEditForm({ ...editForm, jobTitle: e.target.value })} className="h-9 text-sm mt-1" /></div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                <SelectTrigger className="h-9 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="prospect">Prospect</SelectItem>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="churned">Churned</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setEditOpen(false)} className="text-sm">Cancel</Button>
            <Button onClick={saveEdit} className="bg-[#003ABC] hover:bg-[#003ABC]/90 text-white text-sm">Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Deal Detail View ────────────────────────────────────────────────────────

function DealDetailView({ deal, pipelines, onBack, onDelete, onRefresh }: {
  deal: Deal; pipelines: Pipeline[]; onBack: () => void;
  onDelete: (id: string) => void; onRefresh: () => void
}) {
  const [moveStage, setMoveStage] = useState(deal.stageId)

  const moveDeal = async () => {
    await fetch(`/api/crm/deals/${deal.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageId: moveStage }),
    })
    onRefresh()
  }

  const currentPipeline = pipelines.find(p => p.id === deal.pipelineId)
  const weightedValue = (deal.value * deal.probability) / 100

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="text-[#64748B] hover:text-[#003ABC] -ml-2">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Deals
      </Button>

      <Card className="border-[#E2E8F0] shadow-sm">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-[#1E293B]">{deal.title}</h2>
              <p className="text-sm text-[#64748B]">
                {deal.contact ? `${deal.contact.firstName} ${deal.contact.lastName}` : 'No contact'}
                {deal.pipeline && ` · ${deal.pipeline.name}`}
              </p>
              {deal.stage && (
                <Badge variant="secondary" className="mt-1 text-xs font-medium" style={{ backgroundColor: deal.stage.color + '18', color: deal.stage.color, border: `1px solid ${deal.stage.color}40` }}>
                  {deal.stage.name}
                </Badge>
              )}
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-[#1E293B]">{formatCurrency(deal.value, deal.currency)}</p>
              <p className="text-xs text-[#94A3B8]">Weighted: {formatCurrency(weightedValue, deal.currency)}</p>
            </div>
          </div>

          <Separator className="my-4" />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div><span className="text-[#94A3B8] block text-xs">Probability</span><span className="font-semibold text-[#1E293B]">{deal.probability}%</span></div>
            <div><span className="text-[#94A3B8] block text-xs">Expected Close</span><span className="text-[#1E293B]">{formatDate(deal.expectedClose)}</span></div>
            <div><span className="text-[#94A3B8] block text-xs">Status</span><Badge variant="secondary" className={`text-xs ${deal.status === 'active' ? 'bg-emerald-50 text-emerald-700' : deal.status === 'won' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{deal.status}</Badge></div>
            <div><span className="text-[#94A3B8] block text-xs">Created</span><span className="text-[#1E293B]">{formatDate(deal.createdAt)}</span></div>
          </div>

          {/* Stage Movement */}
          {currentPipeline && currentPipeline.stages && (
            <div className="mt-4">
              <Label className="text-xs text-[#64748B]">Move to Stage</Label>
              <div className="flex items-center gap-2 mt-1">
                <Select value={moveStage} onValueChange={setMoveStage}>
                  <SelectTrigger className="h-9 text-sm w-[200px] border-[#E2E8F0]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {currentPipeline.stages.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                          {s.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={moveDeal} disabled={moveStage === deal.stageId} className="bg-[#003ABC] hover:bg-[#003ABC]/90 text-white text-sm">
                  <ChevronRight className="w-4 h-4 mr-1" /> Move
                </Button>
              </div>
            </div>
          )}

          <div className="flex justify-end mt-4">
            <Button variant="outline" size="sm" onClick={() => onDelete(deal.id)} className="text-red-600 hover:text-red-700 text-sm">
              <Trash2 className="w-4 h-4 mr-1" /> Delete Deal
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stage Progression */}
      {currentPipeline && currentPipeline.stages && (
        <Card className="border-[#E2E8F0] shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-[#1E293B]">Stage Progression</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 overflow-x-auto pb-2">
              {currentPipeline.stages.map((s, i) => {
                const isCurrent = s.id === deal.stageId
                const currentIdx = currentPipeline.stages.findIndex(st => st.id === deal.stageId)
                const isPast = i < currentIdx
                return (
                  <div key={s.id} className="flex items-center">
                    <div className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap ${
                      isCurrent ? 'text-white shadow-sm' : isPast ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-[#F1F5F9] text-[#94A3B8]'
                    }`} style={isCurrent ? { backgroundColor: s.color } : undefined}>
                      {s.name}
                    </div>
                    {i < currentPipeline.stages.length - 1 && (
                      <ChevronRight className="w-4 h-4 text-[#CBD5E1] mx-1 flex-shrink-0" />
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deal Activities */}
      <Card className="border-[#E2E8F0] shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-[#1E293B]">Activities</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-64 overflow-y-auto space-y-3">
            {(!deal.activities || deal.activities.length === 0) ? (
              <p className="text-sm text-[#94A3B8]">No activities for this deal</p>
            ) : deal.activities.map((a) => {
              const Icon = activityIcons[a.type] || Activity
              const colorClass = activityColors[a.type] || 'text-slate-600 bg-slate-50'
              return (
                <div key={a.id} className="flex gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[#1E293B]">{a.subject}</p>
                    {a.description && <p className="text-xs text-[#64748B] mt-0.5">{a.description}</p>}
                    <p className="text-[10px] text-[#94A3B8] mt-0.5">{formatDate(a.createdAt)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Pipeline Card ───────────────────────────────────────────────────────────

function PipelineCard({ pipeline }: { pipeline: Pipeline }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <Card className="border-[#E2E8F0] shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => setExpanded(!expanded)}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#003ABC]/10 flex items-center justify-center">
              <GitBranch className="w-4 h-4 text-[#003ABC]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#1E293B]">{pipeline.name}</h3>
              {pipeline.description && <p className="text-xs text-[#94A3B8]">{pipeline.description}</p>}
            </div>
          </div>
          {pipeline.isDefault && <Badge variant="secondary" className="text-[10px] bg-[#FF6A00]/10 text-[#FF6A00]">Default</Badge>}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-[#F8FAFC] rounded-lg p-2.5 text-center">
            <p className="text-lg font-bold text-[#003ABC]">{pipeline._count?.deals ?? 0}</p>
            <p className="text-[10px] text-[#94A3B8]">Total Deals</p>
          </div>
          <div className="bg-[#F8FAFC] rounded-lg p-2.5 text-center">
            <p className="text-lg font-bold text-[#FF6A00]">{formatCurrency(pipeline.totalValue)}</p>
            <p className="text-[10px] text-[#94A3B8]">Total Value</p>
          </div>
        </div>

        {expanded && pipeline.stages.length > 0 && (
          <div className="border-t border-[#E2E8F0] pt-3 space-y-2">
            {pipeline.stages.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-2 rounded-lg bg-[#F8FAFC]">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="text-xs font-medium text-[#1E293B]">{s.name}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-[#94A3B8]">
                  <span>{s.dealCount} deals</span>
                  <span>{formatCurrency(s.totalValue)}</span>
                  <Badge variant="outline" className="text-[10px]">{s.probability}%</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Add Contact Dialog ──────────────────────────────────────────────────────

function AddContactDialog({ onSave }: { onSave: () => void }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', company: '', jobTitle: '', source: 'manual' })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!form.firstName || !form.lastName || !form.email) return
    setSaving(true)
    try {
      await fetch('/api/crm/contacts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      setOpen(false)
      setForm({ firstName: '', lastName: '', email: '', phone: '', company: '', jobTitle: '', source: 'manual' })
      onSave()
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-[#003ABC] hover:bg-[#003ABC]/90 text-white gap-1.5 text-sm">
          <UserPlus className="w-4 h-4" /> Add Contact
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-[#1E293B]">Add New Contact</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">First Name *</Label><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="h-9 text-sm mt-1" /></div>
          <div><Label className="text-xs">Last Name *</Label><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="h-9 text-sm mt-1" /></div>
          <div className="col-span-2"><Label className="text-xs">Email *</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-9 text-sm mt-1" /></div>
          <div><Label className="text-xs">Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-9 text-sm mt-1" /></div>
          <div><Label className="text-xs">Company</Label><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="h-9 text-sm mt-1" /></div>
          <div><Label className="text-xs">Job Title</Label><Input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} className="h-9 text-sm mt-1" /></div>
          <div>
            <Label className="text-xs">Source</Label>
            <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
              <SelectTrigger className="h-9 text-sm mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="web">Website</SelectItem>
                <SelectItem value="referral">Referral</SelectItem>
                <SelectItem value="social">Social</SelectItem>
                <SelectItem value="email">Email Campaign</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setOpen(false)} className="text-sm">Cancel</Button>
          <Button onClick={save} disabled={saving || !form.firstName || !form.lastName || !form.email} className="bg-[#003ABC] hover:bg-[#003ABC]/90 text-white text-sm">
            {saving ? 'Creating...' : 'Create Contact'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Add Deal Dialog ─────────────────────────────────────────────────────────

function AddDealDialog({ contacts, pipelines, onSave }: {
  contacts: Contact[]; pipelines: Pipeline[]; onSave: () => void
}) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ contactId: '', pipelineId: '', stageId: '', title: '', value: '', currency: 'USD', probability: '50', expectedClose: '' })
  const [saving, setSaving] = useState(false)

  const selectedPipeline = pipelines.find(p => p.id === form.pipelineId)

  const save = async () => {
    if (!form.contactId || !form.pipelineId || !form.stageId || !form.title) return
    setSaving(true)
    try {
      await fetch('/api/crm/deals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: form.contactId, pipelineId: form.pipelineId, stageId: form.stageId,
          title: form.title, value: parseFloat(form.value) || 0, currency: form.currency,
          probability: parseInt(form.probability) || 50, expectedClose: form.expectedClose || undefined,
        }),
      })
      setOpen(false)
      setForm({ contactId: '', pipelineId: '', stageId: '', title: '', value: '', currency: 'USD', probability: '50', expectedClose: '' })
      onSave()
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-[#003ABC] hover:bg-[#003ABC]/90 text-white gap-1.5 text-sm">
          <Plus className="w-4 h-4" /> Create Deal
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-[#1E293B]">Create New Deal</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div><Label className="text-xs">Title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="h-9 text-sm mt-1" /></div>
          <div>
            <Label className="text-xs">Contact *</Label>
            <Select value={form.contactId} onValueChange={(v) => setForm({ ...form, contactId: v })}>
              <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder="Select contact" /></SelectTrigger>
              <SelectContent>
                {contacts.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName} ({c.email})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Pipeline *</Label>
            <Select value={form.pipelineId} onValueChange={(v) => setForm({ ...form, pipelineId: v, stageId: '' })}>
              <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder="Select pipeline" /></SelectTrigger>
              <SelectContent>
                {pipelines.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {selectedPipeline && (
            <div>
              <Label className="text-xs">Stage *</Label>
              <Select value={form.stageId} onValueChange={(v) => setForm({ ...form, stageId: v })}>
                <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder="Select stage" /></SelectTrigger>
                <SelectContent>
                  {selectedPipeline.stages.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />{s.name}</div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div><Label className="text-xs">Value</Label><Input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="h-9 text-sm mt-1" /></div>
            <div>
              <Label className="text-xs">Currency</Label>
              <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                <SelectTrigger className="h-9 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Prob %</Label><Input type="number" value={form.probability} onChange={(e) => setForm({ ...form, probability: e.target.value })} className="h-9 text-sm mt-1" /></div>
          </div>
          <div><Label className="text-xs">Expected Close</Label><Input type="date" value={form.expectedClose} onChange={(e) => setForm({ ...form, expectedClose: e.target.value })} className="h-9 text-sm mt-1" /></div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setOpen(false)} className="text-sm">Cancel</Button>
          <Button onClick={save} disabled={saving || !form.contactId || !form.pipelineId || !form.stageId || !form.title} className="bg-[#003ABC] hover:bg-[#003ABC]/90 text-white text-sm">
            {saving ? 'Creating...' : 'Create Deal'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Add Pipeline Dialog ─────────────────────────────────────────────────────

function AddPipelineDialog({ onSave }: { onSave: (name: string, description?: string) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name) return
    setSaving(true)
    try {
      await onSave(name, description || undefined)
      setOpen(false)
      setName('')
      setDescription('')
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-[#003ABC] hover:bg-[#003ABC]/90 text-white gap-1.5 text-sm">
          <Plus className="w-4 h-4" /> Create Pipeline
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-[#1E293B]">Create Pipeline</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div><Label className="text-xs">Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm mt-1" /></div>
          <div><Label className="text-xs">Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[60px] text-sm mt-1" /></div>
          <p className="text-xs text-[#94A3B8]">Default stages will be auto-created: Lead, Qualified, Proposal, Negotiation, Closed Won, Closed Lost.</p>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setOpen(false)} className="text-sm">Cancel</Button>
          <Button onClick={save} disabled={saving || !name} className="bg-[#003ABC] hover:bg-[#003ABC]/90 text-white text-sm">
            {saving ? 'Creating...' : 'Create Pipeline'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Add Activity Dialog ─────────────────────────────────────────────────────

function AddActivityDialog({ contacts, deals, onSave }: {
  contacts: Contact[]; deals: Deal[]; onSave: () => void
}) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ contactId: '', dealId: '', type: 'note', subject: '', description: '', direction: '', scheduledAt: '', durationMin: '' })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!form.type || !form.subject) return
    setSaving(true)
    try {
      await fetch('/api/crm/activities', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: form.contactId || undefined, dealId: form.dealId || undefined,
          type: form.type, subject: form.subject, description: form.description || undefined,
          direction: form.direction || undefined, scheduledAt: form.scheduledAt || undefined,
          durationMin: form.durationMin ? parseInt(form.durationMin) : undefined,
        }),
      })
      setOpen(false)
      setForm({ contactId: '', dealId: '', type: 'note', subject: '', description: '', direction: '', scheduledAt: '', durationMin: '' })
      onSave()
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-[#003ABC] hover:bg-[#003ABC]/90 text-white gap-1.5 text-sm">
          <Plus className="w-4 h-4" /> Log Activity
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-[#1E293B]">Log Activity</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label className="text-xs">Type *</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
              <SelectTrigger className="h-9 text-sm mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="call">Call</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="meeting">Meeting</SelectItem>
                <SelectItem value="task">Task</SelectItem>
                <SelectItem value="note">Note</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Subject *</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="h-9 text-sm mt-1" /></div>
          <div><Label className="text-xs">Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-[60px] text-sm mt-1" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Contact</Label>
              <Select value={form.contactId} onValueChange={(v) => setForm({ ...form, contactId: v })}>
                <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  {contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Deal</Label>
              <Select value={form.dealId} onValueChange={(v) => setForm({ ...form, dealId: v })}>
                <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  {deals.map(d => <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Direction</Label>
              <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v === '__none' ? '' : v })}>
                <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  <SelectItem value="inbound">Inbound</SelectItem>
                  <SelectItem value="outbound">Outbound</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Duration (min)</Label><Input type="number" value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: e.target.value })} className="h-9 text-sm mt-1" /></div>
          </div>
          <div><Label className="text-xs">Scheduled At</Label><Input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} className="h-9 text-sm mt-1" /></div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setOpen(false)} className="text-sm">Cancel</Button>
          <Button onClick={save} disabled={saving || !form.type || !form.subject} className="bg-[#003ABC] hover:bg-[#003ABC]/90 text-white text-sm">
            {saving ? 'Saving...' : 'Log Activity'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}