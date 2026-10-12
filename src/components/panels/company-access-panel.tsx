'use client'

import { useEffect, useState } from 'react'
import {
  Shield,
  AlertTriangle,
  Check,
  X,
  Eye,
  Lock,
  Crown,
  Building2,
  Users,
  Key,
  ChevronDown,
  ChevronRight,
  Plus,
  Ban,
  Bot,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface Company {
  id: string
  name: string
  slug: string
  status: string
  isOwner: boolean
  allowedDepartments: string[]
  allowedWorkflows: string[]
}

interface Department {
  id: string
  name: string
  slug: string
  agentCount: number
  agents?: { id: string; name: string }[]
}

const DEPT_GROUPS = [
  { name: 'AI Ops', slugs: ['ai-ops'] },
  { name: 'Content', slugs: ['content-creation'] },
  { name: 'Business', slugs: ['business-intelligence', 'business-operations'] },
  { name: 'Education', slugs: ['education', 'language-learning'] },
  { name: 'Dev', slugs: ['software-development', 'devops'] },
  { name: 'Sales', slugs: ['sales', 'marketing'] },
  { name: 'HR', slugs: ['human-resources'] },
  { name: 'Finance', slugs: ['finance-accounting'] },
  { name: 'Security', slugs: ['security', 'compliance'] },
  { name: 'Research', slugs: ['research-analytics'] },
]

type AccessLevel = 'full' | 'read' | 'none'

interface GrantAccessForm {
  companyId: string
  groupName: string
  accessLevel: AccessLevel
}

export default function CompanyAccessPanel() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [accessMatrix, setAccessMatrix] = useState<Record<string, Record<string, AccessLevel>>>({})
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null)

  // Grant access dialog
  const [grantDialogOpen, setGrantDialogOpen] = useState(false)
  const [grantForm, setGrantForm] = useState<GrantAccessForm>({
    companyId: '',
    groupName: '',
    accessLevel: 'read',
  })

  // Revoke access dialog
  const [revokeDialog, setRevokeDialog] = useState<{
    open: boolean
    companyId: string
    companyName: string
    groupName: string
  }>({ open: false, companyId: '', companyName: '', groupName: '' })

  // Confirm action dialog
  const [actionDialog, setActionDialog] = useState<{
    open: boolean
    companyId: string
    companyName: string
    groupName: string
    currentLevel: AccessLevel
    newLevel: AccessLevel
  }>({ open: false, companyId: '', companyName: '', groupName: '', currentLevel: 'none', newLevel: 'none' })

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetch('/api/company-access').then((r) => r.json()),
    ])
      .then(([accessRes]) => {
        if (cancelled) return
        const data = accessRes.data || accessRes
        setCompanies((data.companies || []).map((c: Record<string, unknown>) => ({
          ...(c as Omit<Company, 'isOwner'>),
          isOwner: c.slug === 'alo-labs',
        })))
        setDepartments(data.departments || [])
        setAccessMatrix(data.matrix || accessRes.matrix || {})
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const reload = () => {
    fetch('/api/company-access')
      .then((r) => r.json())
      .then((accessRes) => {
        const data = accessRes.data || accessRes
        setCompanies((data.companies || []).map((c: Record<string, unknown>) => ({
          ...(c as Omit<Company, 'isOwner'>),
          isOwner: c.slug === 'alo-labs',
        })))
        setDepartments(data.departments || [])
        setAccessMatrix(data.matrix || accessRes.matrix || {})
      })
      .catch(() => {})
  }

  const getAccessLevel = (companySlug: string, groupName: string): AccessLevel => {
    if (companySlug === 'alo-labs') return 'full'
    return accessMatrix[companySlug]?.[groupName] || 'none'
  }

  const getCompanyDotColor = (company: Company) => {
    if (company.isOwner) return 'bg-green-500'
    if (company.status === 'active') return 'bg-blue-500'
    return 'bg-gray-400'
  }

  const handleCellClick = (company: Company, groupName: string) => {
    if (company.isOwner) return
    const current = getAccessLevel(company.slug, groupName)
    const next: AccessLevel = current === 'none' ? 'read' : current === 'read' ? 'full' : 'none'
    setActionDialog({
      open: true,
      companyId: company.id,
      companyName: company.name,
      groupName,
      currentLevel: current,
      newLevel: next,
    })
  }

  const handleConfirmAccess = async () => {
    const { companyId, groupName, newLevel } = actionDialog
    try {
      await fetch('/api/company-access', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, group: groupName, accessLevel: newLevel }),
      })
      reload()
    } catch { /* error */ }
    setActionDialog((p) => ({ ...p, open: false }))
  }

  const handleGrantAccess = async () => {
    try {
      await fetch('/api/company-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: grantForm.companyId,
          group: grantForm.groupName,
          accessLevel: grantForm.accessLevel,
        }),
      })
      reload()
      setGrantDialogOpen(false)
      setGrantForm({ companyId: '', groupName: '', accessLevel: 'read' })
    } catch { /* error */ }
  }

  const handleRevokeAccess = async () => {
    try {
      await fetch('/api/company-access', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: revokeDialog.companyId,
          group: revokeDialog.groupName,
        }),
      })
      reload()
    } catch { /* error */ }
    setRevokeDialog((p) => ({ ...p, open: false }))
  }

  const getCompanyStats = (company: Company) => {
    if (company.isOwner) {
      return { departments: DEPT_GROUPS.length, agents: departments.reduce((a, d) => a + d.agentCount, 0) }
    }
    const accessibleDepts = DEPT_GROUPS.filter((g) => {
      const level = getAccessLevel(company.slug, g.name)
      return level !== 'none'
    }).length
    const deptSlugs = DEPT_GROUPS.filter((g) => getAccessLevel(company.slug, g.name) !== 'none').flatMap((g) => g.slugs)
    const agentCount = departments.filter((d) => deptSlugs.includes(d.slug)).reduce((a, d) => a + d.agentCount, 0)
    return { departments: accessibleDepts, agents: agentCount }
  }

  const getTotalPermissionsGranted = () => {
    let count = 0
    companies.forEach((company) => {
      if (company.isOwner) return
      DEPT_GROUPS.forEach((group) => {
        const level = getAccessLevel(company.slug, group.name)
        if (level !== 'none') count++
      })
    })
    return count
  }

  const getAccessibleDepartmentsForCompany = (companySlug: string) => {
    return DEPT_GROUPS.filter((g) => getAccessLevel(companySlug, g.name) !== 'none')
  }

  const AccessCell = ({ company, groupName }: { company: Company; groupName: string }) => {
    const level = getAccessLevel(company.slug, groupName)
    const isOwner = company.isOwner

    if (isOwner) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="w-full h-10 flex items-center justify-center bg-green-50 rounded-lg cursor-default border border-green-200">
                <Crown className="w-4 h-4 text-green-600" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">ALO Labs — Full Owner Access</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    }

    const config: Record<AccessLevel, { icon: typeof Check; color: string; bg: string; label: string }> = {
      full: { icon: Check, color: 'text-green-600', bg: 'bg-green-50 hover:bg-green-100 border-green-200', label: 'Full Access' },
      read: { icon: Eye, color: 'text-blue-600', bg: 'bg-blue-50 hover:bg-blue-100 border-blue-200', label: 'Read Only' },
      none: { icon: X, color: 'text-gray-400', bg: 'bg-gray-50 hover:bg-gray-100 border-gray-200', label: 'No Access' },
    }

    const c = config[level]
    const Icon = c.icon

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => handleCellClick(company, groupName)}
              className={`w-full h-10 flex items-center justify-center rounded-lg border transition-colors cursor-pointer ${c.bg}`}
            >
              <Icon className={`w-4 h-4 ${c.color}`} />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">{company.name} → {groupName}: {c.label}</p>
            <p className="text-[10px] text-[#94A3B8]">Click to change</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64 bg-gray-100 rounded-lg" />
        <Skeleton className="h-20 w-full bg-gray-100 rounded-xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl bg-gray-100" />
          ))}
        </div>
        <Skeleton className="h-64 w-full bg-gray-100 rounded-xl" />
      </div>
    )
  }

  const totalAgents = departments.reduce((a, d) => a + d.agentCount, 0)
  const aloLabsDeptCount = DEPT_GROUPS.length

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#003ABC]/10 flex items-center justify-center">
          <Shield className="w-5 h-5 text-[#003ABC]" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[#1E293B]">Company Access Matrix</h2>
          <p className="text-xs text-[#94A3B8]">
            Tenant isolation and service consumption controls
          </p>
        </div>
      </div>

      {/* Security Banner */}
      <div className="bg-[#003ABC]/5 border border-[#003ABC]/20 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#003ABC]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Lock className="w-4 h-4 text-[#003ABC]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#1E293B]">
              🔒 ALO Labs owns all 2,000 AI agents centrally. Sister companies consume agent services through secure API keys only. No agent copies, prompts, or credentials are shared.
            </p>
            <p className="text-xs text-[#64748B] mt-1.5">
              All requests route through the ALO Labs Gateway with tenant validation. Each company operates in complete isolation.
            </p>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: 'Total Companies',
            value: companies.length,
            icon: Building2,
            color: 'text-[#003ABC]',
            bg: 'bg-[#003ABC]/10',
          },
          {
            label: 'ALO Labs Departments',
            value: aloLabsDeptCount,
            icon: Shield,
            color: 'text-[#FF6A00]',
            bg: 'bg-[#FF6A00]/10',
          },
          {
            label: 'Total Agents Owned',
            value: totalAgents.toLocaleString(),
            icon: Bot,
            color: 'text-green-600',
            bg: 'bg-green-50',
          },
          {
            label: 'Total Permissions Granted',
            value: getTotalPermissionsGranted(),
            icon: Key,
            color: 'text-blue-500',
            bg: 'bg-blue-50',
          },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-[#E2E8F0] rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center`}>
                <s.icon className={`w-4 h-4 ${s.color}`} />
              </div>
            </div>
            <p className="text-2xl font-bold text-[#1E293B]">{s.value}</p>
            <p className="text-xs text-[#94A3B8] mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <Button
          onClick={() => setGrantDialogOpen(true)}
          className="rounded-lg bg-[#003ABC] hover:bg-[#002A99] text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          Grant Access
        </Button>
        <Button
          onClick={() => {
            const nonOwner = companies.find((c) => !c.isOwner)
            if (nonOwner) {
              const hasAccess = DEPT_GROUPS.find((g) => getAccessLevel(nonOwner.slug, g.name) !== 'none')
              if (hasAccess) {
                setRevokeDialog({
                  open: true,
                  companyId: nonOwner.id,
                  companyName: nonOwner.name,
                  groupName: hasAccess.name,
                })
              }
            }
          }}
          variant="outline"
          className="rounded-lg border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          <Ban className="w-4 h-4 mr-2" />
          Revoke Access
        </Button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-xs text-[#64748B] font-medium">Legend:</span>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-green-50 border border-green-200 flex items-center justify-center">
            <Check className="w-3.5 h-3.5 text-green-600" />
          </div>
          <span className="text-xs text-[#64748B]">Full Access</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-blue-50 border border-blue-200 flex items-center justify-center">
            <Eye className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <span className="text-xs text-[#64748B]">Read Only</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-gray-50 border border-gray-200 flex items-center justify-center">
            <X className="w-3.5 h-3.5 text-gray-400" />
          </div>
          <span className="text-xs text-[#64748B]">No Access</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-green-50 border border-green-200 flex items-center justify-center">
            <Crown className="w-3.5 h-3.5 text-green-600" />
          </div>
          <span className="text-xs text-[#64748B]">Owner (Full)</span>
        </div>
      </div>

      {/* THE MATRIX */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E2E8F0] bg-[#F8FAFC]">
          <h3 className="text-sm font-semibold text-[#1E293B]">Access Matrix</h3>
          <p className="text-[11px] text-[#94A3B8] mt-0.5">Click any cell to change access. ALO Labs row is locked (full owner access).</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                <th className="text-left text-[#64748B] font-medium px-4 py-3 min-w-[200px] sticky left-0 bg-[#F8FAFC] z-10">
                  Company
                </th>
                {DEPT_GROUPS.map((group) => (
                  <th key={group.name} className="text-center text-[#64748B] font-medium px-1 py-3 min-w-[80px]">
                    <span className="text-[11px]">{group.name}</span>
                  </th>
                ))}
                <th className="text-center text-[#64748B] font-medium px-3 py-3 min-w-[80px]">
                  <span className="text-[11px]">Depts</span>
                </th>
                <th className="text-center text-[#64748B] font-medium px-3 py-3 min-w-[80px]">
                  <span className="text-[11px]">Agents</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => {
                const stats = getCompanyStats(company)
                const isSelected = selectedCompany === company.id
                return (
                  <tr
                    key={company.id}
                    className={`border-b border-[#E2E8F0]/50 hover:bg-[#F8FAFC] transition-colors cursor-pointer ${
                      company.isOwner ? 'bg-green-50/50' : ''
                    } ${isSelected ? 'ring-2 ring-inset ring-[#003ABC]/30' : ''}`}
                    onClick={() => setSelectedCompany(isSelected ? null : company.id)}
                  >
                    <td className="px-4 py-3 sticky left-0 bg-white z-10">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${getCompanyDotColor(company)}`} />
                        <div className="flex items-center gap-2">
                          {company.isOwner && <Crown className="w-4 h-4 text-[#FF6A00] flex-shrink-0" />}
                          <div>
                            <p className={`text-sm font-medium ${company.isOwner ? 'text-[#003ABC]' : 'text-[#1E293B]'}`}>
                              {company.name}
                              {company.isOwner && (
                                <Badge className="ml-1.5 text-[9px] py-0 bg-[#003ABC]/10 text-[#003ABC] border-[#003ABC]/20">
                                  OWNER
                                </Badge>
                              )}
                            </p>
                            <p className="text-[10px] text-[#94A3B8]">{company.slug}</p>
                          </div>
                        </div>
                      </div>
                    </td>
                    {DEPT_GROUPS.map((group) => (
                      <td key={group.name} className="px-1 py-2" onClick={(e) => e.stopPropagation()}>
                        <AccessCell company={company} groupName={group.name} />
                      </td>
                    ))}
                    <td className="px-3 py-3 text-center">
                      <span className="text-sm font-semibold text-[#1E293B]">{stats.departments}</span>
                      <span className="text-[10px] text-[#94A3B8]">/{DEPT_GROUPS.length}</span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="text-sm font-semibold text-[#1E293B]">{stats.agents.toLocaleString()}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Access Details */}
      {selectedCompany && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#003ABC]" />
            <h3 className="text-sm font-semibold text-[#1E293B]">Access Details</h3>
            {(() => {
              const company = companies.find((c) => c.id === selectedCompany)
              return company ? (
                <Badge className="text-[10px] py-0 bg-[#003ABC]/10 text-[#003ABC] border-[#003ABC]/20">
                  {company.name}
                </Badge>
              ) : null
            })()}
          </div>
          <div className="p-4">
            {(() => {
              const company = companies.find((c) => c.id === selectedCompany)
              if (!company) return null

              if (company.isOwner) {
                return (
                  <div className="text-center py-8">
                    <Crown className="w-10 h-10 text-[#FF6A00] mx-auto mb-3" />
                    <p className="text-sm font-semibold text-[#1E293B]">ALO Labs — Full Owner Access</p>
                    <p className="text-xs text-[#94A3B8] mt-1">All {DEPT_GROUPS.length} departments and {totalAgents.toLocaleString()} agents are fully accessible.</p>
                    <Separator className="my-4" />
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 max-w-2xl mx-auto">
                      {DEPT_GROUPS.map((group) => (
                        <div key={group.name} className="bg-green-50 border border-green-200 rounded-lg p-2.5 text-center">
                          <Check className="w-4 h-4 text-green-600 mx-auto mb-1" />
                          <p className="text-[11px] font-medium text-green-700">{group.name}</p>
                          <p className="text-[10px] text-green-600">
                            {departments
                              .filter((d) => group.slugs.includes(d.slug))
                              .reduce((a, d) => a + d.agentCount, 0)} agents
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              }

              const accessibleDepts = getAccessibleDepartmentsForCompany(company.slug)
              const inaccessibleDepts = DEPT_GROUPS.filter((g) => getAccessLevel(company.slug, g.name) === 'none')

              return (
                <div className="space-y-4">
                  {accessibleDepts.length > 0 ? (
                    <div>
                      <p className="text-xs font-medium text-[#64748B] uppercase tracking-wider mb-3">
                        ✅ Accessible Departments ({accessibleDepts.length})
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {accessibleDepts.map((group) => {
                          const level = getAccessLevel(company.slug, group.name)
                          const agentsInGroup = departments.filter((d) => group.slugs.includes(d.slug))
                          return (
                            <div
                              key={group.name}
                              className={`border rounded-lg p-3 ${
                                level === 'full'
                                  ? 'bg-green-50/50 border-green-200'
                                  : 'bg-blue-50/50 border-blue-200'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-sm font-medium text-[#1E293B]">{group.name}</p>
                                <Badge
                                  className={`text-[9px] py-0 ${
                                    level === 'full'
                                      ? 'bg-green-100 text-green-700 border-green-200'
                                      : 'bg-blue-100 text-blue-700 border-blue-200'
                                  }`}
                                >
                                  {level === 'full' ? 'Full' : 'Read'}
                                </Badge>
                              </div>
                              <p className="text-[11px] text-[#64748B]">
                                {agentsInGroup.reduce((a, d) => a + d.agentCount, 0)} agents available
                              </p>
                              {agentsInGroup.length > 0 && (
                                <div className="mt-2 space-y-1">
                                  {agentsInGroup.map((dept) => (
                                    <div key={dept.id} className="flex items-center gap-1.5 text-[11px] text-[#94A3B8]">
                                      <Bot className="w-3 h-3" />
                                      <span>{dept.name}</span>
                                      <span className="ml-auto">({dept.agentCount})</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <X className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-[#94A3B8]">No departments accessible</p>
                      <p className="text-xs text-[#94A3B8] mt-1">Use &quot;Grant Access&quot; to provide access.</p>
                    </div>
                  )}

                  {inaccessibleDepts.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider mb-3">
                        ❌ No Access ({inaccessibleDepts.length})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {inaccessibleDepts.map((group) => (
                          <Badge key={group.name} variant="secondary" className="text-[10px] py-1 bg-gray-100 text-gray-400 border-gray-200">
                            <X className="w-3 h-3 mr-1" />
                            {group.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* Grant Access Dialog */}
      <Dialog open={grantDialogOpen} onOpenChange={setGrantDialogOpen}>
        <DialogContent className="bg-white border-[#E2E8F0] rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B]">Grant Access</DialogTitle>
            <DialogDescription className="text-[#64748B]">
              Authorize a sister company to access a department group&apos;s agent services.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-xs font-medium text-[#1E293B]">Company</label>
              <Select
                value={grantForm.companyId}
                onValueChange={(v) => setGrantForm((p) => ({ ...p, companyId: v }))}
              >
                <SelectTrigger className="rounded-lg border-[#E2E8F0]">
                  <SelectValue placeholder="Select a company" />
                </SelectTrigger>
                <SelectContent>
                  {companies
                    .filter((c) => !c.isOwner)
                    .map((company) => (
                      <SelectItem key={company.id} value={company.id}>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${getCompanyDotColor(company)}`} />
                          {company.name}
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-[#1E293B]">Department Group</label>
              <Select
                value={grantForm.groupName}
                onValueChange={(v) => setGrantForm((p) => ({ ...p, groupName: v }))}
              >
                <SelectTrigger className="rounded-lg border-[#E2E8F0]">
                  <SelectValue placeholder="Select a department group" />
                </SelectTrigger>
                <SelectContent>
                  {DEPT_GROUPS.map((group) => (
                    <SelectItem key={group.name} value={group.name}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-[#1E293B]">Access Level</label>
              <Select
                value={grantForm.accessLevel}
                onValueChange={(v) => setGrantForm((p) => ({ ...p, accessLevel: v as AccessLevel }))}
              >
                <SelectTrigger className="rounded-lg border-[#E2E8F0]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="read">
                    <div className="flex items-center gap-2">
                      <Eye className="w-3.5 h-3.5 text-blue-500" />
                      Read Only — Can view results, cannot execute
                    </div>
                  </SelectItem>
                  <SelectItem value="full">
                    <div className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-green-600" />
                      Full Access — Can execute agents and modify data
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {grantForm.accessLevel === 'full' && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-700">
                  <AlertTriangle className="w-3.5 h-3.5 inline mr-1.5" />
                  Full access allows the company to execute agents and modify data in this department group.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setGrantDialogOpen(false)}
              className="rounded-lg border-[#E2E8F0] text-[#1E293B]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleGrantAccess}
              disabled={!grantForm.companyId || !grantForm.groupName}
              className="rounded-lg bg-[#003ABC] hover:bg-[#002A99] text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Grant Access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Access Dialog */}
      <AlertDialog open={revokeDialog.open} onOpenChange={(open) => setRevokeDialog((p) => ({ ...p, open }))}>
        <AlertDialogContent className="bg-white border-[#E2E8F0] rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#1E293B]">Revoke Access</AlertDialogTitle>
            <AlertDialogDescription className="text-[#64748B]">
              Are you sure you want to revoke <strong>{revokeDialog.companyName}</strong>&apos;s access to{' '}
              <strong>{revokeDialog.groupName}</strong>? This action will immediately block all agent service consumption for this department.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-xs text-red-700">
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1.5" />
              Active workflows using agents in this department will be interrupted.
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg border-[#E2E8F0] text-[#1E293B]">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevokeAccess}
              className="rounded-lg bg-red-600 hover:bg-red-700 text-white"
            >
              <Ban className="w-4 h-4 mr-2" />
              Revoke Access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Cell Click Dialog */}
      <AlertDialog open={actionDialog.open} onOpenChange={(open) => setActionDialog((p) => ({ ...p, open }))}>
        <AlertDialogContent className="bg-white border-[#E2E8F0] rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#1E293B]">Change Access Level</AlertDialogTitle>
            <AlertDialogDescription className="text-[#64748B]">
              Set <strong>{actionDialog.companyName}</strong> access to <strong>{actionDialog.groupName}</strong> from{' '}
              <Badge variant="outline" className="text-[10px] py-0">
                {actionDialog.currentLevel}
              </Badge>{' '}
              to{' '}
              <Badge variant="outline" className="text-[10px] py-0">
                {actionDialog.newLevel}
              </Badge>
              ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          {actionDialog.newLevel === 'full' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs text-amber-700">
                <AlertTriangle className="w-3.5 h-3.5 inline mr-1.5" />
                Full access allows the company to execute agents and modify data in this department group.
              </p>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg border-[#E2E8F0] text-[#1E293B]">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAccess}
              className="rounded-lg bg-[#003ABC] hover:bg-[#002A99] text-white"
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}