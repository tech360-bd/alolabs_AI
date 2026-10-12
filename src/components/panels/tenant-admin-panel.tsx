'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Building2,
  RefreshCw,
  Save,
  Plus,
  Trash2,
  Users,
  Palette,
  Gauge,
  Star,
  Settings,
  Mail,
  Clock,
  Shield,
  Zap,
  Edit3,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'

// ─── Types ───────────────────────────────────────────────────────────────────

interface CompanyWithSub {
  id: string
  name: string
  slug: string
  status: string
  subscription?: {
    status: string
    planName: string
  } | null
}

interface TenantConfig {
  id: string
  companyId: string
  logoUrl: string | null
  primaryColor: string
  customDomain: string | null
  emailFrom: string | null
  supportEmail: string | null
  locale: string
  timezone: string
  notificationsEnabled: boolean
  webhookTimeoutMs: number
  maxConcurrentJobs: number
  config: string
}

interface QuotaData {
  companyId: string
  companyName: string
  monthlyUsage: { limit: number; current: number; remaining: number; usagePercent: string }
  subscriptionLimits: { agentLimit: number; skillLimit: number; workflowLimit: number; monthlyTokens: number; monthlyRequests: number }
  currentCounts: { agents: number; skills: number; workflows: number }
  subscriptionRemaining: { agents: number; skills: number; workflows: number }
  tokenBudget: {
    monthlyBudget: number
    monthlyUsed: number
    dailyBudget: number
    dailyUsed: number
    warningThreshold: number
    blockThreshold: number
    monthlyUsagePercent: string
    dailyUsagePercent: string
    isWarning: boolean
    isBlocked: boolean
  }
  subscription: { status: string; planName: string; currentPeriodEnd: string } | null
}

interface TenantUser {
  id: string
  userId: string
  tenantRole: string
  joinedAt: string
  user: { id: string; name: string; email: string; role: string; isActive: boolean; lastLoginAt: string | null } | null
}

interface QualityAssessment {
  id: string
  agentName: string
  score: number
  category: string
  assessedAt: string
  notes?: string
}

// ─── Quota Display Config ────────────────────────────────────────────────────

const QUOTA_ICONS: Record<string, React.ElementType> = {
  agents: Users,
  skills: Star,
  workflows: Settings,
  requests: Zap,
  tokens: Gauge,
}

const QUOTA_LABELS: Record<string, string> = {
  agents: 'Agents',
  skills: 'Skills',
  workflows: 'Workflows',
  requests: 'API Requests (Monthly)',
  tokens: 'Tokens (Monthly)',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function quotaBarColor(pct: number): string {
  if (pct > 100) return 'bg-red-500'
  if (pct >= 80) return 'bg-amber-500'
  return 'bg-[#003ABC]'
}

function scoreColor(score: number): string {
  if (score >= 90) return 'text-green-600'
  if (score >= 70) return 'text-amber-600'
  return 'text-red-600'
}

function scoreBadgeBg(score: number): string {
  if (score >= 90) return 'bg-green-100 text-green-700 border-green-200'
  if (score >= 70) return 'bg-amber-100 text-amber-700 border-amber-200'
  return 'bg-red-100 text-red-700 border-red-200'
}

function roleBadgeColor(role: string): string {
  switch (role) {
    case 'admin': return 'bg-[#003ABC]/10 text-[#003ABC] border-[#003ABC]/20'
    case 'manager': return 'bg-purple-100 text-purple-700 border-purple-200'
    case 'operator': return 'bg-green-100 text-green-700 border-green-200'
    case 'viewer': return 'bg-gray-100 text-gray-600 border-gray-200'
    default: return 'bg-gray-100 text-gray-600 border-gray-200'
  }
}

function subStatusBadge(status: string): string {
  switch (status) {
    case 'active': return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    case 'trial': return 'bg-sky-100 text-sky-700 border-sky-200'
    case 'past_due': return 'bg-amber-100 text-amber-700 border-amber-200'
    case 'paused': return 'bg-violet-100 text-violet-700 border-violet-200'
    case 'cancelled': return 'bg-slate-100 text-slate-500 border-slate-200'
    default: return 'bg-slate-100 text-slate-500 border-slate-200'
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TenantAdminPanel() {
  const [companies, setCompanies] = useState<CompanyWithSub[]>([])
  const [selectedCompany, setSelectedCompany] = useState('')
  const [loading, setLoading] = useState(true)

  // Config state
  const [config, setConfig] = useState<TenantConfig | null>(null)
  const [configForm, setConfigForm] = useState({
    logoUrl: '',
    primaryColor: '',
    customDomain: '',
    emailFrom: '',
    supportEmail: '',
    locale: 'en',
    timezone: 'UTC',
    notificationsEnabled: true,
    webhookTimeoutMs: '30000',
    maxConcurrentJobs: '5',
  })
  const [configSaving, setConfigSaving] = useState(false)

  // Quotas state
  const [quotaData, setQuotaData] = useState<QuotaData | null>(null)
  const [editQuotaOpen, setEditQuotaOpen] = useState(false)
  const [quotaForm, setQuotaForm] = useState({
    monthlyUsageLimit: '10000',
  })
  const [quotaSaving, setQuotaSaving] = useState(false)

  // Users state
  const [users, setUsers] = useState<TenantUser[]>([])
  const [addUserDialogOpen, setAddUserDialogOpen] = useState(false)
  const [allUsers, setAllUsers] = useState<{ id: string; name: string; email: string }[]>([])
  const [addUserForm, setAddUserForm] = useState({ userId: '', role: 'viewer' })

  // Quality state
  const [qualityAssessments, setQualityAssessments] = useState<QualityAssessment[]>([])

  const loadCompanies = useCallback(() => {
    Promise.all([
      fetch('/api/companies').then((r) => r.json()).catch(() => ({ data: [] })),
      fetch('/api/billing/subscriptions').then((r) => r.json()).catch(() => ({ data: [] })),
    ])
      .then(([compRes, subRes]) => {
        const compData = (compRes.data || []) as { id: string; name: string; slug: string; status: string }[]
        const subData = (subRes.data || []) as { companyId: string; status: string; plan: { name: string } }[]

        const subMap = new Map(subData.map((s) => [s.companyId, s]))
        const enriched = compData.map((c) => ({
          ...c,
          subscription: subMap.get(c.id)
            ? { status: subMap.get(c.id)!.status, planName: subMap.get(c.id)!.plan.name }
            : null,
        }))
        setCompanies(enriched)
        if (enriched.length > 0 && !selectedCompany) {
          setSelectedCompany(enriched[0].id)
        }
      })
      .catch(() => {})
  }, [selectedCompany])

  const loadTenantData = useCallback(() => {
    if (!selectedCompany) return
    setLoading(true)

    Promise.all([
      fetch(`/api/tenant-admin/config?companyId=${selectedCompany}`).then((r) => r.json()).catch(() => ({ config: null })),
      fetch(`/api/tenant-admin/quotas?companyId=${selectedCompany}`).then((r) => r.json()).catch(() => ({})),
      fetch(`/api/tenant-admin/users?companyId=${selectedCompany}`).then((r) => r.json()).catch(() => ({ users: [] })),
      fetch(`/api/quality?companyId=${selectedCompany}`).then((r) => r.json()).catch(() => ({ data: [] })),
    ])
      .then(([configRes, quotaRes, usersRes, qualityRes]) => {
        // Config
        const cfg = configRes.config || configRes.data || configRes
        if (cfg && cfg.id) {
          setConfig(cfg)
          setConfigForm({
            logoUrl: cfg.logoUrl || '',
            primaryColor: cfg.primaryColor || '#003ABC',
            customDomain: cfg.customDomain || '',
            emailFrom: cfg.emailFrom || '',
            supportEmail: cfg.supportEmail || '',
            locale: cfg.locale || 'en',
            timezone: cfg.timezone || 'UTC',
            notificationsEnabled: cfg.notificationsEnabled !== false,
            webhookTimeoutMs: String(cfg.webhookTimeoutMs || 30000),
            maxConcurrentJobs: String(cfg.maxConcurrentJobs || 5),
          })
        }

        // Quotas - the API returns a flat object, not an array
        if (quotaRes && quotaRes.companyId) {
          setQuotaData(quotaRes as QuotaData)
          setQuotaForm({
            monthlyUsageLimit: String(quotaRes.monthlyUsage?.limit || 10000),
          })
        }

        // Users
        const usersData = Array.isArray(usersRes.users)
          ? usersRes.users
          : Array.isArray(usersRes.data)
            ? usersRes.data
            : Array.isArray(usersRes)
              ? usersRes
              : []
        setUsers(usersData)

        // Quality
        const qualityData = Array.isArray(qualityRes.data)
          ? qualityRes.data
          : Array.isArray(qualityRes)
            ? qualityRes
            : []
        setQualityAssessments(qualityData)
      })
      .finally(() => setLoading(false))
  }, [selectedCompany])

  useEffect(() => {
    loadCompanies()
  }, [loadCompanies])

  useEffect(() => {
    if (selectedCompany) {
      loadTenantData()
    }
  }, [selectedCompany, loadTenantData])

  // Load all users for the add-user dialog
  const loadAllUsers = async () => {
    try {
      const res = await fetch('/api/users')
      const data = await res.json()
      const userList = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : []
      setAllUsers(userList.map((u: { id: string; name: string; email: string }) => ({ id: u.id, name: u.name, email: u.email })))
    } catch {
      // ignore
    }
  }

  const handleSaveConfig = async () => {
    if (!selectedCompany) return
    setConfigSaving(true)
    try {
      await fetch(`/api/tenant-admin/config?companyId=${selectedCompany}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompany,
          ...configForm,
          webhookTimeoutMs: parseInt(configForm.webhookTimeoutMs) || 30000,
          maxConcurrentJobs: parseInt(configForm.maxConcurrentJobs) || 5,
        }),
      })
      loadTenantData()
    } catch {
      // ignore
    } finally {
      setConfigSaving(false)
    }
  }

  const handleSaveQuota = async () => {
    if (!selectedCompany) return
    setQuotaSaving(true)
    try {
      await fetch(`/api/companies/${selectedCompany}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthlyUsageLimit: parseInt(quotaForm.monthlyUsageLimit) || 10000,
        }),
      })
      setEditQuotaOpen(false)
      loadTenantData()
    } catch {
      // ignore
    } finally {
      setQuotaSaving(false)
    }
  }

  const handleOpenAddUser = async () => {
    await loadAllUsers()
    setAddUserDialogOpen(true)
  }

  const handleAddUser = async () => {
    if (!selectedCompany || !addUserForm.userId) return
    try {
      await fetch(`/api/tenant-admin/users?companyId=${selectedCompany}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompany,
          userId: addUserForm.userId,
          role: addUserForm.role,
        }),
      })
      setAddUserDialogOpen(false)
      setAddUserForm({ userId: '', role: 'viewer' })
      loadTenantData()
    } catch {
      // ignore
    }
  }

  const handleRemoveUser = async (userId: string) => {
    if (!selectedCompany) return
    try {
      await fetch(`/api/tenant-admin/users/${userId}?companyId=${selectedCompany}`, {
        method: 'DELETE',
      })
      loadTenantData()
    } catch {
      // ignore
    }
  }

  const selectedCompanyData = companies.find((c) => c.id === selectedCompany)

  // Build quota items from the API response
  const quotaItems = quotaData
    ? [
        { resource: 'agents', used: quotaData.currentCounts.agents, limit: quotaData.subscriptionLimits.agentLimit },
        { resource: 'skills', used: quotaData.currentCounts.skills, limit: quotaData.subscriptionLimits.skillLimit },
        { resource: 'workflows', used: quotaData.currentCounts.workflows, limit: quotaData.subscriptionLimits.workflowLimit },
        { resource: 'requests', used: quotaData.monthlyUsage.current, limit: quotaData.monthlyUsage.limit },
        { resource: 'tokens', used: quotaData.tokenBudget.monthlyUsed, limit: quotaData.tokenBudget.monthlyBudget },
      ]
    : []

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#003ABC]/10 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-[#003ABC]" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#1E293B]">Tenant Administration</h2>
            <p className="text-xs text-[#94A3B8]">Manage company configuration, quotas, and users</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedCompany} onValueChange={setSelectedCompany}>
            <SelectTrigger className="w-[220px] border-[#E2E8F0] text-[#1E293B] text-xs rounded-lg">
              <SelectValue placeholder="Select Company" />
            </SelectTrigger>
            <SelectContent className="bg-white border-[#E2E8F0]">
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <div className="flex items-center gap-2">
                    {c.name}
                    {c.subscription && (
                      <span className={`text-[9px] px-1.5 py-0 rounded-full border ${subStatusBadge(c.subscription.status)}`}>
                        {c.subscription.planName}
                      </span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={loadTenantData} variant="outline" className="rounded-lg border-[#E2E8F0] text-[#1E293B] hover:bg-[#F8FAFC]">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Company info bar */}
      {selectedCompanyData && (
        <div className="flex items-center gap-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3">
          <div className="w-8 h-8 rounded-lg bg-[#003ABC]/10 flex items-center justify-center">
            <Building2 className="w-4 h-4 text-[#003ABC]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#1E293B] truncate">{selectedCompanyData.name}</p>
            <p className="text-xs text-[#94A3B8]">{selectedCompanyData.slug}</p>
          </div>
          <Badge variant="secondary" className={`text-[10px] py-0 border ${subStatusBadge(selectedCompanyData.status)}`}>
            {selectedCompanyData.status}
          </Badge>
          {selectedCompanyData.subscription && (
            <Badge variant="secondary" className={`text-[10px] py-0 border ${subStatusBadge(selectedCompanyData.subscription.status)}`}>
              {selectedCompanyData.subscription.planName}
            </Badge>
          )}
        </div>
      )}

      {!selectedCompany ? (
        <Card className="bg-white border-[#E2E8F0] rounded-xl p-12 text-center shadow-sm">
          <Building2 className="w-10 h-10 text-[#94A3B8] mx-auto mb-3" />
          <p className="text-[#64748B] text-sm">Select a company to manage</p>
          <p className="text-[#94A3B8] text-xs mt-1">Choose a company from the dropdown above</p>
        </Card>
      ) : loading ? (
        <div className="space-y-6">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : (
        <Tabs defaultValue="config" className="space-y-4">
          <TabsList className="bg-[#F1F5F9] rounded-lg">
            <TabsTrigger value="config" className="rounded-md data-[state=active]:bg-white data-[state=active]:text-[#003ABC] data-[state=active]:shadow-sm text-[#64748B] text-xs">
              <Palette className="w-3.5 h-3.5 mr-1.5" />
              Configuration
            </TabsTrigger>
            <TabsTrigger value="quotas" className="rounded-md data-[state=active]:bg-white data-[state=active]:text-[#003ABC] data-[state=active]:shadow-sm text-[#64748B] text-xs">
              <Gauge className="w-3.5 h-3.5 mr-1.5" />
              Quotas & Limits
            </TabsTrigger>
            <TabsTrigger value="users" className="rounded-md data-[state=active]:bg-white data-[state=active]:text-[#003ABC] data-[state=active]:shadow-sm text-[#64748B] text-xs">
              <Users className="w-3.5 h-3.5 mr-1.5" />
              Users
            </TabsTrigger>
            <TabsTrigger value="quality" className="rounded-md data-[state=active]:bg-white data-[state=active]:text-[#003ABC] data-[state=active]:shadow-sm text-[#64748B] text-xs">
              <Star className="w-3.5 h-3.5 mr-1.5" />
              Quality
            </TabsTrigger>
          </TabsList>

          {/* ─── Config Tab ─── */}
          <TabsContent value="config">
            <Card className="bg-white border-[#E2E8F0] rounded-xl shadow-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-semibold text-[#1E293B]">Tenant Configuration</CardTitle>
                    <p className="text-xs text-[#94A3B8] mt-0.5">{selectedCompanyData?.name} settings</p>
                  </div>
                  <Badge variant="secondary" className="text-[10px] bg-[#F8FAFC] text-[#64748B]">
                    {config ? 'Configured' : 'Not configured'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Branding Section */}
                  <div className="md:col-span-2">
                    <div className="flex items-center gap-2 mb-3">
                      <Palette className="w-4 h-4 text-[#003ABC]" />
                      <span className="text-xs font-semibold text-[#003ABC] uppercase tracking-wider">Branding</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-[#1E293B] text-sm">Logo URL</Label>
                        <Input
                          placeholder="https://your-domain.com/logo.png"
                          value={configForm.logoUrl}
                          onChange={(e) => setConfigForm((f) => ({ ...f, logoUrl: e.target.value }))}
                          className="border-[#E2E8F0] text-[#1E293B]"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[#1E293B] text-sm">Primary Color</Label>
                        <div className="flex items-center gap-2">
                          {configForm.primaryColor && (
                            <div className="w-8 h-8 rounded-lg border border-[#E2E8F0] shrink-0" style={{ backgroundColor: configForm.primaryColor }} />
                          )}
                          <Input
                            placeholder="#003ABC"
                            value={configForm.primaryColor}
                            onChange={(e) => setConfigForm((f) => ({ ...f, primaryColor: e.target.value }))}
                            className="border-[#E2E8F0] text-[#1E293B] flex-1"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator className="md:col-span-2" />

                  {/* Domain & Email Section */}
                  <div className="md:col-span-2">
                    <div className="flex items-center gap-2 mb-3">
                      <Mail className="w-4 h-4 text-[#FF6A00]" />
                      <span className="text-xs font-semibold text-[#FF6A00] uppercase tracking-wider">Domain & Email</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-[#1E293B] text-sm">Custom Domain</Label>
                        <Input
                          placeholder="app.company.com"
                          value={configForm.customDomain}
                          onChange={(e) => setConfigForm((f) => ({ ...f, customDomain: e.target.value }))}
                          className="border-[#E2E8F0] text-[#1E293B]"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[#1E293B] text-sm">Email From</Label>
                        <Input
                          placeholder="noreply@company.com"
                          value={configForm.emailFrom}
                          onChange={(e) => setConfigForm((f) => ({ ...f, emailFrom: e.target.value }))}
                          className="border-[#E2E8F0] text-[#1E293B]"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[#1E293B] text-sm">Support Email</Label>
                        <Input
                          type="email"
                          placeholder="support@company.com"
                          value={configForm.supportEmail}
                          onChange={(e) => setConfigForm((f) => ({ ...f, supportEmail: e.target.value }))}
                          className="border-[#E2E8F0] text-[#1E293B]"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[#1E293B] text-sm">Locale</Label>
                        <Select value={configForm.locale} onValueChange={(v) => setConfigForm((f) => ({ ...f, locale: v }))}>
                          <SelectTrigger className="border-[#E2E8F0] text-[#1E293B]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-white border-[#E2E8F0]">
                            <SelectItem value="en">English</SelectItem>
                            <SelectItem value="es">Spanish</SelectItem>
                            <SelectItem value="fr">French</SelectItem>
                            <SelectItem value="de">German</SelectItem>
                            <SelectItem value="bn">Bangla</SelectItem>
                            <SelectItem value="zh">Chinese</SelectItem>
                            <SelectItem value="ja">Japanese</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <Separator className="md:col-span-2" />

                  {/* Regional & Notifications Section */}
                  <div className="md:col-span-2">
                    <div className="flex items-center gap-2 mb-3">
                      <Clock className="w-4 h-4 text-[#003ABC]" />
                      <span className="text-xs font-semibold text-[#003ABC] uppercase tracking-wider">Regional & Notifications</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-[#1E293B] text-sm">Timezone</Label>
                        <Select value={configForm.timezone} onValueChange={(v) => setConfigForm((f) => ({ ...f, timezone: v }))}>
                          <SelectTrigger className="border-[#E2E8F0] text-[#1E293B]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-white border-[#E2E8F0] max-h-64">
                            {['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Dhaka', 'Australia/Sydney'].map((tz) => (
                              <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[#1E293B] text-sm">Notifications</Label>
                        <div className="flex items-center gap-3 h-9">
                          <Switch
                            checked={configForm.notificationsEnabled}
                            onCheckedChange={(v) => setConfigForm((f) => ({ ...f, notificationsEnabled: v }))}
                          />
                          <span className="text-sm text-[#64748B]">
                            {configForm.notificationsEnabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator className="md:col-span-2" />

                  {/* Advanced Section */}
                  <div className="md:col-span-2">
                    <div className="flex items-center gap-2 mb-3">
                      <Shield className="w-4 h-4 text-[#FF6A00]" />
                      <span className="text-xs font-semibold text-[#FF6A00] uppercase tracking-wider">Advanced</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-[#1E293B] text-sm">Webhook Timeout (ms)</Label>
                        <Input
                          type="number"
                          min={1000}
                          max={120000}
                          value={configForm.webhookTimeoutMs}
                          onChange={(e) => setConfigForm((f) => ({ ...f, webhookTimeoutMs: e.target.value }))}
                          className="border-[#E2E8F0] text-[#1E293B]"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[#1E293B] text-sm">Max Concurrent Jobs</Label>
                        <Input
                          type="number"
                          min={1}
                          max={100}
                          value={configForm.maxConcurrentJobs}
                          onChange={(e) => setConfigForm((f) => ({ ...f, maxConcurrentJobs: e.target.value }))}
                          className="border-[#E2E8F0] text-[#1E293B]"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-6 flex justify-end">
                  <Button onClick={handleSaveConfig} disabled={configSaving} className="rounded-lg bg-[#003ABC] hover:bg-[#003ABC]/90 text-white">
                    <Save className="w-4 h-4 mr-2" />
                    {configSaving ? 'Saving...' : 'Save Configuration'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── Quotas & Limits Tab ─── */}
          <TabsContent value="quotas">
            <div className="space-y-4">
              {/* Subscription Info */}
              {quotaData?.subscription && (
                <Card className="bg-white border-[#E2E8F0] rounded-xl shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-[#003ABC]" />
                        <CardTitle className="text-sm font-semibold text-[#1E293B]">Subscription</CardTitle>
                      </div>
                      <Badge variant="secondary" className={`text-[10px] py-0 border ${subStatusBadge(quotaData.subscription.status)}`}>
                        {quotaData.subscription.status.replace('_', ' ')}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-[#94A3B8]">Plan</p>
                        <p className="text-sm font-semibold text-[#1E293B]">{quotaData.subscription.planName}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[#94A3B8]">Period End</p>
                        <p className="text-sm font-medium text-[#1E293B]">{new Date(quotaData.subscription.currentPeriodEnd).toLocaleDateString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[#94A3B8]">Monthly Requests</p>
                        <p className="text-sm font-medium text-[#1E293B]">{quotaData.monthlyUsage.current.toLocaleString()} / {quotaData.monthlyUsage.limit.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[#94A3B8]">Usage</p>
                        <p className="text-sm font-medium text-[#1E293B]">{quotaData.monthlyUsage.usagePercent}%</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Token Budget Status */}
              {quotaData && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="bg-white border-[#E2E8F0] rounded-xl shadow-sm">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Gauge className="w-4 h-4 text-[#003ABC]" />
                          <CardTitle className="text-sm font-semibold text-[#1E293B]">Monthly Token Budget</CardTitle>
                        </div>
                        <Badge
                          variant="secondary"
                          className={`text-[10px] py-0 border ${
                            quotaData.tokenBudget.isBlocked ? 'bg-red-100 text-red-700 border-red-200'
                              : quotaData.tokenBudget.isWarning ? 'bg-amber-100 text-amber-700 border-amber-200'
                                : 'bg-green-100 text-green-700 border-green-200'
                          }`}
                        >
                          {quotaData.tokenBudget.monthlyUsagePercent}%
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-end justify-between mb-2">
                        <p className="text-lg font-bold text-[#1E293B]">
                          {quotaData.tokenBudget.monthlyUsed.toLocaleString()}
                          <span className="text-sm font-normal text-[#94A3B8] ml-1">/ {quotaData.tokenBudget.monthlyBudget.toLocaleString()}</span>
                        </p>
                      </div>
                      <Progress
                        value={Math.min(parseFloat(quotaData.tokenBudget.monthlyUsagePercent), 100)}
                        className="h-2.5"
                      />
                      <p className="text-[10px] text-[#94A3B8] mt-1.5">
                        Warning at {Math.round(quotaData.tokenBudget.warningThreshold * 100)}% · Block at {Math.round(quotaData.tokenBudget.blockThreshold * 100)}%
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="bg-white border-[#E2E8F0] rounded-xl shadow-sm">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-[#FF6A00]" />
                        <CardTitle className="text-sm font-semibold text-[#1E293B]">Daily Token Budget</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-end justify-between mb-2">
                        <p className="text-lg font-bold text-[#1E293B]">
                          {quotaData.tokenBudget.dailyUsed.toLocaleString()}
                          <span className="text-sm font-normal text-[#94A3B8] ml-1">/ {quotaData.tokenBudget.dailyBudget.toLocaleString()}</span>
                        </p>
                      </div>
                      <Progress
                        value={Math.min(parseFloat(quotaData.tokenBudget.dailyUsagePercent), 100)}
                        className="h-2.5"
                      />
                      <p className="text-[10px] text-[#94A3B8] mt-1.5">Resets at midnight UTC</p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Resource Quotas */}
              <Card className="bg-white border-[#E2E8F0] rounded-xl shadow-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-semibold text-[#1E293B]">Resource Limits</CardTitle>
                      <p className="text-xs text-[#94A3B8]">Subscription-based resource limits</p>
                    </div>
                    <Dialog open={editQuotaOpen} onOpenChange={setEditQuotaOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" className="rounded-lg border-[#E2E8F0] text-[#1E293B] hover:bg-[#F8FAFC] h-8 text-xs">
                          <Edit3 className="w-3.5 h-3.5 mr-1.5" />
                          Edit Limits
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="bg-white border-[#E2E8F0] sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle className="text-[#1E293B]">Edit Quota Limits</DialogTitle>
                          <DialogDescription>Adjust monthly usage limit for {selectedCompanyData?.name}</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-2">
                          <div className="space-y-2">
                            <Label className="text-[#1E293B] text-sm">Monthly Usage Limit</Label>
                            <Input
                              type="number"
                              min={100}
                              value={quotaForm.monthlyUsageLimit}
                              onChange={(e) => setQuotaForm((f) => ({ ...f, monthlyUsageLimit: e.target.value }))}
                              className="border-[#E2E8F0] text-[#1E293B]"
                            />
                            <p className="text-[10px] text-[#94A3B8]">Total API requests allowed per month</p>
                          </div>
                        </div>
                        <DialogFooter>
                          <DialogClose asChild>
                            <Button variant="outline" className="rounded-lg border-[#E2E8F0] text-[#1E293B]">Cancel</Button>
                          </DialogClose>
                          <Button onClick={handleSaveQuota} disabled={quotaSaving} className="rounded-lg bg-[#003ABC] hover:bg-[#003ABC]/90 text-white">
                            {quotaSaving ? 'Saving...' : 'Save Limits'}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {quotaItems.length === 0 ? (
                    <div className="py-10 text-center">
                      <Gauge className="w-10 h-10 text-[#94A3B8] mx-auto mb-3" />
                      <p className="text-[#64748B] text-sm">No quota data available</p>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {quotaItems.map((q) => {
                        const Icon = QUOTA_ICONS[q.resource] || Gauge
                        const label = QUOTA_LABELS[q.resource] || q.resource
                        const pct = q.limit > 0 && q.limit !== -1 ? (q.used / q.limit) * 100 : 0
                        const displayLimit = q.limit === -1 ? 'Unlimited' : q.limit.toLocaleString()
                        return (
                          <div key={q.resource} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Icon className="w-4 h-4 text-[#64748B]" />
                                <span className="text-sm font-medium text-[#1E293B]">{label}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-[#64748B]">
                                  <span className="font-semibold text-[#1E293B]">{q.used.toLocaleString()}</span> / {displayLimit}
                                </span>
                                {q.limit !== -1 && (
                                  <Badge
                                    variant="secondary"
                                    className={`text-[10px] py-0 border ${
                                      pct > 100 ? 'bg-red-100 text-red-700 border-red-200'
                                        : pct >= 80 ? 'bg-amber-100 text-amber-700 border-amber-200'
                                          : 'bg-green-100 text-green-700 border-green-200'
                                    }`}
                                  >
                                    {pct.toFixed(1)}%
                                  </Badge>
                                )}
                              </div>
                            </div>
                            {q.limit !== -1 && (
                              <div className="relative h-2.5 bg-[#F1F5F9] rounded-full overflow-hidden">
                                <div
                                  className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${quotaBarColor(pct)}`}
                                  style={{ width: `${Math.min(pct, 100)}%` }}
                                />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ─── Users Tab ─── */}
          <TabsContent value="users">
            <Card className="bg-white border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#64748B]" />
                  <h3 className="text-sm font-semibold text-[#1E293B]">Tenant Users</h3>
                  <Badge variant="secondary" className="text-[10px] bg-[#F8FAFC] text-[#64748B]">
                    {users.length} users
                  </Badge>
                </div>
                <Dialog open={addUserDialogOpen} onOpenChange={setAddUserDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={handleOpenAddUser} className="rounded-lg bg-[#003ABC] hover:bg-[#003ABC]/90 text-white h-8 text-xs">
                      <Plus className="w-3.5 h-3.5 mr-1.5" />
                      Add User
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-white border-[#E2E8F0] sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle className="text-[#1E293B]">Add User to Tenant</DialogTitle>
                      <DialogDescription>Select an existing user and assign a role</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-2">
                        <Label className="text-[#1E293B] text-sm">User</Label>
                        <Select value={addUserForm.userId} onValueChange={(v) => setAddUserForm((f) => ({ ...f, userId: v }))}>
                          <SelectTrigger className="border-[#E2E8F0] text-[#1E293B]">
                            <SelectValue placeholder="Select a user" />
                          </SelectTrigger>
                          <SelectContent className="bg-white border-[#E2E8F0] max-h-64">
                            {allUsers.map((u) => (
                              <SelectItem key={u.id} value={u.id}>{u.name} ({u.email})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[#1E293B] text-sm">Role</Label>
                        <Select value={addUserForm.role} onValueChange={(v) => setAddUserForm((f) => ({ ...f, role: v }))}>
                          <SelectTrigger className="border-[#E2E8F0] text-[#1E293B]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-white border-[#E2E8F0]">
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="operator">Operator</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="outline" className="rounded-lg border-[#E2E8F0] text-[#1E293B]">Cancel</Button>
                      </DialogClose>
                      <Button onClick={handleAddUser} disabled={!addUserForm.userId} className="rounded-lg bg-[#003ABC] hover:bg-[#003ABC]/90 text-white">
                        Add User
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {users.length === 0 ? (
                  <div className="py-10 text-center">
                    <Users className="w-10 h-10 text-[#94A3B8] mx-auto mb-3" />
                    <p className="text-[#64748B] text-sm">No users found</p>
                    <p className="text-[#94A3B8] text-xs mt-1">Add users to this tenant to get started</p>
                  </div>
                ) : (
                  <Table className="text-sm">
                    <TableHeader>
                      <TableRow className="bg-[#F8FAFC] hover:bg-[#F8FAFC] border-[#E2E8F0]">
                        <TableHead className="text-[#64748B] font-medium text-xs">Name</TableHead>
                        <TableHead className="text-[#64748B] font-medium text-xs">Email</TableHead>
                        <TableHead className="text-[#64748B] font-medium text-xs">Tenant Role</TableHead>
                        <TableHead className="text-[#64748B] font-medium text-xs">System Role</TableHead>
                        <TableHead className="text-[#64748B] font-medium text-xs">Joined</TableHead>
                        <TableHead className="text-[#64748B] font-medium text-xs text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((tenantUser) => (
                        <TableRow key={tenantUser.id} className="border-[#E2E8F0]/50 hover:bg-[#F8FAFC]">
                          <TableCell className="text-[#1E293B] text-xs font-medium">
                            {tenantUser.user?.name || 'Unknown'}
                          </TableCell>
                          <TableCell className="text-[#64748B] text-xs">
                            {tenantUser.user?.email || '—'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={`text-[10px] py-0 border ${roleBadgeColor(tenantUser.tenantRole)}`}>
                              {tenantUser.tenantRole}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-[10px] py-0 bg-[#F8FAFC] text-[#64748B] border-[#E2E8F0]">
                              {tenantUser.user?.role || '—'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-[#94A3B8] text-xs whitespace-nowrap">
                            {new Date(tenantUser.joinedAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <button
                              onClick={() => handleRemoveUser(tenantUser.userId)}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-[#94A3B8] hover:text-red-600 transition-colors"
                              title="Remove user"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </Card>
          </TabsContent>

          {/* ─── Quality Tab ─── */}
          <TabsContent value="quality">
            <Card className="bg-white border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center gap-2">
                <Star className="w-4 h-4 text-[#64748B]" />
                <h3 className="text-sm font-semibold text-[#1E293B]">Quality Assessments</h3>
                <Badge variant="secondary" className="text-[10px] bg-[#F8FAFC] text-[#64748B]">
                  {qualityAssessments.length} assessments
                </Badge>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {qualityAssessments.length === 0 ? (
                  <div className="py-10 text-center">
                    <Star className="w-10 h-10 text-[#94A3B8] mx-auto mb-3" />
                    <p className="text-[#64748B] text-sm">No quality assessments found</p>
                    <p className="text-[#94A3B8] text-xs mt-1">Quality scores will appear as agents are evaluated</p>
                  </div>
                ) : (
                  <Table className="text-sm">
                    <TableHeader>
                      <TableRow className="bg-[#F8FAFC] hover:bg-[#F8FAFC] border-[#E2E8F0]">
                        <TableHead className="text-[#64748B] font-medium text-xs">Agent</TableHead>
                        <TableHead className="text-[#64748B] font-medium text-xs">Category</TableHead>
                        <TableHead className="text-[#64748B] font-medium text-xs text-right">Score</TableHead>
                        <TableHead className="text-[#64748B] font-medium text-xs">Notes</TableHead>
                        <TableHead className="text-[#64748B] font-medium text-xs">Assessed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {qualityAssessments.map((qa) => (
                        <TableRow key={qa.id} className="border-[#E2E8F0]/50 hover:bg-[#F8FAFC]">
                          <TableCell className="text-[#1E293B] text-xs font-medium">{qa.agentName}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-[10px] py-0 bg-[#F8FAFC] text-[#64748B] border-[#E2E8F0]">
                              {qa.category}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary" className={`text-[10px] py-0 border font-mono ${scoreBadgeBg(qa.score)}`}>
                              {qa.score.toFixed(1)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-[#94A3B8] text-xs max-w-[200px] truncate">
                            {qa.notes || '—'}
                          </TableCell>
                          <TableCell className="text-[#94A3B8] text-xs whitespace-nowrap">
                            {new Date(qa.assessedAt).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}