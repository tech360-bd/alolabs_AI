'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Cpu,
  Bot,
  Wrench,
  GitBranch,
  Plus,
  Target,
  Brain,
  ShieldCheck,
  Route,
  RotateCcw,
  Search,
  Loader2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'

interface BuildRequest {
  id: string
  agentName: string
  departmentId: string | null
  config: string
  status: string
  result: string | null
  createdAt: string
}

interface Department {
  id: string
  name: string
  slug: string
}

const STABILITY_CHECKLIST = [
  { id: 'obj-lock', label: 'Single Objective Lock', icon: Target, desc: 'Agent has one clear, well-defined purpose' },
  { id: 'memory', label: 'Structured Memory Layer', icon: Brain, desc: 'Organized memory with short/long-term separation' },
  { id: 'tool-iso', label: 'Tool Isolation System', icon: ShieldCheck, desc: 'Each tool operates in its own sandbox' },
  { id: 'pipeline', label: 'Decision Pipeline', icon: Route, desc: 'Clear decision tree for choosing actions' },
  { id: 'feedback', label: 'Feedback Loop System', icon: RotateCcw, desc: 'Self-correction and learning from outcomes' },
]

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    pending: 'bg-amber-500/10 text-amber-600',
    generated: 'bg-purple-100 text-purple-700',
    building: 'bg-blue-100 text-blue-700',
    testing: 'bg-orange-100 text-orange-700',
    completed: 'bg-green-500/10 text-green-600',
    failed: 'bg-red-500/10 text-red-500',
    configured: 'bg-emerald-100 text-emerald-700',
  }
  return map[status] || 'bg-gray-100 text-gray-700'
}

interface SkillBuild {
  id: string
  skillName: string
  config: string
  status: string
  result: string | null
  createdAt: string
}

interface WorkflowBuild {
  id: string
  workflowName: string
  config: string
  status: string
  result: string | null
  createdAt: string
}

function SkillBuildsTab() {
  const [items, setItems] = useState<SkillBuild[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/skill-factory/build')
      .then((r) => r.json())
      .then((data) => setItems(Array.isArray(data) ? data : data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Skeleton className="h-48 w-full rounded-xl bg-gray-100" />

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden mt-4">
      <div className="p-4 pb-0">
        <h3 className="text-sm font-semibold text-[#1E293B]">Skill Build Requests</h3>
        <p className="text-xs text-[#94A3B8] mt-0.5">{items.length} build{items.length !== 1 ? 's' : ''}</p>
      </div>
      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-[#E2E8F0] hover:bg-transparent sticky top-0 bg-white">
              <TableHead className="text-[#64748B] text-xs font-medium">Name</TableHead>
              <TableHead className="text-[#64748B] text-xs font-medium">Type</TableHead>
              <TableHead className="text-[#64748B] text-xs font-medium">Status</TableHead>
              <TableHead className="text-[#64748B] text-xs font-medium hidden md:table-cell">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-[#94A3B8] py-12 text-sm">
                  No skill build requests yet
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id} className="border-[#E2E8F0] hover:bg-[#F8FAFC]">
                  <TableCell className="text-[#1E293B] font-medium text-sm">{item.skillName}</TableCell>
                  <TableCell>
                    <Badge className="text-[10px] py-0 border-0 bg-purple-500/10 text-purple-600">Skill</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] py-0 border-0 capitalize ${getStatusBadge(item.status)}`}>{item.status}</Badge>
                  </TableCell>
                  <TableCell className="text-[#94A3B8] text-xs hidden md:table-cell">
                    {(() => { try { return new Date(item.createdAt).toLocaleDateString() } catch { return item.createdAt } })()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function WorkflowBuildsTab() {
  const [items, setItems] = useState<WorkflowBuild[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/workflow-factory/build')
      .then((r) => r.json())
      .then((data) => setItems(Array.isArray(data) ? data : data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Skeleton className="h-48 w-full rounded-xl bg-gray-100" />

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden mt-4">
      <div className="p-4 pb-0">
        <h3 className="text-sm font-semibold text-[#1E293B]">Workflow Build Requests</h3>
        <p className="text-xs text-[#94A3B8] mt-0.5">{items.length} build{items.length !== 1 ? 's' : ''}</p>
      </div>
      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-[#E2E8F0] hover:bg-transparent sticky top-0 bg-white">
              <TableHead className="text-[#64748B] text-xs font-medium">Name</TableHead>
              <TableHead className="text-[#64748B] text-xs font-medium">Type</TableHead>
              <TableHead className="text-[#64748B] text-xs font-medium">Status</TableHead>
              <TableHead className="text-[#64748B] text-xs font-medium hidden md:table-cell">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-[#94A3B8] py-12 text-sm">
                  No workflow build requests yet
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id} className="border-[#E2E8F0] hover:bg-[#F8FAFC]">
                  <TableCell className="text-[#1E293B] font-medium text-sm">{item.workflowName}</TableCell>
                  <TableCell>
                    <Badge className="text-[10px] py-0 border-0 bg-emerald-500/10 text-emerald-600">Workflow</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] py-0 border-0 capitalize ${getStatusBadge(item.status)}`}>{item.status}</Badge>
                  </TableCell>
                  <TableCell className="text-[#94A3B8] text-xs hidden md:table-cell">
                    {(() => { try { return new Date(item.createdAt).toLocaleDateString() } catch { return item.createdAt } })()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

export default function AgentFactoryPanel() {
  const [loading, setLoading] = useState(true)
  const [builds, setBuilds] = useState<BuildRequest[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [activeTab, setActiveTab] = useState('agents')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [formName, setFormName] = useState('')
  const [formDept, setFormDept] = useState('')
  const [formPurpose, setFormPurpose] = useState('')

  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Debounced search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setSearch(searchInput)
    }, 300)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [searchInput])

  // Fetch departments
  useEffect(() => {
    fetch('/api/departments')
      .then((r) => r.json())
      .then((res) => setDepartments(res.data || []))
      .catch(() => {})
  }, [])

  // Fetch build requests
  const fetchBuilds = useCallback(() => {
    setLoading(true)
    fetch('/api/agent-factory/build')
      .then((r) => r.json())
      .then((data) => {
        setBuilds(Array.isArray(data) ? data : [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchBuilds()
  }, [fetchBuilds])

  const handleCreate = async () => {
    if (!formName.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/agent-factory/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentName: formName.trim(),
          departmentId: formDept || undefined,
          config: formPurpose ? { purpose: formPurpose } : {},
        }),
      })
      if (!res.ok) throw new Error('Failed to create build')
      const data = await res.json()
      toast.success(data.message || 'Build request created')
      setFormName('')
      setFormDept('')
      setFormPurpose('')
      setCreateOpen(false)
      fetchBuilds()
    } catch {
      toast.error('Failed to create build request')
    } finally {
      setSubmitting(false)
    }
  }

  const filteredBuilds = builds.filter((b) => {
    const matchSearch = !search || b.agentName.toLowerCase().includes(search.toLowerCase())
    const matchStatus = !statusFilter || b.status === statusFilter
    return matchSearch && matchStatus
  })

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString()
    } catch {
      return dateStr
    }
  }

  const renderStabilityChecklist = () => (
    <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 mt-4">
      <h3 className="text-sm font-semibold text-[#1E293B] mb-3">5-Step Stability Protocol</h3>
      <div className="space-y-3">
        {STABILITY_CHECKLIST.map((item) => {
          const Icon = item.icon
          return (
            <div key={item.id} className="flex items-start gap-3">
              <div className="mt-0.5 w-4 h-4 rounded border border-[#E2E8F0] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Icon className="w-3.5 h-3.5 text-[#94A3B8]" />
                  <span className="text-sm font-medium text-[#1E293B]">{item.label}</span>
                </div>
                <p className="text-xs text-[#94A3B8] mt-0.5">{item.desc}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  const renderBuildTable = (items: BuildRequest[]) => (
    <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden mt-4">
      <div className="p-4 pb-0">
        <h3 className="text-sm font-semibold text-[#1E293B]">Recent Build Requests</h3>
        <p className="text-xs text-[#94A3B8] mt-0.5">{items.length} build{items.length !== 1 ? 's' : ''} shown</p>
      </div>
      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-[#E2E8F0] hover:bg-transparent sticky top-0 bg-white">
              <TableHead className="text-[#64748B] text-xs font-medium">Name</TableHead>
              <TableHead className="text-[#64748B] text-xs font-medium">Type</TableHead>
              <TableHead className="text-[#64748B] text-xs font-medium hidden sm:table-cell">Agent ID</TableHead>
              <TableHead className="text-[#64748B] text-xs font-medium">Status</TableHead>
              <TableHead className="text-[#64748B] text-xs font-medium hidden md:table-cell">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-[#94A3B8] py-12 text-sm">
                  No build requests yet
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id} className="border-[#E2E8F0] hover:bg-[#F8FAFC]">
                  <TableCell className="text-[#1E293B] font-medium text-sm">{item.agentName}</TableCell>
                  <TableCell>
                    <Badge className="text-[10px] py-0 border-0 bg-[#003ABC]/10 text-[#003ABC]">
                      Agent
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[#94A3B8] text-xs font-mono hidden sm:table-cell">
                    {item.result?.match(/AGENT-\d+/)?.[0] || '—'}
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] py-0 border-0 capitalize ${getStatusBadge(item.status)}`}>
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[#94A3B8] text-xs hidden md:table-cell">
                    {formatDate(item.createdAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-56 bg-gray-100 rounded-lg" />
        <Skeleton className="h-10 w-64 bg-gray-100 rounded-lg" />
        <Skeleton className="h-96 rounded-xl bg-gray-100" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[#1E293B]">Agent Factory</h2>
          <p className="text-sm text-[#64748B] mt-1">Build new AI employees after capability approval</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#003ABC] hover:bg-[#002A8F] text-white rounded-lg">
              <Plus className="w-4 h-4 mr-2" />
              New Build
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-white border-[#E2E8F0] rounded-xl sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-[#1E293B]">Build New Agent</DialogTitle>
              <DialogDescription className="text-[#64748B]">Configure and deploy a new AI agent.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label className="text-[#1E293B] text-sm">Agent Name</Label>
                <Input
                  placeholder="e.g., Invoice Processor"
                  className="bg-[#F8FAFC] border-[#E2E8F0] text-[#1E293B] rounded-lg"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[#1E293B] text-sm">Department</Label>
                <Select value={formDept} onValueChange={setFormDept}>
                  <SelectTrigger className="bg-[#F8FAFC] border-[#E2E8F0] text-[#1E293B] rounded-lg">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[#E2E8F0] rounded-lg">
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id} className="text-[#1E293B]">{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[#1E293B] text-sm">Purpose / Description</Label>
                <Textarea
                  placeholder="What should this agent do?"
                  className="bg-[#F8FAFC] border-[#E2E8F0] text-[#1E293B] rounded-lg min-h-[80px]"
                  value={formPurpose}
                  onChange={(e) => setFormPurpose(e.target.value)}
                />
              </div>
              <Button
                className="w-full bg-[#003ABC] hover:bg-[#002A8F] text-white rounded-lg"
                onClick={handleCreate}
                disabled={!formName.trim() || submitting}
              >
                {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Cpu className="w-4 h-4 mr-2" />}
                Build Agent
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
          <Input
            placeholder="Search builds..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 bg-white border-[#E2E8F0] text-[#1E293B] rounded-lg"
          />
        </div>
        <Select value={statusFilter || '__all__'} onValueChange={(v) => setStatusFilter(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-[160px] bg-white border-[#E2E8F0] text-[#1E293B] rounded-lg text-xs">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent className="bg-white border-[#E2E8F0] rounded-lg">
            <SelectItem value="__all__" className="text-[#1E293B]">All Status</SelectItem>
            <SelectItem value="pending" className="text-[#1E293B]">Pending</SelectItem>
            <SelectItem value="generated" className="text-[#1E293B]">Generated</SelectItem>
            <SelectItem value="building" className="text-[#1E293B]">Building</SelectItem>
            <SelectItem value="completed" className="text-[#1E293B]">Completed</SelectItem>
            <SelectItem value="failed" className="text-[#1E293B]">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white border border-[#E2E8F0] rounded-lg h-10 p-1">
          <TabsTrigger value="agents" className="rounded-md text-xs data-[state=active]:bg-[#003ABC] data-[state=active]:text-white text-[#64748B]">
            <Bot className="w-3.5 h-3.5 mr-1.5" />
            Agents
          </TabsTrigger>
          <TabsTrigger value="skills" className="rounded-md text-xs data-[state=active]:bg-[#003ABC] data-[state=active]:text-white text-[#64748B]">
            <Wrench className="w-3.5 h-3.5 mr-1.5" />
            Skills
          </TabsTrigger>
          <TabsTrigger value="workflows" className="rounded-md text-xs data-[state=active]:bg-[#003ABC] data-[state=active]:text-white text-[#64748B]">
            <GitBranch className="w-3.5 h-3.5 mr-1.5" />
            Workflows
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agents" className="mt-4">
          {renderStabilityChecklist()}
          {renderBuildTable(filteredBuilds)}
        </TabsContent>

        <TabsContent value="skills" className="mt-4">
          {renderStabilityChecklist()}
          <SkillBuildsTab />
        </TabsContent>

        <TabsContent value="workflows" className="mt-4">
          {renderStabilityChecklist()}
          <WorkflowBuildsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}