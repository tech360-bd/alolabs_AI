'use client'

import { toast } from 'sonner'
import SettingsPanel from './settings-panel'
import { apiFetch } from '@/lib/api-client'
import { useEffect, useState, useCallback } from 'react'
import {
  Users,
  Building2,
  CreditCard,
  Brain,
  Activity,
  Receipt,
  HardDrive,
  Share2,
  Mail,
  Cpu,
  Settings,
  Rocket,
  Search,
  Plus,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Download,
  Trash2,
  Power,
  Eye,
  Edit3,
  MoreHorizontal,
  ShieldCheck,
  Clock,
  DollarSign,
  Layers,
  FileCheck2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import LinkCoveragePanel from '@/components/panels/link-coverage-panel'

// ─── Shared types ─────────────────────────────────────────────────────────

interface UserItem {
  id: string
  name: string
  email: string
  role: string
  status: string
  company?: { name: string }
  createdAt: string
  lastLogin: string | null
}

interface CompanyItem {
  id: string
  name: string
  slug: string
  subscriptionTier?: string
  status?: string
  createdAt: string
}

interface SubItem {
  id: string
  company?: { name: string }
  plan?: { name: string; priceMonthly: number }
  status: string
  currentPeriodEnd: string
}

interface ModelItem {
  id: string
  name: string
  provider: string
  status: string
  inputCostPer1k?: number
  outputCostPer1k?: number
}

interface InvoiceItem {
  id: string
  company?: { name: string }
  amount: number
  currency: string
  status: string
  dueDate: string
  invoiceNumber: string
  createdAt: string
}

interface BackupItem {
  id: string
  filename: string
  size?: number
  status: string
  createdAt: string
}

interface SocialAccount {
  platform: string
  platformUsername: string | null
  isActive: boolean
  connectedAt?: string
}

interface EmailAccount {
  id: string
  email: string
  provider: string
  syncStatus: string
  lastSynced?: string
}

interface WorkerItem {
  id: string
  name: string
  status: string
  activeJobs: number
  totalFailed: number
  lastHeartbeatAt: string | null
}

// ─── Tab Icons & Labels ──────────────────────────────────────────────────

const TABS = [
  { value: 'users', label: 'Users', icon: Users },
  { value: 'companies', label: 'Companies', icon: Building2 },
  { value: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
  { value: 'ai', label: 'AI Management', icon: Brain },
  { value: 'monitoring', label: 'Monitoring', icon: Activity },
  { value: 'billing', label: 'Billing', icon: Receipt },
  { value: 'backups', label: 'Backups', icon: HardDrive },
  { value: 'social', label: 'Social', icon: Share2 },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'workers', label: 'Workers', icon: Cpu },
  { value: 'settings', label: 'Settings', icon: Settings },
  { value: 'deploy', label: 'Deploy', icon: Rocket },
  { value: 'coverage', label: 'Link Coverage', icon: FileCheck2 },
] as const

// ─── Color helpers ────────────────────────────────────────────────────────

const statusBadge = (status: string) => {
  const s = status?.toLowerCase()
  if (['active', 'healthy', 'online', 'connected', 'paid', 'completed', 'running', 'synced'].includes(s))
    return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100">{status}</Badge>
  if (['disabled', 'inactive', 'offline', 'disconnected', 'cancelled', 'failed', 'error', 'down', 'stopped'].includes(s))
    return <Badge className="bg-red-50 text-red-700 border-red-200 hover:bg-red-100">{status}</Badge>
  if (['trialing', 'pending', 'syncing', 'processing', 'warning', 'degraded'].includes(s))
    return <Badge className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100">{status}</Badge>
  return <Badge className="bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100">{status}</Badge>
}

const roleColor: Record<string, string> = {
  super_admin: 'bg-red-100 text-red-700 border-red-200',
  admin: 'bg-purple-100 text-purple-700 border-purple-200',
  manager: 'bg-blue-100 text-blue-700 border-blue-200',
  member: 'bg-green-100 text-green-700 border-green-200',
}

// ─── Loading skeleton ────────────────────────────────────────────────────

function TabSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-10 w-64 bg-gray-100" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl bg-gray-100" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl bg-gray-100" />
    </div>
  )
}

// ─── Data fetcher hook ───────────────────────────────────────────────────

function useApiData<T>(url: string) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(() => {
    setLoading(true)
    setError(null)
    apiFetch(url)
      .then((r) => { if (!r.ok) throw Error('Request failed'); return r.json() })
      .then((res) => {
        setData(Array.isArray(res.data) ? res.data : Array.isArray(res) ? res : [])
      })
      .catch(() => setError('Failed to load data'))
      .finally(() => setLoading(false))
  }, [url])

  useEffect(() => { refetch() }, [refetch])

  return { data, loading, error, refetch }
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 1 — Users
// ═══════════════════════════════════════════════════════════════════════════

function UsersTab() {
  const { data, loading, refetch } = useApiData<UserItem>('/api/users')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editUser, setEditUser] = useState<UserItem | null>(null)

  const filtered = data.filter((u) => {
    const matchSearch = !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
    const matchRole = roleFilter === 'all' || u.role === roleFilter
    return matchSearch && matchRole
  })

  const handleToggleActive = async (u: UserItem) => {
    const newStatus = u.status === 'active' ? 'disabled' : 'active'
    await apiFetch(`/api/users/${u.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }) })
    refetch()
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
            <Input placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-64 bg-white border-[#E2E8F0] text-[#1E293B]" />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-36 bg-white border-[#E2E8F0] text-[#1E293B]"><SelectValue placeholder="All Roles" /></SelectTrigger>
            <SelectContent className="bg-white">
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="super_admin">Super Admin</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="member">Member</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => { setEditUser(null); setDialogOpen(true) }} className="bg-[#E8501A] hover:bg-[#e55d00] text-white gap-1.5">
          <Plus className="w-4 h-4" /> Add User
        </Button>
      </div>

      {loading ? <TabSkeleton /> : (
        <Card className="bg-white border-[#E2E8F0]">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-[#E2E8F0] hover:bg-transparent">
                  <TableHead className="text-[#64748B]">Name</TableHead>
                  <TableHead className="text-[#64748B]">Email</TableHead>
                  <TableHead className="text-[#64748B]">Role</TableHead>
                  <TableHead className="text-[#64748B]">Company</TableHead>
                  <TableHead className="text-[#64748B]">Status</TableHead>
                  <TableHead className="text-[#64748B]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-[#94A3B8]">No users found</TableCell></TableRow>
                ) : filtered.map((u) => (
                  <TableRow key={u.id} className="border-[#E2E8F0]">
                    <TableCell className="font-medium text-[#1E293B]">{u.name}</TableCell>
                    <TableCell className="text-[#64748B]">{u.email}</TableCell>
                    <TableCell><Badge className={roleColor[u.role] || 'bg-slate-100 text-slate-600'}>{u.role}</Badge></TableCell>
                    <TableCell className="text-[#64748B]">{u.company?.name || '—'}</TableCell>
                    <TableCell>{statusBadge(u.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-[#64748B] hover:text-[#003ACC]" onClick={() => { setEditUser(u); setDialogOpen(true) }}><Edit3 className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-[#64748B] hover:text-[#E8501A]" onClick={() => handleToggleActive(u)}>
                          <Power className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-white border-[#E2E8F0]">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B]">{editUser ? 'Edit User' : 'Create User'}</DialogTitle>
            <DialogDescription className="text-[#94A3B8]">{editUser ? 'Update user details below.' : 'Fill in the details to create a new user.'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label className="text-[#1E293B]">Name</Label><Input className="bg-white border-[#E2E8F0] text-[#1E293B]" defaultValue={editUser?.name || ''} /></div>
            <div><Label className="text-[#1E293B]">Email</Label><Input className="bg-white border-[#E2E8F0] text-[#1E293B]" defaultValue={editUser?.email || ''} /></div>
            <div>
              <Label className="text-[#1E293B]">Role</Label>
              <Select defaultValue={editUser?.role || 'member'}>
                <SelectTrigger className="bg-white border-[#E2E8F0] text-[#1E293B]"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-white"><SelectItem value="member">Member</SelectItem><SelectItem value="manager">Manager</SelectItem><SelectItem value="admin">Admin</SelectItem><SelectItem value="super_admin">Super Admin</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-[#E2E8F0] text-[#64748B]">Cancel</Button>
            <Button className="bg-[#E8501A] hover:bg-[#e55d00] text-white" onClick={() => { setDialogOpen(false); refetch() }}>{editUser ? 'Save Changes' : 'Create User'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 2 — Companies
// ═══════════════════════════════════════════════════════════════════════════

function CompaniesTab() {
  const { data, loading, refetch } = useApiData<CompanyItem>('/api/companies')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState<CompanyItem | null>(null)

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[#1E293B]">All Companies ({data.length})</h3>
        <Button onClick={() => { setEditItem(null); setDialogOpen(true) }} className="bg-[#E8501A] hover:bg-[#e55d00] text-white gap-1.5">
          <Plus className="w-4 h-4" /> Add Company
        </Button>
      </div>
      {loading ? <TabSkeleton /> : (
        <Card className="bg-white border-[#E2E8F0]">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-[#E2E8F0] hover:bg-transparent">
                  <TableHead className="text-[#64748B]">Name</TableHead>
                  <TableHead className="text-[#64748B]">Slug</TableHead>
                  <TableHead className="text-[#64748B]">Tier</TableHead>
                  <TableHead className="text-[#64748B]">Status</TableHead>
                  <TableHead className="text-[#64748B]">Created</TableHead>
                  <TableHead className="text-[#64748B]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-[#94A3B8]">No companies found</TableCell></TableRow>
                ) : data.map((c) => (
                  <TableRow key={c.id} className="border-[#E2E8F0]">
                    <TableCell className="font-medium text-[#1E293B]">{c.name}</TableCell>
                    <TableCell className="text-[#64748B] font-mono text-sm">{c.slug}</TableCell>
                    <TableCell><Badge className="bg-[#003ACC]/10 text-[#003ACC] border-[#003ACC]/20">{c.subscriptionTier || 'Free'}</Badge></TableCell>
                    <TableCell>{statusBadge(c.status || 'active')}</TableCell>
                    <TableCell className="text-[#94A3B8] text-sm">{new Date(c.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-[#64748B] hover:text-[#003ACC]" onClick={() => { setEditItem(c); setDialogOpen(true) }}><Edit3 className="w-4 h-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-white border-[#E2E8F0]">
          <DialogHeader><DialogTitle className="text-[#1E293B]">{editItem ? 'Edit Company' : 'Create Company'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label className="text-[#1E293B]">Name</Label><Input className="bg-white border-[#E2E8F0] text-[#1E293B]" defaultValue={editItem?.name || ''} /></div>
            <div><Label className="text-[#1E293B]">Slug</Label><Input className="bg-white border-[#E2E8F0] text-[#1E293B]" defaultValue={editItem?.slug || ''} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-[#E2E8F0] text-[#64748B]">Cancel</Button>
            <Button className="bg-[#E8501A] hover:bg-[#e55d00] text-white" onClick={() => { setDialogOpen(false); refetch() }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 3 — Subscriptions
// ═══════════════════════════════════════════════════════════════════════════

function SubscriptionsTab() {
  const { data, loading, refetch } = useApiData<SubItem>('/api/billing/subscriptions')

  const handleAction = async (id: string, action: string) => {
    await apiFetch(`/api/billing/subscriptions/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
    refetch()
  }

  return (
    <div className="space-y-4 p-6">
      <h3 className="text-lg font-semibold text-[#1E293B]">Subscriptions ({data.length})</h3>
      {loading ? <TabSkeleton /> : (
        <Card className="bg-white border-[#E2E8F0]">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-[#E2E8F0] hover:bg-transparent">
                  <TableHead className="text-[#64748B]">Company</TableHead>
                  <TableHead className="text-[#64748B]">Plan</TableHead>
                  <TableHead className="text-[#64748B]">Price</TableHead>
                  <TableHead className="text-[#64748B]">Status</TableHead>
                  <TableHead className="text-[#64748B]">Period End</TableHead>
                  <TableHead className="text-[#64748B]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-[#94A3B8]">No subscriptions found</TableCell></TableRow>
                ) : data.map((s) => (
                  <TableRow key={s.id} className="border-[#E2E8F0]">
                    <TableCell className="font-medium text-[#1E293B]">{s.company?.name || '—'}</TableCell>
                    <TableCell className="text-[#1E293B]">{s.plan?.name || '—'}</TableCell>
                    <TableCell className="text-[#1E293B]">${s.plan?.priceMonthly ?? 0}/mo</TableCell>
                    <TableCell>{statusBadge(s.status)}</TableCell>
                    <TableCell className="text-[#94A3B8] text-sm">{new Date(s.currentPeriodEnd).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-[#003ACC] hover:text-[#003ACC]" onClick={() => handleAction(s.id, 'upgrade')}>Upgrade</Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-[#64748B] hover:text-[#1E293B]" onClick={() => handleAction(s.id, 'downgrade')}>Downgrade</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 4 — AI Management
// ═══════════════════════════════════════════════════════════════════════════

function AiTab() {
  const { data, loading, refetch } = useApiData<ModelItem>('/api/llm/models')
  const providers = [...new Set(data.map((m) => m.provider))]
  const activeCount = data.filter((m) => m.status?.toLowerCase() === 'active').length

  return (
    <div className="space-y-4 p-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-white border-[#E2E8F0]"><CardContent className="p-4 flex items-center gap-3"><Brain className="w-8 h-8 text-[#003ACC]" /><div><p className="text-2xl font-bold text-[#1E293B]">{data.length}</p><p className="text-xs text-[#94A3B8]">Total Models</p></div></CardContent></Card>
        <Card className="bg-white border-[#E2E8F0]"><CardContent className="p-4 flex items-center gap-3"><CheckCircle2 className="w-8 h-8 text-emerald-500" /><div><p className="text-2xl font-bold text-[#1E293B]">{activeCount}</p><p className="text-xs text-[#94A3B8]">Active</p></div></CardContent></Card>
        <Card className="bg-white border-[#E2E8F0]"><CardContent className="p-4 flex items-center gap-3"><Building2 className="w-8 h-8 text-[#E8501A]" /><div><p className="text-2xl font-bold text-[#1E293B]">{providers.length}</p><p className="text-xs text-[#94A3B8]">Providers</p></div></CardContent></Card>
      </div>
      {loading ? <TabSkeleton /> : (
        <Card className="bg-white border-[#E2E8F0]">
          <CardHeader className="pb-3 flex-row items-center justify-between">
            <CardTitle className="text-[#1E293B] text-base">AI Models</CardTitle>
            <Button variant="outline" size="sm" onClick={refetch} className="border-[#E2E8F0] text-[#64748B] gap-1"><RefreshCw className="w-3.5 h-3.5" /> Refresh</Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-[#E2E8F0] hover:bg-transparent">
                  <TableHead className="text-[#64748B]">Model</TableHead>
                  <TableHead className="text-[#64748B]">Provider</TableHead>
                  <TableHead className="text-[#64748B]">Status</TableHead>
                  <TableHead className="text-[#64748B]">Input Cost / 1K</TableHead>
                  <TableHead className="text-[#64748B]">Output Cost / 1K</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-[#94A3B8]">No models found</TableCell></TableRow>
                ) : data.map((m) => (
                  <TableRow key={m.id} className="border-[#E2E8F0]">
                    <TableCell className="font-medium text-[#1E293B]">{m.name}</TableCell>
                    <TableCell className="text-[#64748B]">{m.provider}</TableCell>
                    <TableCell>{statusBadge(m.status)}</TableCell>
                    <TableCell className="text-[#1E293B]">${m.inputCostPer1k?.toFixed(4) ?? '—'}</TableCell>
                    <TableCell className="text-[#1E293B]">${m.outputCostPer1k?.toFixed(4) ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 5 — Monitoring
// ═══════════════════════════════════════════════════════════════════════════

interface HealthData {
  status?: string
  uptime?: string
  version?: string
  services?: { name: string; status: string; latency?: number }[]
  recentErrors?: { message: string; timestamp: string; service: string }[]
}

function MonitoringTab() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchHealth = useCallback(() => {
    setLoading(true)
    apiFetch('/api/health')
      .then((r) => { if (!r.ok) throw Error('Request failed'); return r.json() })
      .then((res) => setHealth(res.data || res))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchHealth() }, [fetchHealth])

  const services = health?.services || []
  const errors = health?.recentErrors || []
  const healthyCount = services.filter((s) => s.status?.toLowerCase() === 'healthy' || s.status?.toLowerCase() === 'active').length
  const uptimePct = health?.uptime ? parseFloat(health.uptime) : 99.9

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[#1E293B]">System Monitoring</h3>
        <Button variant="outline" size="sm" onClick={fetchHealth} className="border-[#E2E8F0] text-[#64748B] gap-1"><RefreshCw className="w-3.5 h-3.5" /> Refresh</Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-white border-[#E2E8F0]"><CardContent className="p-4 flex items-center gap-3">
          {health?.status?.toLowerCase() === 'healthy' ? <CheckCircle2 className="w-8 h-8 text-emerald-500" /> : <AlertTriangle className="w-8 h-8 text-amber-500" />}
          <div><p className="text-2xl font-bold text-[#1E293B] capitalize">{health?.status || 'Unknown'}</p><p className="text-xs text-[#94A3B8]">Overall Status</p></div>
        </CardContent></Card>
        <Card className="bg-white border-[#E2E8F0]"><CardContent className="p-4 flex items-center gap-3">
          <Activity className="w-8 h-8 text-[#003ACC]" />
          <div><p className="text-2xl font-bold text-[#1E293B]">{healthyCount}/{services.length}</p><p className="text-xs text-[#94A3B8]">Services Healthy</p></div>
        </CardContent></Card>
        <Card className="bg-white border-[#E2E8F0]"><CardContent className="p-4">
          <p className="text-sm text-[#94A3B8] mb-1">Uptime</p>
          <p className="text-2xl font-bold text-[#1E293B]">{uptimePct}%</p>
          <Progress value={uptimePct} className="mt-2 h-2" />
        </CardContent></Card>
        <Card className="bg-white border-[#E2E8F0]"><CardContent className="p-4 flex items-center gap-3">
          {errors.length > 0 ? <XCircle className="w-8 h-8 text-red-500" /> : <CheckCircle2 className="w-8 h-8 text-emerald-500" />}
          <div><p className="text-2xl font-bold text-[#1E293B]">{errors.length}</p><p className="text-xs text-[#94A3B8]">Recent Errors</p></div>
        </CardContent></Card>
      </div>

      {loading ? <TabSkeleton /> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Service health */}
          <Card className="bg-white border-[#E2E8F0]">
            <CardHeader><CardTitle className="text-[#1E293B] text-base">Services</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#E2E8F0] hover:bg-transparent">
                    <TableHead className="text-[#64748B]">Service</TableHead>
                    <TableHead className="text-[#64748B]">Status</TableHead>
                    <TableHead className="text-[#64748B]">Latency</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {services.map((s, i) => (
                    <TableRow key={i} className="border-[#E2E8F0]">
                      <TableCell className="font-medium text-[#1E293B]">{s.name}</TableCell>
                      <TableCell>{statusBadge(s.status)}</TableCell>
                      <TableCell className="text-[#94A3B8]">{s.latency ? `${s.latency}ms` : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Recent errors */}
          <Card className="bg-white border-[#E2E8F0]">
            <CardHeader><CardTitle className="text-[#1E293B] text-base">Recent Errors</CardTitle></CardHeader>
            <CardContent>
              <ScrollArea className="max-h-72">
                {errors.length === 0 ? (
                  <p className="text-center py-8 text-[#94A3B8] text-sm">No recent errors</p>
                ) : errors.map((e, i) => (
                  <div key={i} className="flex items-start gap-3 py-2 border-b border-[#F1F5F9] last:border-0">
                    <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-[#1E293B] truncate">{e.message}</p>
                      <p className="text-xs text-[#94A3B8]">{e.service} · {new Date(e.timestamp).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 6 — Billing
// ═══════════════════════════════════════════════════════════════════════════

function BillingTab() {
  const { data, loading, refetch } = useApiData<InvoiceItem>('/api/billing/invoices')
  const totalRevenue = data.filter((i) => i.status?.toLowerCase() === 'paid').reduce((sum, i) => sum + (i.amount || 0), 0)
  const pendingAmount = data.filter((i) => i.status?.toLowerCase() === 'pending').reduce((sum, i) => sum + (i.amount || 0), 0)

  return (
    <div className="space-y-4 p-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-white border-[#E2E8F0]"><CardContent className="p-4 flex items-center gap-3"><DollarSign className="w-8 h-8 text-emerald-500" /><div><p className="text-2xl font-bold text-[#1E293B]">${totalRevenue.toLocaleString()}</p><p className="text-xs text-[#94A3B8]">Total Revenue</p></div></CardContent></Card>
        <Card className="bg-white border-[#E2E8F0]"><CardContent className="p-4 flex items-center gap-3"><Clock className="w-8 h-8 text-amber-500" /><div><p className="text-2xl font-bold text-[#1E293B]">${pendingAmount.toLocaleString()}</p><p className="text-xs text-[#94A3B8]">Pending</p></div></CardContent></Card>
        <Card className="bg-white border-[#E2E8F0]"><CardContent className="p-4 flex items-center gap-3"><Receipt className="w-8 h-8 text-[#003ACC]" /><div><p className="text-2xl font-bold text-[#1E293B]">{data.length}</p><p className="text-xs text-[#94A3B8]">Total Invoices</p></div></CardContent></Card>
      </div>
      {loading ? <TabSkeleton /> : (
        <Card className="bg-white border-[#E2E8F0]">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-[#E2E8F0] hover:bg-transparent">
                  <TableHead className="text-[#64748B]">Invoice #</TableHead>
                  <TableHead className="text-[#64748B]">Company</TableHead>
                  <TableHead className="text-[#64748B]">Amount</TableHead>
                  <TableHead className="text-[#64748B]">Status</TableHead>
                  <TableHead className="text-[#64748B]">Due Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-[#94A3B8]">No invoices found</TableCell></TableRow>
                ) : data.map((inv) => (
                  <TableRow key={inv.id} className="border-[#E2E8F0]">
                    <TableCell className="font-mono text-sm font-medium text-[#1E293B]">{inv.invoiceNumber}</TableCell>
                    <TableCell className="text-[#1E293B]">{inv.company?.name || '—'}</TableCell>
                    <TableCell className="font-medium text-[#1E293B]">${inv.amount} {inv.currency}</TableCell>
                    <TableCell>{statusBadge(inv.status)}</TableCell>
                    <TableCell className="text-[#94A3B8] text-sm">{new Date(inv.dueDate).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 7 — Backups
// ═══════════════════════════════════════════════════════════════════════════

function BackupsTab() {
  const { data, loading, refetch } = useApiData<BackupItem>('/api/backups')
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    setCreating(true)
    try {
      const res = await apiFetch('/api/backups/create', { method: 'POST' })
      if (!res.ok) throw Error()
      toast.success('Backup created')
      refetch()
    } catch { toast.error('Could not create the backup') }
    finally { setCreating(false) }
  }

  const handleRestore = async (backupId: string) => {
    try {
      const res = await apiFetch('/api/backups/restore', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupId, inPlace: false }),
      })
      if (!res.ok) throw Error()
      toast.success('Restore staged. The live database was not replaced.')
      refetch()
    } catch { toast.error('Could not stage this restore') }
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[#1E293B]">Backups ({data.length})</h3>
        <Button onClick={handleCreate} disabled={creating} className="bg-[#E8501A] hover:bg-[#e55d00] text-white gap-1.5">
          {creating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create Backup
        </Button>
      </div>

      {/* Schedule card */}
      <Card className="bg-white border-[#E2E8F0]">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-[#003ACC]" />
            <div>
              <p className="text-sm font-medium text-[#1E293B]">Auto-Backup Schedule</p>
              <p className="text-xs text-[#94A3B8]">Scheduled by the deployment operator, independently of manual snapshots.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? <TabSkeleton /> : (
        <Card className="bg-white border-[#E2E8F0]">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-[#E2E8F0] hover:bg-transparent">
                  <TableHead className="text-[#64748B]">Filename</TableHead>
                  <TableHead className="text-[#64748B]">Size</TableHead>
                  <TableHead className="text-[#64748B]">Status</TableHead>
                  <TableHead className="text-[#64748B]">Created</TableHead>
                  <TableHead className="text-[#64748B]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-[#94A3B8]">No backups found</TableCell></TableRow>
                ) : data.map((b) => (
                  <TableRow key={b.id} className="border-[#E2E8F0]">
                    <TableCell className="font-medium text-[#1E293B]">{b.filename}</TableCell>
                    <TableCell className="text-[#64748B]">{typeof b.size === 'number' ? `${b.size.toFixed(2)} MB` : '—'}</TableCell>
                    <TableCell>{statusBadge(b.status)}</TableCell>
                    <TableCell className="text-[#94A3B8] text-sm">{new Date(b.createdAt).toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-[#003ACC]" onClick={() => handleRestore(b.id)}>
                          <Download className="w-3.5 h-3.5 mr-1" /> Stage restore
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 8 — Social
// ═══════════════════════════════════════════════════════════════════════════

function SocialTab() {
  const { data, loading, refetch } = useApiData<SocialAccount>('/api/social/accounts')

  const [provider, setProvider] = useState('facebook')
  const [linking, setLinking] = useState(false)
  const startLink = async () => {
    setLinking(true)
    try {
      const res = await apiFetch(`/api/social/oauth/${provider}`, { method: 'POST', credentials: 'same-origin' })
      const body = await res.json()
      if (!res.ok || !body.authorizationUrl) throw Error(body.error || 'Could not start account linking')
      window.location.assign(body.authorizationUrl)
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Account linking failed') }
    finally { setLinking(false) }
  }
  const handleDisconnect = async (platform: string) => {
    try {
      const res = await apiFetch(`/api/social/accounts?${new URLSearchParams({ platform })}`, { method: 'DELETE' })
      if (!res.ok) throw Error()
      refetch()
    } catch { toast.error('Could not disconnect this account') }
  }

  const platformIcon = (p: string) => {
    const lc = p.toLowerCase()
    if (lc.includes('twitter') || lc.includes('x')) return '𝕏'
    if (lc.includes('facebook')) return 'f'
    if (lc.includes('instagram')) return '📷'
    if (lc.includes('linkedin')) return 'in'
    if (lc.includes('youtube')) return '▶'
    return lc.charAt(0).toUpperCase()
  }

  return (
    <div className="space-y-4 p-6">
      <h3 className="text-lg font-semibold text-[#1E293B]">Connected Social Accounts ({data.length})</h3>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="social-provider">Platform</label>
        <select id="social-provider" value={provider} onChange={e => setProvider(e.target.value)}>
          {['facebook', 'instagram', 'linkedin', 'twitter', 'youtube', 'tiktok', 'pinterest', 'whatsapp'].map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <Button onClick={startLink} disabled={linking}>Connect account</Button>
      </div>
      {loading ? <TabSkeleton /> : (
        <Card className="bg-white border-[#E2E8F0]">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-[#E2E8F0] hover:bg-transparent">
                  <TableHead className="text-[#64748B]">Platform</TableHead>
                  <TableHead className="text-[#64748B]">Username</TableHead>
                  <TableHead className="text-[#64748B]">Status</TableHead>
                  <TableHead className="text-[#64748B]">Connected</TableHead>
                  <TableHead className="text-[#64748B]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-[#94A3B8]">No social accounts connected</TableCell></TableRow>
                ) : data.map((a) => (
                  <TableRow key={a.platform} className="border-[#E2E8F0]">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="w-8 h-8 rounded-lg bg-[#003ACC]/10 text-[#003ACC] flex items-center justify-center text-xs font-bold">{platformIcon(a.platform)}</span>
                        <span className="font-medium text-[#1E293B]">{a.platform}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-[#1E293B]">{a.platformUsername ? `@${a.platformUsername}` : '—'}</TableCell>
                    <TableCell>{statusBadge(a.isActive ? 'active' : 'inactive')}</TableCell>
                    <TableCell className="text-[#94A3B8] text-sm">{a.connectedAt ? new Date(a.connectedAt).toLocaleDateString() : '—'}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500 hover:text-red-700" onClick={() => handleDisconnect(a.platform)}>
                        <XCircle className="w-3.5 h-3.5 mr-1" /> Disconnect
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 9 — Email
// ═══════════════════════════════════════════════════════════════════════════

function EmailTab() {
  const { data, loading, refetch } = useApiData<EmailAccount>('/api/email/accounts')

  return (
    <div className="space-y-4 p-6">
      <h3 className="text-lg font-semibold text-[#1E293B]">Email Accounts ({data.length})</h3>
      {loading ? <TabSkeleton /> : (
        <Card className="bg-white border-[#E2E8F0]">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-[#E2E8F0] hover:bg-transparent">
                  <TableHead className="text-[#64748B]">Email</TableHead>
                  <TableHead className="text-[#64748B]">Provider</TableHead>
                  <TableHead className="text-[#64748B]">Sync Status</TableHead>
                  <TableHead className="text-[#64748B]">Last Synced</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-[#94A3B8]">No email accounts found</TableCell></TableRow>
                ) : data.map((e) => (
                  <TableRow key={e.id} className="border-[#E2E8F0]">
                    <TableCell className="font-medium text-[#1E293B]">{e.email}</TableCell>
                    <TableCell className="text-[#64748B]">{e.provider}</TableCell>
                    <TableCell>{statusBadge(e.syncStatus)}</TableCell>
                    <TableCell className="text-[#94A3B8] text-sm">{e.lastSynced ? new Date(e.lastSynced).toLocaleString() : 'Never'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Recent emails */}
      <Card className="bg-white border-[#E2E8F0]">
        <CardHeader><CardTitle className="text-[#1E293B] text-base">Recent Emails</CardTitle></CardHeader>
        <CardContent>
          <RecentEmailsList />
        </CardContent>
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 10 — Workers
// ═══════════════════════════════════════════════════════════════════════════

function WorkersTab() {
  const { data, loading, refetch } = useApiData<WorkerItem>('/api/workers')

  const runningCount = data.filter((w) => w.status === 'idle' || w.status === 'busy').length
  const totalFailed = data.reduce((sum, w) => sum + (w.totalFailed || 0), 0)
  const totalQueue = data.reduce((sum, w) => sum + (w.activeJobs || 0), 0)

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[#1E293B]">Worker Processes</h3>
        <Button variant="outline" size="sm" onClick={refetch} className="border-[#E2E8F0] text-[#64748B] gap-1"><RefreshCw className="w-3.5 h-3.5" /> Refresh</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-white border-[#E2E8F0]"><CardContent className="p-4 flex items-center gap-3"><Cpu className="w-8 h-8 text-emerald-500" /><div><p className="text-2xl font-bold text-[#1E293B]">{runningCount}/{data.length}</p><p className="text-xs text-[#94A3B8]">Running</p></div></CardContent></Card>
        <Card className="bg-white border-[#E2E8F0]"><CardContent className="p-4 flex items-center gap-3"><Layers className="w-8 h-8 text-[#003ACC]" /><div><p className="text-2xl font-bold text-[#1E293B]">{totalQueue}</p><p className="text-xs text-[#94A3B8]">Active Jobs</p></div></CardContent></Card>
        <Card className="bg-white border-[#E2E8F0]"><CardContent className="p-4 flex items-center gap-3"><XCircle className="w-8 h-8 text-red-500" /><div><p className="text-2xl font-bold text-[#1E293B]">{totalFailed}</p><p className="text-xs text-[#94A3B8]">Failed Jobs</p></div></CardContent></Card>
      </div>

      {loading ? <TabSkeleton /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.length === 0 ? (
            <Card className="bg-white border-[#E2E8F0] col-span-full"><CardContent className="p-8 text-center text-[#94A3B8]">No workers found</CardContent></Card>
          ) : data.map((w) => (
            <Card key={w.id} className="bg-white border-[#E2E8F0]">
              <CardHeader className="pb-3 flex-row items-center justify-between">
                <CardTitle className="text-[#1E293B] text-sm font-semibold">{w.name}</CardTitle>
                {statusBadge(w.status)}
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-[#94A3B8]">Active Jobs</span><span className="text-[#1E293B] font-medium">{w.activeJobs ?? 0}</span></div>
                <div className="flex justify-between"><span className="text-[#94A3B8]">Failed Jobs</span><span className="text-[#1E293B] font-medium">{w.totalFailed ?? 0}</span></div>
                <div className="flex justify-between"><span className="text-[#94A3B8]">Last Heartbeat</span><span className="text-[#1E293B]">{w.lastHeartbeatAt ? new Date(w.lastHeartbeatAt).toLocaleString() : '—'}</span></div>
                <p className="text-xs text-[#64748B]">Process restarts are managed by the host supervisor.</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 11 — Settings
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// TAB 12 — Deploy
// ═══════════════════════════════════════════════════════════════════════════

interface DeploymentRow { id: string; domain: string; status: string; sslStatus: string; updatedAt: string }
function DeployTab() {
  const {data, loading, error, refetch} = useApiData<DeploymentRow>('/api/deploy')
  return <div className="space-y-4 p-6"><div className="flex justify-between"><h3 className="text-lg font-semibold">Deployment records</h3><Button variant="outline" onClick={refetch}>Refresh</Button></div>
    <p className="text-sm text-slate-600">Deployments require the reviewed operations workflow. This read-only view shows registry records, not a live TLS or health probe.</p>
    {loading ? <TabSkeleton /> : error ? <p role="alert">{error}</p> : !data.length ? <p>No deployment records.</p> : <Table><TableHeader><TableRow>{['Domain', 'Status', 'TLS record', 'Updated'].map(h => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{data.map(r => <TableRow key={r.id}><TableCell>{r.domain}</TableCell><TableCell>{r.status}</TableCell><TableCell>{r.sslStatus}</TableCell><TableCell>{new Date(r.updatedAt).toLocaleString()}</TableCell></TableRow>)}</TableBody></Table>}
  </div>
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Panel Component
// ═══════════════════════════════════════════════════════════════════════════

export default function SuperAdminPanel() {
  const [activeTab, setActiveTab] = useState('users')

  return (
    <div className="h-full flex flex-col bg-[#F8FAFC]">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex-shrink-0">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-lg bg-[#003ACC]/10 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-[#003ACC]" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#1E293B]">Super Admin</h2>
            <p className="text-xs text-[#94A3B8]">Complete platform management &amp; oversight</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 flex-shrink-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-white border border-[#E2E8F0] rounded-xl p-1 h-auto flex-wrap gap-1">
            {TABS.map((tab) => {
              const Icon = tab.icon
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg data-[state=active]:bg-[#003ACC] data-[state=active]:text-white text-[#64748B] data-[state=inactive]:hover:text-[#1E293B] data-[state=inactive]:hover:bg-[#F1F5F9] transition-all"
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </TabsTrigger>
              )
            })}
          </TabsList>

          {/* Tab content */}
          <div className="mt-4 flex-1 overflow-y-auto pb-6">
            <TabsContent value="users" className="m-0"><UsersTab /></TabsContent>
            <TabsContent value="companies" className="m-0"><CompaniesTab /></TabsContent>
            <TabsContent value="subscriptions" className="m-0"><SubscriptionsTab /></TabsContent>
            <TabsContent value="ai" className="m-0"><AiTab /></TabsContent>
            <TabsContent value="monitoring" className="m-0"><MonitoringTab /></TabsContent>
            <TabsContent value="billing" className="m-0"><BillingTab /></TabsContent>
            <TabsContent value="backups" className="m-0"><BackupsTab /></TabsContent>
            <TabsContent value="social" className="m-0"><SocialTab /></TabsContent>
            <TabsContent value="email" className="m-0"><EmailTab /></TabsContent>
            <TabsContent value="workers" className="m-0"><WorkersTab /></TabsContent>
            <TabsContent value="settings" className="m-0"><SettingsPanel /></TabsContent>
            <TabsContent value="deploy" className="m-0"><DeployTab /></TabsContent>
            <TabsContent value="coverage" className="m-0"><LinkCoveragePanel /></TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Recent Emails List (fetched from API)
// ═══════════════════════════════════════════════════════════════════════════

function RecentEmailsList() {
  const [emails, setEmails] = useState<{ subject: string; from: string; createdAt: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchEmails() {
      try {
        const res = await apiFetch('/api/email/inbox?limit=5')
        if (res.ok) {
          const json = await res.json()
          if (Array.isArray(json.emails || json.data)) {
            setEmails((json.emails || json.data).slice(0, 5))
          }
        }
      } catch {
        // API not available — show empty state
      } finally {
        setLoading(false)
      }
    }
    fetchEmails()
  }, [])

  if (loading) {
    return <Skeleton className="h-40 w-full" />
  }

  if (emails.length === 0) {
    return <p className="text-sm text-[#94A3B8] text-center py-6">No recent emails</p>
  }

  return (
    <ScrollArea className="max-h-64">
      <div className="space-y-2">
        {emails.map((email, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-lg hover:bg-[#F8FAFC] transition-colors">
            <Mail className="w-4 h-4 text-[#94A3B8] flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[#1E293B] truncate">{email.subject || '(No subject)'}</p>
              <p className="text-xs text-[#94A3B8]">{email.from} · {email.createdAt ? new Date(email.createdAt).toLocaleString() : ''}</p>
            </div>
            <Eye className="w-4 h-4 text-[#94A3B8] flex-shrink-0" />
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}