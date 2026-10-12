'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  GitFork,
  Dna,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Layers,
  Cpu,
  RefreshCw,
  Search,
  Plus,
  Play,
  ArrowRight,
  TrendingUp,
  Brain,
  History,
  Lock,
} from 'lucide-react'
import { toast } from 'sonner'

interface QualificationData {
  state: string
  score: number
  isQualified: boolean
  metrics: {
    taskSuccessRate: number
    reliabilityScore: number
    errorRate: number
    safetyViolations: number
    policyViolations: number
    toolExecutionSuccess: number
    customerOutcomeScore: number
    uptimePercent: number
    totalTasksEvaluated: number
  }
  reasons: string[]
}

interface LineageNode {
  id: string
  agentId: string
  rootAgentId: string
  parentAgentId: string | null
  generation: number
  lineagePath: string
  creationReason: string
  lifecycleStatus: string
  createdAt: string
}

interface LearningCycle {
  id: string
  cycleId: string
  agentId: string
  deployedVersion: string
  status: string
  createdAt: string
  observations: string
  proposedImprovement: string
}

export default function AgentEvolutionPanel() {
  const [stats, setStats] = useState<any>(null)
  const [lineageList, setLineageList] = useState<LineageNode[]>([])
  const [learningCycles, setLearningCycles] = useState<LearningCycle[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('AGENT-0001')
  const [qualification, setQualification] = useState<QualificationData | null>(null)
  const [isGlobalStopActive, setIsGlobalStopActive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Proposal form state
  const [proposalForm, setProposalForm] = useState({
    parentAgentId: 'AGENT-0001',
    departmentId: 'dept_executive_office',
    proposedRole: 'specialist',
    proposedName: 'Executive Intelligence Assistant',
    proposedPurpose: 'Synthesize cross-departmental telemetry and prepare executive briefs',
    capabilityGap: 'Cross-system correlation latency',
    reason: 'Accelerate executive decision agility',
    isLoopAgent: false,
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [statsRes, lineageRes, cyclesRes, qualRes, stopRes] = await Promise.all([
        fetch('/api/enterprise/workforce-evolution?stats=true').then((r) => r.json()),
        fetch('/api/enterprise/workforce-evolution?view=lineage').then((r) => r.json()),
        fetch('/api/enterprise/workforce-evolution?view=cycles').then((r) => r.json()),
        fetch(`/api/enterprise/workforce-evolution?view=qualification&agentId=${selectedAgentId}`).then((r) => r.json()),
        fetch('/api/enterprise/workforce-evolution?view=emergency-stop').then((r) => r.json()),
      ])

      setStats(statsRes)
      setLineageList(lineageRes.lineage || [])
      setLearningCycles(cyclesRes.cycles || [])
      setQualification(qualRes.qualification || null)
      setIsGlobalStopActive(stopRes.isGlobalStopActive || false)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [selectedAgentId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleTriggerEmergencyStop = async () => {
    try {
      const res = await fetch('/api/enterprise/workforce-evolution?action=emergency-stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'global',
          reason: 'Manual administrative halt of recursive evolution',
          action: 'trigger',
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.error('GLOBAL AI EVOLUTION STOP ACTIVATED')
        setIsGlobalStopActive(true)
        loadData()
      }
    } catch {
      toast.error('Failed to trigger emergency stop')
    }
  }

  const handleLiftEmergencyStop = async (stopId: string) => {
    try {
      const res = await fetch('/api/enterprise/workforce-evolution?action=emergency-stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'lift',
          stopId,
          resolution: 'Administrative review completed and authorized',
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Emergency stop lifted. Workforce evolution operational.')
        setIsGlobalStopActive(false)
        loadData()
      }
    } catch {
      toast.error('Failed to lift emergency stop')
    }
  }

  const handleProposeAssistant = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch('/api/enterprise/workforce-evolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proposalForm),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(data.reason || 'Assistant agent created successfully!')
        loadData()
      } else {
        toast.error(data.reason || data.error || 'Proposal rejected by governance policy')
      }
    } catch {
      toast.error('Failed to submit assistant proposal')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-[#1E293B]">Agent Evolution & Governance</h1>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              3-Month Controlled Program
            </Badge>
            {isGlobalStopActive && (
              <Badge variant="destructive" className="animate-pulse">
                EMERGENCY STOP ACTIVE
              </Badge>
            )}
          </div>
          <p className="text-sm text-[#64748B] mt-1">
            Controlled lineage, qualification scoring, self-learning loops, and 100-department AI model governance.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => loadData()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          {!isGlobalStopActive ? (
            <Button variant="destructive" size="sm" onClick={handleTriggerEmergencyStop}>
              <ShieldAlert className="w-4 h-4 mr-2" />
              Global Emergency Stop
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => handleLiftEmergencyStop('global')}
            >
              <ShieldCheck className="w-4 h-4 mr-2" />
              Lift Emergency Stop
            </Button>
          )}
        </div>
      </div>

      {/* Program Timeline Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-blue-500 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-medium">Month 1: Proposal Phase</CardDescription>
            <CardTitle className="text-xl flex items-center justify-between">
              <span>Up to 3 Assistants</span>
              <Dna className="w-5 h-5 text-blue-500" />
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Qualified parents analyze gaps & propose specialized child agents.
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-medium">Month 2: Self-Learning</CardDescription>
            <CardTitle className="text-xl flex items-center justify-between">
              <span>Evidence-Based</span>
              <Brain className="w-5 h-5 text-purple-500" />
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Telemetry collection & parameter improvements with protected boundary.
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-medium">Month 3: Recursive Evolution</CardDescription>
            <CardTitle className="text-xl flex items-center justify-between">
              <span>Max 3 + 1 Loop</span>
              <GitFork className="w-5 h-5 text-emerald-500" />
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Strict generation limit (depth $\le$ 3) and duplicate prevention.
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-medium">Department AI Models</CardDescription>
            <CardTitle className="text-xl flex items-center justify-between">
              <span>100 Departments</span>
              <Cpu className="w-5 h-5 text-amber-500" />
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Multi-model abstraction: Foundation, LoRA, and local routing.
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="lineage" className="space-y-4">
        <TabsList className="bg-slate-100 p-1">
          <TabsTrigger value="lineage" className="gap-2">
            <GitFork className="w-4 h-4" /> Lineage & Hierarchy
          </TabsTrigger>
          <TabsTrigger value="qualification" className="gap-2">
            <ShieldCheck className="w-4 h-4" /> Qualification Matrix
          </TabsTrigger>
          <TabsTrigger value="proposal" className="gap-2">
            <Plus className="w-4 h-4" /> Propose Assistant
          </TabsTrigger>
          <TabsTrigger value="learning" className="gap-2">
            <Brain className="w-4 h-4" /> Learning Cycles
          </TabsTrigger>
          <TabsTrigger value="models" className="gap-2">
            <Cpu className="w-4 h-4" /> Department Models
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Lineage Tree */}
        <TabsContent value="lineage" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">AI Workforce Genealogy & Lineage Trace</CardTitle>
              <CardDescription>
                Every evolved assistant is permanently traceable to its Root Parent Agent and creator.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {lineageList.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <GitFork className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                  No evolved assistant agents created yet. Use the Proposal tab to initiate controlled evolution.
                </div>
              ) : (
                <ScrollArea className="h-80">
                  <div className="space-y-3">
                    {lineageList.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 border rounded-lg bg-slate-50 flex items-center justify-between text-sm"
                      >
                        <div>
                          <div className="font-semibold text-slate-800 flex items-center gap-2">
                            <span>{item.agentId}</span>
                            <Badge variant="outline" className="text-xs">
                              Gen {item.generation}
                            </Badge>
                            <Badge className="bg-emerald-100 text-emerald-800 text-xs">
                              {item.lifecycleStatus}
                            </Badge>
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            Path: <span className="font-mono">{item.lineagePath}</span>
                          </div>
                          <div className="text-xs text-slate-600 mt-0.5">
                            Reason: {item.creationReason}
                          </div>
                        </div>
                        <div className="text-right text-xs text-slate-400">
                          Created: {new Date(item.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Qualification Matrix */}
        <TabsContent value="qualification" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Agent Qualification Engine</CardTitle>
                <CardDescription>
                  Multi-metric mathematical evaluation determining eligibility for child proposals.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  className="w-40 text-xs"
                  placeholder="Agent ID (e.g. AGENT-0001)"
                  value={selectedAgentId}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                />
                <Button size="sm" variant="secondary" onClick={() => loadData()}>
                  Evaluate
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {qualification && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border">
                    <div>
                      <div className="text-xs font-medium text-slate-500">CURRENT STATUS</div>
                      <div className="text-xl font-bold text-slate-800 flex items-center gap-2 mt-1">
                        <span>{qualification.state}</span>
                        {qualification.isQualified ? (
                          <Badge className="bg-emerald-600 text-white">ELIGIBLE</Badge>
                        ) : (
                          <Badge variant="destructive">NOT ELIGIBLE</Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-medium text-slate-500">COMPOSITE SCORE</div>
                      <div className="text-2xl font-bold text-blue-600">
                        {(qualification.score * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                    <div className="p-3 bg-white border rounded">
                      <div className="text-slate-500">Task Success Rate</div>
                      <div className="text-base font-bold text-slate-800">
                        {(qualification.metrics.taskSuccessRate * 100).toFixed(1)}%
                      </div>
                      <Progress value={qualification.metrics.taskSuccessRate * 100} className="mt-2 h-1.5" />
                    </div>

                    <div className="p-3 bg-white border rounded">
                      <div className="text-slate-500">Reliability Score</div>
                      <div className="text-base font-bold text-slate-800">
                        {(qualification.metrics.reliabilityScore * 100).toFixed(1)}%
                      </div>
                      <Progress value={qualification.metrics.reliabilityScore * 100} className="mt-2 h-1.5" />
                    </div>

                    <div className="p-3 bg-white border rounded">
                      <div className="text-slate-500">Error Rate</div>
                      <div className="text-base font-bold text-slate-800">
                        {(qualification.metrics.errorRate * 100).toFixed(1)}%
                      </div>
                      <Progress value={qualification.metrics.errorRate * 100} className="mt-2 h-1.5 bg-red-100" />
                    </div>

                    <div className="p-3 bg-white border rounded">
                      <div className="text-slate-500">Safety Violations</div>
                      <div className="text-base font-bold text-emerald-600">
                        {qualification.metrics.safetyViolations} (0 required)
                      </div>
                    </div>
                  </div>

                  {qualification.reasons.length > 0 && (
                    <div className="p-3 border rounded-lg bg-blue-50/50 text-xs text-blue-900">
                      <span className="font-semibold">Evaluation Notes: </span>
                      {qualification.reasons.join('; ')}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Propose Assistant Form */}
        <TabsContent value="proposal" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Submit Specialized Assistant Proposal</CardTitle>
              <CardDescription>
                Qualified parent agents can propose up to 3 specialized assistants for domain workload acceleration.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleProposeAssistant} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Parent Agent ID</Label>
                    <Input
                      value={proposalForm.parentAgentId}
                      onChange={(e) => setProposalForm({ ...proposalForm, parentAgentId: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Department ID</Label>
                    <Input
                      value={proposalForm.departmentId}
                      onChange={(e) => setProposalForm({ ...proposalForm, departmentId: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Proposed Assistant Name</Label>
                    <Input
                      value={proposalForm.proposedName}
                      onChange={(e) => setProposalForm({ ...proposalForm, proposedName: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Proposed Role</Label>
                    <Input
                      value={proposalForm.proposedRole}
                      onChange={(e) => setProposalForm({ ...proposalForm, proposedRole: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Specific Purpose & Responsibility</Label>
                  <Textarea
                    rows={2}
                    value={proposalForm.proposedPurpose}
                    onChange={(e) => setProposalForm({ ...proposalForm, proposedPurpose: e.target.value })}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Identified Capability Gap</Label>
                    <Input
                      value={proposalForm.capabilityGap}
                      onChange={(e) => setProposalForm({ ...proposalForm, capabilityGap: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Business Justification / Reason</Label>
                    <Input
                      value={proposalForm.reason}
                      onChange={(e) => setProposalForm({ ...proposalForm, reason: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <Button type="submit" disabled={submitting || isGlobalStopActive} className="w-full">
                  {submitting ? 'Evaluating & Provisioning...' : 'Submit Proposal for Governance Approval'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Learning Cycles */}
        <TabsContent value="learning" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Protected Self-Learning Cycles</CardTitle>
              <CardDescription>
                Auditable parameter and prompt tuning history. System-level security parameters cannot be modified.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {learningCycles.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No learning cycles recorded yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {learningCycles.map((c) => (
                    <div key={c.id} className="p-3 border rounded-lg bg-slate-50 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-semibold text-slate-800">
                          {c.cycleId} — {c.agentId} ({c.deployedVersion})
                        </div>
                        <div className="text-slate-500 mt-1">Status: {c.status}</div>
                      </div>
                      <Badge className="bg-blue-100 text-blue-800">Audited</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 5: Department Models */}
        <TabsContent value="models" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">100-Department Model Abstraction & Canary Deployments</CardTitle>
              <CardDescription>
                Each department is backed by an AI model tier with automated canary validation and fallback routing.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="p-4 border rounded-lg bg-slate-50 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">Active Routing Architecture:</span>
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700">Multi-Provider Live</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 bg-white border rounded">
                    <div className="text-slate-500 font-medium">Primary Foundation</div>
                    <div className="text-slate-800 font-bold mt-1">Groq LLaMA-3.3-70B</div>
                  </div>
                  <div className="p-3 bg-white border rounded">
                    <div className="text-slate-500 font-medium">Reasoning Tier</div>
                    <div className="text-slate-800 font-bold mt-1">DeepSeek R1 / Distill</div>
                  </div>
                  <div className="p-3 bg-white border rounded">
                    <div className="text-slate-500 font-medium">Fast Fallback</div>
                    <div className="text-slate-800 font-bold mt-1">LLaMA-3.1-8B Instant</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
