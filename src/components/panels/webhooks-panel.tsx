'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Webhook,
  Plus,
  Copy,
  Check,
  Play,
  Pencil,
  Trash2,
  ExternalLink,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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

// ── Types ───────────────────────────────────────────────────────────────────

interface WebhookItem {
  id: string
  name: string
  companyId: string
  companyName: string
  url: string
  events: string[]
  active: boolean
  lastTriggered: string | null
  createdAt: string
}

interface CompanyOption {
  id: string
  name: string
}

const ALL_EVENTS = [
  'task.completed',
  'agent.run',
  'workflow.completed',
  'approval.required',
  'usage.alert',
  'security.event',
] as const

const EVENT_COLORS: Record<string, string> = {
  'task.completed': 'bg-green-100 text-green-700 border-green-200',
  'agent.run': 'bg-blue-100 text-blue-700 border-blue-200',
  'workflow.completed': 'bg-purple-100 text-purple-700 border-purple-200',
  'approval.required': 'bg-amber-100 text-amber-700 border-amber-200',
  'usage.alert': 'bg-orange-100 text-orange-700 border-orange-200',
  'security.event': 'bg-red-100 text-red-700 border-red-200',
}

// ── Component ───────────────────────────────────────────────────────────────

export default function WebhooksPanel() {
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([])
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [loading, setLoading] = useState(true)
  const [companyFilter, setCompanyFilter] = useState<string>('all')

  // Create / Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    companyId: '',
    name: '',
    url: '',
    events: [] as string[],
    active: true,
  })
  const [submitting, setSubmitting] = useState(false)

  // Test webhook
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ open: boolean; success: boolean; message: string }>({
    open: false,
    success: false,
    message: '',
  })

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean
    id: string
    name: string
  }>({ open: false, id: '', name: '' })
  const [deleting, setDeleting] = useState(false)

  // Copy URL
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // ── Data fetch ──────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      const [webhooksRes, companiesRes] = await Promise.all([
        fetch('/api/webhooks'),
        fetch('/api/companies'),
      ])
      const webhooksData = await webhooksRes.json()
      const companiesData = await companiesRes.json()
      setWebhooks(webhooksData.data || [])
      setCompanies(companiesData.data || [])
    } catch {
      // silently handle
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Handlers ───────────────────────────────────────────────────────────

  const resetForm = () => {
    setForm({ companyId: '', name: '', url: '', events: [], active: true })
    setEditingId(null)
  }

  const openCreate = () => {
    resetForm()
    setDialogOpen(true)
  }

  const openEdit = (w: WebhookItem) => {
    setEditingId(w.id)
    setForm({
      companyId: w.companyId,
      name: w.name,
      url: w.url,
      events: [...w.events],
      active: w.active,
    })
    setDialogOpen(true)
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const isEdit = !!editingId
      const res = await fetch('/api/webhooks', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, ...form }),
      })
      if (res.ok) {
        setDialogOpen(false)
        resetForm()
        fetchData()
      }
    } catch {
      // silently handle
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await fetch('/api/webhooks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteConfirm.id }),
      })
      setDeleteConfirm({ open: false, id: '', name: '' })
      fetchData()
    } catch {
      // silently handle
    } finally {
      setDeleting(false)
    }
  }

  const handleTest = async (id: string) => {
    setTestingId(id)
    try {
      const res = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test', id }),
      })
      const data = await res.json()
      setTestResult({
        open: true,
        success: data.success ?? false,
        message: data.message || (data.success ? 'Webhook test sent successfully' : 'Webhook test failed'),
      })
    } catch {
      setTestResult({
        open: true,
        success: false,
        message: 'Failed to send test webhook. Check your network.',
      })
    } finally {
      setTestingId(null)
    }
  }

  const handleCopyUrl = async (url: string, id: string) => {
    await navigator.clipboard.writeText(url)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const toggleEvent = (event: string) => {
    setForm((prev) => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter((e) => e !== event)
        : [...prev.events, event],
    }))
  }

  // ── Filtering ──────────────────────────────────────────────────────────

  const filteredWebhooks = companyFilter === 'all'
    ? webhooks
    : webhooks.filter((w) => w.companyId === companyFilter)

  // ── Stats ──────────────────────────────────────────────────────────────

  const totalWebhooks = webhooks.length
  const activeWebhooks = webhooks.filter((w) => w.active).length

  const byCompany: Record<string, number> = {}
  webhooks.forEach((w) => {
    byCompany[w.companyName] = (byCompany[w.companyName] || 0) + 1
  })

  // ── Helpers ────────────────────────────────────────────────────────────

  const truncateUrl = (url: string, maxLen = 45) => {
    if (url.length <= maxLen) return url
    return url.slice(0, maxLen) + '...'
  }

  // ── Loading ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6 p-6 bg-[#F8FAFC] min-h-screen">
        <Skeleton className="h-8 w-48 bg-slate-200" />
        <Skeleton className="h-4 w-72 bg-slate-100" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl bg-slate-100" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-xl bg-slate-100" />
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6 bg-[#F8FAFC] min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[#1E293B]">Webhook Manager</h2>
          <p className="text-sm text-[#64748B] mt-1">
            Configure webhook endpoints for event notifications
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-[#003ABC] hover:bg-[#002A99] text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Webhook
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {/* Total */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#F8FAFC] flex items-center justify-center shrink-0">
            <Webhook className="w-5 h-5 text-[#003ABC]" />
          </div>
          <div>
            <p className="text-2xl font-bold text-[#1E293B]">{totalWebhooks}</p>
            <p className="text-xs text-[#64748B]">Total Webhooks</p>
          </div>
        </div>

        {/* Active */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
            <Webhook className="w-5 h-5 text-green-500" />
          </div>
          <div>
            <p className="text-2xl font-bold text-[#1E293B]">{activeWebhooks}</p>
            <p className="text-xs text-[#64748B]">Active</p>
          </div>
        </div>

        {/* By company */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 col-span-2 md:col-span-1">
          <p className="text-xs text-[#64748B] mb-2 font-medium">By Company</p>
          <div className="space-y-1.5">
            {Object.keys(byCompany).length === 0 ? (
              <p className="text-xs text-[#94A3B8]">No webhooks yet</p>
            ) : (
              Object.entries(byCompany)
                .sort((a, b) => b[1] - a[1])
                .map(([name, count]) => (
                  <div key={name} className="flex items-center justify-between">
                    <span className="text-sm text-[#1E293B] truncate max-w-[140px]">{name}</span>
                    <Badge
                      variant="secondary"
                      className="bg-[#003ABC]/10 text-[#003ABC] text-[10px] hover:bg-[#003ABC]/10"
                    >
                      {count}
                    </Badge>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <Select value={companyFilter} onValueChange={setCompanyFilter}>
          <SelectTrigger className="w-[220px] bg-white border-[#E2E8F0]">
            <SelectValue placeholder="Filter by company" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Companies</SelectItem>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-[#94A3B8]">
          {filteredWebhooks.length} webhook{filteredWebhooks.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Desktop Table */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-[#E2E8F0] hover:bg-transparent">
                <TableHead className="text-[#64748B] font-medium">Name</TableHead>
                <TableHead className="text-[#64748B] font-medium">Company</TableHead>
                <TableHead className="text-[#64748B] font-medium">URL</TableHead>
                <TableHead className="text-[#64748B] font-medium">Events</TableHead>
                <TableHead className="text-[#64748B] font-medium">Status</TableHead>
                <TableHead className="text-[#64748B] font-medium">Last Triggered</TableHead>
                <TableHead className="text-[#64748B] font-medium text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredWebhooks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-[#94A3B8]">
                    No webhooks found
                  </TableCell>
                </TableRow>
              ) : (
                filteredWebhooks.map((w) => (
                  <TableRow key={w.id} className="border-[#E2E8F0]">
                    <TableCell className="font-medium text-[#1E293B]">{w.name}</TableCell>
                    <TableCell className="text-[#64748B]">{w.companyName}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <code className="text-xs bg-[#F8FAFC] px-2 py-0.5 rounded text-[#64748B] font-mono max-w-[200px] truncate">
                          {truncateUrl(w.url, 40)}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0 text-[#94A3B8] hover:text-[#1E293B] hover:bg-[#F8FAFC]"
                          onClick={() => handleCopyUrl(w.url, w.id)}
                        >
                          {copiedId === w.id ? (
                            <Check className="w-3 h-3 text-green-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {w.events.slice(0, 2).map((event) => (
                          <Badge
                            key={event}
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 ${EVENT_COLORS[event] || ''}`}
                          >
                            {event}
                          </Badge>
                        ))}
                        {w.events.length > 2 && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0 bg-slate-100 text-[#64748B] hover:bg-slate-100"
                          >
                            +{w.events.length - 2} more
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${w.active ? 'bg-green-500' : 'bg-slate-300'}`} />
                        <span className="text-sm text-[#1E293B]">{w.active ? 'Active' : 'Inactive'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-[#94A3B8] text-sm">
                      {w.lastTriggered
                        ? new Date(w.lastTriggered).toLocaleDateString()
                        : 'Never'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleTest(w.id)}
                          disabled={testingId === w.id || !w.active}
                          className="text-[#FF6A00] hover:text-[#E55D00] hover:bg-orange-50"
                        >
                          {testingId === w.id ? (
                            <span className="flex items-center gap-1">
                              <span className="w-3 h-3 border-2 border-[#FF6A00] border-t-transparent rounded-full animate-spin" />
                              Testing
                            </span>
                          ) : (
                            <>
                              <Play className="w-3.5 h-3.5 mr-1" />
                              Test
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(w)}
                          className="h-8 w-8 text-[#64748B] hover:text-[#1E293B] hover:bg-[#F8FAFC]"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteConfirm({ open: true, id: w.id, name: w.name })}
                          className="h-8 w-8 text-[#64748B] hover:text-red-500 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="space-y-3 md:hidden">
        {filteredWebhooks.length === 0 ? (
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-8 text-center text-[#94A3B8]">
            No webhooks found
          </div>
        ) : (
          filteredWebhooks.map((w) => (
            <div key={w.id} className="bg-white rounded-xl border border-[#E2E8F0] p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[#1E293B]">{w.name}</h3>
                  <p className="text-xs text-[#64748B]">{w.companyName}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${w.active ? 'bg-green-500' : 'bg-slate-300'}`} />
                  <span className="text-xs text-[#1E293B]">{w.active ? 'Active' : 'Inactive'}</span>
                </div>
              </div>

              {/* URL */}
              <div className="flex items-center gap-1.5">
                <code className="text-xs bg-[#F8FAFC] px-2 py-1 rounded text-[#64748B] font-mono flex-1 truncate">
                  {w.url}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-[#94A3B8] hover:text-[#1E293B] hover:bg-[#F8FAFC]"
                  onClick={() => handleCopyUrl(w.url, w.id)}
                >
                  {copiedId === w.id ? (
                    <Check className="w-3 h-3 text-green-500" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </Button>
              </div>

              {/* Events */}
              <div className="flex flex-wrap gap-1">
                {w.events.map((event) => (
                  <Badge
                    key={event}
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 ${EVENT_COLORS[event] || ''}`}
                  >
                    {event}
                  </Badge>
                ))}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-1 border-t border-[#E2E8F0]">
                <span className="text-xs text-[#94A3B8]">
                  {w.lastTriggered
                    ? `Last: ${new Date(w.lastTriggered).toLocaleDateString()}`
                    : 'Never triggered'}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleTest(w.id)}
                    disabled={testingId === w.id || !w.active}
                    className="text-[#FF6A00] hover:text-[#E55D00] hover:bg-orange-50 h-7 text-xs"
                  >
                    {testingId === w.id ? 'Testing...' : 'Test'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEdit(w)}
                    className="text-[#64748B] hover:text-[#1E293B] hover:bg-[#F8FAFC] h-7 text-xs"
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteConfirm({ open: true, id: w.id, name: w.name })}
                    className="text-red-500 hover:text-red-600 hover:bg-red-50 h-7 text-xs"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Create / Edit Dialog ────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm() }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B]">
              {editingId ? 'Edit Webhook' : 'Create Webhook'}
            </DialogTitle>
            <DialogDescription className="text-[#64748B]">
              {editingId
                ? 'Update this webhook endpoint configuration.'
                : 'Add a new webhook endpoint to receive event notifications.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Company */}
            <div className="space-y-2">
              <Label className="text-[#1E293B]">Company</Label>
              <Select
                value={form.companyId}
                onValueChange={(v) => setForm((p) => ({ ...p, companyId: v }))}
              >
                <SelectTrigger className="border-[#E2E8F0]">
                  <SelectValue placeholder="Select a company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label className="text-[#1E293B]">Webhook Name</Label>
              <Input
                placeholder="e.g. Task Completion Notifier"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="border-[#E2E8F0] focus-visible:ring-[#003ABC]"
              />
            </div>

            {/* URL */}
            <div className="space-y-2">
              <Label className="text-[#1E293B]">Endpoint URL</Label>
              <Input
                placeholder="https://your-server.com/webhooks/..."
                value={form.url}
                onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
                className="border-[#E2E8F0] focus-visible:ring-[#003ABC] font-mono text-sm"
              />
            </div>

            {/* Events */}
            <div className="space-y-2">
              <Label className="text-[#1E293B]">Events</Label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_EVENTS.map((event) => (
                  <div key={event} className="flex items-center gap-2">
                    <Checkbox
                      id={`event-${event}`}
                      checked={form.events.includes(event)}
                      onCheckedChange={() => toggleEvent(event)}
                      className="border-[#E2E8F0] data-[state=checked]:bg-[#003ABC] data-[state=checked]:border-[#003ABC]"
                    />
                    <label
                      htmlFor={`event-${event}`}
                      className="text-sm text-[#1E293B] cursor-pointer select-none"
                    >
                      {event}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between rounded-lg border border-[#E2E8F0] p-3">
              <div>
                <p className="text-sm font-medium text-[#1E293B]">Active</p>
                <p className="text-xs text-[#64748B]">Enable or disable this webhook</p>
              </div>
              <Switch
                checked={form.active}
                onCheckedChange={(checked) => setForm((p) => ({ ...p, active: checked }))}
                className="data-[state=checked]:bg-[#003ABC]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setDialogOpen(false); resetForm() }}
              className="border-[#E2E8F0] text-[#1E293B]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!form.companyId || !form.name || !form.url || form.events.length === 0 || submitting}
              className="bg-[#003ABC] hover:bg-[#002A99] text-white"
            >
              {submitting ? 'Saving...' : editingId ? 'Update Webhook' : 'Create Webhook'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ───────────────────────────────────────── */}
      <AlertDialog open={deleteConfirm.open} onOpenChange={(open) => setDeleteConfirm((p) => ({ ...p, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#1E293B]">Delete Webhook</AlertDialogTitle>
            <AlertDialogDescription className="text-[#64748B]">
              Are you sure you want to delete &quot;{deleteConfirm.name}&quot;? This action cannot be undone and the endpoint will stop receiving events.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#E2E8F0] text-[#1E293B]">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {deleting ? 'Deleting...' : 'Delete Webhook'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Test Result Dialog ──────────────────────────────────────────── */}
      <Dialog open={testResult.open} onOpenChange={(open) => setTestResult((p) => ({ ...p, open }))}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B]">Test Result</DialogTitle>
          </DialogHeader>
          <div
            className={`flex items-start gap-3 rounded-lg border p-4 ${
              testResult.success
                ? 'border-green-300 bg-green-50'
                : 'border-red-300 bg-red-50'
            }`}
          >
            {testResult.success ? (
              <Check className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
            ) : (
              <ExternalLink className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            )}
            <div>
              <p className={`text-sm font-semibold ${testResult.success ? 'text-green-800' : 'text-red-800'}`}>
                {testResult.success ? 'Success' : 'Failed'}
              </p>
              <p className={`text-xs mt-1 ${testResult.success ? 'text-green-700' : 'text-red-700'}`}>
                {testResult.message}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => setTestResult((p) => ({ ...p, open: false }))}
              className="bg-[#003ABC] hover:bg-[#002A99] text-white"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}