'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Wifi, WifiOff, RefreshCw, Send, TestTube2, ChevronDown, ChevronUp,
  Building2, Globe, Activity, Zap, Shield, Database, ArrowRightLeft,
  CheckCircle2, XCircle, Clock, Loader2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'

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
  recentActivity: { id: string; action: string; timestamp: string; status: string; tokens: number }[]
  capabilities: { name: string; enabled: boolean }[]
}

interface Summary {
  totalCompanies: number
  connected: number
  disconnected: number
  totalUsage: number
  overallSyncStatus: string
}

export default function CrmConnectionsPanel() {
  const [connections, setConnections] = useState<CrmConnection[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [dispatchForm, setDispatchForm] = useState<Record<string, { count: number; dept: string; cmd: string }>>({})
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/crm-connections')
      const json = await res.json()
      setConnections(json.data || [])
      setSummary(json.summary || null)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const handleAction = async (companyId: string, action: string, config?: object) => {
    setActionLoading(`${companyId}-${action}`)
    try {
      const res = await fetch('/api/crm-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, action, config }),
      })
      const json = await res.json()
      if (json.success) {
        showToast(json.message)
        fetchData()
      } else {
        showToast(json.error || 'Action failed')
      }
    } catch {
      showToast('Network error')
    }
    finally { setActionLoading(null) }
  }

  const handleToggleConnection = async (companyId: string, currentConnected: boolean) => {
    await handleAction(companyId, currentConnected ? 'disconnect' : 'connect')
  }

  const handleDispatch = async (companyId: string) => {
    const form = dispatchForm[companyId] || { count: 10, dept: '', cmd: '' }
    await handleAction(companyId, 'dispatch', {
      command: form.cmd || `Dispatch ${form.count} agents`,
      departmentSlug: form.dept || undefined,
      agentCount: form.count,
    })
    setDispatchForm((prev) => ({ ...prev, [companyId]: { count: 10, dept: '', cmd: '' } }))
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64 bg-[#F8FAFC]" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg bg-gray-50" />
          ))}
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-lg bg-gray-50" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-white rounded-xl border border-[#E2E8F0] px-4 py-3 text-sm text-[#1E293B] border border-[#FF6A00]/30 ">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <ArrowRightLeft className="w-6 h-6 text-[#003ABC]" />
          <h2 className="text-xl font-semibold text-[#1E293B]">CRM Connections</h2>
          <Badge className={summary?.overallSyncStatus === 'all_synced' ? 'bg-emerald-600/10 text-emerald-600' : 'bg-amber-600/10 text-amber-600'}>
            {summary?.overallSyncStatus === 'all_synced' ? 'All Synced' : 'Partial Sync'}
          </Badge>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} className="border-[#E2E8F0] text-[#64748B] hover:text-[#003ABC]">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>

      {/* Architecture Overview */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
        <h3 className="text-sm font-semibold text-[#1E293B] mb-4 flex items-center gap-2">
          <Database className="w-4 h-4 text-[#003ABC]" />
          How Agent Hub Connects to Sister Company CRMs
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="space-y-2">
            <p className="text-[#003ABC] font-semibold uppercase tracking-wider text-[10px]">1. Hub Registers Company</p>
            <p className="text-[#64748B]">Each sister company (ALO Education, English AI, ICLA, TECH360, etc.) is registered in the Hub with its domain and API credentials.</p>
          </div>
          <div className="space-y-2">
            <p className="text-[#FF6A00] font-semibold uppercase tracking-wider text-[10px]">2. Bidirectional Data Flow</p>
            <p className="text-[#64748B]">The Hub sends <span className="text-[#003ABC]">agents &amp; workflows</span> to the company CRM. The CRM sends back <span className="text-[#FF6A00]">leads, contacts, deals</span> to the Hub for AI processing.</p>
          </div>
          <div className="space-y-2">
            <p className="text-emerald-600 font-semibold uppercase tracking-wider text-[10px]">3. Agents Work in CRM</p>
            <p className="text-[#64748B]">Dispatched agents perform lead scoring, auto follow-ups, contact enrichment, deal prediction, and email automation directly in the sister company&apos;s CRM.</p>
          </div>
        </div>

        {/* Visual flow */}
        <div className="mt-4 p-3 rounded-lg bg-gray-50 border border-[#E2E8F0]">
          <div className="flex items-center justify-center gap-2 flex-wrap text-xs">
            <span className="px-2 py-1 rounded bg-[#FF6A00]/10 text-[#FF6A00] font-medium">Agent Hub</span>
            <ArrowRightLeft className="w-4 h-4 text-[#003ABC]" />
            <span className="px-2 py-1 rounded bg-[#F8FAFC] text-[#1E293B] font-medium">REST API + WebSocket</span>
            <ArrowRightLeft className="w-4 h-4 text-[#003ABC]" />
            <span className="px-2 py-1 rounded bg-emerald-600/10 text-emerald-600 font-medium">Sister Company CRM</span>
            <ArrowRightLeft className="w-4 h-4 text-[#003ABC]" />
            <span className="px-2 py-1 rounded bg-amber-600/10 text-amber-600 font-medium">Leads/Deals/Contacts</span>
            <ArrowRightLeft className="w-4 h-4 text-[#003ABC]" />
            <span className="px-2 py-1 rounded bg-[#003ABC]/10 text-[#003ABC] font-medium">AI Processing</span>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Companies', value: summary?.totalCompanies ?? 0, icon: Building2, color: 'text-[#FF6A00]' },
          { label: 'Connected', value: summary?.connected ?? 0, icon: Wifi, color: 'text-emerald-600' },
          { label: 'Disconnected', value: summary?.disconnected ?? 0, icon: WifiOff, color: 'text-red-600' },
          { label: 'Total Usage', value: summary?.totalUsage ?? 0, icon: Activity, color: 'text-[#003ABC]' },
        ].map((s) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="bg-white rounded-xl border border-[#E2E8F0] p-4 text-center">
              <Icon className={`w-5 h-5 mx-auto mb-2 ${s.color}`} />
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-[#64748B] mt-1">{s.label}</p>
            </div>
          )
        })}
      </div>

      {/* Company Connection Cards */}
      <div className="space-y-3">
        {connections.map((conn) => {
          const isExpanded = expandedId === conn.id
          const form = dispatchForm[conn.id] || { count: 10, dept: '', cmd: '' }
          const isLoading = actionLoading?.startsWith(conn.id)

          return (
            <div key={conn.id} className={`bg-white rounded-xl border border-[#E2E8F0] transition-all duration-300 ${conn.connected ? 'border-l-2 border-l-emerald-600/50' : 'border-l-2 border-l-red-600/30'}`}>
              {/* Header Row */}
              <div className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${conn.connected ? 'bg-emerald-600/10' : 'bg-[#F8FAFC]'}`}>
                    {conn.connected ? (
                      <Wifi className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <WifiOff className="w-5 h-5 text-red-600/60" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-[#1E293B]">{conn.companyName}</h3>
                      <Badge variant={conn.status === 'active' ? 'default' : 'secondary'} className={`text-[10px] py-0 ${conn.status === 'active' ? 'bg-emerald-600/10 text-emerald-600' : 'bg-gray-100 text-[#64748B]'}`}>
                        {conn.status}
                      </Badge>
                    </div>
                    {conn.domain && (
                      <div className="flex items-center gap-1 text-xs text-[#64748B]">
                        <Globe className="w-3 h-3" />
                        {conn.domain}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Connection Toggle */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#64748B] hidden sm:inline">{conn.connected ? 'Connected' : 'Disconnected'}</span>
                    <Switch
                      checked={conn.connected}
                      onCheckedChange={() => handleToggleConnection(conn.id, conn.connected)}
                      disabled={isLoading}
                    />
                  </div>

                  {/* Quick Actions */}
                  {conn.connected && (
                    <div className="hidden md:flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-[#64748B] hover:text-[#003ABC]"
                        onClick={() => handleAction(conn.id, 'sync')}
                        disabled={isLoading}
                        title="Sync"
                      >
                        {actionLoading === `${conn.id}-sync` ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-[#64748B] hover:text-[#003ABC]"
                        onClick={() => handleAction(conn.id, 'test')}
                        disabled={isLoading}
                        title="Test Connection"
                      >
                        {actionLoading === `${conn.id}-test` ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube2 className="w-4 h-4" />}
                      </Button>
                    </div>
                  )}

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-[#64748B] hover:text-[#1E293B]"
                    onClick={() => setExpandedId(isExpanded ? null : conn.id)}
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="px-4 pb-4 space-y-4 border-t border-[#E2E8F0] pt-4">
                  {/* Connection Info Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Connection Details */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#64748B]">Connection Details</p>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-[#64748B]">Endpoint</span>
                          <span className="text-[#1E293B] font-mono text-[11px] truncate ml-2">{conn.connectionDetails.crmEndpoint || 'Not set'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#64748B]">Protocol</span>
                          <span className="text-[#1E293B]">{conn.connectionDetails.protocol}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#64748B]">API Version</span>
                          <span className="text-[#1E293B]">{conn.connectionDetails.apiVersion}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#64748B]">Data Format</span>
                          <span className="text-[#1E293B]">{conn.connectionDetails.dataFormat}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#64748B]">Webhook Secret</span>
                          <span className="text-[#1E293B] font-mono">{conn.connectionDetails.webhookSecret || 'None'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#64748B]">Sync Status</span>
                          <Badge className={`text-[10px] py-0 ${conn.connectionDetails.syncStatus === 'synced' ? 'bg-emerald-600/10 text-emerald-600' : 'bg-red-600/10 text-red-600'}`}>
                            {conn.connectionDetails.syncStatus}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {/* Capabilities */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#64748B]">AI Capabilities</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {conn.capabilities.map((cap) => (
                          <div key={cap.name} className="flex items-center gap-1.5 text-xs">
                            {cap.enabled ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5 text-[#64748B]/40 flex-shrink-0" />
                            )}
                            <span className={cap.enabled ? 'text-[#1E293B]' : 'text-[#64748B]/50'}>{cap.name}</span>
                          </div>
                        ))}
                      </div>

                      {/* Usage */}
                      <div className="mt-3">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-[#64748B]">Usage</span>
                          <span className="text-[#1E293B]">{conn.stats.usageCount}/{conn.stats.monthlyUsageLimit}</span>
                        </div>
                        <div className="h-1.5 bg-[#F8FAFC] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${conn.stats.usagePercent > 80 ? 'bg-red-600' : 'bg-[#FF6A00]'}`}
                            style={{ width: `${Math.min(conn.stats.usagePercent, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Agent Dispatch */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-[#64748B]">Dispatch Agents to This CRM</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Input
                        placeholder="Command (e.g., Score all pending leads)"
                        value={form.cmd}
                        onChange={(e) => setDispatchForm((prev) => ({ ...prev, [conn.id]: { ...form, cmd: e.target.value } }))}
                        className="flex-1 min-w-[200px] h-8 bg-gray-50 border-[#E2E8F0] text-[#1E293B] text-xs"
                      />
                      <Input
                        type="number"
                        placeholder="Agents"
                        min={1}
                        max={50}
                        value={form.count}
                        onChange={(e) => setDispatchForm((prev) => ({ ...prev, [conn.id]: { ...form, count: parseInt(e.target.value) || 10 } }))}
                        className="w-20 h-8 bg-gray-50 border-[#E2E8F0] text-[#1E293B] text-xs"
                      />
                      <Button
                        size="sm"
                        className="h-8 bg-[#FF6A00]/10 text-[#003ABC] hover:bg-[#FF6A00]/10 border border-[#FF6A00]/30"
                        onClick={() => handleDispatch(conn.id)}
                        disabled={isLoading}
                      >
                        {actionLoading === `${conn.id}-dispatch` ? (
                          <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5 mr-1" />
                        )}
                        Dispatch
                      </Button>
                    </div>
                  </div>

                  {/* Recent Activity */}
                  {conn.recentActivity.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#64748B]">Recent Activity</p>
                      <div className="space-y-1">
                        {conn.recentActivity.map((act) => (
                          <div key={act.id} className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-[#F8FAFC]">
                            <Clock className="w-3 h-3 text-[#64748B]" />
                            <span className="text-[#1E293B]">{act.action}</span>
                            <Badge className={`text-[10px] py-0 ml-auto ${act.status === 'completed' ? 'bg-emerald-600/10 text-emerald-600' : 'bg-amber-600/10 text-amber-600'}`}>
                              {act.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}