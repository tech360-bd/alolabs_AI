'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Key,
  Plus,
  Copy,
  Check,
  Ban,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
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

interface ApiKey {
  id: string
  name: string
  companyId: string
  companyName: string
  type: 'test' | 'live' | 'restricted' | 'service' | 'webhook'
  prefix: string
  scopes: string[]
  rateLimit: number
  status: 'active' | 'suspended' | 'revoked'
  lastUsed: string | null
  createdAt: string
}

interface CompanyOption {
  id: string
  name: string
}

const ALL_SCOPES = [
  'agents:list',
  'agents:run',
  'workflows:list',
  'workflows:run',
  'documents:upload',
  'documents:read',
  'knowledge:query',
  'usage:read',
  'webhooks:manage',
  'approvals:read',
] as const

const TYPE_COLORS: Record<string, string> = {
  test: 'bg-amber-100 text-amber-700 border-amber-200',
  live: 'bg-green-100 text-green-700 border-green-200',
  restricted: 'bg-blue-100 text-blue-700 border-blue-200',
  service: 'bg-purple-100 text-purple-700 border-purple-200',
  webhook: 'bg-cyan-100 text-cyan-700 border-cyan-200',
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500',
  suspended: 'bg-amber-500',
  revoked: 'bg-red-500',
}

// ── Component ───────────────────────────────────────────────────────────────

export default function ApiKeysPanel() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [loading, setLoading] = useState(true)
  const [companyFilter, setCompanyFilter] = useState<string>('all')

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({
    companyId: '',
    name: '',
    type: 'test' as ApiKey['type'],
    scopes: [] as string[],
    rateLimit: 1000,
  })
  const [creating, setCreating] = useState(false)

  // Reveal key dialog
  const [revealKey, setRevealKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Confirm dialogs
  const [confirmAction, setConfirmAction] = useState<{
    open: boolean
    keyId: string
    keyName: string
    action: 'suspend' | 'revoke'
  }>({ open: false, keyId: '', keyName: '', action: 'suspend' })
  const [actioning, setActioning] = useState(false)

  // ── Data fetch ──────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      const [keysRes, companiesRes] = await Promise.all([
        fetch('/api/api-keys'),
        fetch('/api/companies'),
      ])
      const keysData = await keysRes.json()
      const companiesData = await companiesRes.json()
      setKeys(keysData.data || [])
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

  const handleCreate = async () => {
    setCreating(true)
    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      })
      const data = await res.json()
      if (data.key) {
        setRevealKey(data.key)
        setCreateOpen(false)
        setCreateForm({ companyId: '', name: '', type: 'test', scopes: [], rateLimit: 1000 })
        fetchData()
      }
    } catch {
      // silently handle
    } finally {
      setCreating(false)
    }
  }

  const handleCopyKey = async () => {
    if (!revealKey) return
    await navigator.clipboard.writeText(revealKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleAction = async () => {
    setActioning(true)
    try {
      await fetch('/api/api-keys', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: confirmAction.keyId,
          action: confirmAction.action,
        }),
      })
      setConfirmAction({ open: false, keyId: '', keyName: '', action: 'suspend' })
      fetchData()
    } catch {
      // silently handle
    } finally {
      setActioning(false)
    }
  }

  const toggleScope = (scope: string) => {
    setCreateForm((prev) => ({
      ...prev,
      scopes: prev.scopes.includes(scope)
        ? prev.scopes.filter((s) => s !== scope)
        : [...prev.scopes, scope],
    }))
  }

  // ── Filtering ──────────────────────────────────────────────────────────

  const filteredKeys = companyFilter === 'all'
    ? keys
    : keys.filter((k) => k.companyId === companyFilter)

  // ── Stats ──────────────────────────────────────────────────────────────

  const totalKeys = keys.length
  const activeKeys = keys.filter((k) => k.status === 'active').length
  const suspendedKeys = keys.filter((k) => k.status === 'suspended').length
  const testKeys = keys.filter((k) => k.type === 'test').length

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
          <h2 className="text-xl font-semibold text-[#1E293B]">API Key Manager</h2>
          <p className="text-sm text-[#64748B] mt-1">
            Manage secure API keys for sister company access to ALO Labs agents
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="bg-[#003ABC] hover:bg-[#002A99] text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Key
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Keys', value: totalKeys, icon: Key },
          { label: 'Active', value: activeKeys, icon: ShieldCheck, color: 'text-green-500' },
          { label: 'Suspended', value: suspendedKeys, icon: ShieldAlert, color: 'text-amber-500' },
          { label: 'Test Keys', value: testKeys, icon: Key, color: 'text-purple-500' },
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
          {filteredKeys.length} key{filteredKeys.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-[#E2E8F0] hover:bg-transparent">
                <TableHead className="text-[#64748B] font-medium">Name</TableHead>
                <TableHead className="text-[#64748B] font-medium">Company</TableHead>
                <TableHead className="text-[#64748B] font-medium">Type</TableHead>
                <TableHead className="text-[#64748B] font-medium">Prefix</TableHead>
                <TableHead className="text-[#64748B] font-medium">Scopes</TableHead>
                <TableHead className="text-[#64748B] font-medium">Rate Limit</TableHead>
                <TableHead className="text-[#64748B] font-medium">Status</TableHead>
                <TableHead className="text-[#64748B] font-medium">Last Used</TableHead>
                <TableHead className="text-[#64748B] font-medium text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredKeys.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-[#94A3B8]">
                    No API keys found
                  </TableCell>
                </TableRow>
              ) : (
                filteredKeys.map((key) => (
                  <TableRow key={key.id} className="border-[#E2E8F0]">
                    <TableCell className="font-medium text-[#1E293B]">{key.name}</TableCell>
                    <TableCell className="text-[#64748B]">{key.companyName}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-2 py-0.5 ${TYPE_COLORS[key.type] || ''}`}
                      >
                        {key.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-[#F8FAFC] px-2 py-0.5 rounded text-[#64748B] font-mono">
                        {key.prefix}...
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {key.scopes.slice(0, 3).map((scope) => (
                          <Badge
                            key={scope}
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0 bg-slate-100 text-[#64748B] hover:bg-slate-100"
                          >
                            {scope}
                          </Badge>
                        ))}
                        {key.scopes.length > 3 && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0 bg-[#003ABC]/10 text-[#003ABC] hover:bg-[#003ABC]/10"
                          >
                            +{key.scopes.length - 3} more
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-[#64748B] text-sm">
                      {key.rateLimit.toLocaleString()}/hr
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[key.status] || ''}`} />
                        <span className="text-sm text-[#1E293B] capitalize">{key.status}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-[#94A3B8] text-sm">
                      {key.lastUsed
                        ? new Date(key.lastUsed).toLocaleDateString()
                        : 'Never'}
                    </TableCell>
                    <TableCell className="text-right">
                      {key.status === 'active' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setConfirmAction({
                              open: true,
                              keyId: key.id,
                              keyName: key.name,
                              action: 'suspend',
                            })
                          }
                          className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                        >
                          <Ban className="w-4 h-4 mr-1" />
                          Suspend
                        </Button>
                      )}
                      {key.status !== 'revoked' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setConfirmAction({
                              open: true,
                              keyId: key.id,
                              keyName: key.name,
                              action: 'revoke',
                            })
                          }
                          className="text-red-500 hover:text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Revoke
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ── Create Key Dialog ───────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B]">Create API Key</DialogTitle>
            <DialogDescription className="text-[#64748B]">
              Generate a new API key for company access to ALO Labs agents.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Company */}
            <div className="space-y-2">
              <Label className="text-[#1E293B]">Company</Label>
              <Select
                value={createForm.companyId}
                onValueChange={(v) => setCreateForm((p) => ({ ...p, companyId: v }))}
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
              <Label className="text-[#1E293B]">Key Name</Label>
              <Input
                placeholder="e.g. Production Integration"
                value={createForm.name}
                onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                className="border-[#E2E8F0] focus-visible:ring-[#003ABC]"
              />
            </div>

            {/* Type */}
            <div className="space-y-2">
              <Label className="text-[#1E293B]">Key Type</Label>
              <Select
                value={createForm.type}
                onValueChange={(v) => setCreateForm((p) => ({ ...p, type: v as ApiKey['type'] }))}
              >
                <SelectTrigger className="border-[#E2E8F0]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="test">Test</SelectItem>
                  <SelectItem value="live">Live</SelectItem>
                  <SelectItem value="restricted">Restricted</SelectItem>
                  <SelectItem value="service">Service</SelectItem>
                  <SelectItem value="webhook">Webhook</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Scopes */}
            <div className="space-y-2">
              <Label className="text-[#1E293B]">Scopes</Label>
              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                {ALL_SCOPES.map((scope) => (
                  <div key={scope} className="flex items-center gap-2">
                    <Checkbox
                      id={`scope-${scope}`}
                      checked={createForm.scopes.includes(scope)}
                      onCheckedChange={() => toggleScope(scope)}
                      className="border-[#E2E8F0] data-[state=checked]:bg-[#003ABC] data-[state=checked]:border-[#003ABC]"
                    />
                    <label
                      htmlFor={`scope-${scope}`}
                      className="text-sm text-[#1E293B] cursor-pointer select-none"
                    >
                      {scope}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Rate Limit */}
            <div className="space-y-2">
              <Label className="text-[#1E293B]">Rate Limit (per hour)</Label>
              <Input
                type="number"
                min={1}
                value={createForm.rateLimit}
                onChange={(e) =>
                  setCreateForm((p) => ({ ...p, rateLimit: parseInt(e.target.value) || 0 }))
                }
                className="border-[#E2E8F0] focus-visible:ring-[#003ABC]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              className="border-[#E2E8F0] text-[#1E293B]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!createForm.companyId || !createForm.name || creating}
              className="bg-[#003ABC] hover:bg-[#002A99] text-white"
            >
              {creating ? 'Creating...' : 'Create Key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reveal Key Dialog ───────────────────────────────────────────── */}
      <Dialog open={!!revealKey} onOpenChange={(open) => !open && setRevealKey(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B]">API Key Created</DialogTitle>
          </DialogHeader>

          {/* Warning banner */}
          <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800">
                ⚠️ This key will NOT be shown again. Copy it now.
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Store this key securely. You will not be able to view it after closing this dialog.
              </p>
            </div>
          </div>

          {/* Key display */}
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-4 py-3 font-mono text-[#1E293B] break-all select-all">
              {revealKey}
            </code>
            <Button
              onClick={handleCopyKey}
              variant="outline"
              size="icon"
              className="shrink-0 border-[#E2E8F0] hover:bg-[#F8FAFC]"
            >
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>

          <DialogFooter>
            <Button
              onClick={() => setRevealKey(null)}
              className="bg-[#003ABC] hover:bg-[#002A99] text-white"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirm Action Dialog ───────────────────────────────────────── */}
      <AlertDialog open={confirmAction.open} onOpenChange={(open) => setConfirmAction((p) => ({ ...p, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#1E293B]">
              {confirmAction.action === 'suspend' ? 'Suspend API Key' : 'Revoke API Key'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#64748B]">
              {confirmAction.action === 'suspend'
                ? `Are you sure you want to suspend "${confirmAction.keyName}"? The key will stop working until reactivated.`
                : `Are you sure you want to permanently revoke "${confirmAction.keyName}"? This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#E2E8F0] text-[#1E293B]">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAction}
              disabled={actioning}
              className={
                confirmAction.action === 'suspend'
                  ? 'bg-amber-500 hover:bg-amber-600 text-white'
                  : 'bg-red-500 hover:bg-red-600 text-white'
              }
            >
              {actioning
                ? 'Processing...'
                : confirmAction.action === 'suspend'
                  ? 'Suspend Key'
                  : 'Revoke Key'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}