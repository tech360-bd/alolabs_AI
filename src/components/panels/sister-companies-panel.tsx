'use client'

import { useEffect, useState } from 'react'
import {
  Building2,
  GraduationCap,
  Plane,
  Users,
  DollarSign,
  Megaphone,
  BookOpen,
  FlaskConical,
  Key,
  CheckCircle,
  AlertCircle,
  XCircle,
  Bot,
  Activity,
  Clock,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Shield,
  BarChart3,
  CreditCard,
  Settings,
  Zap,
  Globe,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'

// ── Types ───────────────────────────────────────────────────────────────────

interface AssignedAgent {
  id: string
  name: string
  role: string
  status: 'active' | 'idle' | 'busy'
}

interface ApiPermission {
  name: string
  enabled: boolean
  callsToday: number
  limit: number
}

interface SisterCompany {
  id: string
  name: string
  slug: string
  description: string
  icon: string
  status: 'active' | 'inactive' | 'suspended'
  apiKeyStatus: 'active' | 'expired' | 'revoked' | 'none'
  agentCount: number
  usageThisMonth: number
  usageLimit: number
  lastActivity: string
  monthlyCost: number
  color: string
  agents: AssignedAgent[]
  apiPermissions: ApiPermission[]
}

// ── Helpers

function getCompanyIcon(icon: string) {
  switch (icon) {
    case 'education': return GraduationCap
    case 'visa': return Plane
    case 'hr': return Users
    case 'finance': return DollarSign
    case 'marketing': return Megaphone
    case 'university': return BookOpen
    case 'research': return FlaskConical
    default: return Building2
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'active':
      return <Badge className="bg-green-50 text-green-700 border-green-200 text-xs"><CheckCircle className="w-3 h-3 mr-1" />Active</Badge>
    case 'inactive':
      return <Badge className="bg-slate-100 text-slate-500 border-slate-200 text-xs"><AlertCircle className="w-3 h-3 mr-1" />Inactive</Badge>
    case 'suspended':
      return <Badge className="bg-red-50 text-red-700 border-red-200 text-xs"><XCircle className="w-3 h-3 mr-1" />Suspended</Badge>
    default: return null
  }
}

function getApiKeyBadge(status: string) {
  switch (status) {
    case 'active':
      return <Badge className="bg-green-50 text-green-700 border-green-200 text-xs"><Key className="w-3 h-3 mr-1" />Active</Badge>
    case 'expired':
      return <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs"><AlertCircle className="w-3 h-3 mr-1" />Expired</Badge>
    case 'revoked':
      return <Badge className="bg-red-50 text-red-700 border-red-200 text-xs"><XCircle className="w-3 h-3 mr-1" />Revoked</Badge>
    case 'none':
      return <Badge className="bg-slate-100 text-slate-500 border-slate-200 text-xs"><Key className="w-3 h-3 mr-1" />No Key</Badge>
    default: return null
  }
}

function getAgentStatusDot(status: string) {
  switch (status) {
    case 'active': return 'bg-green-500'
    case 'busy': return 'bg-amber-500'
    case 'idle': return 'bg-slate-300'
    default: return 'bg-slate-300'
  }
}

// ── Component ───────────────────────────────────────────────────────────────

export default function SisterCompaniesPanel() {
  const [companies, setCompanies] = useState<SisterCompany[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/sister-companies')
      .then((r) => r.json())
      .then((data) => {
        if (data.companies) setCompanies(data.companies)
      })
      .catch(() => {
        setCompanies([])
      })
      .finally(() => setLoading(false))
  }, [])

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
  }

  const totalUsage = companies.reduce((acc, c) => acc + c.usageThisMonth, 0)
  const totalLimit = companies.reduce((acc, c) => acc + c.usageLimit, 0)
  const totalAgents = companies.reduce((acc, c) => acc + c.agentCount, 0)
  const totalCost = companies.reduce((acc, c) => acc + c.monthlyCost, 0)
  const activeCompanies = companies.filter((c) => c.status === 'active').length

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#003ABC]/10 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-[#003ABC]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#1E293B]">Sister Companies</h2>
            <p className="text-sm text-[#64748B]">Manage access, API keys, and resource allocation for all ALO subsidiaries</p>
          </div>
        </div>
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
          <Building2 className="w-3 h-3 mr-1" />
          {activeCompanies} of {companies.length} Active
        </Badge>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-[#E2E8F0]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[#64748B]">Total Companies</p>
                <p className="text-2xl font-bold text-[#1E293B]">{companies.length}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[#003ABC]/10 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-[#003ABC]" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-[#E2E8F0]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[#64748B]">Total Agents</p>
                <p className="text-2xl font-bold text-[#1E293B]">{totalAgents}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
                <Bot className="w-5 h-5 text-violet-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-[#E2E8F0]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[#64748B]">Usage This Month</p>
                <p className="text-2xl font-bold text-[#1E293B]">{(totalUsage / 1000).toFixed(0)}k</p>
                <div className="flex items-center gap-1 mt-1">
                  <Progress value={(totalUsage / totalLimit) * 100} className="h-1 w-16 [&>div]:bg-[#003ABC]" />
                  <span className="text-[10px] text-[#64748B]">{((totalUsage / totalLimit) * 100).toFixed(0)}%</span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
                <Activity className="w-5 h-5 text-[#FF6A00]" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-[#E2E8F0]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[#64748B]">Monthly Cost</p>
                <p className="text-2xl font-bold text-[#1E293B]">${totalCost.toLocaleString()}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Company Cards */}
      <div className="space-y-3">
        {companies.length === 0 ? (
          <Card className="border-[#E2E8F0]">
            <CardContent className="p-8 text-center">
              <Building2 className="w-8 h-8 text-[#64748B] mx-auto mb-2" />
              <p className="text-sm text-[#64748B]">No sister companies found</p>
            </CardContent>
          </Card>
        ) : companies.map((company) => {
          const CompanyIcon = getCompanyIcon(company.icon)
          const isExpanded = expandedId === company.id
          const usagePercent = (company.usageThisMonth / company.usageLimit) * 100

          return (
            <Card key={company.id} className="border-[#E2E8F0] overflow-hidden">
              {/* Main Row */}
              <div
                className="p-4 cursor-pointer hover:bg-[#F8FAFC] transition-colors"
                onClick={() => toggleExpand(company.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-11 h-11 rounded-xl ${company.color} flex items-center justify-center border`}>
                      <CompanyIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-[#1E293B]">{company.name}</h3>
                        {getStatusBadge(company.status)}
                      </div>
                      <p className="text-xs text-[#64748B] mt-0.5 max-w-xl">{company.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    {/* API Key Status */}
                    <div className="hidden md:flex items-center gap-4">
                      {getApiKeyBadge(company.apiKeyStatus)}
                      <div className="text-right">
                        <p className="text-xs text-[#64748B]">Agents</p>
                        <p className="text-sm font-semibold text-[#1E293B]">{company.agentCount}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-[#64748B]">Usage</p>
                        <div className="flex items-center gap-1.5">
                          <Progress value={usagePercent} className="h-1.5 w-16 [&>div]:bg-[#003ABC]" />
                          <span className="text-xs font-medium text-[#1E293B]">{usagePercent.toFixed(0)}%</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-[#64748B]">Cost/mo</p>
                        <p className="text-sm font-semibold text-[#1E293B]">${company.monthlyCost.toLocaleString()}</p>
                      </div>
                      <div className="text-right min-w-[100px]">
                        <p className="text-xs text-[#64748B]">Last Activity</p>
                        <p className="text-xs text-[#1E293B] flex items-center gap-1 justify-end">
                          <Clock className="w-3 h-3" />
                          {company.lastActivity}
                        </p>
                      </div>
                    </div>

                    {/* Mobile stats */}
                    <div className="flex md:hidden items-center gap-2">
                      <Badge variant="outline" className="text-[10px] bg-slate-50 text-[#64748B] border-slate-200">
                        {company.agentCount} agents
                      </Badge>
                      <Badge variant="outline" className="text-[10px] bg-slate-50 text-[#64748B] border-slate-200">
                        ${company.monthlyCost}/mo
                      </Badge>
                    </div>

                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-[#64748B]" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[#64748B]" />
                    )}
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="border-t border-[#E2E8F0] bg-[#F8FAFC]">
                  <div className="p-4 space-y-5">
                    {/* Grid of detail sections */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      {/* Assigned Agents */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-[#1E293B] flex items-center gap-1.5">
                          <Bot className="w-3.5 h-3.5 text-[#003ABC]" />
                          Assigned Agents ({company.agents.length})
                        </h4>
                        <div className="space-y-1.5">
                          {company.agents.map((agent) => (
                            <div
                              key={agent.id}
                              className="flex items-center justify-between p-2 rounded-lg bg-white border border-[#E2E8F0]"
                            >
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${getAgentStatusDot(agent.status)}`} />
                                <span className="text-xs text-[#1E293B] font-medium">{agent.name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-[#64748B]">{agent.role}</span>
                                <Badge
                                  variant="outline"
                                  className={`text-[9px] px-1.5 py-0 ${
                                    agent.status === 'active'
                                      ? 'bg-green-50 text-green-700 border-green-200'
                                      : agent.status === 'busy'
                                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                                        : 'bg-slate-100 text-slate-500 border-slate-200'
                                  }`}
                                >
                                  {agent.status}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* API Permissions */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-[#1E293B] flex items-center gap-1.5">
                          <Shield className="w-3.5 h-3.5 text-[#003ABC]" />
                          API Permissions
                        </h4>
                        <div className="space-y-1.5">
                          {company.apiPermissions.map((perm) => (
                            <div
                              key={perm.name}
                              className="flex items-center justify-between p-2 rounded-lg bg-white border border-[#E2E8F0]"
                            >
                              <div className="flex items-center gap-2">
                                {perm.enabled ? (
                                  <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                                ) : (
                                  <XCircle className="w-3.5 h-3.5 text-slate-300" />
                                )}
                                <span className={`text-xs ${perm.enabled ? 'text-[#1E293B] font-medium' : 'text-[#64748B]'}`}>
                                  {perm.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${perm.callsToday / perm.limit > 0.8 ? 'bg-amber-500' : 'bg-[#003ABC]'}`}
                                    style={{ width: `${(perm.callsToday / perm.limit) * 100}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-[#64748B]">
                                  {perm.callsToday.toLocaleString()}/{perm.limit.toLocaleString()}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Usage & Quotas */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-[#1E293B] flex items-center gap-1.5">
                          <BarChart3 className="w-3.5 h-3.5 text-[#003ABC]" />
                          Usage Quotas
                        </h4>
                        <div className="p-3 rounded-lg bg-white border border-[#E2E8F0] space-y-3">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-[#64748B]">Monthly API Calls</span>
                              <span className="text-xs font-medium text-[#1E293B]">
                                {company.usageThisMonth.toLocaleString()} / {company.usageLimit.toLocaleString()}
                              </span>
                            </div>
                            <Progress value={usagePercent} className={`h-2 ${usagePercent > 80 ? '[&>div]:bg-amber-500' : '[&>div]:bg-[#003ABC]'}`} />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-[#64748B]">Agent Count</span>
                              <span className="text-xs font-medium text-[#1E293B]">
                                {company.agentCount} / 20
                              </span>
                            </div>
                            <Progress value={(company.agentCount / 20) * 100} className="h-2 [&>div]:bg-violet-500" />
                          </div>
                          <Separator className="my-2" />
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-[#64748B]">Monthly Cost</span>
                            <span className="text-sm font-bold text-[#1E293B]">${company.monthlyCost.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-[#64748B]">Cost per API Call</span>
                            <span className="text-xs text-[#1E293B]">
                              ${(company.monthlyCost / Math.max(company.usageThisMonth, 1)).toFixed(4)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-2">
                      <Button
                        size="sm"
                        className="bg-[#003ABC] hover:bg-[#003ABC]/90 text-white text-xs h-8"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Settings className="w-3.5 h-3.5 mr-1.5" />
                        Manage Access
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-[#E2E8F0] text-[#64748B] text-xs h-8 hover:bg-white"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Key className="w-3.5 h-3.5 mr-1.5" />
                        Regenerate API Key
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-[#E2E8F0] text-[#64748B] text-xs h-8 hover:bg-white"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Globe className="w-3.5 h-3.5 mr-1.5" />
                        View Dashboard
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}