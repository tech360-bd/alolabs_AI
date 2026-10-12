'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Users,
  GitBranch,
  CheckCircle2,
  DollarSign,
  Target,
  UserPlus,
  Mail,
  FileText,
  ArrowRightLeft,
  Shield,
  MoreHorizontal,
  Zap,
  Bot,
  TrendingUp,
  ArrowUpRight,
  Clock,
  CircleDot,
  Loader2,
  Wifi,
  WifiOff,
  RefreshCw,
  Plug,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'

/* ===== Types ===== */
interface DashboardStats {
  agents: { total: number; active: number; byStatus: Record<string, number> }
  companies: { total: number; active: number }
  usage: { today: number; total: number; totalTokens: number }
  tasks: { total: number; completed: number; failed: number; pending: number; inProgress: number }
  security: { pendingApprovals: number; blockedActions: number; paymentGuardBlocked: number; protectionBlocked: number }
  infrastructure: { workflows: number; departments: number; skills: number }
  recentTasks: { title: string; status: string; priority: string; createdAt: string }[]
  recentAuditLogs: { id: string; action: string; resource: string; details: string; createdAt: string; user?: { name: string } }[]
  topAgents: { agentName: string; count: number }[]
  topDepartments: { name: string; slug: string; agentCount: number }[]
}

interface CrmConnection {
  id: string
  companyName: string
  slug: string
  domain: string | null
  status: string
  connected: boolean
  connectionDetails: {
    crmEndpoint: string | null
    syncStatus: string
    lastSync: string | null
    webhookSecret: string | null
    apiVersion: string
    protocol: string
    dataFormat: string
  }
  stats: {
    usageCount: number
    monthlyUsageLimit: number
    usagePercent: number
    agentPool: number
    workflowsAssigned: number
  }
  recentActivity: {
    id: string
    action: string
    timestamp: string | null
    status: string
    tokens: number
  }[]
  capabilities: { name: string; enabled: boolean }[]
}

interface AuditLog {
  id: string
  action: string
  resource: string
  details: string | null
  userId: string | null
  ipAddress: string | null
  createdAt: string
}

/* ===== Helpers ===== */
function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function getScoreBadge(score: number) {
  if (score >= 80) return 'alo-badge-orange'
  if (score >= 60) return 'alo-badge-blue'
  return 'alo-badge-gray'
}

/* ===== Component ===== */
export default function WebCrmDashboard() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [connections, setConnections] = useState<CrmConnection[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [activeQuickAction, setActiveQuickAction] = useState<string | null>(null)
  const [syncingId, setSyncingId] = useState<string | null>(null)

  const fetchAll = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/dashboard/stats').then((r) => r.json()),
      fetch('/api/crm-connections').then((r) => r.json()),
      fetch('/api/audit-logs?limit=20').then((r) => r.json()),
    ])
      .then(([statsData, connData, logData]) => {
        setStats(statsData || null)
        setConnections(connData?.data || [])
        setAuditLogs(logData?.logs || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const handleCrmAction = async (companyId: string, action: string, companyName: string) => {
    if (action === 'sync') {
      setSyncingId(companyId)
      try {
        const res = await fetch('/api/crm-connections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId, action }),
        })
        const data = await res.json()
        if (data.success) {
          toast.success(data.message || `${action} completed`)
          fetchAll()
        } else {
          toast.error(data.error || `${action} failed`)
        }
      } catch {
        toast.error(`${action} failed`)
      } finally {
        setSyncingId(null)
      }
    } else {
      setActiveQuickAction(action)
      setTimeout(() => setActiveQuickAction(null), 2000)
    }
  }

  const handleQuickAction = (label: string) => {
    setActiveQuickAction(label)
    setTimeout(() => setActiveQuickAction(null), 2000)
    toast.info(`${label} initiated`)
  }

  if (loading) {
    return (
      <div className="p-6 max-w-[1440px] mx-auto space-y-6">
        <Skeleton className="h-8 w-48 bg-gray-100 rounded-lg" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl bg-gray-100" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl bg-gray-100" />
        <Skeleton className="h-64 rounded-xl bg-gray-100" />
      </div>
    )
  }

  const topStats = stats ? [
    {
      label: 'Total Contacts',
      value: formatNumber(stats.usage.total),
      change: stats.usage.today > 0 ? `+${stats.usage.today} today` : '—',
      icon: Users,
      accent: '#FF6A00',
      iconBg: 'bg-[#FF6A00]/10',
      iconColor: 'text-[#FF6A00]',
    },
    {
      label: 'Active Agents',
      value: String(stats.agents.active),
      change: `${stats.infrastructure.departments} departments`,
      icon: Bot,
      accent: '#003ABC',
      iconBg: 'bg-[#003ABC]/10',
      iconColor: 'text-[#003ABC]',
    },
    {
      label: 'Tasks Completed',
      value: formatNumber(stats.tasks.completed),
      change: `${stats.tasks.inProgress} in progress`,
      icon: CheckCircle2,
      accent: '#22C55E',
      iconBg: 'bg-[#22C55E]/10',
      iconColor: 'text-[#22C55E]',
    },
    {
      label: 'Total Tokens Used',
      value: formatNumber(stats.usage.totalTokens),
      change: `${formatNumber(stats.usage.total)} calls`,
      icon: DollarSign,
      accent: '#FF6A00',
      iconBg: 'alo-gradient',
      iconColor: 'text-white',
    },
  ] : []

  const recentActivities = stats?.recentAuditLogs || []

  const pipelineStages = [
    { name: 'Pending', count: stats?.tasks.pending || 0, color: '#FF6A00' },
    { name: 'In Progress', count: stats?.tasks.inProgress || 0, color: '#003ABC' },
    { name: 'Completed', count: stats?.tasks.completed || 0, color: '#22C55E' },
    { name: 'Failed', count: stats?.tasks.failed || 0, color: '#EF4444' },
  ]
  const maxTasks = Math.max(...pipelineStages.map((s) => s.count), 1)

  const quickActions = [
    { label: 'Score All Leads', icon: Target, variant: 'primary' as const },
    { label: 'Enrich Contacts', icon: UserPlus, variant: 'secondary' as const },
    { label: 'Send Follow-ups', icon: Mail, variant: 'outline' as const },
    { label: 'Generate Report', icon: FileText, variant: 'outline' as const },
    { label: 'Sync All CRMs', icon: ArrowRightLeft, variant: 'outline' as const },
    { label: 'Run Security Audit', icon: Shield, variant: 'outline' as const },
  ]

  const agentColorMap: Record<string, string> = {
    crm_connect: 'bg-[#FF6A00]/10 text-[#FF6A00]',
    crm_sync: 'bg-[#003ABC]/10 text-[#003ABC]',
    agent_dispatch: 'bg-[#7C3AED]/10 text-[#7C3AED]',
    crm_disconnect: 'bg-[#EF4444]/10 text-[#EF4444]',
    default: 'bg-[#F1F5F9] text-[#64748B]',
  }

  return (
    <div className="p-6 max-w-[1440px] mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1E293B]">CRM Dashboard</h1>
          <p className="text-sm text-[#64748B] mt-0.5">AI-powered customer relationship management</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-[#22C55E]/10 text-[#16A34A] border-0 rounded-lg px-3 py-1 text-xs font-medium">
            <span className="status-dot status-dot-success mr-1.5" style={{ width: 6, height: 6 }} />
            {connections.filter((c) => c.connected).length}/{connections.length} Connected
          </Badge>
          <Button className="alo-btn-primary px-4 h-9 text-sm gap-2">
            <Zap className="w-4 h-4" />
            Run AI Analysis
          </Button>
        </div>
      </div>

      {/* ===== Top Stats Row ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {topStats.map((stat) => {
          const Icon = stat.icon
          return (
            <div
              key={stat.label}
              className="alo-card p-5 border-l-4 alo-lift cursor-default"
              style={{ borderLeftColor: stat.accent }}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-[#64748B] uppercase tracking-wide">{stat.label}</p>
                  <p className="text-2xl font-bold text-[#1E293B]">{stat.value}</p>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-[#94A3B8]">{stat.change}</span>
                  </div>
                </div>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stat.iconBg}`}>
                  <Icon className={`w-5 h-5 ${stat.iconColor}`} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ===== Main Content: 3 Columns ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Column 1: Activity Feed (wide) */}
        <div className="lg:col-span-5">
          <div className="alo-card h-full">
            <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-[#FF6A00]" />
                <h2 className="text-sm font-semibold text-[#1E293B]">Activity Feed</h2>
                <Badge className="bg-[#FF6A00]/10 text-[#FF6A00] border-0 rounded text-[10px] px-1.5 py-0">LIVE</Badge>
              </div>
              <span className="text-xs text-[#94A3B8]">{recentActivities.length} recent</span>
            </div>
            <div className="p-4 space-y-1 max-h-[420px] overflow-y-auto">
              {recentActivities.length === 0 ? (
                <p className="text-sm text-[#94A3B8] text-center py-8">No recent activity</p>
              ) : (
                recentActivities.map((item) => (
                  <div key={item.id} className="flex items-start gap-3 p-3 rounded-xl hover:bg-[#F8FAFC] transition-colors group">
                    <Avatar className="w-9 h-9 flex-shrink-0 border border-[#E2E8F0]">
                      <AvatarFallback className={`text-[9px] font-bold rounded-lg ${agentColorMap[item.action] || agentColorMap.default}`}>
                        {(item.user?.name || item.action).slice(0, 3).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-xs font-semibold text-[#1E293B]">{item.user?.name || 'System'}</span>
                        <Badge className="text-[8px] py-0 px-1 bg-[#F1F5F9] text-[#94A3B8] border-0 rounded capitalize">{item.action}</Badge>
                      </div>
                      <p className="text-xs text-[#64748B] leading-relaxed">
                        {item.resource}
                      </p>
                      <div className="flex items-center gap-1 mt-1">
                        <Clock className="w-3 h-3 text-[#94A3B8]" />
                        <span className="text-[10px] text-[#94A3B8]">{timeAgo(item.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Column 2: Task Pipeline */}
        <div className="lg:col-span-4">
          <div className="alo-card h-full">
            <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#003ABC]" />
                <h2 className="text-sm font-semibold text-[#1E293B]">Task Pipeline</h2>
              </div>
              <span className="text-xs text-[#94A3B8]">{stats?.tasks.total || 0} total</span>
            </div>
            <div className="p-4 space-y-3">
              {pipelineStages.map((stage) => (
                <div key={stage.name} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CircleDot className="w-3 h-3" style={{ color: stage.color }} />
                      <span className="text-xs font-medium text-[#1E293B]">{stage.name}</span>
                    </div>
                    <span className="text-xs font-semibold text-[#1E293B]">{stage.count} tasks</span>
                  </div>
                  <div className="h-2 bg-[#F1F5F9] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(2, (stage.count / maxTasks) * 100)}%`,
                        backgroundColor: stage.color,
                      }}
                    />
                  </div>
                </div>
              ))}

              <div className="mt-4 pt-4 border-t border-[#E2E8F0]">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#64748B]">Active Agents</span>
                  <span className="font-bold text-[#003ABC]">{stats?.agents.active || 0}</span>
                </div>
                <div className="flex items-center justify-between text-xs mt-1">
                  <span className="text-[#64748B]">Workflows</span>
                  <span className="font-bold text-[#FF6A00]">{stats?.infrastructure.workflows || 0}</span>
                </div>
                <div className="flex items-center justify-between text-xs mt-1">
                  <span className="text-[#64748B]">Blocked Actions</span>
                  <span className="font-bold text-red-500">{stats?.security.blockedActions || 0}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Column 3: AI Agent Quick Actions */}
        <div className="lg:col-span-3">
          <div className="alo-card h-full">
            <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#FF6A00]" />
              <h2 className="text-sm font-semibold text-[#1E293B]">AI Agent Actions</h2>
            </div>
            <div className="p-4 grid grid-cols-1 gap-2">
              {quickActions.map((action) => {
                const Icon = action.icon
                const isActive = activeQuickAction === action.label
                return (
                  <button
                    key={action.label}
                    onClick={() => handleQuickAction(action.label)}
                    disabled={!!isActive}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 text-left w-full ${
                      action.variant === 'primary'
                        ? 'bg-[#FF6A00] text-white hover:bg-[#E5600A] shadow-sm hover:shadow-md'
                        : action.variant === 'secondary'
                          ? 'bg-[#003ABC]/5 text-[#003ABC] border border-[#003ABC]/20 hover:bg-[#003ABC]/10 hover:border-[#003ABC]/30'
                          : 'bg-[#F8FAFC] text-[#64748B] border border-[#E2E8F0] hover:bg-[#F1F5F9] hover:text-[#1E293B]'
                    } ${isActive ? 'opacity-70 cursor-wait' : ''}`}
                  >
                    <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'animate-spin' : ''}`} />
                    <span className="text-xs">{action.label}</span>
                    {isActive && (
                      <span className="ml-auto text-[10px] opacity-70">Running...</span>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="mx-4 mb-4 p-3 bg-gradient-to-br from-[#FF6A00]/5 to-[#003ABC]/5 rounded-xl border border-[#E2E8F0]">
              <div className="flex items-center gap-2">
                <div className="flex -space-x-1.5">
                  {stats?.topAgents?.slice(0, 5).map((a, i) => (
                    <div key={a.agentName} className={`w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold border-2 border-white ${
                      i % 2 === 0 ? 'bg-[#FF6A00] text-white' : 'bg-[#003ABC] text-white'
                    }`}>
                      {a.agentName.slice(0, 2).toUpperCase()}
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#1E293B]">{stats?.agents.active || 0} agents active</p>
                  <p className="text-[10px] text-[#94A3B8]">{stats?.infrastructure.skills || 0} skills loaded</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== CRM Connections Table ===== */}
      <div className="alo-card">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plug className="w-4 h-4 text-[#FF6A00]" />
            <h2 className="text-sm font-semibold text-[#1E293B]">CRM Connections</h2>
            <Badge className="bg-[#003ABC]/10 text-[#003ABC] border-0 rounded text-[10px] px-1.5 py-0">
              {connections.filter((c) => c.connected).length} connected
            </Badge>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-[#E2E8F0] hover:bg-transparent">
                <TableHead className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider py-3 pl-5">Company</TableHead>
                <TableHead className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider py-3">Status</TableHead>
                <TableHead className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider py-3 hidden md:table-cell">Usage</TableHead>
                <TableHead className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider py-3 hidden lg:table-cell">Protocol</TableHead>
                <TableHead className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider py-3 hidden sm:table-cell">Capabilities</TableHead>
                <TableHead className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider py-3 pr-5 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {connections.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-[#94A3B8] py-12 text-sm">No CRM connections</TableCell>
                </TableRow>
              ) : (
                connections.map((conn) => (
                  <TableRow key={conn.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors">
                    <TableCell className="py-3 pl-5">
                      <div className="flex items-center gap-3">
                        <Avatar className="w-8 h-8 border border-[#E2E8F0]">
                          <AvatarFallback className="bg-[#003ABC]/10 text-[#003ABC] text-[10px] font-bold rounded-lg">
                            {conn.companyName.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <span className="text-sm font-medium text-[#1E293B]">{conn.companyName}</span>
                          {conn.domain && (
                            <p className="text-[10px] text-[#94A3B8]">{conn.domain}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      {conn.connected ? (
                        <Badge className="bg-green-500/10 text-green-600 border-0 rounded text-[10px] px-2 py-0.5">
                          <Wifi className="w-3 h-3 mr-1" />
                          Connected
                        </Badge>
                      ) : (
                        <Badge className="bg-red-500/10 text-red-500 border-0 rounded text-[10px] px-2 py-0.5">
                          <WifiOff className="w-3 h-3 mr-1" />
                          Disconnected
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="py-3 hidden md:table-cell">
                      <div className="flex flex-col">
                        <span className="text-xs text-[#1E293B] font-medium">{conn.stats.usageCount} / {conn.stats.monthlyUsageLimit}</span>
                        <div className="w-20 h-1.5 bg-[#F1F5F9] rounded-full overflow-hidden mt-1">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(100, conn.stats.usagePercent)}%`,
                              backgroundColor: conn.stats.usagePercent > 80 ? '#EF4444' : conn.stats.usagePercent > 50 ? '#FF6A00' : '#22C55E',
                            }}
                          />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-xs text-[#64748B] hidden lg:table-cell">{conn.connectionDetails.protocol}</TableCell>
                    <TableCell className="py-3 hidden sm:table-cell">
                      <div className="flex flex-wrap gap-1 max-w-[180px]">
                        {conn.capabilities.slice(0, 3).map((cap) => (
                          <Badge
                            key={cap.name}
                            className={`text-[8px] py-0 px-1.5 border-0 rounded ${
                              cap.enabled
                                ? 'bg-[#003ABC]/10 text-[#003ABC]'
                                : 'bg-gray-100 text-gray-400'
                            }`}
                          >
                            {cap.name}
                          </Badge>
                        ))}
                        {conn.capabilities.length > 3 && (
                          <span className="text-[10px] text-[#94A3B8]">+{conn.capabilities.length - 3}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-3 pr-5 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-[#94A3B8] hover:text-[#1E293B] hover:bg-[#F1F5F9] rounded-lg">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 bg-white border-[#E2E8F0] rounded-xl shadow-lg">
                          <DropdownMenuItem
                            className="text-[#1E293B] text-sm rounded-lg cursor-pointer hover:bg-[#F8FAFC]"
                            onClick={() => handleCrmAction(conn.id, conn.connected ? 'disconnect' : 'connect', conn.companyName)}
                          >
                            {conn.connected ? (
                              <><WifiOff className="w-4 h-4 mr-2 text-red-500" />Disconnect</>
                            ) : (
                              <><Wifi className="w-4 h-4 mr-2 text-green-500" />Connect</>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-[#1E293B] text-sm rounded-lg cursor-pointer hover:bg-[#F8FAFC]"
                            onClick={() => handleCrmAction(conn.id, 'sync', conn.companyName)}
                            disabled={!conn.connected}
                          >
                            {syncingId === conn.id ? (
                              <Loader2 className="w-4 h-4 mr-2 text-[#003ABC] animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4 mr-2 text-[#003ABC]" />
                            )}
                            Sync Data
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-[#1E293B] text-sm rounded-lg cursor-pointer hover:bg-[#F8FAFC]"
                            onClick={() => handleCrmAction(conn.id, 'test', conn.companyName)}
                          >
                            <Shield className="w-4 h-4 mr-2 text-[#7C3AED]" />
                            Test Connection
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}