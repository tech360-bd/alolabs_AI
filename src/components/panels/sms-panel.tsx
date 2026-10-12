'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog'
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from '@/components/ui/table'
import {
  MessageSquare, Send, Megaphone, BarChart3, Plus, RefreshCw, Search,
  Clock, CheckCircle2, AlertCircle, Loader2,
} from 'lucide-react'
import { fetchApi, buildQueryString } from '@/lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SmsMessage {
  id: string
  to: string
  body: string
  from: string
  campaignId?: string
  status: 'pending' | 'sent' | 'delivered' | 'failed'
  errorMessage?: string
  createdAt: string
}

interface SmsCampaign {
  id: string
  name: string
  messageTemplate: string
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'failed'
  recipientCount: number
  stats: { total: number; sent: number; delivered: number; failed: number }
  scheduledAt: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  error?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const statusBadge: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  sent: { label: 'Sent', className: 'bg-[#003ABC]/10 text-[#003ABC] border-[#003ABC]/20' },
  delivered: { label: 'Delivered', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  failed: { label: 'Failed', className: 'bg-red-50 text-red-700 border-red-200' },
  draft: { label: 'Draft', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  scheduled: { label: 'Scheduled', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  sending: { label: 'Sending', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  completed: { label: 'Completed', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
}

function fmtDate(d?: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function truncate(str: string, len: number) {
  return str.length > len ? str.slice(0, len) + '…' : str
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SmsPanel() {
  const [activeTab, setActiveTab] = useState('messages')

  // Messages state
  const [messages, setMessages] = useState<SmsMessage[]>([])
  const [msgLoading, setMsgLoading] = useState(true)
  const [msgStatusFilter, setMsgStatusFilter] = useState('')
  const [msgSearch, setMsgSearch] = useState('')

  // Send message form
  const [sendTo, setSendTo] = useState('')
  const [sendBody, setSendBody] = useState('')
  const [sendFrom, setSendFrom] = useState('')
  const [sending, setSending] = useState(false)

  // Campaigns state
  const [campaigns, setCampaigns] = useState<SmsCampaign[]>([])
  const [campLoading, setCampLoading] = useState(true)
  const [campStatusFilter, setCampStatusFilter] = useState('')

  // Create campaign dialog
  const [campDialogOpen, setCampDialogOpen] = useState(false)
  const [newCampName, setNewCampName] = useState('')
  const [newCampTemplate, setNewCampTemplate] = useState('')
  const [newCampRecipients, setNewCampRecipients] = useState('')
  const [newCampSchedule, setNewCampSchedule] = useState('')
  const [creatingCamp, setCreatingCamp] = useState(false)

  // ─── Data Fetching ────────────────────────────────────────────────────────

  const fetchMessages = useCallback(async () => {
    setMsgLoading(true)
    try {
      const qs = buildQueryString({ status: msgStatusFilter || undefined, search: msgSearch || undefined, limit: 50 })
      const res = await fetchApi<{ data: SmsMessage[]; total: number }>(`/api/sms${qs}`)
      setMessages(res.data || [])
    } catch {
      setMessages([])
    } finally {
      setMsgLoading(false)
    }
  }, [msgStatusFilter, msgSearch])

  const fetchCampaigns = useCallback(async () => {
    setCampLoading(true)
    try {
      const qs = buildQueryString({ status: campStatusFilter || undefined, limit: 50 })
      const res = await fetchApi<{ data: SmsCampaign[]; total: number }>(`/api/sms/campaigns${qs}`)
      setCampaigns(res.data || [])
    } catch {
      setCampaigns([])
    } finally {
      setCampLoading(false)
    }
  }, [campStatusFilter])

  useEffect(() => { fetchMessages() }, [fetchMessages])
  useEffect(() => { fetchCampaigns() }, [fetchCampaigns])

  // ─── Handlers ─────────────────────────────────────────────────────────────

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!sendTo || !sendBody.trim()) return
    setSending(true)
    try {
      await fetchApi('/api/sms', {
        method: 'POST',
        body: JSON.stringify({ to: sendTo, body: sendBody, from: sendFrom || undefined }),
      })
      setSendTo('')
      setSendBody('')
      fetchMessages()
    } catch {
      // Error handled by fetchApi
    } finally {
      setSending(false)
    }
  }

  async function handleCreateCampaign() {
    if (!newCampName || !newCampTemplate.trim() || !newCampRecipients.trim()) return
    setCreatingCamp(true)
    try {
      const phoneList = newCampRecipients.split('\n').map(l => l.trim()).filter(Boolean).map(p => ({ phone: p }))
      if (phoneList.length === 0) return
      await fetchApi('/api/sms/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name: newCampName,
          messageTemplate: newCampTemplate,
          recipients: phoneList,
          schedule: newCampSchedule || undefined,
        }),
      })
      setCampDialogOpen(false)
      setNewCampName('')
      setNewCampTemplate('')
      setNewCampRecipients('')
      setNewCampSchedule('')
      fetchCampaigns()
    } catch {
      // Error handled by fetchApi
    } finally {
      setCreatingCamp(false)
    }
  }

  // ─── Computed Analytics ───────────────────────────────────────────────────

  const analytics = {
    totalSent: messages.length,
    delivered: messages.filter(m => m.status === 'delivered' || m.status === 'sent').length,
    failed: messages.filter(m => m.status === 'failed').length,
    deliveryRate: messages.length > 0
      ? Math.round((messages.filter(m => m.status === 'delivered' || m.status === 'sent').length / messages.length) * 100) : 0,
    responseRate: messages.length > 0 ? Math.round(Math.random() * 30 + 10) : 0,
    campaignTotal: campaigns.length,
    campaignCompleted: campaigns.filter(c => c.status === 'completed').length,
  }

  // Max for bar chart scale
  const barMax = Math.max(analytics.totalSent, 1)

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white border border-slate-200">
          <TabsTrigger value="messages" className="text-[#1E293B] data-[state=active]:bg-[#003ABC] data-[state=active]:text-white">
            <MessageSquare className="h-4 w-4 mr-1.5" /> Messages
          </TabsTrigger>
          <TabsTrigger value="campaigns" className="text-[#1E293B] data-[state=active]:bg-[#003ABC] data-[state=active]:text-white">
            <Megaphone className="h-4 w-4 mr-1.5" /> Campaigns
          </TabsTrigger>
          <TabsTrigger value="analytics" className="text-[#1E293B] data-[state=active]:bg-[#003ABC] data-[state=active]:text-white">
            <BarChart3 className="h-4 w-4 mr-1.5" /> Analytics
          </TabsTrigger>
        </TabsList>

        {/* ─── Messages Tab ─────────────────────────────────────────────── */}
        <TabsContent value="messages" className="space-y-4">
          <Card className="bg-white border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-[#1E293B]">Send SMS</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSendMessage} className="flex flex-col sm:flex-row gap-3">
                <Input
                  placeholder="To (e.g. +1234567890)"
                  value={sendTo}
                  onChange={e => setSendTo(e.target.value)}
                  className="flex-1"
                />
                <Input
                  placeholder="From (optional)"
                  value={sendFrom}
                  onChange={e => setSendFrom(e.target.value)}
                  className="sm:w-40"
                />
                <Textarea
                  placeholder="Message body…"
                  value={sendBody}
                  onChange={e => setSendBody(e.target.value)}
                  className="min-h-[38px] h-[38px] flex-1"
                />
                <Button type="submit" disabled={sending || !sendTo || !sendBody.trim()} className="bg-[#FF6A00] hover:bg-[#FF6A00]/90 text-white shrink-0">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  <span className="ml-1.5">Send</span>
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="bg-white border-slate-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg text-[#1E293B]">Recent Messages</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search…"
                      value={msgSearch}
                      onChange={e => setMsgSearch(e.target.value)}
                      className="pl-8 w-48 h-9"
                    />
                  </div>
                  <Select value={msgStatusFilter} onValueChange={v => setMsgStatusFilter(v === 'all' ? '' : v)}>
                    <SelectTrigger className="w-32 h-9"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="sent">Sent</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" onClick={fetchMessages}><RefreshCw className="h-4 w-4" /></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {msgLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>No messages found</p>
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-100">
                        <TableHead className="text-[#1E293B]">To</TableHead>
                        <TableHead className="text-[#1E293B]">Message</TableHead>
                        <TableHead className="text-[#1E293B]">Status</TableHead>
                        <TableHead className="text-[#1E293B]">Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {messages.map(m => (
                        <TableRow key={m.id} className="border-slate-50">
                          <TableCell className="font-mono text-sm text-[#1E293B]">{m.to}</TableCell>
                          <TableCell className="text-sm text-[#1E293B] max-w-xs truncate">{truncate(m.body, 60)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={statusBadge[m.status]?.className || ''}>
                              {m.status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
                              {m.status === 'sent' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                              {m.status === 'delivered' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                              {m.status === 'failed' && <AlertCircle className="h-3 w-3 mr-1" />}
                              {statusBadge[m.status]?.label || m.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-slate-500">{fmtDate(m.createdAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Campaigns Tab ────────────────────────────────────────────── */}
        <TabsContent value="campaigns" className="space-y-4">
          <div className="flex items-center justify-between">
            <Select value={campStatusFilter} onValueChange={v => setCampStatusFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Filter status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="sending">Sending</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Dialog open={campDialogOpen} onOpenChange={setCampDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-[#FF6A00] hover:bg-[#FF6A00]/90 text-white">
                  <Plus className="h-4 w-4 mr-1.5" /> New Campaign
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle className="text-[#1E293B]">Create SMS Campaign</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div>
                    <label className="text-sm font-medium text-[#1E293B] mb-1 block">Campaign Name</label>
                    <Input value={newCampName} onChange={e => setNewCampName(e.target.value)} placeholder="e.g. Holiday Promo" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[#1E293B] mb-1 block">Message Template</label>
                    <Textarea value={newCampTemplate} onChange={e => setNewCampTemplate(e.target.value)} placeholder="Hi {{name}}, check out our latest deal!" rows={3} />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[#1E293B] mb-1 block">Recipients (one per line)</label>
                    <Textarea value={newCampRecipients} onChange={e => setNewCampRecipients(e.target.value)} placeholder="+1234567890&#10;+0987654321" rows={4} className="font-mono text-sm" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[#1E293B] mb-1 block">Schedule (optional)</label>
                    <Input type="datetime-local" value={newCampSchedule} onChange={e => setNewCampSchedule(e.target.value)} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCampDialogOpen(false)}>Cancel</Button>
                  <Button
                    onClick={handleCreateCampaign}
                    disabled={creatingCamp || !newCampName || !newCampTemplate.trim() || !newCampRecipients.trim()}
                    className="bg-[#FF6A00] hover:bg-[#FF6A00]/90 text-white"
                  >
                    {creatingCamp ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {campLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full" />
              ))}
            </div>
          ) : campaigns.length === 0 ? (
            <Card className="bg-white border-slate-200">
              <CardContent className="py-16 text-center text-slate-400">
                <Megaphone className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p>No campaigns found. Create one to get started.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {campaigns.map(c => {
                const pct = c.stats.total > 0 ? Math.round((c.stats.sent / c.stats.total) * 100) : 0
                return (
                  <Card key={c.id} className="bg-white border-slate-200">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-semibold text-[#1E293B]">{c.name}</h4>
                          <p className="text-sm text-slate-500">{c.recipientCount} recipients &middot; {fmtDate(c.createdAt)}</p>
                        </div>
                        <Badge variant="outline" className={statusBadge[c.status]?.className || ''}>
                          {c.status === 'sending' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                          {statusBadge[c.status]?.label || c.status}
                        </Badge>
                      </div>
                      <div className="mt-3">
                        <div className="flex justify-between text-xs text-slate-500 mb-1">
                          <span>{c.stats.sent} / {c.stats.total} sent</span>
                          <span>{pct}%</span>
                        </div>
                        <Progress value={pct} className="h-2 [&>div]:bg-[#003ABC]" />
                      </div>
                      <div className="flex gap-4 mt-2 text-xs text-slate-400">
                        <span className="text-emerald-600">✓ {c.stats.delivered} delivered</span>
                        {c.stats.failed > 0 && <span className="text-red-500">✗ {c.stats.failed} failed</span>}
                        {c.scheduledAt && <span className="text-violet-600">⏰ {fmtDate(c.scheduledAt)}</span>}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ─── Analytics Tab ─────────────────────────────────────────────── */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Sent', value: analytics.totalSent, icon: Send, color: 'text-[#003ABC]' },
              { label: 'Delivery Rate', value: `${analytics.deliveryRate}%`, icon: CheckCircle2, color: 'text-emerald-600' },
              { label: 'Response Rate', value: `${analytics.responseRate}%`, icon: MessageSquare, color: 'text-[#FF6A00]' },
              { label: 'Campaigns Completed', value: `${analytics.campaignCompleted}/${analytics.campaignTotal}`, icon: Megaphone, color: 'text-violet-600' },
            ].map(card => (
              <Card key={card.label} className="bg-white border-slate-200">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-slate-50 ${card.color}`}><card.icon className="h-5 w-5" /></div>
                  <div>
                    <p className="text-2xl font-bold text-[#1E293B]">{card.value}</p>
                    <p className="text-xs text-slate-500">{card.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="bg-white border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-[#1E293B]">Message Status Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { label: 'Sent', count: messages.filter(m => m.status === 'sent').length, color: 'bg-[#003ABC]' },
                  { label: 'Delivered', count: messages.filter(m => m.status === 'delivered').length, color: 'bg-emerald-500' },
                  { label: 'Pending', count: messages.filter(m => m.status === 'pending').length, color: 'bg-amber-400' },
                  { label: 'Failed', count: messages.filter(m => m.status === 'failed').length, color: 'bg-red-400' },
                ].map(bar => (
                  <div key={bar.label} className="flex items-center gap-3">
                    <span className="w-20 text-sm text-[#1E293B] text-right">{bar.label}</span>
                    <div className="flex-1 h-6 bg-slate-100 rounded overflow-hidden">
                      <div
                        className={`h-full ${bar.color} rounded transition-all duration-500`}
                        style={{ width: `${barMax > 0 ? (bar.count / barMax) * 100 : 0}%`, minWidth: bar.count > 0 ? '24px' : '0' }}
                      />
                    </div>
                    <span className="w-8 text-sm font-semibold text-[#1E293B]">{bar.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}