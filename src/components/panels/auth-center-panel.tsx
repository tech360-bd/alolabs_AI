'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  Shield,
  Key,
  Link2,
  QrCode,
  Lock,
  Plus,
  Trash2,
  Edit,
  CheckCircle,
  XCircle,
  Copy,
  Check,
  AlertTriangle,
  ExternalLink,
  Globe,
  Monitor,
  Smartphone,
  MapPin,
  Clock,
  RefreshCw,
  Eye,
  EyeOff,
  Fingerprint,
  Mail,
  LogOut,
  Terminal,
  FileKey,
  ScrollText,
  History,
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  ChevronRight,
  ArrowRight,
  Zap,
  Users,
  Settings,
  Info,
  BadgeCheck,
  UserX,
  SmartphoneNfc,
  CircleDot,
  Search,
  Download,
  Ban,
  Filter,
  Activity,
  UserCog,
  ShieldOff,
  Timer,
  Globe2,
  Wifi,
  Tablet,
  Laptop,
  MoreHorizontal,
  AlertOctagon,
  CheckCheck,
  X,
} from 'lucide-react'
import { useAppStore } from '@/store/app'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'

// ── Types ───────────────────────────────────────────────────────────────────

interface User {
  id: string
  name: string
  email: string
  role: string
  mfaEnabled: boolean
  lastLogin: string
  status: 'active' | 'inactive' | 'locked'
  avatar?: string
}

interface Role {
  id: string
  name: string
  description: string
  userCount: number
  permissions: Record<string, boolean>
}

interface Session {
  id: string
  userId: string
  userName: string
  device: string
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'api'
  browser: string
  ip: string
  location: string
  lastActivity: string
  createdAt: string
}

interface LoginHistory {
  id: string
  userName: string
  method: string
  ip: string
  country: string
  device: string
  browser: string
  status: 'success' | 'failed' | 'mfa_pending'
  timestamp: string
  suspicious: boolean
}

interface ApiKey {
  id: string
  name: string
  prefix: string
  scopes: string[]
  lastUsed: string
  status: 'active' | 'revoked' | 'expired'
  expiresAt: string
  createdAt: string
}

interface OAuthProvider {
  id: string
  provider: string
  icon: string
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
  enabled: boolean
  connectedUsers: number
}

interface TokenBlacklist {
  id: string
  token: string
  reason: string
  revokedAt: string
  revokedBy: string
}

interface SecurityAlert {
  id: string
  type: 'brute_force' | 'suspicious_location' | 'new_device' | 'multiple_failures'
  message: string
  severity: 'critical' | 'warning' | 'info'
  timestamp: string
  ip: string
}

// ── Static Labels ───────────────────────────────────────────────────────────

const PERMISSION_LABELS: Record<string, string> = {
  users_read: 'Users Read',
  users_write: 'Users Write',
  billing: 'Billing',
  deploy: 'Deploy',
  api_keys: 'API Keys',
  security: 'Security',
  audit: 'Audit Logs',
  settings: 'Settings',
}

const BACKUP_CODES: string[] = []

// Backup codes are generated server-side during MFA setup and stored in component state.

// ── Helper Components ───────────────────────────────────────────────────────

function DeviceIcon({ type }: { type: string }) {
  switch (type) {
    case 'mobile': return <Smartphone className="h-4 w-4" />
    case 'tablet': return <Tablet className="h-4 w-4" />
    case 'api': return <Terminal className="h-4 w-4" />
    default: return <Laptop className="h-4 w-4" />
  }
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { className: string; label: string }> = {
    active: { className: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Active' },
    inactive: { className: 'bg-gray-50 text-gray-600 border-gray-200', label: 'Inactive' },
    locked: { className: 'bg-red-50 text-red-700 border-red-200', label: 'Locked' },
    success: { className: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Success' },
    failed: { className: 'bg-red-50 text-red-700 border-red-200', label: 'Failed' },
    mfa_pending: { className: 'bg-amber-50 text-amber-700 border-amber-200', label: 'MFA Pending' },
    revoked: { className: 'bg-red-50 text-red-700 border-red-200', label: 'Revoked' },
    expired: { className: 'bg-gray-50 text-gray-500 border-gray-200', label: 'Expired' },
  }
  const v = variants[status] || { className: 'bg-gray-50 text-gray-500 border-gray-200', label: status }
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${v.className}`}>{v.label}</span>
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    'Super Admin': 'bg-[#003ABC]/10 text-[#003ABC] border-[#003ABC]/20',
    'Admin': 'bg-[#FF6A00]/10 text-[#FF6A00] border-[#FF6A00]/20',
    'Developer': 'bg-emerald-50 text-emerald-700 border-emerald-200',
    'Viewer': 'bg-gray-100 text-gray-600 border-gray-200',
    'API Consumer': 'bg-purple-50 text-purple-700 border-purple-200',
    'Security Admin': 'bg-red-50 text-red-700 border-red-200',
  }
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${colors[role] || 'bg-gray-100 text-gray-600'}`}>{role}</span>
}

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === 'critical') return <AlertOctagon className="h-4 w-4 text-red-500" />
  if (severity === 'warning') return <AlertTriangle className="h-4 w-4 text-amber-500" />
  return <Info className="h-4 w-4 text-blue-500" />
}

function formatTime(ts: string) {
  if (!ts) return '—'
  const d = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function formatDateTime(ts: string) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function AuthCenterPanel() {
  const { currentView } = useAppStore()
  const [activeTab, setActiveTab] = useState('overview')

  if (currentView !== 'auth-center') return null

  return (
    <TooltipProvider>
      <div className="h-full overflow-auto bg-[#F8FAFC] p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#003ABC]">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#1E293B]">Authentication Center</h1>
              <p className="text-sm text-slate-500">Manage users, sessions, MFA, OAuth providers, and security policies</p>
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <div className="overflow-x-auto">
              <TabsList className="inline-flex h-auto w-full min-w-max flex-wrap gap-1 bg-white border border-slate-200 p-1.5 rounded-lg">
                <TabsTrigger value="overview" className="data-[state=active]:bg-[#003ABC] data-[state=active]:text-white text-slate-600 text-xs px-3 py-2 rounded-md"><Activity className="h-3.5 w-3.5 mr-1.5" />Overview</TabsTrigger>
                <TabsTrigger value="users" className="data-[state=active]:bg-[#003ABC] data-[state=active]:text-white text-slate-600 text-xs px-3 py-2 rounded-md"><Users className="h-3.5 w-3.5 mr-1.5" />Users &amp; Roles</TabsTrigger>
                <TabsTrigger value="mfa" className="data-[state=active]:bg-[#003ABC] data-[state=active]:text-white text-slate-600 text-xs px-3 py-2 rounded-md"><Fingerprint className="h-3.5 w-3.5 mr-1.5" />MFA</TabsTrigger>
                <TabsTrigger value="oauth" className="data-[state=active]:bg-[#003ABC] data-[state=active]:text-white text-slate-600 text-xs px-3 py-2 rounded-md"><Link2 className="h-3.5 w-3.5 mr-1.5" />OAuth2</TabsTrigger>
                <TabsTrigger value="sessions" className="data-[state=active]:bg-[#003ABC] data-[state=active]:text-white text-slate-600 text-xs px-3 py-2 rounded-md"><Clock className="h-3.5 w-3.5 mr-1.5" />Sessions</TabsTrigger>
                <TabsTrigger value="api-auth" className="data-[state=active]:bg-[#003ABC] data-[state=active]:text-white text-slate-600 text-xs px-3 py-2 rounded-md"><KeyRound className="h-3.5 w-3.5 mr-1.5" />API Auth</TabsTrigger>
                <TabsTrigger value="history" className="data-[state=active]:bg-[#003ABC] data-[state=active]:text-white text-slate-600 text-xs px-3 py-2 rounded-md"><History className="h-3.5 w-3.5 mr-1.5" />Login History</TabsTrigger>
                <TabsTrigger value="policies" className="data-[state=active]:bg-[#003ABC] data-[state=active]:text-white text-slate-600 text-xs px-3 py-2 rounded-md"><ShieldCheck className="h-3.5 w-3.5 mr-1.5" />Policies</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview"><OverviewTab /></TabsContent>
            <TabsContent value="users"><UsersRolesTab /></TabsContent>
            <TabsContent value="mfa"><MfaTab /></TabsContent>
            <TabsContent value="oauth"><OAuthTab /></TabsContent>
            <TabsContent value="sessions"><SessionsTab /></TabsContent>
            <TabsContent value="api-auth"><ApiAuthTab /></TabsContent>
            <TabsContent value="history"><LoginHistoryTab /></TabsContent>
            <TabsContent value="policies"><PoliciesTab /></TabsContent>
          </Tabs>
        </div>
      </div>
    </TooltipProvider>
  )
}

// ── Tab 1: Overview ─────────────────────────────────────────────────────────

function OverviewTab() {
  const [users, setUsers] = useState<User[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [loginHistory, setLoginHistory] = useState<LoginHistory[]>([])
  const [securityAlerts, setSecurityAlerts] = useState<SecurityAlert[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/users?limit=100').then(r => r.json()).then(d => (d.data || d || []) as Record<string, unknown>[]).catch(() => []),
      fetch('/api/auth/sessions').then(r => r.json()).then(d => (d.sessions || d.data || d || []) as Record<string, unknown>[]).catch(() => []),
      fetch('/api/audit-logs?limit=100').then(r => r.json()).then(d => (d.logs || d.data || d || []) as Record<string, unknown>[]).catch(() => []),
      fetch('/api/security-events?limit=50').then(r => r.json()).then(d => (d.data || d.items || d || []) as Record<string, unknown>[]).catch(() => []),
    ]).then(([usersData, sessionsData, logsData, alertsData]) => {
      setUsers(usersData.map((u: Record<string, unknown>) => ({
        id: u.id as string,
        name: (u.name as string) || '',
        email: (u.email as string) || '',
        role: (u.role as string) || 'Viewer',
        mfaEnabled: false,
        lastLogin: (u.lastLoginAt as string) || '',
        status: u.isActive ? 'active' as const : 'inactive' as const,
      })))

      setSessions(sessionsData.map((s: Record<string, unknown>) => ({
        id: (s.id || s.sessionId || s.token) as string,
        userId: (s.userId as string) || '',
        userName: (s.userId as string) || '',
        device: (s.device || s.userAgent || 'Unknown') as string,
        deviceType: 'desktop' as const,
        browser: (s.userAgent || 'N/A') as string,
        ip: (s.ip as string) || '',
        location: '',
        lastActivity: (s.lastActivityAt || s.updatedAt || s.createdAt || '') as string,
        createdAt: (s.createdAt || '') as string,
      })))

      setLoginHistory(logsData.map((l: Record<string, unknown>, i: number) => ({
        id: (l.id as string) || `lh-${i}`,
        userName: (l.userId as string) || 'System',
        method: (l.action as string) || 'Session',
        ip: '',
        country: '',
        device: '',
        browser: '',
        status: 'success' as const,
        timestamp: (l.createdAt as string) || '',
        suspicious: false,
      })))

      setSecurityAlerts(alertsData.map((a: Record<string, unknown>, i: number) => ({
        id: (a.id as string) || `sa-${i}`,
        type: (a.type as SecurityAlert['type']) || 'multiple_failures',
        message: (a.details || a.type || 'Security event detected') as string,
        severity: ((a.severity === 'high' ? 'critical' : a.severity === 'medium' ? 'warning' : a.severity) as SecurityAlert['severity']) || 'info',
        timestamp: (a.createdAt as string) || '',
        ip: (a.source as string) || '',
      })))
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /><Skeleton className="h-40 w-full" /></div>

  const totalUsers = users.length
  const activeSessions = sessions.length
  const mfaPercent = totalUsers > 0 ? Math.round((users.filter(u => u.mfaEnabled).length / totalUsers) * 100) : 0
  const failedLogins24h = loginHistory.filter(l => l.status === 'failed' && new Date(l.timestamp).getTime() > Date.now() - 86400000).length

  const methodCounts: Record<string, number> = {}
  for (const l of loginHistory) {
    const m = l.method.split(' ')[0] || 'Other'
    methodCounts[m] = (methodCounts[m] || 0) + 1
  }
  const authMethods = Object.entries(methodCounts).map(([name, count]) => ({ name, count, color: 'bg-slate-400' }))
  const maxCount = Math.max(...authMethods.map(m => m.count), 1)

  const recentLogins = loginHistory.slice(0, 8)

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Users', value: totalUsers, icon: Users, color: 'text-[#003ABC]', bg: 'bg-[#003ABC]/10' },
          { label: 'Active Sessions', value: activeSessions, icon: Wifi, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'MFA Enabled', value: `${mfaPercent}%`, icon: ShieldCheck, color: 'text-[#FF6A00]', bg: 'bg-[#FF6A00]/10' },
          { label: 'Failed Logins (24h)', value: failedLogins24h, icon: ShieldAlert, color: 'text-red-600', bg: 'bg-red-50' },
        ].map(stat => (
          <Card key={stat.label} className="border-slate-200 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                  <p className="mt-1 text-2xl font-bold text-[#1E293B]">{stat.value}</p>
                </div>
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.bg}`}>
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Auth Method Distribution */}
        <Card className="border-slate-200 shadow-sm lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-[#1E293B]">Auth Method Distribution</CardTitle>
            <CardDescription className="text-xs text-slate-500">Last 24 hours</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {authMethods.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">No data</p>
            ) : authMethods.map(m => (
              <div key={m.name} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[#1E293B]">{m.name}</span>
                  <span className="text-slate-500">{m.count} requests</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-slate-100">
                  <div className={`h-2.5 rounded-full ${m.color}`} style={{ width: `${(m.count / maxCount) * 100}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Recent Login Activity */}
        <Card className="border-slate-200 shadow-sm lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-[#1E293B]">Recent Login Activity</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-72 overflow-y-auto">
              {recentLogins.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">No recent login activity</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-100 hover:bg-transparent">
                      <TableHead className="text-xs font-medium text-slate-500">User</TableHead>
                      <TableHead className="text-xs font-medium text-slate-500">Method</TableHead>
                      <TableHead className="text-xs font-medium text-slate-500">IP</TableHead>
                      <TableHead className="text-xs font-medium text-slate-500">Device</TableHead>
                      <TableHead className="text-xs font-medium text-slate-500">Time</TableHead>
                      <TableHead className="text-xs font-medium text-slate-500">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentLogins.map(l => (
                      <TableRow key={l.id} className={`border-slate-50 ${l.suspicious ? 'bg-red-50/50' : ''}`}>
                        <TableCell className="text-xs font-medium text-[#1E293B]">{l.userName}</TableCell>
                        <TableCell className="text-xs text-slate-600">{l.method}</TableCell>
                        <TableCell className="font-mono text-xs text-slate-500">{l.ip || '—'}</TableCell>
                        <TableCell className="text-xs text-slate-600">{l.device || '—'}</TableCell>
                        <TableCell className="text-xs text-slate-500">{formatTime(l.timestamp)}</TableCell>
                        <TableCell><StatusBadge status={l.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Security Alerts */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-[#1E293B]">Security Alerts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {securityAlerts.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">No security alerts</p>
          ) : securityAlerts.map(alert => (
            <div key={alert.id} className={`flex items-start gap-3 rounded-lg border p-3 ${
              alert.severity === 'critical' ? 'border-red-200 bg-red-50/50' : alert.severity === 'warning' ? 'border-amber-200 bg-amber-50/50' : 'border-blue-200 bg-blue-50/50'
            }`}>
              <SeverityIcon severity={alert.severity} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#1E293B]">{alert.message}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {alert.ip ? <><span className="font-mono">{alert.ip}</span> · </> : null}{formatTime(alert.timestamp)}
                </p>
              </div>
              <Badge variant="outline" className={`text-xs shrink-0 ${
                alert.severity === 'critical' ? 'border-red-300 text-red-700' : alert.severity === 'warning' ? 'border-amber-300 text-amber-700' : 'border-blue-300 text-blue-700'
              }`}>
                {alert.severity}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Tab 2: Users & Roles ────────────────────────────────────────────────────

function UsersRolesTab() {
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())
  const [createUserOpen, setCreateUserOpen] = useState(false)
  const [editRoleOpen, setEditRoleOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [subTab, setSubTab] = useState<'users' | 'roles'>('users')

  useEffect(() => {
    Promise.all([
      fetch('/api/users?limit=100').then(r => r.json()).then(d => (d.data || d || []) as Record<string, unknown>[]).catch(() => []),
      fetch('/api/roles?limit=100').then(r => r.json()).then(d => (d.data || d.items || d || []) as Record<string, unknown>[]).catch(() => []),
    ]).then(([usersData, rolesData]) => {
      setUsers(usersData.map((u: Record<string, unknown>) => ({
        id: u.id as string,
        name: (u.name as string) || '',
        email: (u.email as string) || '',
        role: (u.role as string) || 'Viewer',
        mfaEnabled: false,
        lastLogin: (u.lastLoginAt as string) || '',
        status: u.isActive ? 'active' as const : 'inactive' as const,
      })))
      setRoles(rolesData.map((r: Record<string, unknown>) => {
        const perms: Record<string, boolean> = {}
        const permList = (r.permissions as Record<string, unknown>[] | undefined) || []
        for (const p of permList) {
          perms[(p.name as string) || ''] = true
        }
        for (const key of Object.keys(PERMISSION_LABELS)) {
          if (!(key in perms)) perms[key] = false
        }
        return {
          id: r.id as string,
          name: (r.name as string) || '',
          description: (r.description as string) || '',
          userCount: 0,
          permissions: perms,
        }
      }))
    }).finally(() => setLoading(false))
  }, [])

  const filteredUsers = useMemo(() =>
    users.filter(u => u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())),
    [users, search]
  )

  const toggleSelectAll = () => {
    if (selectedUsers.size === filteredUsers.length) setSelectedUsers(new Set())
    else setSelectedUsers(new Set(filteredUsers.map(u => u.id)))
  }

  const toggleSelect = (id: string) => {
    const next = new Set(selectedUsers)
    if (next.has(id)) { next.delete(id) } else { next.add(id) }
    setSelectedUsers(next)
  }

  const toggleMfa = (id: string) => setUsers(users.map(u => u.id === id ? { ...u, mfaEnabled: !u.mfaEnabled } : u))

  const toggleUserStatus = (id: string) => {
    setUsers(users.map(u => {
      if (u.id !== id) return u
      if (u.status === 'active') return { ...u, status: 'inactive' as const }
      return { ...u, status: 'active' as const }
    }))
  }

  const bulkEnableMfa = () => setUsers(users.map(u => selectedUsers.has(u.id) ? { ...u, mfaEnabled: true } : u))
  const bulkDeactivate = () => setUsers(users.map(u => selectedUsers.has(u.id) ? { ...u, status: 'inactive' as const } : u))

  if (loading) return <div className="space-y-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-64 w-full" /></div>

  return (
    <div className="space-y-4">
      {/* Sub-tab toggle */}
      <div className="flex items-center gap-2">
        <Button variant={subTab === 'users' ? 'default' : 'outline'} size="sm" onClick={() => setSubTab('users')} className={subTab === 'users' ? 'bg-[#003ABC] hover:bg-[#003ABC]/90' : ''}>
          <Users className="h-3.5 w-3.5 mr-1.5" /> Users
        </Button>
        <Button variant={subTab === 'roles' ? 'default' : 'outline'} size="sm" onClick={() => setSubTab('roles')} className={subTab === 'roles' ? 'bg-[#003ABC] hover:bg-[#003ABC]/90' : ''}>
          <Shield className="h-3.5 w-3.5 mr-1.5" /> Roles &amp; Permissions
        </Button>
      </div>

      {subTab === 'users' && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-sm font-semibold text-[#1E293B]">User Management</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <Input placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 w-56 pl-8 text-xs" />
                </div>
                {selectedUsers.size > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 text-xs border-[#FF6A00] text-[#FF6A00] hover:bg-[#FF6A00]/10">
                        <Zap className="h-3.5 w-3.5 mr-1" /> Bulk ({selectedUsers.size})
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={bulkEnableMfa}><ShieldCheck className="h-3.5 w-3.5 mr-2" />Enable MFA</DropdownMenuItem>
                      <DropdownMenuItem onClick={bulkDeactivate}><UserX className="h-3.5 w-3.5 mr-2" />Deactivate</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-red-600"><RefreshCw className="h-3.5 w-3.5 mr-2" />Reset Passwords</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Button size="sm" className="h-8 bg-[#003ABC] hover:bg-[#003ABC]/90 text-xs" onClick={() => setCreateUserOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add User
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[500px] overflow-y-auto">
              {filteredUsers.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">No users found</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-100 hover:bg-transparent">
                      <TableHead className="w-10"><Checkbox checked={selectedUsers.size === filteredUsers.length && filteredUsers.length > 0} onCheckedChange={toggleSelectAll} /></TableHead>
                      <TableHead className="text-xs font-medium text-slate-500">Name</TableHead>
                      <TableHead className="text-xs font-medium text-slate-500">Email</TableHead>
                      <TableHead className="text-xs font-medium text-slate-500">Role</TableHead>
                      <TableHead className="text-xs font-medium text-slate-500">MFA</TableHead>
                      <TableHead className="text-xs font-medium text-slate-500">Last Login</TableHead>
                      <TableHead className="text-xs font-medium text-slate-500">Status</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map(user => (
                      <TableRow key={user.id} className="border-slate-50">
                        <TableCell><Checkbox checked={selectedUsers.has(user.id)} onCheckedChange={() => toggleSelect(user.id)} /></TableCell>
                        <TableCell className="text-xs font-medium text-[#1E293B]">{user.name}</TableCell>
                        <TableCell className="text-xs text-slate-500">{user.email}</TableCell>
                        <TableCell><RoleBadge role={user.role} /></TableCell>
                        <TableCell>
                          <Switch checked={user.mfaEnabled} onCheckedChange={() => toggleMfa(user.id)} className="scale-75" />
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">{formatTime(user.lastLogin)}</TableCell>
                        <TableCell><StatusBadge status={user.status} /></TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0"><MoreHorizontal className="h-3.5 w-3.5 text-slate-400" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem><Edit className="h-3.5 w-3.5 mr-2" />Edit User</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => toggleUserStatus(user.id)}>{user.status === 'active' ? <UserX className="h-3.5 w-3.5 mr-2" /> : <CheckCircle className="h-3.5 w-3.5 mr-2" />}{user.status === 'active' ? 'Deactivate' : 'Activate'}</DropdownMenuItem>
                              <DropdownMenuItem className="text-red-600"><RefreshCw className="h-3.5 w-3.5 mr-2" />Reset Password</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {subTab === 'roles' && (
        <div className="space-y-4">
          {/* Roles Table */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-[#1E293B]">Roles</CardTitle>
                <Button size="sm" className="h-8 bg-[#003ABC] hover:bg-[#003ABC]/90 text-xs" onClick={() => { setEditingRole(null); setEditRoleOpen(true) }}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Role
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {roles.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">No roles configured</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-100 hover:bg-transparent">
                      <TableHead className="text-xs font-medium text-slate-500">Role</TableHead>
                      <TableHead className="text-xs font-medium text-slate-500">Description</TableHead>
                      <TableHead className="text-xs font-medium text-slate-500">Users</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roles.map(role => (
                      <TableRow key={role.id} className="border-slate-50">
                        <TableCell className="text-xs font-semibold text-[#1E293B]"><RoleBadge role={role.name} /></TableCell>
                        <TableCell className="text-xs text-slate-500">{role.description}</TableCell>
                        <TableCell className="text-xs text-slate-500">{role.userCount}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setEditingRole(role); setEditRoleOpen(true) }}>
                            <Edit className="h-3.5 w-3.5 text-slate-400" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Permission Matrix */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-[#1E293B]">Permission Matrix</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {roles.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">No roles to display</p>
              ) : (
                <ScrollArea className="w-full">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-100 hover:bg-transparent">
                        <TableHead className="sticky left-0 bg-white z-10 text-xs font-medium text-slate-500 min-w-[120px]">Permission</TableHead>
                        {roles.map(r => (
                          <TableHead key={r.id} className="text-xs font-medium text-slate-500 text-center min-w-[90px]">{r.name}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(PERMISSION_LABELS).map(([key, label]) => (
                        <TableRow key={key} className="border-slate-50">
                          <TableCell className="sticky left-0 bg-white z-10 text-xs font-medium text-[#1E293B]">{label}</TableCell>
                          {roles.map(r => (
                            <TableCell key={r.id} className="text-center">
                              {r.permissions[key] ? <CheckCircle className="h-4 w-4 text-emerald-500 mx-auto" /> : <XCircle className="h-4 w-4 text-slate-300 mx-auto" />}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create User Dialog */}
      <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B]">Create New User</DialogTitle>
            <DialogDescription>Add a new user to the system</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label className="text-xs">Full Name</Label><Input placeholder="Enter full name" className="text-sm" /></div>
            <div className="space-y-2"><Label className="text-xs">Email Address</Label><Input type="email" placeholder="user@alolabs.io" className="text-sm" /></div>
            <div className="space-y-2">
              <Label className="text-xs">Role</Label>
              <Select><SelectTrigger className="text-sm"><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>{roles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label className="text-xs">Temporary Password</Label><Input type="password" placeholder="Generate or enter password" className="text-sm" /></div>
            <div className="flex items-center gap-2"><Switch /><Label className="text-xs">Require MFA on first login</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateUserOpen(false)}>Cancel</Button>
            <Button size="sm" className="bg-[#003ABC] hover:bg-[#003ABC]/90" onClick={() => setCreateUserOpen(false)}>Create User</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog open={editRoleOpen} onOpenChange={setEditRoleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B]">{editingRole ? 'Edit Role' : 'Create Role'}</DialogTitle>
            <DialogDescription>{editingRole ? `Editing ${editingRole.name}` : 'Define a new role'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label className="text-xs">Role Name</Label><Input defaultValue={editingRole?.name || ''} placeholder="Role name" className="text-sm" /></div>
            <div className="space-y-2"><Label className="text-xs">Description</Label><Textarea defaultValue={editingRole?.description || ''} placeholder="Role description" className="text-sm" rows={2} /></div>
            <Separator />
            <Label className="text-xs font-semibold">Permissions</Label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(PERMISSION_LABELS).map(([key, label]) => (
                <div key={key} className="flex items-center gap-2">
                  <Checkbox defaultChecked={editingRole?.permissions[key] || false} />
                  <Label className="text-xs">{label}</Label>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditRoleOpen(false)}>Cancel</Button>
            <Button size="sm" className="bg-[#003ABC] hover:bg-[#003ABC]/90" onClick={() => setEditRoleOpen(false)}>Save Role</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Tab 3: MFA Management ───────────────────────────────────────────────────

function MfaTab() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [setupStep, setSetupStep] = useState(0)
  const [showBackupCodes, setShowBackupCodes] = useState(false)
  const [mfaPolicy, setMfaPolicy] = useState({
    requireForAdmin: true,
    optionalForUsers: true,
    allowedMethods: ['totp', 'sms'],
  })

  useEffect(() => {
    fetch('/api/users?limit=100')
      .then(r => r.json())
      .then(d => {
        const items = (d.data || d || []) as Record<string, unknown>[]
        setUsers(items.map((u: Record<string, unknown>) => ({
          id: u.id as string,
          name: (u.name as string) || '',
          email: (u.email as string) || '',
          role: (u.role as string) || 'Viewer',
          mfaEnabled: false,
          lastLogin: (u.lastLoginAt as string) || '',
          status: u.isActive ? 'active' as const : 'inactive' as const,
        })))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const enabledCount = users.filter(u => u.mfaEnabled).length
  const disabledCount = users.filter(u => !u.mfaEnabled).length
  const pendingCount = 0

  const toggleMfa = (id: string) => setUsers(users.map(u => u.id === id ? { ...u, mfaEnabled: !u.mfaEnabled } : u))

  if (loading) return <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: 'MFA Enabled', value: enabledCount, icon: ShieldCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Pending Setup', value: pendingCount, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'MFA Disabled', value: disabledCount, icon: ShieldOff, color: 'text-slate-500', bg: 'bg-slate-100' },
        ].map(s => (
          <Card key={s.label} className="border-slate-200 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${s.bg}`}><s.icon className={`h-4 w-4 ${s.color}`} /></div>
                <div>
                  <p className="text-xs text-slate-500">{s.label}</p>
                  <p className="text-xl font-bold text-[#1E293B]">{s.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Per-user MFA Status */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-[#1E293B]">User MFA Status</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-72 overflow-y-auto">
            {users.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">No users</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-100 hover:bg-transparent">
                    <TableHead className="text-xs font-medium text-slate-500">User</TableHead>
                    <TableHead className="text-xs font-medium text-slate-500">Role</TableHead>
                    <TableHead className="text-xs font-medium text-slate-500">MFA Status</TableHead>
                    <TableHead className="text-xs font-medium text-slate-500">Toggle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map(u => (
                    <TableRow key={u.id} className="border-slate-50">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#003ABC]/10 text-[#003ABC] text-xs font-bold">{u.name.split(' ').map(n => n[0]).join('')}</div>
                          <span className="text-xs font-medium text-[#1E293B]">{u.name}</span>
                        </div>
                      </TableCell>
                      <TableCell><RoleBadge role={u.role} /></TableCell>
                      <TableCell>
                        {u.mfaEnabled ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"><CheckCircle className="h-3.5 w-3.5" />Enabled</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400"><XCircle className="h-3.5 w-3.5" />Disabled</span>
                        )}
                      </TableCell>
                      <TableCell><Switch checked={u.mfaEnabled} onCheckedChange={() => toggleMfa(u.id)} className="scale-75" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* MFA Setup Flow Preview */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-[#1E293B]">MFA Setup Flow (TOTP)</CardTitle>
            <CardDescription className="text-xs text-slate-500">Preview of the user enrollment experience</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Step indicators */}
            <div className="flex items-center gap-2">
              {[1, 2, 3].map(step => (
                <button key={step} onClick={() => setSetupStep(step - 1)} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${setupStep >= step - 1 ? 'border-[#003ABC] bg-[#003ABC]/5 text-[#003ABC]' : 'border-slate-200 text-slate-400'}`}>
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${setupStep >= step - 1 ? 'bg-[#003ABC] text-white' : 'bg-slate-200 text-slate-500'}`}>{step}</span>
                  {['Scan QR Code', 'Enter Code', 'Save Codes'][step - 1]}
                </button>
              ))}
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 min-h-[200px]">
              {setupStep === 0 && (
                <div className="flex flex-col items-center gap-3">
                  <div className="rounded-lg bg-white p-4 shadow-sm border">
                    <div className="h-36 w-36 bg-[repeating-conic-gradient(#1E293B_0%_25%,#fff_0%_50%)] bg-[length:8px_8px] rounded opacity-80" />
                  </div>
                  <p className="text-xs text-slate-600 text-center">Scan this QR code with your authenticator app<br />(Google Authenticator, Authy, etc.)</p>
                  <div className="flex items-center gap-2 rounded bg-white border px-3 py-1.5">
                    <span className="font-mono text-xs text-[#1E293B]">JBSW Y3DP EHPK 3PXP</span>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0"><Copy className="h-3 w-3" /></Button>
                  </div>
                </div>
              )}
              {setupStep === 1 && (
                <div className="flex flex-col items-center gap-3">
                  <Fingerprint className="h-10 w-10 text-[#003ABC]" />
                  <p className="text-sm font-medium text-[#1E293B]">Enter the 6-digit code</p>
                  <p className="text-xs text-slate-500 text-center">Enter the verification code from your authenticator app to confirm setup</p>
                  <div className="flex gap-2 mt-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Input key={i} className="h-10 w-10 text-center text-lg font-bold" maxLength={1} />
                    ))}
                  </div>
                  <Button size="sm" className="bg-[#003ABC] hover:bg-[#003ABC]/90 mt-2">Verify Code</Button>
                </div>
              )}
              {setupStep === 2 && (
                <div className="flex flex-col items-center gap-3">
                  <CheckCheck className="h-10 w-10 text-emerald-500" />
                  <p className="text-sm font-medium text-[#1E293B]">Save Your Backup Codes</p>
                  <p className="text-xs text-slate-500 text-center">Store these codes in a safe place. Each can only be used once.</p>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {BACKUP_CODES.map(code => (
                      <div key={code} className="rounded bg-white border px-3 py-1.5 font-mono text-xs text-[#1E293B]">{code}</div>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Button variant="outline" size="sm" onClick={() => setShowBackupCodes(true)}><Download className="h-3.5 w-3.5 mr-1" />Download</Button>
                    <Button variant="outline" size="sm"><Copy className="h-3.5 w-3.5 mr-1" />Copy All</Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* MFA Policy */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-[#1E293B]">MFA Policy Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <div><p className="text-xs font-medium text-[#1E293B]">Require MFA for Admin roles</p><p className="text-xs text-slate-500">All admin accounts must have MFA enabled</p></div>
              <Switch checked={mfaPolicy.requireForAdmin} onCheckedChange={v => setMfaPolicy(p => ({ ...p, requireForAdmin: v }))} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div><p className="text-xs font-medium text-[#1E293B]">Optional for standard users</p><p className="text-xs text-slate-500">Users can choose to enable MFA</p></div>
              <Switch checked={mfaPolicy.optionalForUsers} onCheckedChange={v => setMfaPolicy(p => ({ ...p, optionalForUsers: v }))} />
            </div>
            <Separator />
            <div>
              <p className="text-xs font-medium text-[#1E293B] mb-3">Allowed MFA Methods</p>
              <div className="space-y-2">
                {[
                  { id: 'totp', label: 'TOTP (Authenticator App)', desc: 'Time-based one-time password' },
                  { id: 'sms', label: 'SMS Verification', desc: 'Code sent via SMS' },
                  { id: 'email', label: 'Email Verification', desc: 'Code sent via email' },
                  { id: 'hardware', label: 'Hardware Key (FIDO2)', desc: 'YubiKey or similar' },
                ].map(method => (
                  <div key={method.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                    <div>
                      <p className="text-xs font-medium text-[#1E293B]">{method.label}</p>
                      <p className="text-[11px] text-slate-500">{method.desc}</p>
                    </div>
                    <Switch
                      checked={mfaPolicy.allowedMethods.includes(method.id)}
                      onCheckedChange={v => setMfaPolicy(p => ({
                        ...p,
                        allowedMethods: v ? [...p.allowedMethods, method.id] : p.allowedMethods.filter(m => m !== method.id),
                      }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ── Tab 4: OAuth2 Providers ─────────────────────────────────────────────────

function OAuthTab() {
  const [providers, setProviders] = useState<OAuthProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [editDialog, setEditDialog] = useState(false)
  const [editingProvider, setEditingProvider] = useState<OAuthProvider | null>(null)

  useEffect(() => {
    fetch('/api/auth/oauth/providers')
      .then(r => r.json())
      .then(d => {
        const items = (d.providers || d.data || d || []) as Record<string, unknown>[]
        setProviders(items.map((p: Record<string, unknown>, i: number) => ({
          id: (p.id as string) || `oa-${i}`,
          provider: (p.provider as string) || '',
          icon: ['', '🔴', '⚫', '🔵', '🔷'][i % 5],
          clientId: (p.clientId as string) || '',
          clientSecret: '',
          redirectUri: (p.authorizationUrl as string) || '',
          scopes: (p.scopes as string[]) || [],
          enabled: (p.isActive as boolean) ?? false,
          connectedUsers: 0,
        })))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const toggleProvider = (id: string) => setProviders(providers.map(p => p.id === id ? { ...p, enabled: !p.enabled } : p))

  if (loading) return <div className="space-y-4"><Skeleton className="h-48 w-full" /><Skeleton className="h-40 w-full" /></div>

  return (
    <div className="space-y-6">
      {/* Provider Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {providers.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
            <Link2 className="h-10 w-10 text-slate-300 mb-3" />
            <p className="text-sm font-medium text-slate-500">No OAuth providers configured</p>
            <p className="text-xs text-slate-400 mt-1">Add an OAuth provider to enable third-party login</p>
          </div>
        ) : providers.map(provider => (
          <Card key={provider.id} className="border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{provider.icon}</span>
                  <CardTitle className="text-sm font-semibold text-[#1E293B]">{provider.provider}</CardTitle>
                </div>
                <Switch checked={provider.enabled} onCheckedChange={() => toggleProvider(provider.id)} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div><span className="text-slate-500">Client ID:</span><p className="font-mono text-[#1E293B] mt-0.5 truncate">{provider.clientId}</p></div>
              <div><span className="text-slate-500">Redirect Uri:</span><p className="font-mono text-[#1E293B] mt-0.5 truncate">{provider.redirectUri}</p></div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                <span className="text-slate-500">{provider.connectedUsers} connected users</span>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-[#003ABC] hover:text-[#003ABC]/80" onClick={() => { setEditingProvider(provider); setEditDialog(true) }}>
                  <Edit className="h-3 w-3 mr-1" />Configure
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* OAuth2 Flow Visualization */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-[#1E293B]">OAuth2 Authorization Code Flow</CardTitle>
          <CardDescription className="text-xs text-slate-500">Standard OAuth2 flow used by all providers</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-stretch gap-3">
            {[
              { step: '1', title: 'Authorization', desc: 'User redirected to provider login', icon: Globe, color: 'bg-[#003ABC]' },
              { step: '2', title: 'Token Exchange', desc: 'Auth code exchanged for tokens', icon: KeyRound, color: 'bg-[#FF6A00]' },
              { step: '3', title: 'User Info', desc: 'Fetch user profile from provider', icon: Users, color: 'bg-emerald-500' },
              { step: '4', title: 'Session', desc: 'Create local session', icon: ShieldCheck, color: 'bg-purple-500' },
            ].map((item, i) => (
              <div key={item.step} className="flex items-center gap-3 flex-1">
                <div className="flex-1 rounded-lg border border-slate-200 p-3 text-center">
                  <div className={`mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full ${item.color} text-white`}>
                    <item.icon className="h-4 w-4" />
                  </div>
                  <p className="text-xs font-semibold text-[#1E293B]">{item.title}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{item.desc}</p>
                </div>
                {i < 3 && <ArrowRight className="h-4 w-4 text-slate-300 shrink-0 hidden sm:block" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Edit Provider Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B]">Configure {editingProvider?.provider}</DialogTitle>
            <DialogDescription>Update OAuth2 provider settings</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label className="text-xs">Client ID</Label><Input defaultValue={editingProvider?.clientId} className="text-sm font-mono" /></div>
            <div className="space-y-2"><Label className="text-xs">Client Secret</Label><Input type="password" defaultValue="••••••••••••" className="text-sm font-mono" /></div>
            <div className="space-y-2"><Label className="text-xs">Redirect Uri(s)</Label><Textarea defaultValue={editingProvider?.redirectUri} className="text-sm font-mono" rows={2} /></div>
            <div className="space-y-2">
              <Label className="text-xs">Scopes</Label>
              <div className="flex flex-wrap gap-1.5">
                {(editingProvider?.scopes || ['openid', 'email', 'profile']).map(scope => (
                  <Badge key={scope} variant="outline" className="text-xs border-[#003ABC]/30 text-[#003ABC]">{scope}</Badge>
                ))}
                <Button variant="outline" size="sm" className="h-6 text-xs"><Plus className="h-3 w-3" /></Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditDialog(false)}>Cancel</Button>
            <Button size="sm" className="bg-[#003ABC] hover:bg-[#003ABC]/90" onClick={() => setEditDialog(false)}>Save Configuration</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Tab 5: Sessions ─────────────────────────────────────────────────────────

function SessionsTab() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [timeoutConfig, setTimeoutConfig] = useState({ session: '30', idle: '15', maxConcurrent: '5' })

  useEffect(() => {
    fetch('/api/auth/sessions')
      .then(r => r.json())
      .then(d => {
        const items = (d.sessions || d.data || d || []) as Record<string, unknown>[]
        setSessions(items.map((s: Record<string, unknown>, i: number) => ({
          id: (s.id || s.sessionId || s.token || `s-${i}`) as string,
          userId: (s.userId as string) || '',
          userName: (s.userId as string) || '',
          device: (s.device || s.userAgent || 'Unknown') as string,
          deviceType: 'desktop' as const,
          browser: (s.userAgent || 'N/A') as string,
          ip: (s.ip as string) || '',
          location: '',
          lastActivity: (s.lastActivityAt || s.updatedAt || s.createdAt || '') as string,
          createdAt: (s.createdAt || '') as string,
        })))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const desktopCount = sessions.filter(s => s.deviceType === 'desktop').length
  const mobileCount = sessions.filter(s => s.deviceType === 'mobile').length
  const apiCount = sessions.filter(s => s.deviceType === 'api').length

  const revokeSession = (id: string) => setSessions(sessions.filter(s => s.id !== id))
  const revokeAll = () => setSessions([])

  if (loading) return <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-48 w-full" /><Skeleton className="h-32 w-full" /></div>

  return (
    <div className="space-y-6">
      {/* Session Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        {[
          { label: 'Total Active', value: sessions.length, icon: Wifi, color: 'text-[#003ABC]', bg: 'bg-[#003ABC]/10' },
          { label: 'Desktop', value: desktopCount, icon: Laptop, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Mobile', value: mobileCount, icon: Smartphone, color: 'text-[#FF6A00]', bg: 'bg-[#FF6A00]/10' },
          { label: 'API Only', value: apiCount, icon: Terminal, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map(s => (
          <Card key={s.label} className="border-slate-200 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${s.bg}`}><s.icon className={`h-4 w-4 ${s.color}`} /></div>
                <div><p className="text-xs text-slate-500">{s.label}</p><p className="text-xl font-bold text-[#1E293B]">{s.value}</p></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Active Sessions Table */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-[#1E293B]">Active Sessions</CardTitle>
            <Button variant="outline" size="sm" className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50" onClick={revokeAll}>
              <LogOut className="h-3.5 w-3.5 mr-1.5" />Force Logout All
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-100 hover:bg-transparent">
                  <TableHead className="text-xs font-medium text-slate-500">User</TableHead>
                  <TableHead className="text-xs font-medium text-slate-500">Device</TableHead>
                  <TableHead className="text-xs font-medium text-slate-500">Browser</TableHead>
                  <TableHead className="text-xs font-medium text-slate-500">IP Address</TableHead>
                  <TableHead className="text-xs font-medium text-slate-500">Location</TableHead>
                  <TableHead className="text-xs font-medium text-slate-500">Last Activity</TableHead>
                  <TableHead className="text-xs font-medium text-slate-500"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map(session => (
                  <TableRow key={session.id} className="border-slate-50">
                    <TableCell className="text-xs font-medium text-[#1E293B]">{session.userName}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs text-slate-600">
                        <DeviceIcon type={session.deviceType} />
                        {session.device}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">{session.browser}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">{session.ip}</TableCell>
                    <TableCell className="text-xs text-slate-500">{session.location}</TableCell>
                    <TableCell className="text-xs text-slate-500">{formatTime(session.lastActivity)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => revokeSession(session.id)}>
                        <XCircle className="h-3.5 w-3.5 mr-1" />Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {sessions.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-sm text-slate-400">No active sessions</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Session Timeout Configuration */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-[#1E293B]">Session Timeout Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { key: 'session' as const, label: 'Session Timeout', desc: 'Maximum session duration', unit: 'minutes' },
              { key: 'idle' as const, label: 'Idle Timeout', desc: 'Auto-logout after inactivity', unit: 'minutes' },
              { key: 'maxConcurrent' as const, label: 'Max Concurrent Sessions', desc: 'Per user limit', unit: 'sessions' },
            ].map(field => (
              <div key={field.key} className="space-y-1.5">
                <Label className="text-xs font-medium text-[#1E293B]">{field.label}</Label>
                <p className="text-[11px] text-slate-500">{field.desc} ({field.unit})</p>
                <Input
                  type="number"
                  value={timeoutConfig[field.key]}
                  onChange={e => setTimeout(t => ({ ...t, [field.key]: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <Button size="sm" className="bg-[#003ABC] hover:bg-[#003ABC]/90 text-xs">Save Configuration</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Tab 6: API Authentication ───────────────────────────────────────────────

function ApiAuthTab() {
  const [method, setMethod] = useState('api_key')
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [tokenBlacklist, setTokenBlacklist] = useState<TokenBlacklist[]>([])
  const [loading, setLoading] = useState(true)
  const [jwtConfig, setJwtConfig] = useState({
    expiry: '15',
    refreshExpiry: '7',
    algorithm: 'RS256',
    refreshPolicy: 'rotating',
  })
  const [rateLimits, setRateLimits] = useState({
    api_key: { limit: '1000', window: '1m' },
    jwt: { limit: '500', window: '1m' },
    oauth2: { limit: '200', window: '1m' },
    mtls: { limit: '10000', window: '1m' },
  })

  useEffect(() => {
    fetch('/api/api-keys')
      .then(r => r.json())
      .then(d => {
        const items = (d.data || d || []) as Record<string, unknown>[]
        setKeys(items.map((k: Record<string, unknown>) => ({
          id: (k.id as string) || '',
          name: (k.name as string) || '',
          prefix: (k.keyPrefix as string) || '',
          scopes: (k.scopes as string[]) || [],
          lastUsed: (k.lastUsedAt as string) || '',
          status: k.isActive ? 'active' as const : 'revoked' as const,
          expiresAt: (k.expiresAt as string) || '',
          createdAt: (k.createdAt as string) || '',
        })))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const revokeKey = (id: string) => setKeys(keys.map(k => k.id === id ? { ...k, status: 'revoked' as const } : k))

  if (loading) return <div className="space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-48 w-full" /><Skeleton className="h-48 w-full" /></div>

  return (
    <div className="space-y-6">
      {/* Method Selector */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-[#1E293B]">Authentication Method</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { id: 'api_key', label: 'API Key', icon: Key },
              { id: 'jwt', label: 'JWT Bearer', icon: FileKey },
              { id: 'oauth2', label: 'OAuth2 Client Creds', icon: Link2 },
              { id: 'mtls', label: 'mTLS', icon: Shield },
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setMethod(m.id)}
                className={`flex items-center gap-2 rounded-lg border p-3 text-xs font-medium transition-all ${
                  method === m.id
                    ? 'border-[#003ABC] bg-[#003ABC]/5 text-[#003ABC] shadow-sm'
                    : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <m.icon className="h-4 w-4" />
                {m.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {method === 'api_key' && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-[#1E293B]">API Keys</CardTitle>
                <CardDescription className="text-xs text-slate-500">Manage API keys for programmatic access</CardDescription>
              </div>
              <Button size="sm" className="h-8 bg-[#003ABC] hover:bg-[#003ABC]/90 text-xs"><Plus className="h-3.5 w-3.5 mr-1" />Create Key</Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[350px] overflow-y-auto">
              {keys.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">No API keys</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-100 hover:bg-transparent">
                      <TableHead className="text-xs font-medium text-slate-500">Name</TableHead>
                      <TableHead className="text-xs font-medium text-slate-500">Prefix</TableHead>
                      <TableHead className="text-xs font-medium text-slate-500">Scopes</TableHead>
                      <TableHead className="text-xs font-medium text-slate-500">Last Used</TableHead>
                      <TableHead className="text-xs font-medium text-slate-500">Expires</TableHead>
                      <TableHead className="text-xs font-medium text-slate-500">Status</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {keys.map(key => (
                      <TableRow key={key.id} className="border-slate-50">
                        <TableCell className="text-xs font-medium text-[#1E293B]">{key.name}</TableCell>
                        <TableCell className="font-mono text-xs text-slate-500">{key.prefix}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {key.scopes.map(s => <Badge key={s} variant="outline" className="text-[10px] px-1.5 py-0 border-[#003ABC]/20 text-[#003ABC]">{s}</Badge>)}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">{formatTime(key.lastUsed)}</TableCell>
                        <TableCell className="text-xs text-slate-500">{key.expiresAt}</TableCell>
                        <TableCell><StatusBadge status={key.status} /></TableCell>
                        <TableCell>
                          {key.status === 'active' && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600 hover:bg-red-50" onClick={() => revokeKey(key.id)}>
                              <Ban className="h-3 w-3" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {method === 'jwt' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-[#1E293B]">JWT Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Access Token Expiry (minutes)</Label>
                <Input type="number" value={jwtConfig.expiry} onChange={e => setJwtConfig(c => ({ ...c, expiry: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Refresh Token Expiry (days)</Label>
                <Input type="number" value={jwtConfig.refreshExpiry} onChange={e => setJwtConfig(c => ({ ...c, refreshExpiry: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Signing Algorithm</Label>
                <Select value={jwtConfig.algorithm} onValueChange={v => setJwtConfig(c => ({ ...c, algorithm: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HS256">HS256 (HMAC)</SelectItem>
                    <SelectItem value="RS256">RS256 (RSA)</SelectItem>
                    <SelectItem value="ES256">ES256 (ECDSA)</SelectItem>
                    <SelectItem value="PS256">PS256 (RSA-PSS)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Refresh Token Policy</Label>
                <Select value={jwtConfig.refreshPolicy} onValueChange={v => setJwtConfig(c => ({ ...c, refreshPolicy: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rotating">Rotating (new token on refresh)</SelectItem>
                    <SelectItem value="sliding">Sliding (extend expiry)</SelectItem>
                    <SelectItem value="static">Static (reuse token)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end pt-2"><Button size="sm" className="bg-[#003ABC] hover:bg-[#003ABC]/90 text-xs">Save Configuration</Button></div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-[#1E293B]">Token Blacklist</CardTitle>
              <CardDescription className="text-xs text-slate-500">Revoked tokens that are rejected</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[280px] overflow-y-auto">
                {tokenBlacklist.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-8">No revoked tokens</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-100 hover:bg-transparent">
                        <TableHead className="text-xs font-medium text-slate-500">Token (truncated)</TableHead>
                        <TableHead className="text-xs font-medium text-slate-500">Reason</TableHead>
                        <TableHead className="text-xs font-medium text-slate-500">Revoked By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tokenBlacklist.map(t => (
                        <TableRow key={t.id} className="border-slate-50">
                          <TableCell className="font-mono text-xs text-slate-500">{t.token}</TableCell>
                          <TableCell className="text-xs text-[#1E293B]">{t.reason}</TableCell>
                          <TableCell className="text-xs text-slate-500">{t.revokedBy}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Rate Limiting */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-[#1E293B]">Rate Limiting Rules</CardTitle>
          <CardDescription className="text-xs text-slate-500">Configure rate limits per authentication method</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(rateLimits).map(([key, config]) => (
              <div key={key} className="rounded-lg border border-slate-200 p-3 space-y-2">
                <p className="text-xs font-semibold text-[#1E293B] uppercase tracking-wide">{key.replace('_', ' ')}</p>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-slate-500">Requests / Window</Label>
                  <Input
                    type="number"
                    value={config.limit}
                    onChange={e => setRateLimits(rl => ({ ...rl, [key]: { ...rl[key as keyof typeof rl], limit: e.target.value } }))}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-slate-500">Window</Label>
                  <Select value={config.window} onValueChange={v => setRateLimits(rl => ({ ...rl, [key]: { ...rl[key as keyof typeof rl], window: v } }))}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1s">1 second</SelectItem>
                      <SelectItem value="1m">1 minute</SelectItem>
                      <SelectItem value="15m">15 minutes</SelectItem>
                      <SelectItem value="1h">1 hour</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <Button size="sm" className="bg-[#003ABC] hover:bg-[#003ABC]/90 text-xs">Save Rate Limits</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Tab 7: Login History ────────────────────────────────────────────────────

function LoginHistoryTab() {
  const [loginHistory, setLoginHistory] = useState<LoginHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    user: '',
    method: 'all',
    status: 'all',
    ip: '',
  })

  useEffect(() => {
    fetch('/api/audit-logs?limit=200')
      .then(r => r.json())
      .then(d => {
        const items = (d.logs || d.data || d || []) as Record<string, unknown>[]
        setLoginHistory(items.map((l: Record<string, unknown>, i: number) => ({
          id: (l.id as string) || `lh-${i}`,
          userName: (l.userId as string) || 'System',
          method: (l.action as string) || 'Session',
          ip: '',
          country: '',
          device: '',
          browser: '',
          status: 'success' as const,
          timestamp: (l.createdAt as string) || '',
          suspicious: false,
        })))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    return loginHistory.filter(l => {
      if (filters.user && !l.userName.toLowerCase().includes(filters.user.toLowerCase())) return false
      if (filters.method !== 'all' && !l.method.toLowerCase().includes(filters.method.toLowerCase())) return false
      if (filters.status !== 'all' && l.status !== filters.status) return false
      if (filters.ip && !l.ip.includes(filters.ip)) return false
      return true
    })
  }, [loginHistory, filters])

  if (loading) return <div className="space-y-4"><Skeleton className="h-16 w-full" /><Skeleton className="h-64 w-full" /><Skeleton className="h-32 w-full" /></div>

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1"><Label className="text-[11px] text-slate-500">User</Label><Input placeholder="Filter by user..." value={filters.user} onChange={e => setFilters(f => ({ ...f, user: e.target.value }))} className="h-8 w-40 text-xs" /></div>
            <div className="space-y-1">
              <Label className="text-[11px] text-slate-500">Method</Label>
              <Select value={filters.method} onValueChange={v => setFilters(f => ({ ...f, method: v }))}>
                <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Methods</SelectItem>
                  <SelectItem value="session">Session</SelectItem>
                  <SelectItem value="api key">API Key</SelectItem>
                  <SelectItem value="jwt">JWT Bearer</SelectItem>
                  <SelectItem value="oauth2">OAuth2</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-slate-500">Status</Label>
              <Select value={filters.status} onValueChange={v => setFilters(f => ({ ...f, status: v }))}>
                <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="mfa_pending">MFA Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-[11px] text-slate-500">IP Address</Label><Input placeholder="Filter by IP..." value={filters.ip} onChange={e => setFilters(f => ({ ...f, ip: e.target.value }))} className="h-8 w-36 text-xs font-mono" /></div>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setFilters({ user: '', method: 'all', status: 'all', ip: '' })}>
              <Filter className="h-3 w-3 mr-1" />Clear
            </Button>
            <div className="ml-auto">
              <Button variant="outline" size="sm" className="h-8 text-xs border-[#003ABC] text-[#003ABC] hover:bg-[#003ABC]/10">
                <Download className="h-3 w-3 mr-1" />Export CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Login History Table */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-0">
          <div className="max-h-[500px] overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">No login history entries match the filters</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-100 hover:bg-transparent">
                    <TableHead className="text-xs font-medium text-slate-500">User</TableHead>
                    <TableHead className="text-xs font-medium text-slate-500">Method</TableHead>
                    <TableHead className="text-xs font-medium text-slate-500">IP</TableHead>
                    <TableHead className="text-xs font-medium text-slate-500">Country</TableHead>
                    <TableHead className="text-xs font-medium text-slate-500">Device</TableHead>
                    <TableHead className="text-xs font-medium text-slate-500">Browser</TableHead>
                    <TableHead className="text-xs font-medium text-slate-500">Status</TableHead>
                    <TableHead className="text-xs font-medium text-slate-500">Timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(entry => (
                    <TableRow key={entry.id} className={`border-slate-50 ${entry.suspicious ? 'bg-red-50/50' : ''}`}>
                      <TableCell className="text-xs font-medium text-[#1E293B]">{entry.userName}</TableCell>
                      <TableCell className="text-xs text-slate-600">{entry.method}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-500">{entry.ip || '—'}</TableCell>
                      <TableCell className="text-xs text-slate-500">{entry.country || '—'}</TableCell>
                      <TableCell className="text-xs text-slate-600">{entry.device || '—'}</TableCell>
                      <TableCell className="text-xs text-slate-500">{entry.browser || '—'}</TableCell>
                      <TableCell><StatusBadge status={entry.status} /></TableCell>
                      <TableCell className="text-xs text-slate-500">{formatDateTime(entry.timestamp)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Suspicious Activity Summary */}
      <Card className="border-red-200 bg-red-50/30 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-red-800">Suspicious Activity Highlights</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loginHistory.filter(l => l.suspicious).length > 0 ? (
            loginHistory.filter(l => l.suspicious).map(l => (
              <div key={l.id} className="flex items-start gap-2 rounded border border-red-200 bg-white p-2.5">
                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <div className="text-xs text-[#1E293B]">
                  <span className="font-semibold">{l.userName}</span> — {l.status === 'failed' ? 'Failed login' : 'Suspicious login'} from <span className="font-mono">{l.ip}</span> ({l.country}) using {l.browser} at {formatDateTime(l.timestamp)}
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-500">No suspicious activity detected</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Tab 8: Policies ─────────────────────────────────────────────────────────

function PoliciesTab() {
  const [passwordPolicy, setPasswordPolicy] = useState({
    minLength: '12',
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecial: true,
    expiryDays: '90',
  })

  const [lockoutPolicy, setLockoutPolicy] = useState({
    maxAttempts: '5',
    lockoutDuration: '30',
    incrementalLockout: true,
  })

  const [sessionPolicy, setSessionPolicy] = useState({
    timeout: '30',
    maxConcurrent: '5',
    idleTimeout: '15',
    rememberMe: true,
  })

  const [ipAllowlist, setIpAllowlist] = useState('192.168.0.0/16\n10.0.0.0/8\n172.16.0.0/12')
  const [ipBlocklist, setIpBlocklist] = useState('45.33.32.0/24\n185.220.101.0/24\n198.51.100.0/24')

  const [corsConfig, setCorsConfig] = useState({
    enabled: true,
    origins: 'https://aios.alolabs.io\nhttps://admin.alolabs.io\nhttps://app.alolabs.io',
    methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    allowCredentials: true,
    maxAge: '86400',
  })

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Password Policy */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-[#003ABC]" />
              <CardTitle className="text-sm font-semibold text-[#1E293B]">Password Policy</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Minimum Length</Label>
              <Input type="number" value={passwordPolicy.minLength} onChange={e => setPasswordPolicy(p => ({ ...p, minLength: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="space-y-2">
              {[
                { key: 'requireUppercase' as const, label: 'Require uppercase letters (A-Z)' },
                { key: 'requireLowercase' as const, label: 'Require lowercase letters (a-z)' },
                { key: 'requireNumbers' as const, label: 'Require numbers (0-9)' },
                { key: 'requireSpecial' as const, label: 'Require special characters (!@#$...)' },
              ].map(req => (
                <div key={req.key} className="flex items-center justify-between">
                  <Label className="text-xs text-[#1E293B]">{req.label}</Label>
                  <Switch checked={passwordPolicy[req.key]} onCheckedChange={v => setPasswordPolicy(p => ({ ...p, [req.key]: v }))} />
                </div>
              ))}
            </div>
            <Separator />
            <div className="space-y-1.5">
              <Label className="text-xs">Password Expiry (days, 0 = never)</Label>
              <Input type="number" value={passwordPolicy.expiryDays} onChange={e => setPasswordPolicy(p => ({ ...p, expiryDays: e.target.value }))} className="h-8 text-sm" />
            </div>
          </CardContent>
        </Card>

        {/* Account Lockout */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-[#FF6A00]" />
              <CardTitle className="text-sm font-semibold text-[#1E293B]">Account Lockout</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Max Failed Attempts</Label>
              <Input type="number" value={lockoutPolicy.maxAttempts} onChange={e => setLockoutPolicy(p => ({ ...p, maxAttempts: e.target.value }))} className="h-8 text-sm" />
              <p className="text-[11px] text-slate-500">Account locks after this many consecutive failures</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Lockout Duration (minutes)</Label>
              <Input type="number" value={lockoutPolicy.lockoutDuration} onChange={e => setLockoutPolicy(p => ({ ...p, lockoutDuration: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="flex items-center justify-between pt-2">
              <div><Label className="text-xs text-[#1E293B]">Incremental Lockout</Label><p className="text-[11px] text-slate-500">Each failure increases lockout duration</p></div>
              <Switch checked={lockoutPolicy.incrementalLockout} onCheckedChange={v => setLockoutPolicy(p => ({ ...p, incrementalLockout: v }))} />
            </div>
          </CardContent>
        </Card>

        {/* Session Policy */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-emerald-600" />
              <CardTitle className="text-sm font-semibold text-[#1E293B]">Session Policy</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Session Timeout (minutes)</Label>
              <Input type="number" value={sessionPolicy.timeout} onChange={e => setSessionPolicy(p => ({ ...p, timeout: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Max Concurrent Sessions per User</Label>
              <Input type="number" value={sessionPolicy.maxConcurrent} onChange={e => setSessionPolicy(p => ({ ...p, maxConcurrent: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Idle Timeout (minutes)</Label>
              <Input type="number" value={sessionPolicy.idleTimeout} onChange={e => setSessionPolicy(p => ({ ...p, idleTimeout: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="flex items-center justify-between pt-1">
              <Label className="text-xs text-[#1E293B]">Allow &quot;Remember Me&quot;</Label>
              <Switch checked={sessionPolicy.rememberMe} onCheckedChange={v => setSessionPolicy(p => ({ ...p, rememberMe: v }))} />
            </div>
          </CardContent>
        </Card>

        {/* IP Allowlist / Blocklist */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Globe2 className="h-4 w-4 text-purple-600" />
              <CardTitle className="text-sm font-semibold text-[#1E293B]">IP Access Control</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">IP Allowlist (one per line)</Label>
              <Textarea value={ipAllowlist} onChange={e => setIpAllowlist(e.target.value)} className="text-xs font-mono" rows={3} placeholder="e.g. 192.168.0.0/16" />
              <p className="text-[11px] text-slate-500">Leave empty to allow all IPs</p>
            </div>
            <Separator />
            <div className="space-y-1.5">
              <Label className="text-xs">IP Blocklist (one per line)</Label>
              <Textarea value={ipBlocklist} onChange={e => setIpBlocklist(e.target.value)} className="text-xs font-mono" rows={3} placeholder="e.g. 45.33.32.0/24" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* CORS Configuration */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ExternalLink className="h-4 w-4 text-[#003ABC]" />
              <CardTitle className="text-sm font-semibold text-[#1E293B]">CORS Configuration</CardTitle>
            </div>
            <Switch checked={corsConfig.enabled} onCheckedChange={v => setCorsConfig(c => ({ ...c, enabled: v }))} />
          </div>
        </CardHeader>
        <CardContent className={corsConfig.enabled ? '' : 'opacity-50 pointer-events-none'}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Allowed Origins (one per line)</Label>
              <Textarea value={corsConfig.origins} onChange={e => setCorsConfig(c => ({ ...c, origins: e.target.value }))} className="text-xs font-mono" rows={3} />
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Allowed Methods</Label>
                <Input value={corsConfig.methods} onChange={e => setCorsConfig(c => ({ ...c, methods: e.target.value }))} className="h-8 text-sm font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Preflight Cache Max Age (seconds)</Label>
                <Input type="number" value={corsConfig.maxAge} onChange={e => setCorsConfig(c => ({ ...c, maxAge: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-[#1E293B]">Allow Credentials</Label>
                <Switch checked={corsConfig.allowCredentials} onCheckedChange={v => setCorsConfig(c => ({ ...c, allowCredentials: v }))} />
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button size="sm" className="bg-[#003ABC] hover:bg-[#003ABC]/90 text-xs">Save All Policies</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
