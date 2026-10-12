'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Terminal, Send, Bot, Building2, Shield, Zap, Activity, AlertTriangle,
  Radio, Power, Settings, Server, ArrowRight, ChevronRight, CheckCircle2,
  XCircle, Clock, Loader2, Globe, Brain, Lock,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'

interface SystemOverview {
  agents: number
  departments: number
  workflows: number
  skills: number
  companies: number
  tasks: number
  pendingApprovals: number
  commandsIssued: number
  totalUsage: number
  securityEvents: number
}

interface Company {
  id: string
  name: string
  slug: string
  domain: string | null
  status: string
  crmConnected: boolean
}

interface CommandRecord {
  id: string
  rawCommand: string
  parsedIntent: string
  detectedDept: string | null
  status: string
  createdAt: string
  taskStatus: string | null
}

interface TaskRecord {
  id: string
  title: string
  status: string
  priority: string
  createdAt: string
}

interface DeptInfo {
  id: string
  name: string
  slug: string
  agentCount: number
}

interface SuperAdminData {
  systemOverview: SystemOverview
  companies: Company[]
  recentCommands: CommandRecord[]
  recentTasks: TaskRecord[]
  topDepartments: DeptInfo[]
  pendingApprovals: { id: string; type: string; title: string; status: string; createdAt: string }[]
}

const QUICK_COMMANDS = [
  { label: 'Score All Leads', cmd: 'score all pending leads across all companies', icon: Brain },
  { label: 'Sync All CRMs', cmd: 'sync all CRM data from connected companies', icon: Globe },
  { label: 'Run Security Audit', cmd: 'run full security audit across all systems', icon: Shield },
  { label: 'Generate Reports', cmd: 'generate productivity reports for all departments', icon: Activity },
  { label: 'Emergency Stop', cmd: 'EMERGENCY: halt all agent processing immediately', icon: Power, danger: true },
  { label: 'Broadcast to Agents', cmd: 'BROADCAST: system update - all agents reload configurations', icon: Radio },
]

export default function SuperAdminCommandCenter() {
  const [data, setData] = useState<SuperAdminData | null>(null)
  const [loading, setLoading] = useState(true)
  const [command, setCommand] = useState('')
  const [targetCompany, setTargetCompany] = useState<string>('__all__')
  const [priority, setPriority] = useState<string>('high')
  const [executing, setExecuting] = useState(false)
  const [commandLog, setCommandLog] = useState<Array<{ time: string; message: string; type: 'success' | 'error' | 'info' | 'warning' }>>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const logEndRef = useRef<HTMLDivElement>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/super-admin')
      const json = await res.json()
      setData(json)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [commandLog])

  const addLog = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    setCommandLog((prev) => [
      ...prev,
      { time: new Date().toLocaleTimeString(), message, type },
    ])
  }

  const executeCommand = async (cmd: string) => {
    if (!cmd.trim() || executing) return
    setExecuting(true)
    addLog(`> ${cmd}`, 'info')

    try {
      const res = await fetch('/api/super-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'execute_command',
          payload: {
            command: cmd,
            targetCompany: targetCompany === '__all__' ? null : targetCompany,
            priority,
          },
        }),
      })
      const json = await res.json()

      if (json.success) {
        addLog(`✓ ${json.message}`, 'success')
        if (json.matchedWorkflow) addLog(`  → Matched Workflow: ${json.matchedWorkflow}`, 'info')
        if (json.detectedDepartment) addLog(`  → Department: ${json.detectedDepartment}`, 'info')
        if (json.stepsCreated) addLog(`  → ${json.stepsCreated}`, 'info')
        if (json.targetCompany) addLog(`  → Target: ${json.targetCompany}`, 'info')
      } else {
        addLog(`✗ ${json.error || 'Command failed'}`, 'error')
      }
    } catch {
      addLog('✗ Network error - could not reach API', 'error')
    }

    setCommand('')
    setExecuting(false)
    inputRef.current?.focus()
    fetchData()
  }

  const handleQuickCommand = (cmd: string, danger?: boolean) => {
    if (danger) {
      setCommandLog((prev) => [
        ...prev,
        { time: new Date().toLocaleTimeString(), message: '⚠ CONFIRM: Type the command and press Enter to execute', type: 'warning' },
      ])
    }
    setCommand(cmd)
    inputRef.current?.focus()
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-80 bg-[#F8FAFC]" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg bg-gray-50" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-lg bg-gray-50" />
      </div>
    )
  }

  const overview = data?.systemOverview

  const statusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="w-3 h-3 text-emerald-600" />
      case 'failed': return <XCircle className="w-3 h-3 text-red-600" />
      case 'processing': return <Loader2 className="w-3 h-3 text-[#003ABC] animate-spin" />
      default: return <Clock className="w-3 h-3 text-[#64748B]" />
    }
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-red-600/10 flex items-center justify-center">
          <Shield className="w-5 h-5 text-red-600" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-[#1E293B]">Super Admin Command Center</h2>
          <p className="text-xs text-[#64748B]">Issue commands, dispatch agents, control all systems</p>
        </div>
      </div>

      {/* System Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          { label: 'Agents', value: overview?.agents, icon: Bot, color: 'text-[#003ABC]' },
          { label: 'Depts', value: overview?.departments, icon: Server, color: 'text-[#FF6A00]' },
          { label: 'Workflows', value: overview?.workflows, icon: Zap, color: 'text-emerald-600' },
          { label: 'Skills', value: overview?.skills, icon: Brain, color: 'text-[#003ABC]' },
          { label: 'Companies', value: overview?.companies, icon: Building2, color: 'text-[#003ABC]' },
          { label: 'Tasks', value: overview?.tasks, icon: Activity, color: 'text-amber-600' },
          { label: 'Approvals', value: overview?.pendingApprovals, icon: AlertTriangle, color: 'text-red-600' },
          { label: 'Commands', value: overview?.commandsIssued, icon: Terminal, color: 'text-[#1E293B]' },
        ].map((s) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="bg-white rounded-xl border border-[#E2E8F0] p-3 text-center">
              <Icon className={`w-4 h-4 mx-auto mb-1 ${s.color}`} />
              <p className={`text-xl font-bold ${s.color}`}>{(s.value ?? 0).toLocaleString()}</p>
              <p className="text-[10px] text-[#64748B]">{s.label}</p>
            </div>
          )
        })}
      </div>

      {/* Main Command Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Terminal - 2/3 width */}
        <div className="lg:col-span-2 space-y-4">
          {/* Command Input */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Terminal className="w-4 h-4 text-[#003ABC]" />
              <span className="text-xs font-semibold text-[#1E293B]">Command Terminal</span>
              {executing && (
                <Badge className="bg-[#003ABC]/10 text-[#003ABC] text-[10px] py-0 ml-auto">
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Executing...
                </Badge>
              )}
            </div>

            {/* Target selector */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <Select value={targetCompany} onValueChange={setTargetCompany}>
                <SelectTrigger className="w-[180px] h-8 text-xs bg-gray-50 border-[#E2E8F0] text-[#1E293B]">
                  <SelectValue placeholder="Target Company" />
                </SelectTrigger>
                <SelectContent className="bg-white border-[#E2E8F0]">
                  <SelectItem value="__all__" className="text-[#1E293B]">All Companies</SelectItem>
                  {data?.companies.map((c) => (
                    <SelectItem key={c.slug} value={c.slug} className="text-[#1E293B]">
                      <div className="flex items-center gap-2">
                        {c.crmConnected ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <XCircle className="w-3 h-3 text-[#64748B]" />}
                        {c.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="w-[120px] h-8 text-xs bg-gray-50 border-[#E2E8F0] text-[#1E293B]">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent className="bg-white border-[#E2E8F0]">
                  <SelectItem value="critical" className="text-red-600">Critical</SelectItem>
                  <SelectItem value="high" className="text-amber-600">High</SelectItem>
                  <SelectItem value="medium" className="text-[#1E293B]">Medium</SelectItem>
                  <SelectItem value="low" className="text-[#64748B]">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Input line */}
            <div className="flex items-center gap-2">
              <span className="text-[#003ABC] font-mono text-sm flex-shrink-0">$</span>
              <Input
                ref={inputRef}
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') executeCommand(command) }}
                placeholder="Type a command... (e.g., score all leads for ALO Education)"
                className="flex-1 h-10 bg-[#F8FAFC] border-[#E2E8F0] text-[#1E293B] font-mono text-sm focus:border-[#003ABC]/50"
                disabled={executing}
              />
              <Button
                onClick={() => executeCommand(command)}
                disabled={!command.trim() || executing}
                className="h-10 bg-[#FF6A00]/10 text-[#003ABC] hover:bg-[#FF6A00]/10 border border-[#FF6A00]/30"
              >
                {executing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>

            {/* Quick Commands */}
            <div className="mt-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#64748B] mb-2">Quick Commands</p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_COMMANDS.map((qc) => {
                  const Icon = qc.icon
                  return (
                    <Button
                      key={qc.label}
                      variant="outline"
                      size="sm"
                      className={`h-7 text-[11px] gap-1 ${qc.danger ? 'border-red-600/30 text-red-600 hover:bg-red-600/10' : 'border-[#E2E8F0] text-[#64748B] hover:text-[#003ABC] hover:bg-gray-50'}`}
                      onClick={() => handleQuickCommand(qc.cmd, qc.danger)}
                    >
                      <Icon className="w-3 h-3" />
                      {qc.label}
                    </Button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Command Log */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#FF6A00]" />
                <span className="text-xs font-semibold text-[#1E293B]">Command Log</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[10px] text-[#64748B] hover:text-[#1E293B]"
                onClick={() => setCommandLog([])}
              >
                Clear
              </Button>
            </div>
            <div className="h-48 overflow-y-auto bg-gray-50 rounded-lg p-3 font-mono text-xs space-y-1">
              {commandLog.length === 0 ? (
                <p className="text-[#64748B]">Waiting for commands...</p>
              ) : (
                commandLog.map((log, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-[#64748B]/60 flex-shrink-0">{log.time}</span>
                    <span className={
                      log.type === 'success' ? 'text-emerald-600' :
                      log.type === 'error' ? 'text-red-600' :
                      log.type === 'warning' ? 'text-amber-600' :
                      'text-[#1E293B]'
                    }>
                      {log.message}
                    </span>
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-4">
          {/* Company CRM Status */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="w-4 h-4 text-[#FF6A00]" />
              <span className="text-xs font-semibold text-[#1E293B]">Company CRM Status</span>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {data?.companies.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-1.5 px-2 rounded bg-[#F8FAFC]">
                  <div className="flex items-center gap-2 min-w-0">
                    {c.crmConnected ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-3 h-3 text-[#64748B]/40 flex-shrink-0" />
                    )}
                    <span className="text-xs text-[#1E293B] truncate">{c.name}</span>
                  </div>
                  <Badge className={`text-[9px] py-0 ${c.crmConnected ? 'bg-emerald-600/10 text-emerald-600' : 'bg-gray-100 text-[#64748B]'}`}>
                    {c.crmConnected ? 'CRM' : 'OFF'}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Commands */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Terminal className="w-4 h-4 text-[#003ABC]" />
              <span className="text-xs font-semibold text-[#1E293B]">Recent Commands</span>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {data?.recentCommands.map((cmd) => (
                <div key={cmd.id} className="py-1.5 px-2 rounded bg-[#F8FAFC]">
                  <div className="flex items-center gap-1.5">
                    {statusIcon(cmd.status)}
                    <span className="text-xs text-[#1E293B] truncate">{cmd.rawCommand}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 ml-5">
                    <span className="text-[10px] text-[#64748B]">{new Date(cmd.createdAt).toLocaleTimeString()}</span>
                    {cmd.detectedDept && (
                      <Badge className="text-[9px] py-0 bg-[#F8FAFC] text-[#64748B]">{cmd.detectedDept}</Badge>
                    )}
                  </div>
                </div>
              ))}
              {(!data?.recentCommands || data.recentCommands.length === 0) && (
                <p className="text-xs text-[#64748B] text-center py-4">No commands yet</p>
              )}
            </div>
          </div>

          {/* Top Departments */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Bot className="w-4 h-4 text-[#003ABC]" />
              <span className="text-xs font-semibold text-[#1E293B]">Top Departments</span>
            </div>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {data?.topDepartments.map((dept) => (
                <div key={dept.id} className="flex items-center justify-between py-1 px-2 rounded bg-[#F8FAFC]">
                  <span className="text-xs text-[#1E293B] truncate">{dept.name}</span>
                  <span className="text-xs text-[#003ABC] font-medium ml-2">{dept.agentCount}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Pending Approvals */}
          {overview && overview.pendingApprovals > 0 && (
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 border-l-2 border-l-amber-600">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span className="text-xs font-semibold text-amber-600">Pending Approvals</span>
                <Badge className="bg-amber-600/10 text-amber-600 text-[10px] py-0 ml-auto">{overview.pendingApprovals}</Badge>
              </div>
              <div className="space-y-1.5">
                {data?.pendingApprovals.slice(0, 3).map((a) => (
                  <div key={a.id} className="text-xs text-[#1E293B] py-1 px-2 rounded bg-amber-600/5">
                    {a.title}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Architecture Diagram */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
        <h3 className="text-sm font-semibold text-[#1E293B] mb-4 flex items-center gap-2">
          <Server className="w-4 h-4 text-[#003ABC]" />
          How It Works: Agent Hub → Sister Company CRM Architecture
        </h3>
        <div className="space-y-4">
          {/* Visual Architecture */}
          <div className="p-4 rounded-lg bg-gray-50 border border-[#E2E8F0]">
            <div className="flex items-center justify-center gap-1 flex-wrap text-[11px] py-2">
              <div className="px-3 py-2 rounded-lg bg-red-600/10 border border-red-600/30 text-center">
                <Lock className="w-4 h-4 mx-auto mb-1 text-red-600" />
                <span className="text-red-600 font-semibold">Super Admin</span>
                <p className="text-[#64748B] text-[9px] mt-0.5">You are here</p>
              </div>
              <ChevronRight className="w-5 h-5 text-[#FF6A00] mx-1" />
              <div className="px-3 py-2 rounded-lg bg-[#FF6A00]/10 border border-[#FF6A00]/30 text-center">
                <Terminal className="w-4 h-4 mx-auto mb-1 text-[#003ABC]" />
                <span className="text-[#003ABC] font-semibold">Command Center</span>
                <p className="text-[#64748B] text-[9px] mt-0.5">Issues commands</p>
              </div>
              <ChevronRight className="w-5 h-5 text-[#FF6A00] mx-1" />
              <div className="px-3 py-2 rounded-lg bg-gray-50 border border-[#FF6A00]/30 text-center">
                <Zap className="w-4 h-4 mx-auto mb-1 text-[#FF6A00]" />
                <span className="text-[#FF6A00] font-semibold">Agent Hub</span>
                <p className="text-[#64748B] text-[9px] mt-0.5">2000 AI Agents</p>
              </div>
              <ChevronRight className="w-5 h-5 text-[#003ABC] mx-1" />
              <div className="px-3 py-2 rounded-lg bg-emerald-600/10 border border-emerald-600/30 text-center">
                <Globe className="w-4 h-4 mx-auto mb-1 text-emerald-600" />
                <span className="text-emerald-600 font-semibold">Company CRM</span>
                <p className="text-[#64748B] text-[9px] mt-0.5">Sister company</p>
              </div>
            </div>
          </div>

          {/* Step by Step */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              {
                step: '1',
                title: 'Super Admin Commands',
                desc: 'You type a command in the terminal above (e.g., "score all leads for ALO Education"). You can select a target company and priority level.',
                color: 'text-red-600',
                border: 'border-red-600/30',
                bg: 'bg-red-600/5',
              },
              {
                step: '2',
                title: 'Hub Routes to Agents',
                desc: 'The Command Center matches your command to workflows, detects the target department, and dispatches the right AI agents from the 2000-agent pool.',
                color: 'text-[#003ABC]',
                border: 'border-[#003ABC]/30',
                bg: 'bg-[#003ABC]/5',
              },
              {
                step: '3',
                title: 'Agents Process in CRM',
                desc: 'Dispatched agents connect to the sister company CRM via REST API + WebSocket. They perform lead scoring, contact enrichment, deal prediction, and auto follow-ups.',
                color: 'text-[#FF6A00]',
                border: 'border-[#FF6A00]/30',
                bg: 'bg-[#FF6A00]/5',
              },
              {
                step: '4',
                title: 'Results Sync Back',
                desc: 'Processed data (scores, predictions, follow-ups) is written back to the company CRM. Usage is tracked. Audit logs record everything for compliance.',
                color: 'text-emerald-600',
                border: 'border-emerald-600/30',
                bg: 'bg-emerald-600/5',
              },
            ].map((s) => (
              <div key={s.step} className={`p-3 rounded-lg border ${s.border} ${s.bg}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-6 h-6 rounded-full bg-[#F8FAFC] flex items-center justify-center text-xs font-bold ${s.color}`}>
                    {s.step}
                  </span>
                  <span className={`text-xs font-semibold ${s.color}`}>{s.title}</span>
                </div>
                <p className="text-[11px] text-[#64748B] leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}