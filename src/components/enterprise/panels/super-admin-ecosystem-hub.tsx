'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Activity,
  Bot,
  CheckCircle2,
  Cpu,
  Globe,
  HardDrive,
  KeyRound,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wrench,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

interface RouterCandidate {
  provider: string
  model: string
  isLocal: boolean
  isHealthy: boolean
  circuitOpen: boolean
  latencyMs: number
  costPerMillionTokens: number
  contextLength: number
  eligible: boolean
  ineligibleReason?: string
  score: number
}

interface RouterResponse {
  config: {
    strategy: string
    privacyMode: string
    preferFreeFirst: boolean
    preferLocalFirst: boolean
    maxConcurrencyPerTenant: number
    pinnedProvider?: string | null
    pinnedModel?: string | null
  }
  plan: {
    strategy: string
    privacyMode: string
    selected: RouterCandidate | null
    candidates: RouterCandidate[]
  }
  decisions: Array<{
    id: string
    requestedModel: string
    selectedProvider: string | null
    selectedModel: string | null
    success: boolean
    latencyMs: number
    createdAt: string
  }>
  protocols: Array<{ id: string; endpoint: string; status: string }>
}

interface VaultResponse {
  summary: {
    totalSuppliedSources: number
    totalVettedAssets: number
    topicJarvisTotal: number
    searchAiCallTotal: number
  }
  dbCounts: {
    sources: number
    assets: number
    integrations: number
    licenses: number
    securityReviews: number
    versions: number
    oneRuntimeAdapters?: number
  }
  reconciledAdapters?: Array<{
    id: string
    category: string
    strategy: string
    licenseClass: string
    upstreamRepo: string
    runtimeState: string
    stateReason: string
  }>
  sources: Array<{
    id: string
    slug: string
    url: string
    sourceKind: string
    displayName: string
    category: string
    availability: string
  }>
  assets?: Array<{
    id: string
    fullName: string
    url: string
    licenseSpdx: string | null
    compatibilityStatus: string
    integrationPattern: string
    assetCategory: string
    isPinned: boolean
  }>
  licenses: Array<{
    id: string
    assetId?: string
    spdxId: string
    copyleftScope: string
    commercialAllowed: boolean
    verdict: string
  }>
  securityReviews?: Array<{
    id: string
    assetId: string
    riskLevel: string
    status: string
    ssrfChecked: boolean
    sandboxRequired: boolean
  }>
  integrations: Array<{
    id: string
    slug: string
    name: string
    category: string
    strategy: string
    licenseClass: string
    status: string
    activeVersionId?: string | null
    versions?: Array<{
      id: string
      version: string
      pinnedRef: string
      isActive: boolean
      createdAt: string
    }>
  }>
  hardware: {
    memory?: { totalGb?: number; availableGb?: number }
    cpu?: { cores?: number }
    capabilities?: {
      canRunSmallLocalModels?: boolean
      canRun7bModels?: boolean
      canRunImageGeneration?: boolean
    }
  }
}

interface CodingAgentsResponse {
  harnesses: Array<{
    id: string
    slug: string
    name: string
    harnessType: string
    upstreamRepo: string | null
    licenseSpdx: string | null
    sandboxMode: string
    requiresApproval: boolean
    cliProbe: { installed: boolean; detail: string }
  }>
  sessions: Array<{
    id: string
    workspacePath: string
    branchName: string
    sandboxMode: string
    status: string
    promptSummary: string | null
    diffSummaryJson?: string | null
    startedAt: string
    harness: { slug: string; name: string; licenseSpdx: string | null }
  }>
  tools: Array<{
    id: string
    slug: string
    name: string
    category: string
    readOnly: boolean
    requiresApproval: boolean
    optimizationPolicy: string
  }>
  qaViewports: Array<{ id: string; label: string; width: number; height: number }>
}

const LICENSE_TONE: Record<string, string> = {
  permissive: 'bg-emerald-100 text-emerald-800',
  'strong-copyleft-isolated': 'bg-amber-100 text-amber-800',
  'custom-restricted': 'bg-rose-100 text-rose-800',
  'no-license': 'bg-red-100 text-red-800',
  commercial: 'bg-slate-100 text-slate-700',
}

export default function SuperAdminEcosystemHub() {
  const [loading, setLoading] = useState(true)
  const [routerData, setRouterData] = useState<RouterResponse | null>(null)
  const [vaultData, setVaultData] = useState<VaultResponse | null>(null)
  const [agentsData, setAgentsData] = useState<CodingAgentsResponse | null>(null)

  const [strategy, setStrategy] = useState('free-first')
  const [privacyMode, setPrivacyMode] = useState('guarded')
  const [testPrompt, setTestPrompt] = useState('Reply with OK and summarize your model routing status in one sentence.')
  const [routeResult, setRouteResult] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)

  const [sandboxHarness, setSandboxHarness] = useState('opencode')
  const [sandboxBranch, setSandboxBranch] = useState('sandbox/feature-preview')
  const [sandboxPrompt, setSandboxPrompt] = useState('Run typecheck and propose minimal typed API refactor inside sandbox.')
  const [optimizerPreview, setOptimizerPreview] = useState<{
    originalCount: number
    deduplicatedCount: number
    estimatedTokensSaved: number
  } | null>(null)
  const [livekitProbe, setLivekitProbe] = useState<string | null>(null)
  const [guardrailProbe, setGuardrailProbe] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    try {
      const [rRes, vRes, aRes] = await Promise.all([
        apiFetch('/api/super-admin/ai/command-router'),
        apiFetch('/api/super-admin/ecosystem/vault'),
        apiFetch('/api/super-admin/coding-agents'),
      ])
      if (rRes.ok) {
        const rJson = (await rRes.json()) as RouterResponse
        setRouterData(rJson)
        if (rJson.config) {
          setStrategy(rJson.config.strategy)
          setPrivacyMode(rJson.config.privacyMode)
        }
      }
      if (vRes.ok) setVaultData((await vRes.json()) as VaultResponse)
      if (aRes.ok) setAgentsData((await aRes.json()) as CodingAgentsResponse)
    } catch {
      toast.error('Failed to load Ecosystem Hub telemetry')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const saveRouterConfig = async () => {
    setBusyAction('save_router')
    try {
      const res = await apiFetch('/api/super-admin/ai/command-router', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_config', strategy, privacyMode }),
      })
      if (!res.ok) throw new Error('Update failed')
      toast.success('Command Router policy saved')
      await loadAll()
    } catch {
      toast.error('Failed to save Command Router policy')
    } finally {
      setBusyAction(null)
    }
  }

  const runLiveRouteTest = async () => {
    setBusyAction('test_route')
    setRouteResult(null)
    try {
      const res = await apiFetch('/api/super-admin/ai/command-router', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test_route',
          prompt: testPrompt,
          strategy,
          privacyMode,
        }),
      })
      const json = await res.json()
      if (json.success) {
        setRouteResult(`${json.selectedProvider} / ${json.selectedModel} (${json.latencyMs}ms): ${json.content}`)
        toast.success('Route probe completed')
      } else {
        setRouteResult(`Probe unavailable: ${json.error || 'No live model configured'}`)
        toast.error('No live model responded', { description: json.error })
      }
    } catch {
      toast.error('Route probe request failed')
    } finally {
      setBusyAction(null)
    }
  }

  const syncVault = async () => {
    setBusyAction('sync_vault')
    try {
      const res = await apiFetch('/api/super-admin/ecosystem/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_vault' }),
      })
      if (!res.ok) throw new Error('Sync failed')
      const json = await res.json()
      toast.success('Asset Vault synced to database', {
        description: `${json.counts?.sourcesUpserted ?? 0} sources · ${json.counts?.assetsUpserted ?? 0} assets · ${json.counts?.integrationsEnsured ?? 0} new integrations`,
      })
      await loadAll()
    } catch {
      toast.error('Asset Vault sync failed')
    } finally {
      setBusyAction(null)
    }
  }

  const createSandboxSession = async () => {
    setBusyAction('create_session')
    try {
      const res = await apiFetch('/api/super-admin/coding-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_session',
          harnessSlug: sandboxHarness,
          branchName: sandboxBranch,
          promptSummary: sandboxPrompt,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error('Sandbox guard blocked session', { description: json.error })
        return
      }
      toast.success('Isolated sandbox session queued for approval')
      await loadAll()
    } catch {
      toast.error('Failed to launch sandbox session')
    } finally {
      setBusyAction(null)
    }
  }

  const decideSession = async (sessionId: string, decision: 'approved' | 'rejected') => {
    setBusyAction(sessionId)
    try {
      const res = await apiFetch('/api/super-admin/coding-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'review_session', sessionId, decision }),
      })
      if (!res.ok) throw new Error('Decision failed')
      toast.success(`Session ${decision}`)
      await loadAll()
    } catch {
      toast.error('Failed to update session approval')
    } finally {
      setBusyAction(null)
    }
  }

  const executeSession = async (sessionId: string) => {
    setBusyAction(`exec:${sessionId}`)
    try {
      const res = await apiFetch('/api/super-admin/coding-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'execute_session', sessionId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Execution failed')
      toast.success('Sandbox git task executed & verified', {
        description: json.execution?.diffStat || 'Verified inside disposable git sandbox',
      })
      await loadAll()
    } catch (err) {
      toast.error('Sandbox execution failed', {
        description: err instanceof Error ? err.message : 'Unable to execute',
      })
    } finally {
      setBusyAction(null)
    }
  }

  const runOptimizerPreview = async () => {
    setBusyAction('optimizer')
    try {
      const res = await apiFetch('/api/super-admin/coding-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'optimize_batch_preview',
          calls: [
            { name: 'repo.read_file', args: { path: 'src/lib/ai-router/command-router.ts' } },
            { name: 'repo.read_file', args: { path: 'src/lib/ai-router/command-router.ts' } },
            { name: 'browser.inspect_page', args: { url: 'http://127.0.0.1:3011' } },
            { name: 'repo.apply_patch', args: { file: 'demo.ts' } },
          ],
        }),
      })
      const json = await res.json()
      if (json.plan) {
        setOptimizerPreview(json.plan)
        toast.success('Tool Optimizer deduplication simulated')
      }
    } catch {
      toast.error('Optimizer preview failed')
    } finally {
      setBusyAction(null)
    }
  }

  const pinIntegrationVersion = async (integration: NonNullable<VaultResponse['integrations']>[number]) => {
    setBusyAction(`pin:${integration.id}`)
    try {
      const nextPatch = `1.0.${(integration.versions?.length ?? 0) + 1}`
      const res = await apiFetch('/api/super-admin/ecosystem/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'pin_version',
          integrationId: integration.id,
          version: nextPatch,
          pinnedRef: `pinned-${nextPatch}`,
          changelog: `Pinned ${nextPatch} from Super Admin Ecosystem Hub`,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      toast.success(`Pinned ${integration.slug} → v${nextPatch}`)
      await loadAll()
    } catch (err) {
      toast.error('Version pin failed', { description: err instanceof Error ? err.message : 'Unable to pin version' })
    } finally {
      setBusyAction(null)
    }
  }

  const rollbackIntegration = async (integration: NonNullable<VaultResponse['integrations']>[number]) => {
    const previous = (integration.versions ?? []).find((v) => !v.isActive)
    if (!previous) {
      toast.error('No previous version to roll back to')
      return
    }
    setBusyAction(`rollback:${integration.id}`)
    try {
      const res = await apiFetch('/api/super-admin/ecosystem/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'rollback_version',
          integrationId: integration.id,
          targetVersionId: previous.id,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      toast.success(`Rolled back ${integration.slug} → v${previous.version}`)
      await loadAll()
    } catch (err) {
      toast.error('Rollback failed', { description: err instanceof Error ? err.message : 'Unable to roll back' })
    } finally {
      setBusyAction(null)
    }
  }

  const probeLiveKitMeetings = async () => {
    setBusyAction('probe_livekit')
    try {
      const res = await apiFetch('/api/meetings')
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setLivekitProbe(
        `${json.livekitConfigured ? 'LiveKit SFU configured' : 'LiveKit SFU unconfigured'} · ${json.stats?.total ?? 0} meetings (${json.stats?.scheduled ?? 0} scheduled)`,
      )
      toast.success('Meetings & LiveKit SFU status checked')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Meetings probe failed'
      setLivekitProbe(`Error: ${msg}`)
      toast.error('Meetings probe failed', { description: msg })
    } finally {
      setBusyAction(null)
    }
  }

  const probeBrowserGuardrails = async () => {
    setBusyAction('probe_browser')
    try {
      const [readRes, writeRes] = await Promise.all([
        apiFetch('/api/super-admin/coding-agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'classify_browser_action', browserAction: 'navigate' }),
        }),
        apiFetch('/api/super-admin/coding-agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'classify_browser_action', browserAction: 'publish_content' }),
        }),
      ])
      const readJson = await readRes.json()
      const writeJson = await writeRes.json()
      if (!readRes.ok || !writeRes.ok) throw new Error('Guardrail check failed')
      setGuardrailProbe(
        `navigate → ${readJson.decision?.requiresHumanApproval ? 'approval-required' : 'auto-allow'}; publish_content → ${writeJson.decision?.requiresHumanApproval ? 'approval-required' : 'auto-allow'}`,
      )
      toast.success('Browser guardrail policy verified')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Guardrail probe failed'
      setGuardrailProbe(`Error: ${msg}`)
      toast.error('Guardrail probe failed', { description: msg })
    } finally {
      setBusyAction(null)
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading Super Admin Ecosystem Control Plane...
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-600" />
            Ecosystem Control Plane &amp; Command Router
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Unified multi-protocol AI gateway, license-gated Asset Vault, sandboxed coding harnesses, and LiveKit voice/meeting infrastructure.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadAll} className="self-start sm:self-auto">
          <RefreshCw className="w-4 h-4 mr-1.5" />
          Refresh Telemetry
        </Button>
      </div>

      {/* Honest KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Supplied Sources</span>
              <Globe className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {vaultData?.summary.totalSuppliedSources ?? 30}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {vaultData?.dbCounts.sources ?? 0} persisted in DB
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Active Integrations</span>
              <Layers className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {vaultData?.dbCounts.integrations ?? 0}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {vaultData?.dbCounts.licenses ?? 0} license verdicts audited
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Coding Harnesses</span>
              <Terminal className="w-4 h-4 text-indigo-600" />
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {agentsData?.harnesses.length ?? 0}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {agentsData?.sessions.length ?? 0} sandbox sessions recorded
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Host Hardware Gate</span>
              <HardDrive className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {vaultData?.hardware?.memory?.totalGb ? `${vaultData.hardware.memory.totalGb.toFixed(1)} GB` : 'CPU Only'}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {vaultData?.hardware?.capabilities?.canRun7bModels ? '7B local eligible' : 'API / small local tier'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Workbench */}
      <Tabs defaultValue="router" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-slate-100 p-1">
          <TabsTrigger value="router" className="text-xs">Command Router &amp; Gateways</TabsTrigger>
          <TabsTrigger value="vault" className="text-xs">Asset Vault &amp; Licenses</TabsTrigger>
          <TabsTrigger value="harnesses" className="text-xs">Coding Harnesses &amp; Optimizer</TabsTrigger>
          <TabsTrigger value="voice-qa" className="text-xs">LiveKit, OBS &amp; Visual QA</TabsTrigger>
        </TabsList>

        {/* Tab 1: Command Router & Gateways */}
        <TabsContent value="router" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-blue-600" />
                  Routing Strategy &amp; Privacy Guard
                </CardTitle>
                <CardDescription className="text-xs">
                  Matches Jarvis &amp; FCC routing tiers (`RELAXED`, `GUARDED`, `STRICT`) across local, free-tier, and paid endpoints.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Routing Strategy</Label>
                    <Select value={strategy} onValueChange={setStrategy}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="free-first">Free-First ($0 then Fallback)</SelectItem>
                        <SelectItem value="local-first">Local-First (Ollama/vLLM)</SelectItem>
                        <SelectItem value="capability">Capability Match</SelectItem>
                        <SelectItem value="lowest-cost">Lowest Cost</SelectItem>
                        <SelectItem value="lowest-latency">Lowest Latency</SelectItem>
                        <SelectItem value="priority">Configured Priority</SelectItem>
                        <SelectItem value="manual">Manual Pin</SelectItem>
                        <SelectItem value="fallback">Resilient Fallback</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Privacy Mode</Label>
                    <Select value={privacyMode} onValueChange={setPrivacyMode}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="guarded">Guarded (Redact Secrets)</SelectItem>
                        <SelectItem value="strict">Strict (Local Models Only)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button onClick={saveRouterConfig} disabled={busyAction === 'save_router'} size="sm" className="bg-blue-600 hover:bg-blue-700">
                  {busyAction === 'save_router' && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                  Save Routing Policy
                </Button>

                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <Label className="text-xs">Live Route Dry-Run Probe</Label>
                  <Input value={testPrompt} onChange={(e) => setTestPrompt(e.target.value)} className="text-xs" />
                  <Button variant="outline" size="sm" onClick={runLiveRouteTest} disabled={busyAction === 'test_route'}>
                    {busyAction === 'test_route' ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
                    Execute Live Route Probe
                  </Button>
                  {routeResult && (
                    <p className="text-xs rounded-md bg-slate-50 border border-slate-200 p-2.5 text-slate-700 break-words">
                      {routeResult}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-emerald-600" />
                  Multi-Protocol Gateway Endpoints
                </CardTitle>
                <CardDescription className="text-xs">
                  Drop-in protocol adapters for Claude Code, Codex CLI, OpenCode, Gemini CLI, and OpenAI SDKs.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {(routerData?.protocols ?? []).map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800">{p.id}</p>
                      <p className="text-[11px] font-mono text-slate-500 truncate">{p.endpoint}</p>
                    </div>
                    <Badge className="bg-emerald-100 text-emerald-800 text-[10px] shrink-0">{p.status}</Badge>
                  </div>
                ))}
                <div className="pt-2">
                  <p className="text-xs font-medium text-slate-700 mb-1.5">Ranked Candidate Preview ({routerData?.plan.candidates.length ?? 0} models)</p>
                  <div className="space-y-1 max-h-44 overflow-y-auto">
                    {(routerData?.plan.candidates ?? []).slice(0, 8).map((c) => (
                      <div key={`${c.provider}:${c.model}`} className="flex items-center justify-between text-[11px] px-2 py-1 rounded bg-white border border-slate-100">
                        <span className="font-mono truncate max-w-[65%]">{c.provider} / {c.model}</span>
                        <span className={c.eligible ? 'text-emerald-700 font-medium' : 'text-amber-700'}>
                          {c.eligible ? `score ${Math.round(c.score)}` : c.ineligibleReason || 'filtered'}
                        </span>
                      </div>
                    ))}
                    {(routerData?.plan.candidates ?? []).length === 0 && (
                      <p className="text-xs text-slate-400">No models registered yet — configure Ollama or free/API provider credentials.</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 2: Asset Vault & Licenses */}
        <TabsContent value="vault" className="space-y-4">
          <Card className="border-slate-200">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Ecosystem Asset Vault &amp; License Governance
                </CardTitle>
                <CardDescription className="text-xs">
                  Verifies true repository LICENSE text (catching NOASSERTION/AGPL traps like free-claude-code &amp; NocoCRM) before persistence.
                </CardDescription>
              </div>
              <Button size="sm" onClick={syncVault} disabled={busyAction === 'sync_vault'} className="bg-emerald-600 hover:bg-emerald-700 self-start sm:self-auto">
                {busyAction === 'sync_vault' ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                Sync Vault to Database
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-96 overflow-y-auto pr-1">
                {(vaultData?.sources ?? []).map((src, i) => (
                  <div key={src.id} className="p-2.5 rounded-lg border border-slate-200 bg-white space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-slate-500">#{i + 1} · {src.displayName}</span>
                      <Badge className={`text-[10px] ${src.availability === 'verified' ? 'bg-emerald-100 text-emerald-800' : LICENSE_TONE['custom-restricted']}`}>
                        {src.availability}
                      </Badge>
                    </div>
                    <p className="text-xs font-mono text-slate-800 truncate" title={src.url}>{src.url}</p>
                    <p className="text-[11px] text-slate-500">{src.sourceKind} · {src.category}</p>
                  </div>
                ))}
                {(vaultData?.sources ?? []).length === 0 && (
                  <p className="text-xs text-slate-500 col-span-full">Click &quot;Sync Vault to Database&quot; to populate all 30 verified sources, assets, and license records.</p>
                )}
              </div>

              {/* License & Security Audit Verdicts */}
              {(vaultData?.assets ?? []).length > 0 && (
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <h4 className="text-xs font-semibold text-slate-800">
                    Audited Assets, Licenses &amp; Security Reviews ({vaultData?.assets?.length ?? 0} assets · {vaultData?.dbCounts.licenses ?? 0} licenses · {vaultData?.dbCounts.securityReviews ?? 0} reviews)
                  </h4>
                  <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white">
                    {(vaultData?.assets ?? []).slice(0, 30).map((asset) => {
                      const lic = vaultData?.licenses.find((l) => l.assetId === asset.id)
                      const rev = vaultData?.securityReviews?.find((r) => r.assetId === asset.id)
                      return (
                        <div key={asset.id} className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="min-w-0">
                            <span className="font-mono font-medium text-slate-800">{asset.fullName}</span>
                            <span className="text-slate-500 ml-2">{asset.integrationPattern} · {asset.compatibilityStatus}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Badge variant="outline" className="text-[10px] font-mono">
                              {lic?.spdxId ?? asset.licenseSpdx ?? 'UNKNOWN'}
                            </Badge>
                            {lic && (
                              <Badge className={`text-[10px] ${lic.verdict === 'approved' ? 'bg-emerald-100 text-emerald-800' : lic.verdict === 'conditional' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}>
                                {lic.verdict}
                              </Badge>
                            )}
                            {rev && (
                              <Badge variant="secondary" className="text-[10px]">
                                risk: {rev.riskLevel}
                              </Badge>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Pinned Integrations & Rollback */}
              {(vaultData?.integrations ?? []).length > 0 && (
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <h4 className="text-xs font-semibold text-slate-800">
                    Integration Registry &amp; Immutable Version Pins ({vaultData?.integrations.length ?? 0})
                  </h4>
                  <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white">
                    {(vaultData?.integrations ?? []).map((integ) => {
                      const activeVer = integ.versions?.find((v) => v.isActive)
                      const hasRollback = (integ.versions?.length ?? 0) > 1
                      return (
                        <div key={integ.id} className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="min-w-0">
                            <span className="font-mono font-semibold text-slate-800">{integ.slug}</span>
                            <span className="text-slate-500 ml-2">{integ.strategy} · {activeVer ? `v${activeVer.version}` : 'unpinned'}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Badge className={`text-[10px] ${LICENSE_TONE[integ.licenseClass] ?? 'bg-slate-100 text-slate-700'}`}>
                              {integ.licenseClass}
                            </Badge>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-[11px]"
                              disabled={busyAction === `pin:${integ.id}`}
                              onClick={() => pinIntegrationVersion(integ)}
                            >
                              Pin Patch
                            </Button>
                            {hasRollback && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-[11px] text-amber-700"
                                disabled={busyAction === `rollback:${integ.id}`}
                                onClick={() => rollbackIntegration(integ)}
                              >
                                Rollback
                              </Button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 35 ONE Runtime Adapter Inventory */}
              {(vaultData?.reconciledAdapters ?? []).length > 0 && (
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <h4 className="text-xs font-semibold text-slate-800">
                    ONE Runtime Adapter Inventory ({vaultData?.reconciledAdapters?.length ?? 0} registered adapters)
                  </h4>
                  <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white">
                    {(vaultData?.reconciledAdapters ?? []).map((ad) => (
                      <div key={ad.id} className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="min-w-0">
                          <span className="font-mono font-medium text-slate-800">{ad.id}</span>
                          <span className="text-slate-500 ml-2 truncate">{ad.stateReason}</span>
                        </div>
                        <Badge className={`text-[10px] shrink-0 ${ad.runtimeState === 'operational' ? 'bg-emerald-100 text-emerald-800' : ad.runtimeState === 'configured' ? 'bg-blue-100 text-blue-800' : ad.runtimeState === 'restricted' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>
                          {ad.runtimeState}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Coding Harnesses & Tool Optimizer */}
        <TabsContent value="harnesses" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Bot className="w-4 h-4 text-indigo-600" />
                  Launch Isolated Coding Sandbox
                </CardTitle>
                <CardDescription className="text-xs">
                  Protected branches (`main`, `master`, `production`) and direct repo `.git` paths are strictly blocked.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Harness</Label>
                    <Select value={sandboxHarness} onValueChange={setSandboxHarness}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(agentsData?.harnesses ?? []).map((h) => (
                          <SelectItem key={h.slug} value={h.slug}>{h.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Sandbox Branch</Label>
                    <Input value={sandboxBranch} onChange={(e) => setSandboxBranch(e.target.value)} className="mt-1 text-xs" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Task Prompt</Label>
                  <Input value={sandboxPrompt} onChange={(e) => setSandboxPrompt(e.target.value)} className="mt-1 text-xs" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={createSandboxSession} disabled={busyAction === 'create_session'}>
                    {busyAction === 'create_session' && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                    Create Sandbox Session
                  </Button>
                  <Button size="sm" variant="outline" onClick={runOptimizerPreview} disabled={busyAction === 'optimizer'}>
                    <Wrench className="w-3.5 h-3.5 mr-1.5" />
                    Test Tool Optimizer
                  </Button>
                </div>
                {optimizerPreview && (
                  <p className="text-xs bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-md p-2">
                    ToolOptimizer compacted {optimizerPreview.originalCount} calls → {optimizerPreview.deduplicatedCount} batched calls (~{optimizerPreview.estimatedTokensSaved} tokens saved).
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Activity className="w-4 h-4 text-amber-600" />
                  Sandbox Approval Queue ({agentsData?.sessions.length ?? 0})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-72 overflow-y-auto">
                {(agentsData?.sessions ?? []).map((s) => (
                  <div key={s.id} className="p-2.5 rounded-lg border border-slate-200 bg-white space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-800">{s.harness.name}</span>
                      <Badge variant="outline" className="text-[10px]">{s.status}</Badge>
                    </div>
                    <p className="text-[11px] font-mono text-slate-500 truncate">{s.branchName} · {s.workspacePath}</p>
                    {s.diffSummaryJson && (
                      <p className="text-[11px] font-mono text-emerald-700 bg-emerald-50 rounded p-1.5 break-all">
                        {s.diffSummaryJson}
                      </p>
                    )}
                    {s.status === 'awaiting_approval' && (
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" className="h-6 text-[11px] bg-emerald-600 hover:bg-emerald-700" onClick={() => decideSession(s.id, 'approved')}>
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => decideSession(s.id, 'rejected')}>
                          <XCircle className="w-3 h-3 mr-1" /> Reject
                        </Button>
                      </div>
                    )}
                    {s.status === 'approved' && (
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          className="h-6 text-[11px] bg-indigo-600 hover:bg-indigo-700"
                          disabled={busyAction === `exec:${s.id}`}
                          onClick={() => executeSession(s.id)}
                        >
                          <Play className="w-3 h-3 mr-1" /> Execute in Git Sandbox
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
                {(agentsData?.sessions ?? []).length === 0 && (
                  <p className="text-xs text-slate-400">No sandbox sessions created yet.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 4: Voice, LiveKit & Browser Visual QA */}
        <TabsContent value="voice-qa" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">LiveKit &amp; rasonyang Voice</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-600 space-y-2">
                <p><span className="font-semibold">telephony.livekit</span> — Apache-2.0 HS256 JWT + Twirp room API</p>
                <p><span className="font-semibold">telephony.freesbc</span> — Apache-2.0 pure-Go SBC &amp; RTP proxy</p>
                <p><span className="font-semibold">telephony.cascade-realtime-gateway</span> — OpenAI Realtime WS</p>
                <Button size="sm" variant="outline" className="h-7 text-xs mt-1" disabled={busyAction === 'probe_livekit'} onClick={probeLiveKitMeetings}>
                  {busyAction === 'probe_livekit' ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
                  Check LiveKit &amp; Meetings
                </Button>
                {livekitProbe && <p className="text-[11px] font-mono bg-slate-50 border border-slate-200 rounded p-1.5 text-slate-700">{livekitProbe}</p>}
              </CardContent>
            </Card>
            <Card className="border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Meetings, OBS &amp; Lark MCP</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-600 space-y-1.5">
                <p><span className="font-semibold">media.joincall</span> — MIT self-hosted video meeting API</p>
                <p><span className="font-semibold">media.obs-websocket</span> — GPL-2.0 external process over authenticated WS v5</p>
                <p><span className="font-semibold">messaging.larksuite</span> — MIT Open Platform + MCP adapter</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Responsive QA Presets</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-600 space-y-2">
                {(agentsData?.qaViewports ?? []).map((vp) => (
                  <p key={vp.id}><span className="font-semibold">{vp.label}</span> — {vp.width}×{vp.height}px</p>
                ))}
                <p className="text-[11px] text-slate-500 pt-1">Read-only DOM/screenshots pass automatically; form submits &amp; publishes require approval.</p>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busyAction === 'probe_browser'} onClick={probeBrowserGuardrails}>
                  {busyAction === 'probe_browser' ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <ShieldCheck className="w-3 h-3 mr-1" />}
                  Verify Browser Guardrails
                </Button>
                {guardrailProbe && <p className="text-[11px] font-mono bg-slate-50 border border-slate-200 rounded p-1.5 text-slate-700">{guardrailProbe}</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
