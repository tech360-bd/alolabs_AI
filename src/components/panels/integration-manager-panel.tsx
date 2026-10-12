'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Plug,
  Plus,
  Pencil,
  Trash2,
  CheckCircle,
  XCircle,
  AlertCircle,
  ExternalLink,
  Webhook as WebhookIcon,
  Zap,
  Link2,
  Settings,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
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

// ── Types ───────────────────────────────────────────────────────────────────

interface Integration {
  id: string
  name: string
  type: 'slack' | 'n8n' | 'zapier' | 'webhook' | 'custom'
  companyId: string
  companyName: string
  status: 'connected' | 'disconnected' | 'error'
  enabled: boolean
  config: Record<string, string>
  lastSync: string | null
  createdAt: string
  description: string
}

interface CompanyOption {
  id: string
  name: string
}

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  slack: { icon: Zap, color: 'text-[#E01E5A]', bg: 'bg-[#E01E5A]/10' },
  n8n: { icon: Link2, color: 'text-[#FF6D5A]', bg: 'bg-[#FF6D5A]/10' },
  zapier: { icon: Zap, color: 'text-[#FF4A00]', bg: 'bg-[#FF4A00]/10' },
  webhook: { icon: WebhookIcon, color: 'text-[#003ABC]', bg: 'bg-[#003ABC]/10' },
  custom: { icon: Plug, color: 'text-purple-600', bg: 'bg-purple-100' },
}

const STATUS_INDICATOR: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  connected: { icon: CheckCircle, color: 'text-green-500', label: 'Connected' },
  disconnected: { icon: XCircle, color: 'text-[#94A3B8]', label: 'Disconnected' },
  error: { icon: AlertCircle, color: 'text-red-500', label: 'Error' },
}

const TYPE_FIELDS: Record<string, { key: string; label: string; placeholder: string; type?: string }[]> = {
  slack: [
    { key: 'botToken', label: 'Bot Token', placeholder: 'xoxb-...' },
    { key: 'signingSecret', label: 'Signing Secret', placeholder: 'Enter signing secret' },
    { key: 'channelId', label: 'Default Channel ID', placeholder: 'C0123456789' },
  ],
  n8n: [
    { key: 'webhookUrl', label: 'Webhook URL', placeholder: 'https://your-n8n.com/webhook/...' },
    { key: 'apiKey', label: 'API Key', placeholder: 'Enter n8n API key' },
  ],
  zapier: [
    { key: 'webhookUrl', label: 'Webhook URL', placeholder: 'https://hooks.zapier.com/hooks/catch/...' },
    { key: 'authToken', label: 'Auth Token', placeholder: 'Enter Zapier auth token' },
  ],
  webhook: [
    { key: 'url', label: 'Webhook URL', placeholder: 'https://your-domain.com/webhook' },
    { key: 'secret', label: 'HMAC Secret', placeholder: 'Enter HMAC signing secret' },
  ],
  custom: [
    { key: 'url', label: 'Endpoint URL', placeholder: 'https://your-domain.com/api/endpoint' },
    { key: 'apiKey', label: 'API Key', placeholder: 'Enter API key' },
    { key: 'authHeader', label: 'Auth Header Name', placeholder: 'Authorization' },
  ],
}

// ── Component ───────────────────────────────────────────────────────────────

export default function IntegrationManagerPanel() {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<string>('all')

  // Create / Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    companyId: '',
    name: '',
    type: 'slack' as Integration['type'],
    description: '',
    config: {} as Record<string, string>,
    enabled: true,
  })
  const [submitting, setSubmitting] = useState(false)

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean
    id: string
    name: string
  }>({ open: false, id: '', name: '' })
  const [deleting, setDeleting] = useState(false)

  // Toggle
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // ── Data fetch ──────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      const [integrationsRes, companiesRes] = await Promise.all([
        fetch('/api/integrations'),
        fetch('/api/companies'),
      ])
      const integrationsData = await integrationsRes.json()
      const companiesData = await companiesRes.json()
      setIntegrations(integrationsData.data || [])
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
    setForm({ companyId: '', name: '', type: 'slack', description: '', config: {}, enabled: true })
    setEditingId(null)
  }

  const openCreate = () => {
    resetForm()
    setDialogOpen(true)
  }

  const openEdit = (integration: Integration) => {
    setEditingId(integration.id)
    setForm({
      companyId: integration.companyId,
      name: integration.name,
      type: integration.type,
      description: integration.description,
      config: { ...integration.config },
      enabled: integration.enabled,
    })
    setDialogOpen(true)
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const isEdit = !!editingId
      const res = await fetch('/api/integrations', {
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
      await fetch('/api/integrations', {
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

  const handleToggle = async (integration: Integration) => {
    setTogglingId(integration.id)
    try {
      await fetch('/api/integrations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: integration.id,
          action: integration.enabled ? 'disable' : 'enable',
        }),
      })
      fetchData()
    } catch {
      // silently handle
    } finally {
      setTogglingId(null)
    }
  }

  // ── Filtering ──────────────────────────────────────────────────────────

  const filteredIntegrations =
    typeFilter === 'all'
      ? integrations
      : integrations.filter((i) => i.type === typeFilter)

  // ── Stats ──────────────────────────────────────────────────────────────

  const totalIntegrations = integrations.length
  const connectedIntegrations = integrations.filter((i) => i.status === 'connected').length
  const errorIntegrations = integrations.filter((i) => i.status === 'error').length
  const enabledIntegrations = integrations.filter((i) => i.enabled).length

  // ── Loading ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6 p-6 bg-[#F8FAFC] min-h-screen">
        <Skeleton className="h-8 w-56 bg-slate-200" />
        <Skeleton className="h-4 w-80 bg-slate-100" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl bg-slate-100" />
          ))}
        </div>
        <Skeleton className="h-10 w-full bg-slate-100" />
        <Skeleton className="h-96 rounded-xl bg-slate-100" />
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6 bg-[#F8FAFC] min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[#1E293B]">Integration Manager</h2>
          <p className="text-sm text-[#64748B] mt-1">
            Manage external integrations: Slack, n8n, Zapier, custom webhooks, and more
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-[#003ABC] hover:bg-[#002A99] text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Integration
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: totalIntegrations, icon: Plug },
          { label: 'Connected', value: connectedIntegrations, icon: CheckCircle, color: 'text-green-500' },
          { label: 'Errors', value: errorIntegrations, icon: AlertCircle, color: 'text-red-500' },
          { label: 'Enabled', value: enabledIntegrations, icon: Zap, color: 'text-purple-500' },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-white rounded-xl border border-[#E2E8F0] p-4 flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-lg bg-[#F8FAFC] flex items-center justify-center shrink-0">
              <s.icon className={`w-5 h-5 ${s.color ?? 'text-[#003ABC]'}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#1E293B]">{s.value}</p>
              <p className="text-xs text-[#64748B]">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[200px] bg-white border-[#E2E8F0]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="slack">Slack</SelectItem>
            <SelectItem value="n8n">n8n</SelectItem>
            <SelectItem value="zapier">Zapier</SelectItem>
            <SelectItem value="webhook">Webhook</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-[#94A3B8]">
          {filteredIntegrations.length} integration{filteredIntegrations.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-[#E2E8F0] hover:bg-transparent">
                <TableHead className="text-[#64748B] font-medium">Integration</TableHead>
                <TableHead className="text-[#64748B] font-medium">Type</TableHead>
                <TableHead className="text-[#64748B] font-medium">Company</TableHead>
                <TableHead className="text-[#64748B] font-medium">Status</TableHead>
                <TableHead className="text-[#64748B] font-medium">Enabled</TableHead>
                <TableHead className="text-[#64748B] font-medium">Last Sync</TableHead>
                <TableHead className="text-[#64748B] font-medium text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredIntegrations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-[#94A3B8]">
                    No integrations found
                  </TableCell>
                </TableRow>
              ) : (
                filteredIntegrations.map((integration) => {
                  const typeConf = TYPE_CONFIG[integration.type] || TYPE_CONFIG.custom
                  const statusConf = STATUS_INDICATOR[integration.status] || STATUS_INDICATOR.disconnected
                  const TypeIcon = typeConf.icon
                  const StatusIcon = statusConf.icon

                  return (
                    <TableRow key={integration.id} className="border-[#E2E8F0]">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-lg ${typeConf.bg} flex items-center justify-center shrink-0`}>
                            <TypeIcon className={`w-4 h-4 ${typeConf.color}`} />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-[#1E293B]">{integration.name}</p>
                            <p className="text-xs text-[#94A3B8] max-w-[200px] truncate">
                              {integration.description}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="text-[10px] px-2 py-0.5 capitalize"
                        >
                          {integration.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-[#64748B]">
                        {integration.companyName}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <StatusIcon className={`w-4 h-4 ${statusConf.color}`} />
                          <span className={`text-sm ${statusConf.color}`}>{statusConf.label}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={integration.enabled}
                          disabled={togglingId === integration.id}
                          onCheckedChange={() => handleToggle(integration)}
                          className="data-[state=checked]:bg-[#003ABC]"
                        />
                      </TableCell>
                      <TableCell className="text-[#94A3B8] text-sm">
                        {integration.lastSync
                          ? new Date(integration.lastSync).toLocaleDateString()
                          : 'Never'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(integration)}
                            className="text-[#003ABC] hover:text-[#002A99] hover:bg-[#003ABC]/5"
                          >
                            <Settings className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setDeleteConfirm({ open: true, id: integration.id, name: integration.name })
                            }
                            className="text-red-500 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ── Create / Edit Dialog ─────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B]">
              {editingId ? 'Edit Integration' : 'Add Integration'}
            </DialogTitle>
            <DialogDescription className="text-[#64748B]">
              {editingId
                ? 'Update integration configuration and settings.'
                : 'Connect a new external integration to the platform.'}
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
              <Label className="text-[#1E293B]">Integration Name</Label>
              <Input
                placeholder="e.g. Production Slack Bot"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="border-[#E2E8F0] focus-visible:ring-[#003ABC]"
              />
            </div>

            {/* Type */}
            <div className="space-y-2">
              <Label className="text-[#1E293B]">Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) => {
                  setForm((p) => ({ ...p, type: v as Integration['type'], config: {} }))
                }}
              >
                <SelectTrigger className="border-[#E2E8F0]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="slack">
                    <span className="flex items-center gap-2">
                      <Zap className="w-3.5 h-3.5 text-[#E01E5A]" />
                      Slack
                    </span>
                  </SelectItem>
                  <SelectItem value="n8n">
                    <span className="flex items-center gap-2">
                      <Link2 className="w-3.5 h-3.5 text-[#FF6D5A]" />
                      n8n
                    </span>
                  </SelectItem>
                  <SelectItem value="zapier">
                    <span className="flex items-center gap-2">
                      <Zap className="w-3.5 h-3.5 text-[#FF4A00]" />
                      Zapier
                    </span>
                  </SelectItem>
                  <SelectItem value="webhook">
                    <span className="flex items-center gap-2">
                      <WebhookIcon className="w-3.5 h-3.5 text-[#003ABC]" />
                      Custom Webhook
                    </span>
                  </SelectItem>
                  <SelectItem value="custom">
                    <span className="flex items-center gap-2">
                      <Plug className="w-3.5 h-3.5 text-purple-600" />
                      Custom
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label className="text-[#1E293B]">Description</Label>
              <Input
                placeholder="Brief description of this integration"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                className="border-[#E2E8F0] focus-visible:ring-[#003ABC]"
              />
            </div>

            <Separator className="bg-[#E2E8F0]" />

            {/* Type-specific config fields */}
            <div className="space-y-3">
              <Label className="text-[#1E293B] flex items-center gap-1.5">
                <Settings className="w-3.5 h-3.5" />
                Configuration
              </Label>
              {(TYPE_FIELDS[form.type] || []).map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label className="text-[#94A3B8] text-xs">{field.label}</Label>
                  <Input
                    type={field.type || 'text'}
                    placeholder={field.placeholder}
                    value={form.config[field.key] || ''}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        config: { ...p.config, [field.key]: e.target.value },
                      }))
                    }
                    className="border-[#E2E8F0] focus-visible:ring-[#003ABC]"
                  />
                </div>
              ))}
            </div>

            {/* Enabled */}
            <div className="flex items-center justify-between">
              <Label className="text-[#1E293B]">Enable integration</Label>
              <Switch
                checked={form.enabled}
                onCheckedChange={(checked) => setForm((p) => ({ ...p, enabled: checked }))}
                className="data-[state=checked]:bg-[#003ABC]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="border-[#E2E8F0] text-[#1E293B]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!form.companyId || !form.name.trim() || submitting}
              className="bg-[#003ABC] hover:bg-[#002A99] text-white"
            >
              {submitting ? 'Saving...' : editingId ? 'Save Changes' : 'Add Integration'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ────────────────────────────────────────── */}
      <AlertDialog open={deleteConfirm.open} onOpenChange={(open) => setDeleteConfirm((p) => ({ ...p, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#1E293B]">Remove Integration</AlertDialogTitle>
            <AlertDialogDescription className="text-[#64748B]">
              Are you sure you want to remove &quot;{deleteConfirm.name}&quot;? This will disconnect the integration and all associated automations will stop.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#E2E8F0] text-[#1E293B]">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {deleting ? 'Removing...' : 'Remove Integration'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}