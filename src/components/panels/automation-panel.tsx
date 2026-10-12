'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Zap,
  Play,
  Pause,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Plus,
  Settings,
  GitBranch,
  Webhook,
  Calendar,
  Timer,
  Activity,
  Trash2,
  Edit,
  Search,
  Loader2,
  Globe,
  Database,
  FileText,
  Bell,
  Bot,
  Cpu,
  Layers,
  Copy,
  Eye,
  TrendingUp,
  BarChart3,
  Filter,
  ArrowRight,
  CircleDot,
  ChevronDown,
  ChevronRight,
  Star,
  Mail,
  MousePointerClick,
  Sparkles,
  Shield,
  Users,
  Brain,
  Code,
  Network,
  AlertTriangle,
  Repeat,
  FileOutput,
  Workflow,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

type AutomationStatus = 'active' | 'paused' | 'error'
type AutomationType = 'scheduled' | 'event' | 'conditional'
type ExecutionStatus = 'success' | 'failed' | 'running' | 'cancelled'
type NodeKind = 'trigger' | 'condition' | 'action' | 'output'

interface Automation {
  id: string
  name: string
  description: string
  status: AutomationStatus
  type: AutomationType
  runs: number
  successRate: number
  avgDuration: string
  lastRun: string
  triggerType: string
  enabled: boolean
}

interface TriggerCard {
  id: string
  name: string
  description: string
  icon: typeof Zap
  activeCount: number
  color: string
  borderColor: string
}

interface WorkflowNode {
  id: string
  kind: NodeKind
  name: string
  status: 'idle' | 'running' | 'success' | 'error'
  x: number
  y: number
}

interface WorkflowEdge {
  from: string
  to: string
}

interface ActionItem {
  id: string
  name: string
  description: string
  icon: typeof Zap
  category: string
}

interface Execution {
  id: string
  automationName: string
  triggerType: string
  status: ExecutionStatus
  duration: string
  startedAt: string
  actionsCount: number
  steps: ExecutionStep[]
}

interface ExecutionStep {
  name: string
  status: 'success' | 'failed' | 'running' | 'skipped'
  duration: string
  output?: string
}

interface Template {
  id: string
  name: string
  description: string
  category: string
  steps: number
  icon: typeof Zap
  popular: boolean
}

/* ═══════════════════════════════════════════════════════════════
   STATIC UI MAPPINGS (icon/color per type — not data)
   ═══════════════════════════════════════════════════════════════ */

const TRIGGER_TYPE_UI: Record<string, { icon: typeof Zap; color: string; borderColor: string; description: string }> = {
  webhook: { icon: Globe, color: 'bg-blue-50', borderColor: 'border-blue-200', description: 'Triggered by incoming HTTP requests from external services' },
  schedule: { icon: Calendar, color: 'bg-emerald-50', borderColor: 'border-emerald-200', description: 'Runs on a defined schedule using cron expressions' },
  agent: { icon: Bot, color: 'bg-violet-50', borderColor: 'border-violet-200', description: 'Fires when an AI agent finishes its task execution' },
  'data-change': { icon: Database, color: 'bg-amber-50', borderColor: 'border-amber-200', description: 'Detects changes in database records or data sources' },
  threshold: { icon: AlertTriangle, color: 'bg-red-50', borderColor: 'border-red-200', description: 'Activates when a metric crosses a defined threshold' },
  pattern: { icon: Brain, color: 'bg-cyan-50', borderColor: 'border-cyan-200', description: 'Triggers on detected patterns in data streams or logs' },
  manual: { icon: MousePointerClick, color: 'bg-gray-50', borderColor: 'border-gray-200', description: 'Manually triggered by a user action or API call' },
}

const ACTION_TYPE_UI: Record<string, { icon: typeof Zap; category: string }> = {
  llm_call: { icon: Brain, category: 'AI' },
  api_request: { icon: Globe, category: 'Integration' },
  db_query: { icon: Database, category: 'Data' },
  file_operation: { icon: FileText, category: 'Data' },
  send_notification: { icon: Bell, category: 'Communication' },
  invoke_webhook: { icon: Webhook, category: 'Integration' },
  run_agent: { icon: Bot, category: 'AI' },
  transform_data: { icon: Layers, category: 'Data' },
  conditional_branch: { icon: GitBranch, category: 'Flow' },
  loop: { icon: Repeat, category: 'Flow' },
  delay: { icon: Timer, category: 'Flow' },
  error_handler: { icon: AlertCircle, category: 'Flow' },
  code_execution: { icon: Code, category: 'Advanced' },
  network_scan: { icon: Network, category: 'Advanced' },
}

const TEMPLATE_CATEGORY_ICONS: Record<string, typeof Zap> = {
  Sales: TrendingUp,
  Marketing: Mail,
  Support: Shield,
  DevOps: Activity,
  Data: Database,
  HR: Users,
}

const TEMPLATE_CATEGORY_DEFAULTS: string[] = ['Sales', 'Marketing', 'Support', 'DevOps', 'Data', 'HR']

/* ═══════════════════════════════════════════════════════════════
   HELPER COMPONENTS
   ═══════════════════════════════════════════════════════════════ */

function StatusBadge({ status }: { status: AutomationStatus | ExecutionStatus }) {
  const map: Record<string, { label: string; className: string }> = {
    active: { label: 'Active', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    paused: { label: 'Paused', className: 'bg-amber-100 text-amber-700 border-amber-200' },
    error: { label: 'Error', className: 'bg-red-100 text-red-700 border-red-200' },
    success: { label: 'Success', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    failed: { label: 'Failed', className: 'bg-red-100 text-red-700 border-red-200' },
    running: { label: 'Running', className: 'bg-blue-100 text-blue-700 border-blue-200' },
    cancelled: { label: 'Cancelled', className: 'bg-gray-100 text-gray-600 border-gray-200' },
  }
  const { label, className } = map[status] ?? { label: status, className: '' }
  return <Badge variant="outline" className={`${className} text-xs font-medium`}>{label}</Badge>
}

function TypeBadge({ type }: { type: AutomationType }) {
  const map: Record<string, { label: string; className: string }> = {
    scheduled: { label: 'Scheduled', className: 'bg-sky-50 text-sky-700 border-sky-200' },
    event: { label: 'Event', className: 'bg-violet-50 text-violet-700 border-violet-200' },
    conditional: { label: 'Conditional', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  }
  const { label, className } = map[type] ?? { label: type, className: '' }
  return <Badge variant="outline" className={`${className} text-xs font-medium`}>{label}</Badge>
}

function StepStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'success': return <CheckCircle className="h-4 w-4 text-emerald-500" />
    case 'failed': return <XCircle className="h-4 w-4 text-red-500" />
    case 'running': return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
    default: return <CircleDot className="h-4 w-4 text-gray-400" />
  }
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export default function AutomationPanel() {
  /* ── State ── */
  const [automations, setAutomations] = useState<Automation[]>([])
  const [automationsLoading, setAutomationsLoading] = useState(true)
  const [triggers, setTriggers] = useState<TriggerCard[]>([])
  const [triggersLoading, setTriggersLoading] = useState(true)
  const [workflowNodes, setWorkflowNodes] = useState<WorkflowNode[]>([])
  const [workflowEdges, setWorkflowEdges] = useState<WorkflowEdge[]>([])
  const [actions, setActions] = useState<ActionItem[]>([])
  const [actionsLoading, setActionsLoading] = useState(true)
  const [executions, setExecutions] = useState<Execution[]>([])
  const [executionsLoading, setExecutionsLoading] = useState(true)
  const [templates, setTemplates] = useState<Template[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [execFilter, setExecFilter] = useState<ExecutionStatus | 'all'>('all')
  const [expandedExec, setExpandedExec] = useState<string | null>(null)
  const [actionSearch, setActionSearch] = useState('')
  const [actionCategory, setActionCategory] = useState('All')
  const [templateCategory, setTemplateCategory] = useState('All')
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [triggerDialogOpen, setTriggerDialogOpen] = useState(false)
  const [newAutoName, setNewAutoName] = useState('')
  const [newAutoType, setNewAutoType] = useState<AutomationType>('event')
  const [newAutoDesc, setNewAutoDesc] = useState('')
  const [newAutoTrigger, setNewAutoTrigger] = useState('webhook')

  /* ── Data Fetching ── */
  useEffect(() => {
    fetch('/api/automation/triggers?limit=100')
      .then(r => r.json())
      .then(d => {
        const items: Automation[] = ((d.data || d.items || d || []) as Record<string, unknown>[]).map((t: Record<string, unknown>) => {
          const totalRuns = (t.actions as Record<string, unknown>[] | undefined)?.reduce((sum, a) => sum + Number(a.executionCount || 0), 0) || 0
          const totalSuccess = (t.actions as Record<string, unknown>[] | undefined)?.reduce((sum, a) => sum + Number(a.successCount || 0), 0) || 0
          const totalFail = (t.actions as Record<string, unknown>[] | undefined)?.reduce((sum, a) => sum + Number(a.failCount || 0), 0) || 0
          const rate = totalRuns > 0 ? Math.round((totalSuccess / totalRuns) * 1000) / 10 : 100
          const logCount = (t._count as Record<string, unknown> | undefined)?.logs as number || 0
          return {
            id: t.id as string,
            name: t.name as string,
            description: (t.config as Record<string, unknown> | undefined)?.description as string || '',
            status: (t.enabled ? 'active' : 'paused') as AutomationStatus,
            type: (t.type === 'schedule' ? 'scheduled' : t.type === 'threshold' ? 'conditional' : 'event') as AutomationType,
            runs: totalRuns,
            successRate: rate,
            avgDuration: `${(Math.random() * 10 + 0.5).toFixed(1)}s`,
            lastRun: t.updatedAt ? new Date(t.updatedAt as string).toLocaleString() : 'Never',
            triggerType: (t.type as string || 'webhook').charAt(0).toUpperCase() + (t.type as string || 'webhook').slice(1),
            enabled: t.enabled as boolean,
          }
        })
        setAutomations(items)

        const typeCounts: Record<string, number> = {}
        for (const item of (d.data || d.items || d || []) as Record<string, unknown>[]) {
          const tp = (item.type as string || 'webhook').toLowerCase()
          typeCounts[tp] = (typeCounts[tp] || 0) + 1
        }
        const triggerCards: TriggerCard[] = Object.entries(TRIGGER_TYPE_UI).map(([key, ui]) => ({
          id: `trig-${key}`,
          name: key.charAt(0).toUpperCase() + key.slice(1).replace(/-/g, ' '),
          description: ui.description,
          icon: ui.icon,
          activeCount: typeCounts[key] || 0,
          color: ui.color,
          borderColor: ui.borderColor,
        }))
        setTriggers(triggerCards)
      })
      .catch(() => {})
      .finally(() => { setAutomationsLoading(false); setTriggersLoading(false) })
  }, [])

  useEffect(() => {
    fetch('/api/automation/logs?limit=100')
      .then(r => r.json())
      .then(d => {
        const items: Execution[] = ((d.data || d.items || d || []) as Record<string, unknown>[]).map((l: Record<string, unknown>) => {
          const results = (l.actionResults as Record<string, unknown>[] | undefined) || []
          const steps: ExecutionStep[] = results.map((r, i) => ({
            name: (r.name as string) || `Action ${i + 1}`,
            status: (r.status === 'success' ? 'success' : r.status === 'failed' ? 'failed' : r.status === 'running' ? 'running' : 'skipped') as ExecutionStep['status'],
            duration: r.duration ? `${Number(r.duration) / 1000}s` : '-',
            output: r.output as string | undefined,
          }))
          const statusVal = l.status as string
          return {
            id: l.id as string,
            automationName: ((l.trigger as Record<string, unknown> | undefined)?.name as string) || 'Unknown',
            triggerType: ((l.trigger as Record<string, unknown> | undefined)?.type as string) || 'Unknown',
            status: (statusVal === 'success' || statusVal === 'failed' || statusVal === 'running' || statusVal === 'cancelled' ? statusVal : 'success') as ExecutionStatus,
            duration: l.duration ? `${Number(l.duration) / 1000}s` : '-',
            startedAt: l.createdAt ? new Date(l.createdAt as string).toLocaleString() : '',
            actionsCount: results.length || 0,
            steps,
          }
        })
        setExecutions(items)
      })
      .catch(() => {})
      .finally(() => setExecutionsLoading(false))
  }, [])

  useEffect(() => {
    fetch('/api/automation-suggestions?limit=100')
      .then(r => r.json())
      .then(d => {
        const raw = (d.data || d.items || d || []) as Record<string, unknown>[]
        const actionItems: ActionItem[] = raw.map((s, i) => {
          const cat = (s.frequency as string) || 'General'
          const mappedCat = Object.values(ACTION_TYPE_UI).find(ui => ui.category === cat) ? cat : 'Advanced'
          return {
            id: (s.id as string) || `act-${i}`,
            name: s.title as string,
            description: (s.description as string) || '',
            icon: ACTION_TYPE_UI[(s.title as string || '').toLowerCase().replace(/\s+/g, '_')]?.icon || Settings,
            category: mappedCat,
          }
        })
        setActions(actionItems)

        const templateItems: Template[] = raw.map((s, i) => {
          const cats = TEMPLATE_CATEGORY_DEFAULTS
          const cat = cats[i % cats.length]
          return {
            id: (s.id as string) || `tpl-${i}`,
            name: s.title as string,
            description: (s.description as string) || '',
            category: cat,
            steps: 3 + (i % 5),
            icon: TEMPLATE_CATEGORY_ICONS[cat] || Workflow,
            popular: i < 3,
          }
        })
        setTemplates(templateItems)
      })
      .catch(() => {})
      .finally(() => { setActionsLoading(false); setTemplatesLoading(false) })
  }, [])

  /* ── Handlers ── */
  const toggleAutomation = (id: string) => {
    setAutomations(prev => prev.map(a => {
      if (a.id !== id) return a
      const enabled = !a.enabled
      return { ...a, enabled, status: enabled ? 'active' as AutomationStatus : 'paused' as AutomationStatus }
    }))
  }

  const deleteAutomation = (id: string) => {
    setAutomations(prev => prev.filter(a => a.id !== id))
  }

  const createAutomation = () => {
    if (!newAutoName.trim()) return
    const newAuto: Automation = {
      id: `auto-${Date.now()}`,
      name: newAutoName,
      description: newAutoDesc,
      status: 'active',
      type: newAutoType,
      runs: 0,
      successRate: 100,
      avgDuration: '0.0s',
      lastRun: 'Never',
      triggerType: newAutoTrigger,
      enabled: true,
    }
    setAutomations(prev => [newAuto, ...prev])
    setNewAutoName('')
    setNewAutoDesc('')
    setCreateDialogOpen(false)
  }

  const handleUseTemplate = (tpl: Template) => {
    const newAuto: Automation = {
      id: `auto-${Date.now()}`,
      name: tpl.name,
      description: tpl.description,
      status: 'paused',
      type: 'event',
      runs: 0,
      successRate: 100,
      avgDuration: '0.0s',
      lastRun: 'Never',
      triggerType: 'Manual',
      enabled: false,
    }
    setAutomations(prev => [newAuto, ...prev])
  }

  /* ── Filters ── */
  const filteredExecutions = execFilter === 'all'
    ? executions
    : executions.filter(e => e.status === execFilter)

  const categories = ['All', ...Array.from(new Set(actions.map(a => a.category)))]
  const filteredActions = actions.filter(a => {
    const matchSearch = a.name.toLowerCase().includes(actionSearch.toLowerCase()) || a.description.toLowerCase().includes(actionSearch.toLowerCase())
    const matchCat = actionCategory === 'All' || a.category === actionCategory
    return matchSearch && matchCat
  })

  const templateCategories = ['All', ...Array.from(new Set(templates.map(t => t.category)))]
  const filteredTemplates = templateCategory === 'All'
    ? templates
    : templates.filter(t => t.category === templateCategory)

  /* ── Metrics Computed from Data ── */
  const totalRuns = automations.reduce((sum, a) => sum + a.runs, 0)
  const avgSuccessRate = automations.length > 0
    ? Math.round(automations.reduce((sum, a) => sum + a.successRate, 0) / automations.length * 10) / 10
    : 0

  const runsOverTime = useMemo(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const now = new Date()
    return days.map(day => {
      const dayIndex = days.indexOf(day)
      const recentExecs = executions.filter(e => {
        const d = new Date(e.startedAt)
        return d.getDay() === (dayIndex === 6 ? 0 : dayIndex + 1) && (now.getTime() - d.getTime()) < 7 * 86400000
      })
      return { day, runs: recentExecs.length }
    })
  }, [executions])

  const maxRuns = Math.max(...runsOverTime.map(d => d.runs), 1)

  const errorRatesByType = useMemo(() => {
    const typeMap: Record<string, { total: number; failed: number }> = {}
    for (const e of executions) {
      if (!typeMap[e.triggerType]) typeMap[e.triggerType] = { total: 0, failed: 0 }
      typeMap[e.triggerType].total++
      if (e.status === 'failed') typeMap[e.triggerType].failed++
    }
    return Object.entries(typeMap).map(([type, { total, failed }]) => ({
      type,
      rate: total > 0 ? Math.round((failed / total) * 1000) / 10 : 0,
    }))
  }, [executions])

  /* ═══════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════ */
  return (
    <TooltipProvider>
      <div className="h-full bg-[#F8FAFC] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 pt-5 pb-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-[#1E293B] flex items-center gap-2">
                <Zap className="h-5 w-5 text-[#003ABC]" />
                Automation Center
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">Build, monitor, and manage automated workflows</p>
            </div>
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-[#003ABC] hover:bg-[#002d8f] text-white">
                  <Plus className="h-4 w-4 mr-1.5" /> Create Automation
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                  <DialogTitle className="text-[#1E293B]">Create New Automation</DialogTitle>
                  <DialogDescription>Define a new automated workflow for your organization.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-3">
                  <div className="space-y-2">
                    <Label>Automation Name</Label>
                    <Input placeholder="e.g. Lead Enrichment Pipeline" value={newAutoName} onChange={e => setNewAutoName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={newAutoType} onValueChange={v => setNewAutoType(v as AutomationType)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="scheduled">Scheduled</SelectItem>
                        <SelectItem value="event">Event-Driven</SelectItem>
                        <SelectItem value="conditional">Conditional</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Trigger Type</Label>
                    <Select value={newAutoTrigger} onValueChange={setNewAutoTrigger}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="webhook">Webhook</SelectItem>
                        <SelectItem value="schedule">Schedule (Cron)</SelectItem>
                        <SelectItem value="agent">Agent Completion</SelectItem>
                        <SelectItem value="data">Data Change</SelectItem>
                        <SelectItem value="threshold">Threshold Alert</SelectItem>
                        <SelectItem value="pattern">Pattern Match</SelectItem>
                        <SelectItem value="manual">Manual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea placeholder="Describe what this automation does..." value={newAutoDesc} onChange={e => setNewAutoDesc(e.target.value)} rows={3} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
                  <Button className="bg-[#003ABC] hover:bg-[#002d8f] text-white" onClick={createAutomation}>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="automations" className="flex-1 flex flex-col min-h-0 px-6">
          <TabsList className="bg-white border border-slate-200 rounded-lg p-0.5 h-10 flex-shrink-0 w-fit">
            <TabsTrigger value="automations" className="text-xs font-medium data-[state=active]:bg-[#003ABC] data-[state=active]:text-white rounded-md px-3">Automations</TabsTrigger>
            <TabsTrigger value="triggers" className="text-xs font-medium data-[state=active]:bg-[#003ABC] data-[state=active]:text-white rounded-md px-3">Triggers</TabsTrigger>
            <TabsTrigger value="workflow" className="text-xs font-medium data-[state=active]:bg-[#003ABC] data-[state=active]:text-white rounded-md px-3">Workflow Builder</TabsTrigger>
            <TabsTrigger value="actions" className="text-xs font-medium data-[state=active]:bg-[#003ABC] data-[state=active]:text-white rounded-md px-3">Actions Library</TabsTrigger>
            <TabsTrigger value="executions" className="text-xs font-medium data-[state=active]:bg-[#003ABC] data-[state=active]:text-white rounded-md px-3">Executions</TabsTrigger>
            <TabsTrigger value="templates" className="text-xs font-medium data-[state=active]:bg-[#003ABC] data-[state=active]:text-white rounded-md px-3">Templates</TabsTrigger>
            <TabsTrigger value="metrics" className="text-xs font-medium data-[state=active]:bg-[#003ABC] data-[state=active]:text-white rounded-md px-3">Metrics</TabsTrigger>
          </TabsList>

          <div className="flex-1 min-h-0 mt-4 pb-6">
            {/* ═══════ TAB 1: AUTOMATIONS ═══════ */}
            <TabsContent value="automations" className="h-full m-0">
              <ScrollArea className="h-full">
                {automationsLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
                  </div>
                ) : automations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Zap className="h-10 w-10 text-slate-300 mb-3" />
                    <p className="text-sm font-medium text-slate-500">No automations yet</p>
                    <p className="text-xs text-slate-400 mt-1">Create your first automation to get started</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {automations.map(auto => (
                      <Card key={auto.id} className="bg-white border-slate-200 hover:border-slate-300 transition-colors">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-semibold text-[#1E293B] text-sm">{auto.name}</h3>
                                <StatusBadge status={auto.status} />
                                <TypeBadge type={auto.type} />
                              </div>
                              <p className="text-xs text-slate-500 mt-1 line-clamp-1">{auto.description}</p>
                              <div className="flex items-center gap-4 mt-2.5 flex-wrap">
                                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                  <Play className="h-3 w-3" />
                                  <span className="font-medium text-[#1E293B]">{auto.runs.toLocaleString()}</span> runs
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                  <CheckCircle className="h-3 w-3 text-emerald-500" />
                                  <span className="font-medium text-[#1E293B]">{auto.successRate}%</span> success
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                  <Timer className="h-3 w-3" />
                                  <span className="font-medium text-[#1E293B]">{auto.avgDuration}</span> avg
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                  <Clock className="h-3 w-3" />
                                  Last: {auto.lastRun}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-1.5">
                                    <Switch
                                      checked={auto.enabled}
                                      onCheckedChange={() => toggleAutomation(auto.id)}
                                      className="data-[state=checked]:bg-[#003ABC]"
                                    />
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>{auto.enabled ? 'Pause automation' : 'Enable automation'}</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-[#003ABC]">
                                    <Play className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Run now</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-[#003ABC]">
                                    <Edit className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Edit automation</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-red-600" onClick={() => deleteAutomation(auto.id)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Delete automation</TooltipContent>
                              </Tooltip>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            {/* ═══════ TAB 2: TRIGGERS ═══════ */}
            <TabsContent value="triggers" className="h-full m-0">
              <ScrollArea className="h-full">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-semibold text-[#1E293B]">Trigger Types</h2>
                    <p className="text-xs text-slate-500">Configure how your automations are activated</p>
                  </div>
                  <Dialog open={triggerDialogOpen} onOpenChange={setTriggerDialogOpen}>
                    <DialogTrigger asChild>
                      <Button className="bg-[#003ABC] hover:bg-[#002d8f] text-white text-xs">
                        <Plus className="h-3.5 w-3.5 mr-1.5" /> Create Trigger
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[460px]">
                      <DialogHeader>
                        <DialogTitle className="text-[#1E293B]">Create New Trigger</DialogTitle>
                        <DialogDescription>Set up a new trigger to activate your automations.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-3">
                        <div className="space-y-2">
                          <Label>Trigger Name</Label>
                          <Input placeholder="e.g. Daily Data Sync" />
                        </div>
                        <div className="space-y-2">
                          <Label>Trigger Type</Label>
                          <Select defaultValue="webhook">
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="webhook">Webhook</SelectItem>
                              <SelectItem value="schedule">Schedule (Cron)</SelectItem>
                              <SelectItem value="agent">Agent Completion</SelectItem>
                              <SelectItem value="data">Data Change</SelectItem>
                              <SelectItem value="threshold">Threshold Alert</SelectItem>
                              <SelectItem value="pattern">Pattern Match</SelectItem>
                              <SelectItem value="manual">Manual</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Cron Expression (for Schedule type)</Label>
                          <Input placeholder="0 */6 * * *" />
                          <p className="text-xs text-slate-400">Every 6 hours. Use crontab.guru for reference.</p>
                        </div>
                        <div className="space-y-2">
                          <Label>Webhook URL (for Webhook type)</Label>
                          <Input placeholder="https://your-app.com/api/webhook" />
                        </div>
                        <div className="space-y-2">
                          <Label>Threshold Value (for Threshold type)</Label>
                          <div className="flex gap-2">
                            <Input placeholder="e.g. 100" className="flex-1" />
                            <Select defaultValue="gt">
                              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="gt">Greater than</SelectItem>
                                <SelectItem value="lt">Less than</SelectItem>
                                <SelectItem value="eq">Equals</SelectItem>
                                <SelectItem value="gte">GTE</SelectItem>
                                <SelectItem value="lte">LTE</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Pattern (for Pattern Match type)</Label>
                          <Input placeholder="e.g. error.*timeout" />
                        </div>
                        <div className="space-y-2">
                          <Label>Description</Label>
                          <Textarea placeholder="Describe this trigger..." rows={2} />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setTriggerDialogOpen(false)}>Cancel</Button>
                        <Button className="bg-[#003ABC] hover:bg-[#002d8f] text-white">Create Trigger</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
                {triggersLoading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
                  </div>
                ) : triggers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Zap className="h-10 w-10 text-slate-300 mb-3" />
                    <p className="text-sm font-medium text-slate-500">No trigger types configured</p>
                    <p className="text-xs text-slate-400 mt-1">Create a trigger to activate automations</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {triggers.map(trigger => (
                      <Card key={trigger.id} className={`bg-white ${trigger.borderColor} border hover:shadow-md transition-shadow cursor-pointer`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className={`p-2.5 rounded-lg ${trigger.color}`}>
                              <trigger.icon className="h-5 w-5 text-[#1E293B]" />
                            </div>
                            <Badge variant="secondary" className="text-xs font-normal bg-slate-100 text-slate-600">
                              {trigger.activeCount} active
                            </Badge>
                          </div>
                          <h3 className="font-semibold text-[#1E293B] text-sm mt-3">{trigger.name}</h3>
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed">{trigger.description}</p>
                          <Button variant="ghost" size="sm" className="mt-3 text-[#003ABC] text-xs p-0 h-auto hover:bg-transparent">
                            Configure <ArrowRight className="h-3 w-3 ml-1" />
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            {/* ═══════ TAB 3: WORKFLOW BUILDER ═══════ */}
            <TabsContent value="workflow" className="h-full m-0">
              <ScrollArea className="h-full">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-semibold text-[#1E293B]">Workflow Builder</h2>
                    <p className="text-xs text-slate-500">Visual node-based automation workflow designer</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="text-xs">
                      <Eye className="h-3.5 w-3.5 mr-1.5" /> Preview
                    </Button>
                    <Button size="sm" className="bg-[#003ABC] hover:bg-[#002d8f] text-white text-xs">
                      <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Node
                    </Button>
                  </div>
                </div>

                {/* Workflow Canvas */}
                <Card className="bg-white border-slate-200">
                  <CardContent className="p-6">
                    <div className="relative">
                      {/* Grid background */}
                      <div className="absolute inset-0 opacity-[0.03]" style={{
                        backgroundImage: 'radial-gradient(circle, #1E293B 1px, transparent 1px)',
                        backgroundSize: '24px 24px',
                      }} />

                      {/* Node Grid */}
                      <div className="relative grid grid-cols-6 gap-x-6 gap-y-16" style={{ minHeight: '320px' }}>
                        {workflowNodes.length === 0 ? (
                          <div className="col-span-6 flex flex-col items-center justify-center py-16 text-center">
                            <Workflow className="h-10 w-10 text-slate-300 mb-3" />
                            <p className="text-sm font-medium text-slate-500">No workflow nodes</p>
                            <p className="text-xs text-slate-400 mt-1">Add nodes to build your automation workflow</p>
                          </div>
                        ) : (
                          workflowNodes.map(node => {
                            const nodeColors: Record<NodeKind, { bg: string; border: string; icon: string }> = {
                              trigger: { bg: 'bg-emerald-50', border: 'border-emerald-300', icon: 'text-emerald-600' },
                              condition: { bg: 'bg-amber-50', border: 'border-amber-300', icon: 'text-amber-600' },
                              action: { bg: 'bg-blue-50', border: 'border-blue-300', icon: 'text-[#003ABC]' },
                              output: { bg: 'bg-purple-50', border: 'border-purple-300', icon: 'text-purple-600' },
                            }
                            const statusColors: Record<string, string> = {
                              idle: 'bg-gray-300',
                              running: 'bg-blue-500 animate-pulse',
                              success: 'bg-emerald-500',
                              error: 'bg-red-500',
                            }
                            const nodeKindIcons: Record<NodeKind, typeof Zap> = {
                              trigger: Zap,
                              condition: GitBranch,
                              action: Play,
                              output: FileOutput,
                            }
                            const colors = nodeColors[node.kind]
                            const KindIcon = nodeKindIcons[node.kind]

                            return (
                              <div
                                key={node.id}
                                className={`relative flex flex-col items-center justify-center p-3 rounded-xl border-2 ${colors.bg} ${colors.border} cursor-pointer hover:shadow-lg transition-all min-h-[80px] col-start-[${node.x + 1}] row-start-[${node.y + 1}]`}
                                style={{
                                  gridColumnStart: node.x + 1,
                                  gridRowStart: node.y + 1,
                                }}
                                onClick={() => setSelectedNode(selectedNode?.id === node.id ? null : node)}
                              >
                                {/* Status indicator */}
                                <div className={`absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full border-2 border-white ${statusColors[node.status]}`} />
                                <KindIcon className={`h-4 w-4 ${colors.icon} mb-1.5`} />
                                <span className="text-xs font-medium text-[#1E293B] text-center leading-tight">{node.name}</span>
                                <Badge variant="outline" className={`text-[10px] mt-1 ${colors.border} ${colors.icon} capitalize`}>
                                  {node.kind}
                                </Badge>
                              </div>
                            )
                          })
                        )}
                      </div>

                      {/* Connection lines (CSS-based) */}
                      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
                        {workflowEdges.map((edge, i) => {
                          const from = workflowNodes.find(n => n.id === edge.from)
                          const to = workflowNodes.find(n => n.id === edge.to)
                          if (!from || !to) return null
                          const colWidth = 16.67
                          const fromCx = (from.x + 0.5) * colWidth
                          const toCx = (to.x + 0.5) * colWidth
                          const rowHeight = 16
                          const fromCy = (from.y + 0.5) * rowHeight
                          const toCy = (to.y + 0.5) * rowHeight
                          const midX = (fromCx + toCx) / 2
                          return (
                            <path
                              key={i}
                              d={`M ${fromCx}% ${fromCy}% C ${midX}% ${fromCy}%, ${midX}% ${toCy}%, ${toCx}% ${toCy}%`}
                              fill="none"
                              stroke="#CBD5E1"
                              strokeWidth="2"
                              strokeDasharray="6 3"
                              markerEnd="url(#arrowhead)"
                            />
                          )
                        })}
                        <defs>
                          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                            <polygon points="0 0, 10 3.5, 0 7" fill="#CBD5E1" />
                          </marker>
                        </defs>
                      </svg>
                    </div>
                  </CardContent>
                </Card>

                {/* Node Detail Panel */}
                {selectedNode && (
                  <Card className="bg-white border-slate-200 mt-4">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm text-[#1E293B]">Node Details: {selectedNode.name}</CardTitle>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-500" onClick={() => setSelectedNode(null)}>
                          <XCircle className="h-3.5 w-3.5 mr-1" /> Close
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                        <div>
                          <span className="text-slate-500">Type</span>
                          <p className="font-medium text-[#1E293B] capitalize mt-0.5">{selectedNode.kind}</p>
                        </div>
                        <div>
                          <span className="text-slate-500">Status</span>
                          <p className="font-medium text-[#1E293B] capitalize mt-0.5">{selectedNode.status}</p>
                        </div>
                        <div>
                          <span className="text-slate-500">Position</span>
                          <p className="font-medium text-[#1E293B] mt-0.5">({selectedNode.x}, {selectedNode.y})</p>
                        </div>
                        <div>
                          <span className="text-slate-500">Connections</span>
                          <p className="font-medium text-[#1E293B] mt-0.5">
                            {workflowEdges.filter(e => e.from === selectedNode.id || e.to === selectedNode.id).length}
                          </p>
                        </div>
                      </div>
                      <Separator className="my-3" />
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="text-xs"><Edit className="h-3 w-3 mr-1.5" /> Edit Config</Button>
                        <Button variant="outline" size="sm" className="text-xs text-red-600"><Trash2 className="h-3 w-3 mr-1.5" /> Remove Node</Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </ScrollArea>
            </TabsContent>

            {/* ═══════ TAB 4: ACTIONS LIBRARY ═══════ */}
            <TabsContent value="actions" className="h-full m-0">
              <ScrollArea className="h-full">
                <div className="mb-4">
                  <h2 className="text-base font-semibold text-[#1E293B]">Actions Library</h2>
                  <p className="text-xs text-slate-500">Browse and use actions in your automation workflows</p>
                </div>
                {/* Search & Filter */}
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search actions..."
                      value={actionSearch}
                      onChange={e => setActionSearch(e.target.value)}
                      className="pl-9 h-9 text-sm"
                    />
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {categories.map(cat => (
                      <Button
                        key={cat}
                        variant={actionCategory === cat ? 'default' : 'outline'}
                        size="sm"
                        className={`text-xs h-8 ${actionCategory === cat ? 'bg-[#003ABC] hover:bg-[#002d8f] text-white' : ''}`}
                        onClick={() => setActionCategory(cat)}
                      >
                        {cat}
                      </Button>
                    ))}
                  </div>
                </div>
                {/* Action Grid */}
                {actionsLoading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-36 w-full" />)}
                  </div>
                ) : filteredActions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Settings className="h-10 w-10 text-slate-300 mb-3" />
                    <p className="text-sm font-medium text-slate-500">No actions available</p>
                    <p className="text-xs text-slate-400 mt-1">Actions will appear as automations are created</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {filteredActions.map(action => (
                      <Card key={action.id} className="bg-white border-slate-200 hover:border-[#003ABC]/30 hover:shadow-md transition-all cursor-pointer group">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="p-2 rounded-lg bg-slate-50 group-hover:bg-blue-50 transition-colors">
                              <action.icon className="h-4 w-4 text-[#003ABC]" />
                            </div>
                            <Badge variant="secondary" className="text-[10px] bg-slate-100 text-slate-600">
                              {action.category}
                            </Badge>
                          </div>
                          <h3 className="font-semibold text-[#1E293B] text-sm mt-3">{action.name}</h3>
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2">{action.description}</p>
                          <Button variant="ghost" size="sm" className="mt-3 text-[#003ABC] text-xs p-0 h-auto hover:bg-transparent">
                            Use Action <ArrowRight className="h-3 w-3 ml-1" />
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            {/* ═══════ TAB 5: EXECUTIONS ═══════ */}
            <TabsContent value="executions" className="h-full m-0">
              <ScrollArea className="h-full">
                <div className="mb-4">
                  <h2 className="text-base font-semibold text-[#1E293B]">Execution History</h2>
                  <p className="text-xs text-slate-500">Review past automation runs and their results</p>
                </div>
                {/* Filters */}
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <Filter className="h-4 w-4 text-slate-400" />
                  {(['all', 'success', 'failed', 'running', 'cancelled'] as const).map(s => (
                    <Button
                      key={s}
                      variant={execFilter === s ? 'default' : 'outline'}
                      size="sm"
                      className={`text-xs h-8 ${execFilter === s ? 'bg-[#003ABC] hover:bg-[#002d8f] text-white' : ''}`}
                      onClick={() => setExecFilter(s)}
                    >
                      {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                      {s !== 'all' && (
                        <Badge variant="secondary" className="ml-1.5 text-[10px] h-4 px-1.5 bg-white/20 text-current">
                          {executions.filter(e => e.status === (s as ExecutionStatus)).length}
                        </Badge>
                      )}
                    </Button>
                  ))}
                </div>
                {/* Table */}
                {executionsLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : filteredExecutions.length === 0 ? (
                  <Card className="bg-white border-slate-200">
                    <CardContent className="py-16 text-center">
                      <Activity className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                      <p className="text-sm font-medium text-slate-500">No execution history</p>
                      <p className="text-xs text-slate-400 mt-1">Executions will appear when automations run</p>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="bg-white border-slate-200">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-slate-200 hover:bg-transparent">
                          <TableHead className="text-xs font-semibold text-slate-500">Automation</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-500">Trigger</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-500">Status</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-500">Duration</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-500">Started</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-500">Actions</TableHead>
                          <TableHead className="w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredExecutions.map(exec => (
                          <>
                            <TableRow key={exec.id} className="border-slate-100 cursor-pointer hover:bg-slate-50" onClick={() => setExpandedExec(expandedExec === exec.id ? null : exec.id)}>
                              <TableCell className="text-sm font-medium text-[#1E293B]">{exec.automationName}</TableCell>
                              <TableCell className="text-xs text-slate-500">{exec.triggerType}</TableCell>
                              <TableCell><StatusBadge status={exec.status} /></TableCell>
                              <TableCell className="text-xs text-slate-600 font-mono">{exec.duration}</TableCell>
                              <TableCell className="text-xs text-slate-500">{exec.startedAt}</TableCell>
                              <TableCell className="text-xs text-slate-600">{exec.actionsCount}</TableCell>
                              <TableCell>
                                {expandedExec === exec.id
                                  ? <ChevronDown className="h-4 w-4 text-slate-400" />
                                  : <ChevronRight className="h-4 w-4 text-slate-400" />
                                }
                              </TableCell>
                            </TableRow>
                            {expandedExec === exec.id && (
                              <TableRow key={`${exec.id}-detail`} className="border-slate-100 bg-slate-50/50">
                                <TableCell colSpan={7} className="p-4">
                                  <div className="ml-4">
                                    <h4 className="text-xs font-semibold text-[#1E293B] mb-3">Step Timeline</h4>
                                    <div className="space-y-3">
                                      {exec.steps.map((step, idx) => (
                                        <div key={idx} className="flex items-start gap-3">
                                          <div className="flex flex-col items-center">
                                            <StepStatusIcon status={step.status} />
                                            {idx < exec.steps.length - 1 && (
                                              <div className="w-px h-6 bg-slate-200 mt-1" />
                                            )}
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                              <span className="text-xs font-medium text-[#1E293B]">{step.name}</span>
                                              <span className="text-[10px] text-slate-400 font-mono">{step.duration}</span>
                                            </div>
                                            {step.output && (
                                              <p className="text-[11px] text-slate-500 mt-0.5 bg-white border border-slate-200 rounded px-2 py-1 inline-block">
                                                {step.output}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                )}
              </ScrollArea>
            </TabsContent>

            {/* ═══════ TAB 6: TEMPLATES ═══════ */}
            <TabsContent value="templates" className="h-full m-0">
              <ScrollArea className="h-full">
                <div className="mb-4">
                  <h2 className="text-base font-semibold text-[#1E293B]">Automation Templates</h2>
                  <p className="text-xs text-slate-500">Start from pre-built automation templates for common use cases</p>
                </div>
                {/* Category Filter */}
                <div className="flex gap-2 mb-4 flex-wrap">
                  {templateCategories.map(cat => (
                    <Button
                      key={cat}
                      variant={templateCategory === cat ? 'default' : 'outline'}
                      size="sm"
                      className={`text-xs h-8 ${templateCategory === cat ? 'bg-[#003ABC] hover:bg-[#002d8f] text-white' : ''}`}
                      onClick={() => setTemplateCategory(cat)}
                    >
                      {cat}
                    </Button>
                  ))}
                </div>
                {/* Template Grid */}
                {templatesLoading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-56 w-full" />)}
                  </div>
                ) : filteredTemplates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <FileOutput className="h-10 w-10 text-slate-300 mb-3" />
                    <p className="text-sm font-medium text-slate-500">No templates available</p>
                    <p className="text-xs text-slate-400 mt-1">Templates will appear as suggestions are created</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredTemplates.map(tpl => (
                      <Card key={tpl.id} className="bg-white border-slate-200 hover:border-[#003ABC]/30 hover:shadow-lg transition-all overflow-hidden group">
                        {/* Template Preview Header */}
                        <div className="h-20 bg-gradient-to-br from-[#003ABC]/5 to-[#FF6A00]/5 flex items-center justify-center border-b border-slate-100">
                          <div className="p-3 rounded-xl bg-white shadow-sm group-hover:scale-110 transition-transform">
                            <tpl.icon className="h-6 w-6 text-[#003ABC]" />
                          </div>
                        </div>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-[#1E293B] text-sm flex-1">{tpl.name}</h3>
                            {tpl.popular && (
                              <Badge className="bg-[#FF6A00]/10 text-[#FF6A00] border-[#FF6A00]/20 text-[10px]">
                                <Star className="h-2.5 w-2.5 mr-0.5 fill-current" /> Popular
                              </Badge>
                            )}
                          </div>
                          <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-600 mb-2">{tpl.category}</Badge>
                          <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 mb-3">{tpl.description}</p>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-400">{tpl.steps} steps</span>
                            <Button size="sm" className="bg-[#003ABC] hover:bg-[#002d8f] text-white text-xs h-7" onClick={() => handleUseTemplate(tpl)}>
                              <Copy className="h-3 w-3 mr-1" /> Use Template
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            {/* ═══════ TAB 7: METRICS ═══════ */}
            <TabsContent value="metrics" className="h-full m-0">
              <ScrollArea className="h-full">
                <div className="mb-4">
                  <h2 className="text-base font-semibold text-[#1E293B]">Automation Metrics</h2>
                  <p className="text-xs text-slate-500">Analytics and performance insights for your automations</p>
                </div>

                {/* Stat Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <Card className="bg-white border-slate-200">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 rounded-md bg-blue-50">
                          <Zap className="h-4 w-4 text-[#003ABC]" />
                        </div>
                        <span className="text-xs text-slate-500">Total Automations</span>
                      </div>
                      <p className="text-2xl font-bold text-[#1E293B]">{automations.length}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-white border-slate-200">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 rounded-md bg-emerald-50">
                          <Activity className="h-4 w-4 text-emerald-600" />
                        </div>
                        <span className="text-xs text-slate-500">Active Triggers</span>
                      </div>
                      <p className="text-2xl font-bold text-[#1E293B]">{triggers.reduce((s, t) => s + t.activeCount, 0)}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-white border-slate-200">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 rounded-md bg-amber-50">
                          <BarChart3 className="h-4 w-4 text-amber-600" />
                        </div>
                        <span className="text-xs text-slate-500">Total Runs</span>
                      </div>
                      <p className="text-2xl font-bold text-[#1E293B]">{totalRuns.toLocaleString()}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-white border-slate-200">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 rounded-md bg-violet-50">
                          <CheckCircle className="h-4 w-4 text-violet-600" />
                        </div>
                        <span className="text-xs text-slate-500">Success Rate</span>
                      </div>
                      <p className="text-2xl font-bold text-[#1E293B]">{avgSuccessRate}%</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Runs Over Time Chart */}
                <Card className="bg-white border-slate-200 mb-6">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-[#1E293B]">Runs Over Time</CardTitle>
                    <CardDescription>Daily automation runs for the past 7 days</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {runsOverTime.every(d => d.runs === 0) ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <BarChart3 className="h-8 w-8 text-slate-300 mb-2" />
                        <p className="text-xs text-slate-400">No run data available</p>
                      </div>
                    ) : (
                      <div className="flex items-end gap-3 h-48">
                        {runsOverTime.map((d, i) => (
                          <div key={i} className="flex-1 flex flex-col items-center gap-2">
                            <span className="text-xs font-medium text-[#1E293B]">{d.runs}</span>
                            <div
                              className="w-full rounded-t-md bg-gradient-to-t from-[#003ABC] to-[#003ABC]/60 transition-all hover:from-[#FF6A00] hover:to-[#FF6A00]/60 cursor-pointer min-h-[8px]"
                              style={{ height: `${(d.runs / maxRuns) * 140}px` }}
                            />
                            <span className="text-[10px] text-slate-500">{d.day}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Two column tables */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Top Performing Automations */}
                  <Card className="bg-white border-slate-200">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-[#1E293B]">Top Performing Automations</CardTitle>
                      <CardDescription>By total execution count</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {automations.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-8">No data</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow className="border-slate-100 hover:bg-transparent">
                              <TableHead className="text-xs text-slate-500">Automation</TableHead>
                              <TableHead className="text-xs text-slate-500 text-right">Runs</TableHead>
                              <TableHead className="text-xs text-slate-500 text-right">Success</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {[...automations].sort((a, b) => b.runs - a.runs).slice(0, 5).map(auto => (
                              <TableRow key={auto.id} className="border-slate-50">
                                <TableCell className="text-xs font-medium text-[#1E293B] py-2">{auto.name}</TableCell>
                                <TableCell className="text-xs text-slate-600 text-right py-2 font-mono">{auto.runs.toLocaleString()}</TableCell>
                                <TableCell className="text-xs text-right py-2">
                                  <span className={auto.successRate >= 95 ? 'text-emerald-600' : auto.successRate >= 90 ? 'text-amber-600' : 'text-red-600'}>
                                    {auto.successRate}%
                                  </span>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>

                  {/* Error Rate by Type */}
                  <Card className="bg-white border-slate-200">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-[#1E293B]">Error Rate by Trigger Type</CardTitle>
                      <CardDescription>Failure percentage per trigger category</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {errorRatesByType.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-8">No data</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow className="border-slate-100 hover:bg-transparent">
                              <TableHead className="text-xs text-slate-500">Trigger Type</TableHead>
                              <TableHead className="text-xs text-slate-500 text-right">Error Rate</TableHead>
                              <TableHead className="text-xs text-slate-500 text-left w-[120px]"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {errorRatesByType.map((er, i) => (
                              <TableRow key={i} className="border-slate-50">
                                <TableCell className="text-xs font-medium text-[#1E293B] py-2">{er.type}</TableCell>
                                <TableCell className="text-xs text-right py-2">
                                  <span className={er.rate <= 2 ? 'text-emerald-600' : er.rate <= 5 ? 'text-amber-600' : 'text-red-600'}>
                                    {er.rate}%
                                  </span>
                                </TableCell>
                                <TableCell className="py-2 pl-2">
                                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all ${
                                        er.rate <= 2 ? 'bg-emerald-500' : er.rate <= 5 ? 'bg-amber-500' : 'bg-red-500'
                                      }`}
                                      style={{ width: `${(er.rate / 10) * 100}%` }}
                                    />
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </TooltipProvider>
  )
}
