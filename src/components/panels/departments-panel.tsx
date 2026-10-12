'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  Building2,
  FolderTree,
  Search,
  Plus,
  Users,
  GitBranch,
  ListTodo,
  Activity,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Edit,
  Trash2,
  Eye,
  UserPlus,
  BarChart3,
  Zap,
  Heart,
  ArrowUpRight,
  Circle,
  LayoutGrid,
  Network,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Department {
  id: string
  name: string
  slug: string
  description?: string
  status: string
  agentCount: number
  parentId?: string | null
  head?: { name: string; email: string }
  metrics?: {
    workflows: number
    tasks: number
    usagePercent: number
    healthScore: number
  }
}

interface DeptDetail extends Department {
  agents?: { id: string; name: string; status: string }[]
  recentActivity?: { action: string; time: string; agent: string }[]
}



// ─── Helpers ─────────────────────────────────────────────────────────────────

const healthColor = (score: number) => {
  if (score >= 90) return { color: 'text-emerald-600', bg: 'bg-emerald-50', dot: 'bg-emerald-500', label: 'Healthy' }
  if (score >= 75) return { color: 'text-amber-600', bg: 'bg-amber-50', dot: 'bg-amber-500', label: 'Fair' }
  return { color: 'text-red-600', bg: 'bg-red-50', dot: 'bg-red-500', label: 'Critical' }
}

const getInitials = (name: string) => name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)

// ─── Component ───────────────────────────────────────────────────────────────

export default function DepartmentsPanel() {
  const [departments, setDepartments] = useState<DeptDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'tree'>('grid')
  const [selectedDept, setSelectedDept] = useState<DeptDetail | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['d1']))
  const [createForm, setCreateForm] = useState({ name: '', description: '', head: '', parentId: '' })

  useEffect(() => {
    fetch('/api/departments')
      .then((r) => r.json())
      .then((res) => {
        const apiDepts = (res.data || []) as Department[]
        setDepartments(apiDepts.map((d) => ({
          ...d,
          description: d.description || '',
          metrics: { workflows: 0, tasks: 0, usagePercent: 0, healthScore: 100 },
          agents: [],
          recentActivity: [],
        })) as DeptDetail[])
      })
      .catch(() => setDepartments([]))
      .finally(() => setLoading(false))
  }, [])

  const filteredDepts = useMemo(() => {
    if (!search.trim()) return departments
    const q = search.toLowerCase()
    return departments.filter((d) => d.name.toLowerCase().includes(q) || d.slug.includes(q) || d.description?.toLowerCase().includes(q))
  }, [departments, search])

  const rootDepts = filteredDepts.filter((d) => !d.parentId)
  const getChildren = (parentId: string) => filteredDepts.filter((d) => d.parentId === parentId)

  const toggleExpand = (id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const totalAgents = departments.reduce((sum, d) => sum + d.agentCount, 0)
  const avgHealth = Math.round(departments.reduce((sum, d) => sum + (d.metrics?.healthScore || 0), 0) / Math.max(departments.length, 1))

  const handleCreate = () => {
    if (!createForm.name.trim()) return
    toast.success(`Department "${createForm.name}" created`)
    setShowCreateDialog(false)
    setCreateForm({ name: '', description: '', head: '', parentId: '' })
  }

  const renderDeptStats = (dept: DeptDetail) => {
    const h = healthColor(dept.metrics?.healthScore || 0)
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
        <div className="bg-slate-50 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Users className="w-3.5 h-3.5 text-[#94A3B8]" />
            <span className="text-[11px] text-[#94A3B8]">Agents</span>
          </div>
          <p className="text-lg font-bold text-[#1E293B]">{dept.agentCount}</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <GitBranch className="w-3.5 h-3.5 text-[#94A3B8]" />
            <span className="text-[11px] text-[#94A3B8]">Workflows</span>
          </div>
          <p className="text-lg font-bold text-[#1E293B]">{dept.metrics?.workflows || 0}</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <ListTodo className="w-3.5 h-3.5 text-[#94A3B8]" />
            <span className="text-[11px] text-[#94A3B8]">Tasks</span>
          </div>
          <p className="text-lg font-bold text-[#1E293B]">{dept.metrics?.tasks || 0}</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Activity className="w-3.5 h-3.5 text-[#94A3B8]" />
            <span className="text-[11px] text-[#94A3B8]">Usage</span>
          </div>
          <p className="text-lg font-bold text-[#1E293B]">{dept.metrics?.usagePercent || 0}%</p>
          <Progress value={dept.metrics?.usagePercent || 0} className="h-1.5 mt-1" />
        </div>
      </div>
    )
  }

  const renderTreeItem = (dept: DeptDetail, depth: number = 0) => {
    const children = getChildren(dept.id)
    const hasChildren = children.length > 0
    const isExpanded = expandedNodes.has(dept.id)
    const h = healthColor(dept.metrics?.healthScore || 0)

    return (
      <div key={dept.id}>
        <div
          className="flex items-center gap-3 p-3 rounded-lg hover:bg-white cursor-pointer transition-colors border border-transparent hover:border-[#E2E8F0] group"
          style={{ paddingLeft: `${depth * 24 + 12}px` }}
          onClick={() => setSelectedDept(dept)}
        >
          {/* Expand toggle */}
          <button onClick={(e) => { e.stopPropagation(); if (hasChildren) toggleExpand(dept.id) }} className="flex-shrink-0">
            {hasChildren ? (
              isExpanded ? <ChevronDown className="w-4 h-4 text-[#94A3B8]" /> : <ChevronRight className="w-4 h-4 text-[#94A3B8]" />
            ) : (
              <div className="w-4" />
            )}
          </button>

          {/* Icon */}
          <div className="w-9 h-9 rounded-lg bg-[#003ABC]/10 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-4 h-4 text-[#003ABC]" />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-[#1E293B] truncate">{dept.name}</h3>
              <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${dept.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{dept.status}</Badge>
            </div>
            <p className="text-[11px] text-[#94A3B8]">{dept.agentCount} agents · {dept.metrics?.workflows || 0} workflows</p>
          </div>

          {/* Health */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className={`w-2 h-2 rounded-full ${h.dot}`} />
            <span className={`text-[11px] font-medium ${h.color}`}>{dept.metrics?.healthScore || 0}</span>
          </div>

          {/* Actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 text-[#94A3B8] hover:text-[#1E293B] transition-opacity">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="gap-2"><Eye className="w-3.5 h-3.5" /> View Details</DropdownMenuItem>
              <DropdownMenuItem className="gap-2"><Edit className="w-3.5 h-3.5" /> Edit</DropdownMenuItem>
              <DropdownMenuItem className="gap-2"><UserPlus className="w-3.5 h-3.5" /> Assign Agent</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="gap-2 text-red-600"><Trash2 className="w-3.5 h-3.5" /> Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div className="space-y-0.5">
            {children.map((child) => renderTreeItem(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#003ABC] to-[#0077FF] flex items-center justify-center">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#1E293B]">Departments</h2>
            <p className="text-sm text-[#64748B]">{departments.length} departments · {totalAgents} total agents</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className={`h-9 w-9 ${viewMode === 'tree' ? 'bg-[#003ABC]/10 border-[#003ABC]/30 text-[#003ABC]' : 'border-[#E2E8F0] text-[#64748B]'}`} onClick={() => setViewMode('tree')}>
            <Network className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" className={`h-9 w-9 ${viewMode === 'grid' ? 'bg-[#003ABC]/10 border-[#003ABC]/30 text-[#003ABC]' : 'border-[#E2E8F0] text-[#64748B]'}`} onClick={() => setViewMode('grid')}>
            <LayoutGrid className="w-4 h-4" />
          </Button>
          <Button size="sm" className="bg-[#FF6A00] hover:bg-[#E5600A] text-white gap-1.5" onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-3.5 h-3.5" /> New Department
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-[#E2E8F0] shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-[#94A3B8]">Total Departments</span>
              <Building2 className="w-4 h-4 text-[#003ABC]" />
            </div>
            <p className="text-2xl font-bold text-[#1E293B]">{departments.length}</p>
            <p className="text-[11px] text-emerald-600 mt-1">{departments.filter((d) => d.status === 'active').length} active</p>
          </CardContent>
        </Card>
        <Card className="border-[#E2E8F0] shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-[#94A3B8]">Total Agents</span>
              <Users className="w-4 h-4 text-[#FF6A00]" />
            </div>
            <p className="text-2xl font-bold text-[#1E293B]">{totalAgents}</p>
          </CardContent>
        </Card>
        <Card className="border-[#E2E8F0] shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-[#94A3B8]">Avg Health</span>
              <Heart className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-2xl font-bold text-[#1E293B]">{avgHealth}</p>
            <Progress value={avgHealth} className="h-1.5 mt-1.5" />
          </CardContent>
        </Card>
        <Card className="border-[#E2E8F0] shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-[#94A3B8]">Total Workflows</span>
              <GitBranch className="w-4 h-4 text-purple-500" />
            </div>
            <p className="text-2xl font-bold text-[#1E293B]">{departments.reduce((s, d) => s + (d.metrics?.workflows || 0), 0)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
        <Input placeholder="Search departments..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-white border-[#E2E8F0]" />
      </div>

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredDepts.map((dept) => {
            const h = healthColor(dept.metrics?.healthScore || 0)
            return (
              <Card key={dept.id} className="border-[#E2E8F0] shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedDept(dept)}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-[#003ABC]/10 flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-5 h-5 text-[#003ABC]" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-[#1E293B]">{dept.name}</h3>
                        <p className="text-[11px] text-[#94A3B8] font-mono">{dept.slug}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${h.dot}`} />
                      <span className={`text-[10px] font-medium ${h.color}`}>{h.label}</span>
                    </div>
                  </div>

                  {dept.description && (
                    <p className="text-xs text-[#64748B] line-clamp-2 leading-relaxed">{dept.description}</p>
                  )}

                  <Separator />

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="flex items-center justify-center gap-1">
                        <Users className="w-3 h-3 text-[#94A3B8]" />
                        <span className="text-sm font-bold text-[#1E293B]">{dept.agentCount}</span>
                      </div>
                      <p className="text-[9px] text-[#94A3B8]">Agents</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-center gap-1">
                        <GitBranch className="w-3 h-3 text-[#94A3B8]" />
                        <span className="text-sm font-bold text-[#1E293B]">{dept.metrics?.workflows || 0}</span>
                      </div>
                      <p className="text-[9px] text-[#94A3B8]">Workflows</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-center gap-1">
                        <ListTodo className="w-3 h-3 text-[#94A3B8]" />
                        <span className="text-sm font-bold text-[#1E293B]">{dept.metrics?.tasks || 0}</span>
                      </div>
                      <p className="text-[9px] text-[#94A3B8]">Tasks</p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-[#94A3B8]">Usage</span>
                      <span className="font-medium text-[#1E293B]">{dept.metrics?.usagePercent || 0}%</span>
                    </div>
                    <Progress value={dept.metrics?.usagePercent || 0} className="h-1.5" />
                  </div>

                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${dept.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{dept.status}</Badge>
                    {dept.head && (
                      <div className="flex items-center gap-1.5">
                        <Avatar className="w-5 h-5">
                          <AvatarFallback className="bg-slate-100 text-[#64748B] text-[8px]">{getInitials(dept.head.name)}</AvatarFallback>
                        </Avatar>
                        <span className="text-[10px] text-[#94A3B8] hidden sm:inline">{dept.head.name}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Tree View */}
      {viewMode === 'tree' && (
        <Card className="border-[#E2E8F0] shadow-sm">
          <CardContent className="p-3">
            <div className="space-y-0.5">
              {rootDepts.map((dept) => renderTreeItem(dept, 0))}
            </div>
            {filteredDepts.length === 0 && (
              <div className="text-center py-12">
                <Building2 className="w-10 h-10 text-[#CBD5E1] mx-auto mb-3" />
                <p className="text-sm text-[#64748B]">No departments found</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Department Detail Dialog */}
      <Dialog open={!!selectedDept} onOpenChange={() => setSelectedDept(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {selectedDept && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-[#003ABC]/10 flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-[#003ABC]" />
                  </div>
                  <div>
                    <DialogTitle className="text-[#1E293B]">{selectedDept.name}</DialogTitle>
                    <DialogDescription className="text-[#64748B]">{selectedDept.description || 'No description'}</DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4">
                {/* Health indicator */}
                <div className="flex items-center gap-4 bg-slate-50 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <Heart className="w-5 h-5 text-[#FF6A00]" />
                    <span className="text-sm font-medium text-[#1E293B]">Health Score</span>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${healthColor(selectedDept.metrics?.healthScore || 0).dot}`} />
                    <span className={`text-lg font-bold ${healthColor(selectedDept.metrics?.healthScore || 0).color}`}>
                      {selectedDept.metrics?.healthScore || 0}/100
                    </span>
                  </div>
                </div>

                {renderDeptStats(selectedDept)}

                {/* Agents List */}
                {selectedDept.agents && selectedDept.agents.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-medium text-[#1E293B] mb-2">Agents ({selectedDept.agentCount})</p>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {selectedDept.agents.map((agent) => (
                          <div key={agent.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-[#003ABC]/10 flex items-center justify-center">
                                <Zap className="w-3.5 h-3.5 text-[#003ABC]" />
                              </div>
                              <span className="text-sm text-[#1E293B]">{agent.name}</span>
                            </div>
                            <Badge variant="secondary" className={`text-[10px] ${agent.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                              {agent.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                      {selectedDept.agentCount > (selectedDept.agents?.length || 0) && (
                        <Button variant="ghost" size="sm" className="mt-2 text-[#003ABC] text-xs w-full">
                          View all {selectedDept.agentCount} agents <ArrowUpRight className="w-3 h-3 ml-1" />
                        </Button>
                      )}
                    </div>
                  </>
                )}

                {/* Recent Activity */}
                {selectedDept.recentActivity && selectedDept.recentActivity.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-medium text-[#1E293B] mb-2">Recent Activity</p>
                      <div className="space-y-2">
                        {selectedDept.recentActivity.map((act, i) => (
                          <div key={i} className="flex items-center gap-3 text-xs">
                            <Circle className="w-1.5 h-1.5 text-[#CBD5E1] flex-shrink-0" />
                            <span className="text-[#64748B]"><span className="text-[#1E293B] font-medium">{act.agent}</span> — {act.action}</span>
                            <span className="text-[#94A3B8] ml-auto flex-shrink-0">{act.time}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Hierarchy visualization */}
                {selectedDept.parentId && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-medium text-[#1E293B] mb-2">Hierarchy</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="bg-[#003ABC]/10 text-[#003ABC] text-[11px] px-2 py-1 rounded-md font-medium">
                          {departments.find((d) => d.id === selectedDept.parentId)?.name || 'Parent'}
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-[#CBD5E1]" />
                        <div className="bg-[#FF6A00]/10 text-[#FF6A00] text-[11px] px-2 py-1 rounded-md font-medium">
                          {selectedDept.name}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" className="text-[#003ABC] border-[#003ABC]/30 gap-1.5">
                  <UserPlus className="w-3.5 h-3.5" /> Assign Agent
                </Button>
                <Button variant="outline" className="text-[#64748B] gap-1.5">
                  <Edit className="w-3.5 h-3.5" /> Edit
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Department Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B]">Create Department</DialogTitle>
            <DialogDescription className="text-[#64748B]">Add a new department to the organization.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-[#1E293B]">Department Name</Label>
              <Input placeholder="e.g. Research & Development" value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} className="bg-white border-[#E2E8F0]" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-[#1E293B]">Description</Label>
              <Textarea placeholder="Describe the department..." value={createForm.description} onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))} className="bg-white border-[#E2E8F0] min-h-[80px]" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-[#1E293B]">Department Head</Label>
              <Input placeholder="Name or email" value={createForm.head} onChange={(e) => setCreateForm((f) => ({ ...f, head: e.target.value }))} className="bg-white border-[#E2E8F0]" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-[#1E293B]">Parent Department</Label>
              <Select value={createForm.parentId} onValueChange={(v) => setCreateForm((f) => ({ ...f, parentId: v }))}>
                <SelectTrigger className="bg-white border-[#E2E8F0]">
                  <SelectValue placeholder="None (top-level)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (top-level)</SelectItem>
                  {departments.filter((d) => !d.parentId).map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} className="text-[#64748B]">Cancel</Button>
            <Button className="bg-[#FF6A00] hover:bg-[#E5600A] text-white" onClick={handleCreate} disabled={!createForm.name.trim()}>Create Department</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}