'use client'

import { useEffect, useState } from 'react'
import { Bot, Building2, FolderTree, ClipboardList, CheckSquare, Zap, Activity, Shield, CreditCard } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useAppStore } from '@/store/app'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

interface DashboardStats {
  agents: { total: number; byStatus: Record<string, number> }
  companies: { active: number; total: number }
  usage: { today: number; total: number; totalTokens: number; byCompanyToday: { companyName: string; logs: number; tokens: number }[] }
  tasks: { total: number; completed: number; failed: number; pending: number; inProgress: number }
  security: { pendingApprovals: number; blockedActions: number; paymentGuardBlocked: number; protectionBlocked: number }
  infrastructure: { workflows: number; departments: number; skills: number }
  topDepartments: { name: string; agentCount: number; slug: string }[]
  recentAuditLogs: { id: string; action: string; resource: string; details: string; createdAt: string; user?: { name: string } }[]
}

interface HealthData {
  status: string
  payment_guard_enabled: boolean
  protection_mode_enabled: boolean
  self_improvement_enabled: boolean
  productivity_mode_enabled: boolean
  rag_enabled: boolean
  paid_ai_api_allowed: boolean
  central_agent_hub_enabled: boolean
  multi_company_routing_enabled: boolean
  company_usage_tracking_enabled: boolean
  selected_agent_runtime_enabled: boolean
  web_crm_auto_connected: boolean
  all_sister_companies_connected: boolean
}

const CHART_COLORS = ['#2563EB', '#22D3EE', '#7C3AED', '#22C55E', '#F59E0B', '#EF4444', '#EC4899', '#F97316']

export default function CommandCenter() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [health, setHealth] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/dashboard/stats').then((r) => r.json()),
      fetch('/api/health').then((r) => r.json()),
    ])
      .then(([statsRes, healthRes]) => {
        setStats(statsRes)
        setHealth(healthRes)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48 bg-[#F8FAFC]" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg bg-gray-50" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-lg bg-gray-50" />
      </div>
    )
  }

  const statCards = [
    { icon: Bot, label: 'Total Agents', value: stats?.agents.total ?? 0, color: 'text-[#003ABC]' },
    { icon: FolderTree, label: 'Departments', value: stats?.infrastructure.departments ?? 0, color: 'text-[#FF6A00]' },
    { icon: Building2, label: 'Companies', value: stats?.companies.total ?? 0, color: 'text-[#003ABC]' },
    { icon: ClipboardList, label: 'Active Tasks', value: stats?.tasks.inProgress ?? 0, color: 'text-amber-600' },
    { icon: CheckSquare, label: 'Pending Approvals', value: stats?.security.pendingApprovals ?? 0, color: 'text-red-600' },
    { icon: Zap, label: 'Usage Today', value: stats?.usage.today ?? 0, color: 'text-emerald-600' },
  ]

  const chartData = (stats?.usage.byCompanyToday || []).map((c, i) => ({
    name: c.companyName?.replace('ALO ', '') || 'Unknown',
    logs: c.logs,
    tokens: c.tokens,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }))

  const healthItems = health
    ? [
        { label: 'Payment Guard', value: health.payment_guard_enabled },
        { label: 'Protection Mode', value: health.protection_mode_enabled },
        { label: 'Self-Improvement', value: health.self_improvement_enabled },
        { label: 'Productivity Mode', value: health.productivity_mode_enabled },
        { label: 'RAG Memory', value: health.rag_enabled },
        { label: 'Agent Hub', value: health.central_agent_hub_enabled },
        { label: 'Multi-Company Routing', value: health.multi_company_routing_enabled },
        { label: 'Usage Tracking', value: health.company_usage_tracking_enabled },
        { label: 'Agent Runtime', value: health.selected_agent_runtime_enabled },
        { label: 'Web CRM Connected', value: health.web_crm_auto_connected },
        { label: 'Sister Companies', value: health.all_sister_companies_connected },
      ]
    : []

  return (
    <div className="space-y-6 p-6">
      <h2 className="text-xl font-semibold text-[#1E293B]">Command Center</h2>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.label} className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm hover:shadow-md transition-shadow p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-[#64748B]" />
                <span className="text-xs text-[#64748B]">{card.label}</span>
              </div>
              <p className="text-3xl font-bold text-[#003ABC]">{card.value.toLocaleString()}</p>
            </div>
          )
        })}
      </div>

      {/* Second row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Company Usage Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-[#E2E8F0] p-4">
          <h3 className="text-sm font-semibold text-[#1E293B] mb-4">Company Usage (Today)</h3>
          <div className="h-64">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(37,99,235,0.1)" />
                  <XAxis dataKey="name" tick={{ fill: '#94A3B8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#F8FAFC' }}
                  />
                  <Bar dataKey="logs" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-[#64748B] text-sm">No usage data yet</div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
          <h3 className="text-sm font-semibold text-[#1E293B] mb-4">Recent Activity</h3>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {stats?.recentAuditLogs?.length ? (
              stats.recentAuditLogs.slice(0, 5).map((log) => (
                <div key={log.id} className="flex items-start gap-2 text-xs">
                  <Activity className="w-3 h-3 text-[#FF6A00] mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[#1E293B] truncate">
                      <span className="text-[#003ABC]">{log.action}</span> on {log.resource}
                    </p>
                    <p className="text-[#64748B]">
                      {log.user?.name || 'System'} · {new Date(log.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-[#64748B] text-xs text-center py-8">No recent activity</p>
            )}
          </div>
        </div>
      </div>

      {/* Third row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Departments */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
          <h3 className="text-sm font-semibold text-[#1E293B] mb-4">Top Departments by Agents</h3>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {stats?.topDepartments?.length ? (
              stats.topDepartments.map((dept, i) => {
                const maxCount = stats.topDepartments[0]?.agentCount || 1
                const pct = Math.round((dept.agentCount / maxCount) * 100)
                return (
                  <div key={dept.slug} className="flex items-center gap-3">
                    <span className="text-xs text-[#64748B] w-4 text-right">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-[#1E293B] truncate">{dept.name}</span>
                        <span className="text-xs text-[#003ABC] font-medium">{dept.agentCount}</span>
                      </div>
                      <div className="h-1.5 bg-[#F8FAFC] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#FF6A00] to-[#003ABC] rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })
            ) : (
              <p className="text-[#64748B] text-xs text-center py-8">No departments</p>
            )}
          </div>
        </div>

        {/* System Health */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[#1E293B]">System Health</h3>
            <Badge variant={health?.status === 'healthy' ? 'default' : 'destructive'} className={health?.status === 'healthy' ? 'bg-emerald-600/10 text-emerald-600' : ''}>
              {health?.status || 'unknown'}
            </Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {healthItems.map((item) => (
              <div key={item.label} className="flex items-center gap-2 py-1.5 px-2 rounded-md bg-gray-50">
                <span className={`status-dot ${item.value ? 'status-dot-active' : 'status-dot-error'}`} />
                <span className="text-xs text-[#1E293B]">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}