'use client'

import { useEffect, useState, useRef } from 'react'
import { Search, ChevronLeft, ChevronRight, Eye, Wrench, Shield, Zap, AlertTriangle, Ban, CheckCircle2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Skill {
  id: string
  name: string
  slug: string
  category: string
  categorySlug: string
  title: string
  version: string
  status: string
  riskLevel: string
  runtime: string
  requiresApproval: boolean
  allowedTools: string
  forbiddenTools: string
  inputs: string
  outputs: string
  purpose: string
  validationRules: string
  securityRules: string
  costPolicy: string
  safetyRules: string
  approvalRules: string
  failureHandling: string
  content: string
  description: string
  createdAt: string
}

interface SkillStats {
  total: number
  approved: number
  private: number
  quarantined: number
  disabled: number
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SkillsPanel() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [stats, setStats] = useState<SkillStats>({ total: 0, approved: 0, private: 0, quarantined: 0, disabled: 0 })
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [riskFilter, setRiskFilter] = useState('')
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const limit = 50

  // Fetch stats
  useEffect(() => {
     
    setStatsLoading(true)
    Promise.all([
      fetch('/api/skills?limit=1').then((r) => r.json()),
      fetch('/api/skills?status=approved&limit=1').then((r) => r.json()),
      fetch('/api/skills?status=private&limit=1').then((r) => r.json()),
      fetch('/api/skills?status=quarantined&limit=1').then((r) => r.json()),
      fetch('/api/skills?status=disabled&limit=1').then((r) => r.json()),
    ])
      .then(([all, approved, priv, quar, dis]) => {
        setStats({
          total: all.total || 0,
          approved: approved.total || 0,
          private: priv.total || 0,
          quarantined: quar.total || 0,
          disabled: dis.total || 0,
        })
      })
      .catch(() => {})
      .finally(() => setStatsLoading(false))
  }, [])

  // Debounced search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null)
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [searchInput])

  // Fetch skills
  useEffect(() => {
    let cancelled = false
     
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (search) params.set('search', search)
    if (categoryFilter) params.set('category', categoryFilter)
    if (statusFilter) params.set('status', statusFilter)

    fetch(`/api/skills?${params}`)
      .then((r) => r.json())
      .then((res) => {
        if (!cancelled) {
          setSkills(res.data || [])
          setTotal(res.total || 0)
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [page, search, categoryFilter, statusFilter])

  // Filter by risk on client side
  const filteredSkills = riskFilter
    ? skills.filter((s) => s.riskLevel === riskFilter)
    : skills

  const totalPages = Math.ceil(total / limit)
  const from = (page - 1) * limit + 1
  const to = Math.min(page * limit, total)

  const statusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-emerald-600/10 text-emerald-600'
      case 'private': return 'bg-[#FF6A00]/10 text-[#FF6A00]'
      case 'quarantined': return 'bg-amber-600/10 text-amber-600'
      case 'disabled': return 'bg-red-600/10 text-red-600'
      default: return 'bg-gray-100 text-[#64748B]'
    }
  }

  const riskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'bg-emerald-600/10 text-emerald-600'
      case 'medium': return 'bg-amber-600/10 text-amber-600'
      case 'high': return 'bg-red-600/10 text-red-600'
      default: return 'bg-gray-100 text-[#64748B]'
    }
  }

  const parseJSON = <T,>(str: string): T[] => {
    try { return JSON.parse(str) as T[] } catch { return [] }
  }

  const openDetail = (skill: Skill) => {
    setSelectedSkill(skill)
    setDetailOpen(true)
  }

  const statCards = [
    { icon: Wrench, label: 'Total Skills', value: stats.total, color: 'text-[#003ABC]', bgColor: 'bg-[#003ABC]/10' },
    { icon: CheckCircle2, label: 'Approved', value: stats.approved, color: 'text-emerald-600', bgColor: 'bg-emerald-600/10' },
    { icon: AlertTriangle, label: 'Quarantined', value: stats.quarantined, color: 'text-amber-600', bgColor: 'bg-amber-600/10' },
    { icon: Ban, label: 'Disabled', value: stats.disabled, color: 'text-red-600', bgColor: 'bg-red-600/10' },
  ]

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Wrench className="w-6 h-6 text-[#003ABC]" />
          <h2 className="text-xl font-semibold text-[#1E293B]">Skills Registry</h2>
        </div>
        <span className="text-sm text-[#64748B]">
          Showing {total > 0 ? `${from}-${to}` : '0'} of {total} skills
        </span>
      </div>

      {/* Stats Cards */}
      {statsLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg bg-gray-50" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map((card) => {
            const Icon = card.icon
            return (
              <div key={card.label} className={`bg-white rounded-xl border border-[#E2E8F0] shadow-sm hover:shadow-md transition-shadow p-5 ${card.bgColor}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center">
                    <Icon className={`w-5 h-5 ${card.color}`} />
                  </div>
                  <h3 className="text-sm font-semibold text-[#1E293B]">{card.label}</h3>
                </div>
                <p className="text-3xl font-bold text-[#003ABC] mb-1">{card.value.toLocaleString()}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
          <Input
            placeholder="Search skills..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 bg-gray-50 border-[#E2E8F0] text-[#1E293B] placeholder:text-gray-400"
          />
        </div>
        <Select value={categoryFilter || '__all__'} onValueChange={(v) => { setCategoryFilter(v === '__all__' ? '' : v); setPage(1) }}>
          <SelectTrigger className="w-[180px] bg-gray-50 border-[#E2E8F0] text-[#1E293B] text-xs">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent className="bg-white border-[#E2E8F0] max-h-64">
            <SelectItem value="__all__" className="text-[#1E293B]">All Categories</SelectItem>
            <SelectItem value="web-development" className="text-[#1E293B]">Web Development</SelectItem>
            <SelectItem value="marketing" className="text-[#1E293B]">Marketing</SelectItem>
            <SelectItem value="sales" className="text-[#1E293B]">Sales</SelectItem>
            <SelectItem value="finance" className="text-[#1E293B]">Finance</SelectItem>
            <SelectItem value="operations" className="text-[#1E293B]">Operations</SelectItem>
            <SelectItem value="communication" className="text-[#1E293B]">Communication</SelectItem>
            <SelectItem value="analytics" className="text-[#1E293B]">Analytics</SelectItem>
            <SelectItem value="hr" className="text-[#1E293B]">HR</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter || '__all__'} onValueChange={(v) => { setStatusFilter(v === '__all__' ? '' : v); setPage(1) }}>
          <SelectTrigger className="w-[140px] bg-gray-50 border-[#E2E8F0] text-[#1E293B] text-xs">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent className="bg-white border-[#E2E8F0]">
            <SelectItem value="__all__" className="text-[#1E293B]">All Status</SelectItem>
            <SelectItem value="private" className="text-[#1E293B]">Private</SelectItem>
            <SelectItem value="approved" className="text-[#1E293B]">Approved</SelectItem>
            <SelectItem value="quarantined" className="text-[#1E293B]">Quarantined</SelectItem>
            <SelectItem value="disabled" className="text-[#1E293B]">Disabled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={riskFilter || '__all__'} onValueChange={(v) => setRiskFilter(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-[130px] bg-gray-50 border-[#E2E8F0] text-[#1E293B] text-xs">
            <SelectValue placeholder="All Risk" />
          </SelectTrigger>
          <SelectContent className="bg-white border-[#E2E8F0]">
            <SelectItem value="__all__" className="text-[#1E293B]">All Risk</SelectItem>
            <SelectItem value="low" className="text-[#1E293B]">Low</SelectItem>
            <SelectItem value="medium" className="text-[#1E293B]">Medium</SelectItem>
            <SelectItem value="high" className="text-[#1E293B]">High</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <Skeleton className="h-96 rounded-lg bg-gray-50" />
      ) : (
        <>
          <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
            <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow className="bg-[#F8FAFC] hover:bg-[#F8FAFC] border-[#E2E8F0]">
                    <TableHead className="text-[#64748B]">Name</TableHead>
                    <TableHead className="text-[#64748B] hidden md:table-cell">Category</TableHead>
                    <TableHead className="text-[#64748B]">Status</TableHead>
                    <TableHead className="text-[#64748B] hidden sm:table-cell">Risk</TableHead>
                    <TableHead className="text-[#64748B] hidden lg:table-cell">Version</TableHead>
                    <TableHead className="text-[#64748B] hidden lg:table-cell">Runtime</TableHead>
                    <TableHead className="text-[#64748B]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSkills.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-[#64748B] py-12">No skills found</TableCell>
                    </TableRow>
                  ) : (
                    filteredSkills.map((skill) => (
                      <TableRow key={skill.id} className="border-[#E2E8F0] hover:bg-gray-50">
                        <TableCell>
                          <div>
                            <p className="text-[#1E293B] font-medium">{skill.title || skill.name}</p>
                            <p className="text-[10px] text-[#64748B] font-mono">{skill.slug}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-[#64748B] hidden md:table-cell capitalize">{skill.category}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={`text-[10px] py-0 ${statusColor(skill.status)}`}>
                            {skill.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant="secondary" className={`text-[10px] py-0 ${riskColor(skill.riskLevel)}`}>
                            {skill.riskLevel}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[#64748B] font-mono text-xs hidden lg:table-cell">{skill.version}</TableCell>
                        <TableCell className="text-[#64748B] text-xs hidden lg:table-cell capitalize">{skill.runtime}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-[#64748B] hover:text-[#FF6A00]" onClick={() => openDetail(skill)}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-[#64748B]">Page {page} of {totalPages}</p>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Skill Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="bg-white border-[#E2E8F0] max-w-2xl max-h-[80vh] overflow-y-auto custom-scrollbar">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B] text-lg">{selectedSkill?.title || selectedSkill?.name}</DialogTitle>
          </DialogHeader>
          {selectedSkill && (
            <div className="space-y-4">
              {/* Meta row */}
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className={statusColor(selectedSkill.status)}>{selectedSkill.status}</Badge>
                <Badge variant="secondary" className={riskColor(selectedSkill.riskLevel)}>{selectedSkill.riskLevel} risk</Badge>
                <Badge variant="secondary" className="bg-[#F8FAFC] text-[#64748B]">v{selectedSkill.version}</Badge>
                <Badge variant="secondary" className="bg-[#F8FAFC] text-[#64748B]">{selectedSkill.runtime}</Badge>
                {selectedSkill.requiresApproval && (
                  <Badge variant="secondary" className="bg-amber-600/10 text-amber-600">requires approval</Badge>
                )}
              </div>

              {selectedSkill.purpose && (
                <div>
                  <h4 className="text-xs font-semibold text-[#64748B] uppercase mb-1">Purpose</h4>
                  <p className="text-sm text-[#1E293B]">{selectedSkill.purpose}</p>
                </div>
              )}

              {selectedSkill.description && (
                <div>
                  <h4 className="text-xs font-semibold text-[#64748B] uppercase mb-1">Description</h4>
                  <p className="text-sm text-[#1E293B]">{selectedSkill.description}</p>
                </div>
              )}

              {/* Inputs */}
              {(() => {
                const inputs = parseJSON<{ name?: string; type?: string; description?: string }>(selectedSkill.inputs)
                if (!inputs.length) return null
                return (
                  <div>
                    <h4 className="text-xs font-semibold text-[#64748B] uppercase mb-1">Inputs</h4>
                    <div className="bg-white rounded-xl border border-[#E2E8F0] p-3 max-h-32 overflow-y-auto custom-scrollbar">
                      {inputs.map((inp: { name?: string; type?: string; description?: string }, i: number) => (
                        <div key={i} className="flex items-center gap-2 py-1 text-xs">
                          <code className="text-[#FF6A00] font-mono">{inp.name || `input_${i}`}</code>
                          {inp.type && <span className="text-[#64748B]">({inp.type})</span>}
                          {inp.description && <span className="text-[#64748B]">— {inp.description}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* Outputs */}
              {(() => {
                const outputs = parseJSON<{ name?: string; type?: string; description?: string }>(selectedSkill.outputs)
                if (!outputs.length) return null
                return (
                  <div>
                    <h4 className="text-xs font-semibold text-[#64748B] uppercase mb-1">Outputs</h4>
                    <div className="bg-white rounded-xl border border-[#E2E8F0] p-3 max-h-32 overflow-y-auto custom-scrollbar">
                      {outputs.map((out: { name?: string; type?: string; description?: string }, i: number) => (
                        <div key={i} className="flex items-center gap-2 py-1 text-xs">
                          <code className="text-[#003ABC] font-mono">{out.name || `output_${i}`}</code>
                          {out.type && <span className="text-[#64748B]">({out.type})</span>}
                          {out.description && <span className="text-[#64748B]">— {out.description}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* Tools */}
              {(() => {
                const allowed = parseJSON<string>(selectedSkill.allowedTools)
                const forbidden = parseJSON<string>(selectedSkill.forbiddenTools)
                if (!allowed.length && !forbidden.length) return null
                return (
                  <div>
                    <h4 className="text-xs font-semibold text-[#64748B] uppercase mb-1">Tools</h4>
                    <div className="bg-white rounded-xl border border-[#E2E8F0] p-3 space-y-1">
                      {allowed.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          <span className="text-[10px] text-emerald-600 font-semibold">ALLOWED:</span>
                          {allowed.map((t: string, i: number) => (
                            <Badge key={i} variant="secondary" className="text-[10px] bg-emerald-600/10 text-emerald-600 py-0">{t}</Badge>
                          ))}
                        </div>
                      )}
                      {forbidden.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          <span className="text-[10px] text-red-600 font-semibold">FORBIDDEN:</span>
                          {forbidden.map((t: string, i: number) => (
                            <Badge key={i} variant="secondary" className="text-[10px] bg-red-600/10 text-red-600 py-0">{t}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* Validation Rules */}
              {(() => {
                const rules = parseJSON(selectedSkill.validationRules)
                if (!rules || (typeof rules === 'object' && Object.keys(rules as object).length === 0)) return null
                return (
                  <div>
                    <h4 className="text-xs font-semibold text-[#64748B] uppercase mb-1">Validation Rules</h4>
                    <pre className="bg-white rounded-xl border border-[#E2E8F0] p-3 text-xs text-[#1E293B] overflow-x-auto custom-scrollbar">{JSON.stringify(rules, null, 2)}</pre>
                  </div>
                )
              })()}

              {/* Cost Policy */}
              {(() => {
                const policy = parseJSON(selectedSkill.costPolicy)
                if (!policy || (typeof policy === 'object' && Object.keys(policy as object).length === 0)) return null
                return (
                  <div>
                    <h4 className="text-xs font-semibold text-[#64748B] uppercase mb-1">Cost Policy</h4>
                    <pre className="bg-white rounded-xl border border-[#E2E8F0] p-3 text-xs text-[#1E293B] overflow-x-auto custom-scrollbar">{JSON.stringify(policy, null, 2)}</pre>
                  </div>
                )
              })()}

              {/* Safety Rules */}
              {(() => {
                const safetyRules = parseJSON<string>(selectedSkill.safetyRules)
                if (!Array.isArray(safetyRules) || !safetyRules.length) return null
                return (
                  <div>
                    <h4 className="text-xs font-semibold text-[#64748B] uppercase mb-1">Safety Rules</h4>
                    <ul className="bg-white rounded-xl border border-[#E2E8F0] p-3 space-y-1">
                      {safetyRules.map((rule: string, i: number) => (
                        <li key={i} className="text-xs text-[#1E293B]">• {rule}</li>
                      ))}
                    </ul>
                  </div>
                )
              })()}

              {selectedSkill.failureHandling && (
                <div>
                  <h4 className="text-xs font-semibold text-[#64748B] uppercase mb-1">Failure Handling</h4>
                  <p className="text-sm text-[#1E293B]">{selectedSkill.failureHandling}</p>
                </div>
              )}

              <p className="text-[10px] text-[#64748B]">Created: {new Date(selectedSkill.createdAt).toLocaleString()}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}