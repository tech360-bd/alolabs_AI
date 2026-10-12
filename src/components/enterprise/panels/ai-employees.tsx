'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { fetchApi, fetchApiRaw } from '@/lib/api'
import { Bot, Search, LayoutGrid, List, MessageSquare, Loader2, Trash2, Play, Activity, Clock, Zap, Brain, Database, BarChart3 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Agent {
  id: string
  agentId: string
  name: string
  departmentName: string
  department?: string
  role: string
  type: string
  status: string
  capabilities: number
  lastActive: string
  purpose?: string
}

interface PipelineMetadata {
  taskClassification?: string
  validationScore?: number
  validationPassed?: boolean
  ragResults?: number
}

interface AgentDetail {
  success: boolean
  stats: {
    totalRuns: number
    successRate: number
    avgLatency: number
    avgConfidence: number
    avgTokens: number
    totalTokens: number
    ragUsageRate: number
    modelUsage: Record<string, number>
    lastRunAt: string | null
  }
  health: {
    agentId: string
    status: string
    healthScore: number
    successRate: number
    avgLatencyMs: number
    errorRate: number
    totalExecutions: number
    lastExecutionAt?: string
    lastErrorAt?: string
    consecutiveFailures: number
    isDegraded: boolean
  }
  skills: Array<{ name: string; slug: string; category: string; purpose: string; status: string; riskLevel: string }>
  recentRuns: Array<{
    id: string
    model: string | null
    tokensUsed: number
    latencyMs: number | null
    confidence: number | null
    status: string
    createdAt: string
  }>
  memory: Array<{ id: string; category: string; content: string; temperature: string; createdAt: string }>
}

interface ChatMessage {
  role: 'user' | 'agent'
  content: string
  timestamp: string
  meta?: {
    model: string
    confidence: number
    latencyMs: number
    contextTokens: number
    contextSources: string
    pipeline?: PipelineMetadata
  }
}

interface RunResult {
  content: string
  model: string
  confidence: number
  latencyMs: number
  contextTokens: number
  ragSources?: number
  taskClassification?: string
  validationScore?: number
  reasoningPath?: string
  pipeline?: PipelineMetadata
}

const roles = ['All', 'Analyst', 'Manager', 'Developer', 'Coordinator', 'Specialist', 'Lead', 'Strategist', 'Architect', 'Engineer', 'Consultant']
const agentTypes = ['All', 'Cognitive', 'Operational', 'Analytical', 'Creative', 'Administrative', 'Technical', 'Strategic', 'Support']
const statusOptions = ['All', 'active', 'idle', 'training']

const typeColors: Record<string, string> = {
  Cognitive: 'bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400',
  Operational: 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
  Analytical: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
  Creative: 'bg-pink-100 text-pink-700 dark:bg-pink-950/30 dark:text-pink-400',
  Administrative: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  Technical: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-400',
  Strategic: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
  Support: 'bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400',
}

export default function AIEmployees() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [deptList, setDeptList] = useState<string[]>(['All'])
  const [total, setTotal] = useState(0)
  const [activeTotal, setActiveTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [department, setDepartment] = useState('All')
  const [role, setRole] = useState('All')
  const [type, setType] = useState('All')
  const [status, setStatus] = useState('All')
  const [page, setPage] = useState(1)
  const [view, setView] = useState<'grid' | 'list'>('grid')

  // Chat state
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Run agent state
  const [runAgent, setRunAgent] = useState<Agent | null>(null)
  const [runOpen, setRunOpen] = useState(false)
  const [runTask, setRunTask] = useState('')
  const [runLoading, setRunLoading] = useState(false)
  const [runResult, setRunResult] = useState<RunResult | null>(null)

  // Detail dialog state
  const [detailAgent, setDetailAgent] = useState<Agent | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailData, setDetailData] = useState<AgentDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Load real departments for filter dropdown
  useEffect(() => {
    fetchApi('/api/enterprise/departments?limit=100')
      .then((data: any) => {
        if (data?.departments?.length) {
          setDeptList(['All', ...data.departments.map((d: { name: string }) => d.name).sort()])
        }
      }).catch(() => {})
  }, [])

  // Fetch active agent count
  useEffect(() => {
    fetchApi('/api/enterprise/agents?limit=1&status=active')
      .then((data: any) => { if (data?.total != null) setActiveTotal(data.total) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    async function fetchAgents() {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          page: String(page), limit: '50', search,
          department: department === 'All' ? '' : department,
          role: role === 'All' ? '' : role,
          type: type === 'All' ? '' : type,
          status: status === 'All' ? '' : status,
        })
        const data = await fetchApi(`/api/enterprise/agents?${params}`, { signal: controller.signal })
        setAgents(data.agents || [])
        setTotal(data.total || 0)
      } catch { /* empty */ } finally { setLoading(false) }
    }
    fetchAgents()
    return () => controller.abort()
  }, [page, search, department, role, type, status])

  // Fetch detail data when dialog opens
  useEffect(() => {
    if (!detailOpen || !detailAgent?.agentId) return
    setDetailLoading(true)
    setDetailData(null)
    fetchApi<AgentDetail>(`/api/enterprise/agents/${detailAgent.agentId}/detail`)
      .then((data) => { setDetailData(data) })
      .catch(() => {})
      .finally(() => setDetailLoading(false))
  }, [detailOpen, detailAgent?.agentId])

  useEffect(() => { setPage(1) }, [search, department, role, type, status])

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatLoading])

  const totalPages = Math.ceil(total / 50)

  const openChat = useCallback((agent: Agent, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setSelectedAgent(agent)
    setChatMessages([])
    setChatInput('')
    setConversationId(null)
    setChatOpen(true)
  }, [])

  const openRun = useCallback((agent: Agent, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setRunAgent(agent)
    setRunTask('')
    setRunResult(null)
    setRunLoading(false)
    setRunOpen(true)
  }, [])

  const openDetail = useCallback((agent: Agent, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setDetailAgent(agent)
    setDetailOpen(true)
  }, [])

  const executeRun = useCallback(async () => {
    if (!runAgent || !runTask.trim() || runLoading) return
    setRunLoading(true)
    setRunResult(null)
    try {
      const data = await fetchApi<{ success: boolean; data?: any; error?: string }>('/api/enterprise/agents/run', {
        method: 'POST',
        body: JSON.stringify({ agentId: runAgent.agentId, task: runTask.trim() }),
      })
      if (data.success) {
        setRunResult({
          content: data.data?.content || data.data?.result || JSON.stringify(data.data),
          model: data.data?.model || 'N/A',
          confidence: data.data?.confidence ?? 0,
          latencyMs: data.data?.latencyMs ?? 0,
          contextTokens: data.data?.contextTokens ?? 0,
          ragSources: data.data?.ragSources ?? data.data?.pipeline?.ragResults,
          taskClassification: data.data?.taskClassification ?? data.data?.pipeline?.taskClassification ? String(data.data?.pipeline?.taskClassification ?? '') : undefined,
          validationScore: data.data?.validationScore ?? data.data?.pipeline?.validationScore,
          reasoningPath: data.data?.reasoningPath ?? data.data?.pipeline?.reasoningPath ? String(data.data?.pipeline?.reasoningPath ?? '') : undefined,
          pipeline: data.data?.pipeline,
        })
      } else {
        setRunResult({ content: `Error: ${data.error || 'Failed to execute task.'}`, model: '', confidence: 0, latencyMs: 0, contextTokens: 0 })
      }
    } catch {
      setRunResult({ content: 'Network error. Please try again.', model: '', confidence: 0, latencyMs: 0, contextTokens: 0 })
    } finally {
      setRunLoading(false)
    }
  }, [runAgent, runTask, runLoading])

  const handleRunKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      executeRun()
    }
  }, [executeRun])

  const sendMessage = useCallback(async () => {
    if (!selectedAgent || !chatInput.trim() || chatLoading) return

    const userMessage = chatInput.trim()
    const timestamp = new Date().toISOString()

    const userMsg: ChatMessage = { role: 'user', content: userMessage, timestamp }
    setChatMessages(prev => [...prev, userMsg])
    setChatInput('')
    setChatLoading(true)

    try {
      const data = await fetchApi<{ success: boolean; data?: any; error?: string }>('/api/enterprise/agent-chat', {
        method: 'POST',
        body: JSON.stringify({ agentId: selectedAgent.agentId, message: userMessage, conversationId }),
      })

      if (data.success) {
        if (data.data.conversationId && !conversationId) {
          setConversationId(data.data.conversationId)
        }
        const pipeline = data.data.pipeline || {}
        const agentMsg: ChatMessage = {
          role: 'agent',
          content: data.data.content,
          timestamp: new Date().toISOString(),
          meta: {
            model: data.data.model,
            confidence: data.data.confidence,
            latencyMs: data.data.latencyMs,
            contextTokens: data.data.contextTokens,
            contextSources: data.data.contextSources,
            pipeline,
          },
        }
        setChatMessages(prev => [...prev, agentMsg])
      } else {
        const errorMsg: ChatMessage = {
          role: 'agent',
          content: `Error: ${data.error || 'Failed to get response from agent.'}`,
          timestamp: new Date().toISOString(),
        }
        setChatMessages(prev => [...prev, errorMsg])
      }
    } catch {
      const errorMsg: ChatMessage = {
        role: 'agent',
        content: 'Network error. Please try again.',
        timestamp: new Date().toISOString(),
      }
      setChatMessages(prev => [...prev, errorMsg])
    } finally {
      setChatLoading(false)
    }
  }, [selectedAgent, chatInput, chatLoading, conversationId])

  const handleChatKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }, [sendMessage])

  if (loading && agents.length === 0) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">AI Employees</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{total.toLocaleString()} autonomous agents across all departments</p>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
          <Button variant={view === 'grid' ? 'default' : 'ghost'} size="sm" className="h-7 w-7 p-0" onClick={() => setView('grid')}>
            <LayoutGrid className="h-3.5 w-3.5" />
          </Button>
          <Button variant={view === 'list' ? 'default' : 'ghost'} size="sm" className="h-7 w-7 p-0" onClick={() => setView('list')}>
            <List className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total Agents', value: total, color: 'text-[#003ABC]' },
          { label: 'Active', value: activeTotal, color: 'text-emerald-600' },
          { label: 'Departments', value: deptList.length - 1, color: 'text-[#FF6A00]' },
          { label: 'Agent Types', value: agentTypes.length - 1, color: 'text-purple-600' },
        ].map(s => (
          <Card key={s.label} className="rounded-xl shadow-sm border-0 bg-white dark:bg-slate-800">
            <CardContent className="p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value.toLocaleString()}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search agents by name..." className="pl-9 rounded-lg" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger className="w-[140px] h-8 text-xs rounded-lg"><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent>{deptList.map(d => <SelectItem key={d} value={d} className="text-xs">{d}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="w-[120px] h-8 text-xs rounded-lg"><SelectValue placeholder="Role" /></SelectTrigger>
            <SelectContent>{roles.map(r => <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-[120px] h-8 text-xs rounded-lg"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>{agentTypes.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[100px] h-8 text-xs rounded-lg"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>{statusOptions.map(s => <SelectItem key={s} value={s} className="text-xs capitalize">{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {/* Agents Display */}
      {view === 'grid' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {agents.map(agent => (
            <Card key={agent.id} className="rounded-xl shadow-sm hover:shadow-md transition-all border-0 bg-white dark:bg-slate-800">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <button onClick={(e) => openDetail(agent, e)} className="shrink-0 focus:outline-none">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-[#003ABC] text-white text-xs font-bold">
                        {agent.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                  <div className="flex-1 min-w-0">
                    <button onClick={(e) => openDetail(agent, e)} className="text-left focus:outline-none w-full">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate hover:text-[#003ABC] dark:hover:text-blue-400 transition-colors">{agent.name}</p>
                    </button>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{agent.departmentName || agent.department}</p>
                  </div>
                  <Badge variant="outline" className="text-[9px] px-1.5 capitalize shrink-0">{agent.status}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">{agent.role}</Badge>
                  <Badge className={`text-[10px] ${typeColors[agent.type] || ''}`}>{agent.type}</Badge>
                </div>
                <div className="mt-3 flex items-center justify-between text-[10px] text-slate-400">
                  <span>{agent.capabilities} capabilities</span>
                  <span>Active {agent.lastActive}</span>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50 flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 h-7 text-[11px] gap-1.5" onClick={(e) => openChat(agent, e)}>
                    <MessageSquare className="h-3 w-3" />Chat
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 h-7 text-[11px] gap-1.5" onClick={(e) => openRun(agent, e)}>
                    <Play className="h-3 w-3" />Run
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="rounded-xl shadow-sm border-0 bg-white dark:bg-slate-800 overflow-hidden">
          <ScrollArea className="max-h-[600px]">
            <div className="min-w-[900px]">
              <div className="grid grid-cols-[100px_1fr_120px_100px_100px_70px_80px_100px] gap-2 px-4 py-3 bg-slate-50 dark:bg-slate-700/30 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <span>ID</span><span>Name</span><span>Department</span><span>Role</span><span>Type</span><span>Status</span><span>Last Active</span><span className="text-right">Actions</span>
              </div>
              {agents.map(agent => (
                <div key={agent.id} className="grid grid-cols-[100px_1fr_120px_100px_100px_70px_80px_100px] gap-2 px-4 py-2.5 border-t border-slate-100 dark:border-slate-700/50 text-xs items-center hover:bg-slate-50 dark:hover:bg-slate-700/20">
                  <span className="font-mono text-slate-400">{agent.id.replace('agent-', '')}</span>
                  <div className="flex items-center gap-2 min-w-0">
                    <button onClick={(e) => openDetail(agent, e)} className="shrink-0 focus:outline-none">
                      <Avatar className="h-6 w-6"><AvatarFallback className="bg-[#003ABC] text-white text-[8px] font-bold">{agent.name.slice(0, 2)}</AvatarFallback></Avatar>
                    </button>
                    <button onClick={(e) => openDetail(agent, e)} className="truncate text-slate-700 dark:text-slate-200 font-medium text-left hover:text-[#003ABC] dark:hover:text-blue-400 transition-colors focus:outline-none">
                      {agent.name}
                    </button>
                  </div>
                  <span className="text-slate-500 truncate">{agent.departmentName || agent.department}</span>
                  <Badge variant="secondary" className="text-[10px] w-fit">{agent.role}</Badge>
                  <Badge className={`text-[10px] w-fit ${typeColors[agent.type] || ''}`}>{agent.type}</Badge>
                  <Badge variant={agent.status === 'active' ? 'default' : 'secondary'} className="text-[10px] w-fit capitalize">{agent.status}</Badge>
                  <span className="text-slate-400">{agent.lastActive}</span>
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => openChat(agent)}>
                      <MessageSquare className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => openRun(agent)}>
                      <Play className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <span className="text-xs text-slate-500">Page {page} of {totalPages} ({total.toLocaleString()} agents)</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}

      {/* Chat Dialog */}
      <Dialog open={chatOpen} onOpenChange={(open) => { setChatOpen(open); if (!open) { setChatMessages([]); setChatInput('') } }}>
        <DialogContent className="sm:max-w-[560px] p-0 gap-0 flex flex-col max-h-[85vh]">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback className="bg-[#003ABC] text-white text-xs font-bold">
                    {selectedAgent?.name.slice(0, 2).toUpperCase() || 'AI'}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <DialogTitle className="text-sm font-semibold truncate">{selectedAgent?.name}</DialogTitle>
                  <DialogDescription className="text-xs mt-0.5">
                    {selectedAgent?.role} · {selectedAgent?.department}
                  </DialogDescription>
                  {selectedAgent?.purpose && (
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 line-clamp-1">{selectedAgent.purpose}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge className={`text-[10px] ${typeColors[selectedAgent?.type || ''] || ''}`}>{selectedAgent?.type}</Badge>
                {chatMessages.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[10px] text-slate-400 hover:text-red-500"
                    onClick={() => setChatMessages([])}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>

          {/* Messages area */}
          <ScrollArea className="flex-1 px-6 py-4">
            {chatMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center">
                <Bot className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-sm text-slate-500 dark:text-slate-400">Start a conversation with {selectedAgent?.name}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">This agent uses the Context Engine for personalized responses</p>
              </div>
            ) : (
              <div className="space-y-4">
                {chatMessages.map((msg, idx) => (
                  <div key={idx}>
                    <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                          msg.role === 'user'
                            ? 'bg-[#003ABC] text-white rounded-br-md'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-bl-md'
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                    {msg.role === 'agent' && msg.meta && (
                      <div className="mt-1.5 ml-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                        <span>Model: {msg.meta.model}</span>
                        <span>Confidence: {Math.round(msg.meta.confidence * 100)}%</span>
                        <span>Latency: {msg.meta.latencyMs}ms</span>
                        <span>Context: {msg.meta.contextTokens.toLocaleString()} tokens</span>
                        {msg.meta.pipeline?.taskClassification && (
                          <span className="text-emerald-500">{String(msg.meta.pipeline.taskClassification)}</span>
                        )}
                        {(msg.meta.pipeline?.ragResults ?? 0) > 0 && (
                          <span className="text-blue-500">RAG: {msg.meta.pipeline?.ragResults ?? 0} sources</span>
                        )}
                        {msg.meta.pipeline?.validationPassed === false && (
                          <span className="text-amber-500">Validation: {Math.round((msg.meta.pipeline?.validationScore ?? 0) * 100)}%</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-100 dark:bg-slate-700 rounded-2xl rounded-bl-md px-4 py-3">
                      <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}
          </ScrollArea>

          {/* Input area */}
          <div className="px-6 pb-6 pt-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
            <div className="flex gap-2">
              <Textarea
                placeholder={`Message ${selectedAgent?.name || 'agent'}...`}
                className="min-h-[40px] max-h-[120px] resize-none text-sm rounded-lg"
                rows={1}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                disabled={chatLoading}
              />
              <Button
                size="sm"
                className="h-[40px] px-4 shrink-0"
                onClick={sendMessage}
                disabled={chatLoading || !chatInput.trim()}
              >
                {chatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Run Agent Dialog */}
      <Dialog open={runOpen} onOpenChange={(open) => { setRunOpen(open); if (!open) { setRunResult(null); setRunTask('') } }}>
        <DialogContent className="sm:max-w-[600px] p-0 gap-0 flex flex-col max-h-[85vh]">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarFallback className="bg-[#003ABC] text-white text-xs font-bold">
                  {runAgent?.name.slice(0, 2).toUpperCase() || 'AI'}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <DialogTitle className="text-sm font-semibold truncate">Run Agent</DialogTitle>
                <DialogDescription className="text-xs mt-0.5">
                  {runAgent?.name} · {runAgent?.role} · {runAgent?.departmentName || runAgent?.department}
                </DialogDescription>
              </div>
              <Badge className={`text-[10px] shrink-0 ${typeColors[runAgent?.type || ''] || ''}`}>{runAgent?.type}</Badge>
            </div>
          </DialogHeader>

          <div className="flex-1 px-6 py-4 overflow-y-auto">
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">Task</label>
                <Textarea
                  placeholder="Describe the task for this agent to execute..."
                  className="min-h-[100px] text-sm rounded-lg"
                  value={runTask}
                  onChange={(e) => setRunTask(e.target.value)}
                  onKeyDown={handleRunKeyDown}
                  disabled={runLoading}
                />
                <p className="text-[10px] text-slate-400 mt-1">Press Ctrl+Enter to execute</p>
              </div>

              <Button
                className="w-full gap-2"
                onClick={executeRun}
                disabled={runLoading || !runTask.trim()}
              >
                {runLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {runLoading ? 'Executing...' : 'Execute Task'}
              </Button>

              {runResult && (
                <div className="space-y-3">
                  <Separator />
                  <div>
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">Result</label>
                    <div className="rounded-lg bg-slate-50 dark:bg-slate-900 p-4 text-sm whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                      {runResult.content}
                    </div>
                  </div>
                  {runResult.model && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400 dark:text-slate-500">
                      {runResult.model && <span>Model: {runResult.model}</span>}
                      <span>Confidence: {Math.round((runResult.confidence || 0) * 100)}%</span>
                      <span>Latency: {runResult.latencyMs}ms</span>
                      <span>Context: {runResult.contextTokens.toLocaleString()} tokens</span>
                      {runResult.taskClassification && <span className="text-emerald-500">{runResult.taskClassification}</span>}
                      {runResult.ragSources != null && runResult.ragSources > 0 && <span className="text-blue-500">RAG: {runResult.ragSources} sources</span>}
                      {runResult.validationScore != null && <span className="text-amber-500">Validation: {Math.round(runResult.validationScore * 100)}%</span>}
                      {runResult.reasoningPath && <span className="text-purple-500">Path: {runResult.reasoningPath}</span>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Agent Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={(open) => { setDetailOpen(open); if (!open) { setDetailData(null) } }}>
        <DialogContent className="sm:max-w-[720px] p-0 gap-0 flex flex-col max-h-[85vh]">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarFallback className="bg-[#003ABC] text-white text-xs font-bold">
                    {detailAgent?.name.slice(0, 2).toUpperCase() || 'AI'}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <DialogTitle className="text-sm font-semibold truncate">{detailAgent?.name}</DialogTitle>
                  <DialogDescription className="text-xs mt-0.5">
                    {detailAgent?.role} · {detailAgent?.departmentName || detailAgent?.department}
                  </DialogDescription>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge className={`text-[10px] ${typeColors[detailAgent?.type || ''] || ''}`}>{detailAgent?.type}</Badge>
                <Badge variant={detailAgent?.status === 'active' ? 'default' : 'outline'} className="text-[10px] capitalize">{detailAgent?.status}</Badge>
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1 px-6 py-4">
            {detailLoading ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
                </div>
                <Skeleton className="h-4 w-32" />
                <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}</div>
                <Skeleton className="h-4 w-32" />
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 rounded" />)}
              </div>
            ) : detailData ? (
              <Tabs defaultValue="overview" className="w-full">
                <TabsList className="w-full">
                  <TabsTrigger value="overview" className="flex-1 text-xs">Overview</TabsTrigger>
                  <TabsTrigger value="runs" className="flex-1 text-xs">Recent Runs</TabsTrigger>
                  <TabsTrigger value="memory" className="flex-1 text-xs">Memory</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4 mt-4">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                      { label: 'Total Runs', value: detailData.stats.totalRuns.toLocaleString(), icon: BarChart3, color: 'text-[#003ABC]' },
                      { label: 'Success Rate', value: `${Math.round(detailData.stats.successRate * 100)}%`, icon: Zap, color: 'text-emerald-600' },
                      { label: 'Avg Latency', value: `${Math.round(detailData.stats.avgLatency)}ms`, icon: Clock, color: 'text-amber-600' },
                      { label: 'Avg Confidence', value: `${Math.round(detailData.stats.avgConfidence * 100)}%`, icon: Brain, color: 'text-purple-600' },
                      { label: 'Total Tokens', value: detailData.stats.totalTokens.toLocaleString(), icon: Database, color: 'text-cyan-600' },
                      { label: 'RAG Usage', value: `${Math.round(detailData.stats.ragUsageRate * 100)}%`, icon: Activity, color: 'text-orange-600' },
                    ].map(s => (
                      <Card key={s.label} className="border-0 bg-slate-50 dark:bg-slate-900">
                        <CardContent className="p-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            <s.icon className={`h-3 w-3 ${s.color}`} />
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">{s.label}</p>
                          </div>
                          <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Health */}
                  {detailData.health != null && (
                    <div>
                      <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Health Monitor</h3>
                      <Card className="border-0 bg-slate-50 dark:bg-slate-900">
                        <CardContent className="p-3 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">Health Score</span>
                            <div className="flex items-center gap-2 flex-1 max-w-[180px] ml-4">
                              <Progress value={detailData.health.healthScore} className="h-2" />
                              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 w-8 text-right">{Math.round(detailData.health.healthScore)}%</span>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[10px]">
                            <span className="text-slate-400">Consecutive Failures</span>
                            <span className="text-right font-medium text-slate-700 dark:text-slate-300">{detailData.health.consecutiveFailures}</span>
                            <span className="text-slate-400">Last Execution</span>
                            <span className="text-right font-medium text-emerald-600">{detailData.health.lastExecutionAt ? new Date(detailData.health.lastExecutionAt).toLocaleString() : '—'}</span>
                            <span className="text-slate-400">Last Error</span>
                            <span className="text-right font-medium text-red-500">{detailData.health.lastErrorAt ? new Date(detailData.health.lastErrorAt).toLocaleString() : '—'}</span>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {/* Skills */}
                  {detailData.skills && Array.isArray(detailData.skills) && detailData.skills.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Skills</h3>
                      <div className="flex flex-wrap gap-1.5">
                        {detailData.skills.map((skill) => (
                          <Badge key={skill.slug} variant="secondary" className="text-[10px]">
                            {skill.name}
                            <span className="ml-1 text-slate-400">· {skill.category}</span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="runs" className="mt-4">
                  {detailData.recentRuns && Array.isArray(detailData.recentRuns) && detailData.recentRuns.length > 0 ? (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50 dark:bg-slate-800">
                            <TableHead className="text-[10px]">Model</TableHead>
                            <TableHead className="text-[10px]">Latency</TableHead>
                            <TableHead className="text-[10px]">Confidence</TableHead>
                            <TableHead className="text-[10px]">Tokens</TableHead>
                            <TableHead className="text-[10px]">Time</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detailData.recentRuns.slice(0, 5).map((run) => (
                            <TableRow key={run.id}>
                              <TableCell className="text-[10px] py-2 font-mono">{run.model ?? '—'}</TableCell>
                              <TableCell className="text-[10px] py-2">{run.latencyMs == null ? '—' : `${Math.round(run.latencyMs)}ms`}</TableCell>
                              <TableCell className="text-[10px] py-2">{run.confidence == null ? '—' : `${Math.round(run.confidence * 100)}%`}</TableCell>
                              <TableCell className="text-[10px] py-2">{run.tokensUsed.toLocaleString()}</TableCell>
                              <TableCell className="text-[10px] py-2 text-slate-400">{new Date(run.createdAt).toLocaleString()}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 text-center py-8">No recent runs available</p>
                  )}
                </TabsContent>

                <TabsContent value="memory" className="mt-4">
                  {detailData.memory && Array.isArray(detailData.memory) && detailData.memory.length > 0 ? (
                    <div className="space-y-2">
                      {detailData.memory.slice(0, 5).map((entry) => (
                        <Card key={entry.id} className="border-0 bg-slate-50 dark:bg-slate-900">
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <Badge variant="outline" className="text-[9px] mb-1">{entry.category}</Badge>
                                <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2">{entry.content}</p>
                              </div>
                              <Badge variant="secondary" className="text-[9px] shrink-0">{entry.temperature}</Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 text-center py-8">No memory entries available</p>
                  )}
                </TabsContent>
              </Tabs>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Bot className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-sm text-slate-400">No detail data available</p>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
}
