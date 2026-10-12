'use client'

import { useEffect, useState } from 'react'
import {
  Activity,
  Database,
  Server,
  ShieldCheck,
  Zap,
  BarChart3,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Bot,
  Building2,
  Key,
  GitBranch,
  ClipboardCheck,
  FileText,
  Settings,
  Cpu,
  UserCheck,
  KeyRound,
  Eye,
  Wrench,
  ShieldAlert,
  Lock,
  Check,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface HealthStatus {
  service: string
  status: 'healthy' | 'degraded' | 'down'
  responseMs: number | null
  details: string | null
  updatedAt: string
}

interface SystemStats {
  agents_count: number
  departments_count: number
  companies_count: number
  active_api_keys: number
  workflows_count: number
  skills_count: number
  pending_approvals: number
  audit_events_24h: number
}

interface AuditEvent {
  id: string
  action: string
  resource: string
  details: string
  createdAt: string
  user?: { name: string }
}

interface ConfigRule {
  key: string
  label: string
  enabled: boolean
  description: string
}

const SERVICE_ICONS: Record<string, React.ElementType> = {
  Database: Database,
  'Agent Registry': Bot,
  'API Gateway': Server,
  'Auth Service': ShieldCheck,
  'Usage Tracker': BarChart3,
  'Audit Logger': FileText,
}

const FLOW_STEPS = [
  { label: 'Sister Company', icon: Building2, color: 'bg-[#003ABC]', detail: 'Request initiated' },
  { label: 'API Key', icon: Key, color: 'bg-blue-500', detail: 'Authentication' },
  { label: 'ALO Labs Gateway', icon: Server, color: 'bg-[#FF6A00]', detail: 'Request routing' },
  { label: 'Tenant Validation', icon: ShieldCheck, color: 'bg-violet-500', detail: 'Isolation check' },
  { label: 'Agent Selection', icon: Bot, color: 'bg-purple-500', detail: 'Route to agent' },
  { label: 'Protection Mode', icon: ShieldAlert, color: 'bg-fuchsia-500', detail: 'Safety rules' },
  { label: 'Payment Guard', icon: ClipboardCheck, color: 'bg-pink-500', detail: 'Cost control' },
  { label: 'Execution', icon: Zap, color: 'bg-[#FF6A00]', detail: 'Agent runs' },
  { label: 'Result', icon: CheckCircle2, color: 'bg-green-500', detail: 'Response sent' },
  { label: 'Usage/Audit Logs', icon: FileText, color: 'bg-teal-500', detail: 'Usage tracked' },
]

const CONFIG_RULES: ConfigRule[] = [
  { key: 'CENTRAL_HUB_ONLY', label: 'Central Hub Only', enabled: true, description: 'All agent requests must route through ALO Labs central hub' },
  { key: 'TENANT_ISOLATION', label: 'Tenant Isolation', enabled: true, description: 'Strict data isolation between sister companies' },
  { key: 'PROTECTION_MODE', label: 'Protection Mode', enabled: true, description: 'Agent output protection and safety rules enforcement' },
  { key: 'PAYMENT_GUARD', label: 'Payment Guard', enabled: true, description: 'Block unauthorized paid API calls and external costs' },
  { key: 'LOCAL_FIRST', label: 'Local First', enabled: true, description: 'Prefer local execution before external API calls' },
  { key: 'AUDIT_LOGGING', label: 'Audit Logging', enabled: true, description: 'Log all actions for compliance and accountability' },
  { key: 'HUMAN_APPROVAL', label: 'Human Approval', enabled: true, description: 'Require human approval for critical operations' },
  { key: 'PAID_AI_API', label: 'Paid AI API', enabled: false, description: 'Allow external paid AI API calls (disabled by default)' },
]

export default function SystemHealthPanel() {
  const [healthStatuses, setHealthStatuses] = useState<HealthStatus[]>([])
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null)
  const [recentEvents, setRecentEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<string>('')

  const loadHealthData = () => {
    Promise.all([
      fetch('/api/system-health?deep=true').then((r) => r.json()),
      fetch('/api/system-health').then((r) => r.json()),
    ])
      .then(([deepRes, healthRes]) => {
        const deepData = deepRes.data || deepRes
        const healthData = healthRes.data || healthRes

        setHealthStatuses(deepData.services || deepRes.services || [])

        const stats: SystemStats = {
          agents_count: healthData.agents_count || healthRes.agents_count || 0,
          departments_count: healthData.departments_count || healthRes.departments_count || 0,
          companies_count: healthData.companies_count || healthRes.companies_count || 0,
          active_api_keys: healthData.active_api_keys || healthRes.active_api_keys || 0,
          workflows_count: healthData.workflows_count || healthRes.workflows_count || 0,
          skills_count: healthData.skills_count || healthRes.skills_count || 0,
          pending_approvals: healthData.pending_approvals || healthRes.pending_approvals || 0,
          audit_events_24h: healthData.audit_events_24h || healthRes.audit_events_24h || 0,
        }
        setSystemStats(stats)

        // Update config rules from health response
        const merged = { ...deepData, ...healthData }
        CONFIG_RULES.forEach((rule) => {
          const key = rule.key as keyof typeof merged
          if (key in merged && typeof merged[key] === 'boolean') {
            rule.enabled = merged[key]
          }
        })

        setRecentEvents(deepData.recentEvents || deepRes.recentEvents || [])
        setLastRefresh(new Date().toLocaleTimeString())
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadHealthData()
    const interval = setInterval(loadHealthData, 30000)
    return () => clearInterval(interval)
  }, [])

  const statusDot = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-green-500'
      case 'degraded': return 'bg-amber-500'
      case 'down': return 'bg-red-500'
      default: return 'bg-gray-300'
    }
  }

  const statusLabel = (status: string) => {
    switch (status) {
      case 'healthy': return <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px] py-0">Healthy</Badge>
      case 'degraded': return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px] py-0">Degraded</Badge>
      case 'down': return <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px] py-0">Down</Badge>
      default: return <Badge className="bg-gray-100 text-gray-500 border-gray-200 text-[10px] py-0">Unknown</Badge>
    }
  }

  const actionColor = (action: string) => {
    switch (action) {
      case 'create': return 'bg-green-100 text-green-700'
      case 'update': return 'bg-blue-100 text-blue-700'
      case 'delete': return 'bg-red-100 text-red-700'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  if (loading && !systemStats) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48 bg-gray-100 rounded-lg" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl bg-gray-100" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl bg-gray-100" />
      </div>
    )
  }

  const allHealthy = healthStatuses.length > 0 && healthStatuses.every((s) => s.status === 'healthy')
  const hasDown = healthStatuses.some((s) => s.status === 'down')

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#003ABC]/10 flex items-center justify-center">
            <Activity className="w-5 h-5 text-[#003ABC]" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold text-[#1E293B]">System Health</h2>
              {/* Large animated pulse dot */}
              <div className="relative flex items-center justify-center">
                <div
                  className={`w-4 h-4 rounded-full ${allHealthy ? 'bg-green-500' : hasDown ? 'bg-red-500' : 'bg-amber-500'}`}
                  style={{
                    animation: 'pulse-ring 2s ease-in-out infinite',
                    boxShadow: allHealthy
                      ? '0 0 0 0 rgba(34, 197, 94, 0.5)'
                      : hasDown
                      ? '0 0 0 0 rgba(239, 68, 68, 0.5)'
                      : '0 0 0 0 rgba(245, 158, 11, 0.5)',
                  }}
                />
                <div
                  className={`absolute w-4 h-4 rounded-full ${allHealthy ? 'bg-green-500' : hasDown ? 'bg-red-500' : 'bg-amber-500'} animate-ping opacity-30`}
                />
              </div>
              <span className={`text-xs font-medium ${allHealthy ? 'text-green-600' : hasDown ? 'text-red-600' : 'text-amber-600'}`}>
                {allHealthy ? 'All Systems Operational' : hasDown ? 'System Issues Detected' : 'Partial Degradation'}
              </span>
            </div>
            <p className="text-xs text-[#94A3B8]">
              Real-time system telemetry and configuration status
              {lastRefresh && <span className="ml-2">· Updated {lastRefresh}</span>}
            </p>
          </div>
        </div>
        <Button onClick={loadHealthData} variant="outline" className="rounded-lg border-[#E2E8F0] text-[#1E293B] hover:bg-[#F8FAFC]">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Service Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {healthStatuses.map((service) => {
          const Icon = SERVICE_ICONS[service.service] || Server
          return (
            <div key={service.service} className="bg-white border border-[#E2E8F0] rounded-xl p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  service.status === 'healthy' ? 'bg-green-50' : service.status === 'degraded' ? 'bg-amber-50' : 'bg-red-50'
                }`}>
                  <Icon className={`w-4 h-4 ${
                    service.status === 'healthy' ? 'text-green-600' : service.status === 'degraded' ? 'text-amber-600' : 'text-red-600'
                  }`} />
                </div>
                <div className={`w-2.5 h-2.5 rounded-full ${statusDot(service.status)} ${service.status === 'healthy' ? 'animate-pulse' : ''}`} />
              </div>
              <p className="text-sm font-medium text-[#1E293B]">{service.service}</p>
              {statusLabel(service.status)}
              {service.responseMs && (
                <p className="text-[10px] text-[#94A3B8] mt-1">{service.responseMs}ms</p>
              )}
            </div>
          )
        })}
      </div>

      {/* System Overview - 8 stat cards */}
      {systemStats && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-6">
          <h3 className="text-sm font-semibold text-[#1E293B] mb-4">System Overview</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
            {[
              { label: 'Total Agents', value: systemStats.agents_count, icon: Bot, color: 'text-[#003ABC]', bg: 'bg-[#003ABC]/10' },
              { label: 'Departments', value: systemStats.departments_count, icon: Settings, color: 'text-blue-500', bg: 'bg-blue-50' },
              { label: 'Companies', value: systemStats.companies_count, icon: Building2, color: 'text-green-600', bg: 'bg-green-50' },
              { label: 'Active API Keys', value: systemStats.active_api_keys, icon: KeyRound, color: 'text-[#FF6A00]', bg: 'bg-[#FF6A00]/10' },
              { label: 'Workflows', value: systemStats.workflows_count, icon: GitBranch, color: 'text-purple-500', bg: 'bg-purple-50' },
              { label: 'Skills', value: systemStats.skills_count, icon: Cpu, color: 'text-teal-500', bg: 'bg-teal-50' },
              { label: 'Pending Approvals', value: systemStats.pending_approvals, icon: UserCheck, color: 'text-amber-600', bg: 'bg-amber-50' },
              { label: 'Audit Events (24h)', value: systemStats.audit_events_24h, icon: Eye, color: 'text-red-500', bg: 'bg-red-50' },
            ].map((s) => (
              <div key={s.label} className="bg-[#F8FAFC] rounded-lg p-3">
                <div className={`w-7 h-7 rounded-lg ${s.bg} flex items-center justify-center mb-2`}>
                  <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
                </div>
                <p className="text-lg font-bold text-[#1E293B]">{s.value.toLocaleString()}</p>
                <p className="text-[10px] text-[#94A3B8] mt-0.5 leading-tight">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Architecture Flow Diagram */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6">
        <h3 className="text-sm font-semibold text-[#1E293B] mb-1">Request Architecture Flow</h3>
        <p className="text-[11px] text-[#94A3B8] mb-4">Every sister company request follows this secured pipeline from initiation to audit logging.</p>
        <div className="overflow-x-auto pb-2">
          <div className="flex items-start gap-1.5 min-w-max">
            {FLOW_STEPS.map((step, idx) => {
              const Icon = step.icon
              return (
                <div key={step.label} className="flex items-start gap-1.5">
                  <div className="flex flex-col items-center gap-1.5">
                    <div className={`w-12 h-12 rounded-xl ${step.color} flex items-center justify-center shadow-sm`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <p className="text-[10px] text-[#1E293B] font-medium text-center max-w-[90px] leading-tight">
                      {step.label}
                    </p>
                    <p className="text-[9px] text-[#94A3B8] text-center max-w-[90px]">{step.detail}</p>
                  </div>
                  {idx < FLOW_STEPS.length - 1 && (
                    <div className="flex items-center pt-5">
                      <div className="w-6 h-[2px] bg-[#E2E8F0]" />
                      <div className="w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-l-[6px] border-l-[#E2E8F0]" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Operating Rules */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#1E293B]">Operating Rules</h3>
          <Badge variant="secondary" className="text-[10px] bg-[#F8FAFC] text-[#64748B]">
            {CONFIG_RULES.filter((r) => r.enabled).length}/{CONFIG_RULES.length} active
          </Badge>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {CONFIG_RULES.map((rule) => (
              <div
                key={rule.key}
                className={`border rounded-xl p-3.5 transition-colors ${
                  rule.enabled
                    ? 'bg-green-50/50 border-green-200 hover:bg-green-50'
                    : 'bg-gray-50/50 border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2.5 mb-1.5">
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${
                    rule.enabled ? 'bg-green-100' : 'bg-gray-100'
                  }`}>
                    {rule.enabled ? (
                      <Check className="w-3.5 h-3.5 text-green-600" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-gray-400" />
                    )}
                  </div>
                  <p className={`text-xs font-semibold ${rule.enabled ? 'text-green-700' : 'text-gray-500'}`}>
                    {rule.label}
                  </p>
                </div>
                <div className="ml-[30px]">
                  <code className="text-[9px] text-[#94A3B8] font-mono bg-[#F8FAFC] px-1.5 py-0.5 rounded">
                    {rule.key}
                  </code>
                  <p className="text-[11px] text-[#64748B] mt-1 leading-tight">{rule.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Events - last 10 */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#1E293B]">Recent Events</h3>
          <Badge variant="secondary" className="text-[10px] bg-[#F8FAFC] text-[#64748B]">
            Last {Math.min(recentEvents.length, 10)} of {recentEvents.length} entries
          </Badge>
        </div>
        <div className="max-h-96 overflow-y-auto">
          <Table className="text-sm">
            <TableHeader>
              <TableRow className="bg-[#F8FAFC] hover:bg-[#F8FAFC] border-[#E2E8F0]">
                <TableHead className="text-[#64748B] font-medium text-xs">Time</TableHead>
                <TableHead className="text-[#64748B] font-medium text-xs">Action</TableHead>
                <TableHead className="text-[#64748B] font-medium text-xs">Resource</TableHead>
                <TableHead className="text-[#64748B] font-medium text-xs">User</TableHead>
                <TableHead className="text-[#64748B] font-medium text-xs">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentEvents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-[#94A3B8] py-8 text-xs">No recent events</TableCell>
                </TableRow>
              ) : (
                recentEvents.slice(0, 10).map((event) => (
                  <TableRow key={event.id} className="border-[#E2E8F0]/50 hover:bg-[#F8FAFC]">
                    <TableCell className="text-[#94A3B8] text-[11px] whitespace-nowrap">
                      <Clock className="w-3 h-3 inline mr-1" />
                      {new Date(event.createdAt).toLocaleTimeString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={`text-[9px] py-0 ${actionColor(event.action)}`}>
                        {event.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[#1E293B] text-xs max-w-[120px] truncate">{event.resource}</TableCell>
                    <TableCell className="text-[#64748B] text-xs">{event.user?.name || '—'}</TableCell>
                    <TableCell className="text-[#94A3B8] text-[11px] max-w-[180px] truncate">{event.details}</TableCell>
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