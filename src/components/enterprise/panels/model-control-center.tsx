'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  Boxes,
  CheckCircle2,
  Cpu,
  DollarSign,
  Globe,
  HardDrive,
  Loader2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
/**
 * Local structural type instead of importing DashboardPanelProps from
 * '@/lib/dashboard/navigation'. That module contains the full dynamic-import
 * panel registry; importing it from a leaf panel pulls every panel's type graph
 * into the next build type-check and exhausts the CI memory budget.
 */
type DashboardPanelProps = { onNavigate?: (view: string) => void }

/**
 * Model Control Center (Phase 6).
 *
 * Read-only view over /api/super-admin/ai/model-center. Every figure on this
 * page comes from the database or the live router; nothing is sample data.
 * When a value is unknown it is rendered as "unknown" rather than 0.
 *
 * Additive: existing AI Providers and Super Admin AI Control Plane panels are
 * untouched and remain the place where providers are created/edited.
 */

interface ModelCenterMode {
  freeOnly: boolean
  description: string
}

interface ModelCenterSummary {
  totalModels: number
  activeModels: number
  localModels: number
  freeApiModels: number
  unverifiedModels: number
  unavailableProviders: number
  totalProviders: number
  enabledProviders: number
  externalSpendUsd: number
  windowDays: number
}

interface ModelRow {
  id: string
  providerConfigId: string
  provider: string
  providerName: string
  isLocal: boolean
  isEnabled: boolean
  contextLength: number | null
  capabilities: string[]
  licence: string | null
  family: string | null
  freeStatus: string
  quotaDefault: { limit: number; period: string } | null
  healthStatus: string | null
}

interface ProviderRow {
  id: string
  companyId: string | null
  provider: string
  name: string
  baseUrl: string | null
  isEnabled: boolean
  isLocal: boolean
  fallbackEligible: boolean
  priority: number
  hasApiKey: boolean
  lastHealthStatus: string | null
  lastHealthAt: string | null
  lastHealthLatencyMs: number | null
  lastError: string | null
  verification: {
    freeTierEligibility: string
    verifiedAt: string
    commercialUse: string | null
    billingBehavior: string | null
    officialDocsUrl: string | null
  } | null
  quota: {
    remainingRequests: number | null
    remainingTokens: number | null
    limitRequests: number | null
    limitTokens: number | null
    capturedAt: string
  } | null
}

interface FailoverEvent {
  id: string
  requestedModel: string
  failedProvider: string | null
  currentProvider: string | null
  selectedModel: string | null
  reason: string
  attempts: number
  success: boolean
  errorCode: string | null
  latencyMs: number | null
  occurredAt: string
}

interface ProviderUsage {
  provider: string
  requests: number
  failures: number
  tokens: number
  costUsd: number
  avgLatencyMs: number | null
}

interface ModelCenterResponse {
  mode: ModelCenterMode
  summary: ModelCenterSummary
  usage: {
    requests: number
    successes: number
    failures: number
    deferred: number
    blocked: number
    tokens: number
    successTokens: number
    costUsd: number
  }
  byProvider: ProviderUsage[]
  models: ModelRow[]
  providers: ProviderRow[]
  runtime: Array<{ provider: string; initialized: boolean; circuitOpen: boolean; isLocal: boolean; models: string[]; initError: string | null }>
  failover: { events: FailoverEvent[]; totalFallbacks: number; successfulFallbacks: number }
  failures: Array<{ id: string; provider: string | null; model: string | null; status: string; errorCode: string | null; rateLimitResponse: boolean; createdAt: string; profile: string }>
  discovery: { providersQueried: number; newModels: number; generatedAt: string } | null
  envConfiguredProviders: Array<{ envVar: string; kind: string; label: string }>
  notes: string[]
}

const FREE_STATUS_STYLES: Record<string, string> = {
  verified_free: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  verification_stale: 'bg-amber-50 text-amber-700 border-amber-200',
  unverified: 'bg-slate-50 text-slate-600 border-slate-200',
}

function money(value: number): string {
  return `$${value.toFixed(value > 0 && value < 0.01 ? 6 : 2)}`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function StatCard({ icon: Icon, label, value, hint }: { icon: React.ElementType; label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <Icon className="mt-0.5 h-5 w-5 text-slate-500" />
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
          <p className="text-xl font-semibold tabular-nums">{value}</p>
          {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

export default function ModelControlCenter({ onNavigate }: DashboardPanelProps) {
  const [data, setData] = useState<ModelCenterResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fetchApi<ModelCenterResponse>('/api/super-admin/ai/model-center'))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading live model data…
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-red-200">
        <CardContent className="flex items-start gap-3 p-6">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-red-600" />
          <div>
            <h2 className="font-semibold">Model Control Center unavailable</h2>
            <p className="mt-1 text-sm text-slate-600">{error}</p>
            <p className="mt-1 text-xs text-slate-500">
              This panel requires a Super Admin session and reads live router state. It shows no placeholder metrics.
            </p>
            <Button className="mt-3" size="sm" variant="outline" onClick={() => void load()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!data) return null

  const { summary, usage, mode } = data

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Model Control Center</h1>
          <p className="text-sm text-slate-600">
            Live provider health, free-model registry, failover activity and external AI spend.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={mode.freeOnly ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-300'}>
            <ShieldCheck className="mr-1 h-3.5 w-3.5" />
            {mode.freeOnly ? 'FREE-ONLY MODE ON' : 'FREE-ONLY MODE OFF'}
          </Badge>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      <Card className="border-slate-200">
        <CardContent className="p-4 text-sm text-slate-600">{mode.description}</CardContent>
      </Card>

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Boxes} label="Registered models" value={String(summary.totalModels)} hint={`${summary.activeModels} active`} />
        <StatCard icon={HardDrive} label="Local models" value={String(summary.localModels)} hint="Ollama / llama.cpp / vLLM" />
        <StatCard icon={Globe} label="Verified free models" value={String(summary.freeApiModels)} hint={`${summary.unverifiedModels} unverified`} />
        <StatCard
          icon={DollarSign}
          label={`External AI spend (${summary.windowDays}d)`}
          value={money(summary.externalSpendUsd)}
          hint="Inference only — excludes hosting"
        />
      </div>

      <Tabs defaultValue="providers" className="space-y-3">
        <TabsList className="flex-wrap">
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="models">Model registry</TabsTrigger>
          <TabsTrigger value="failover">Failover monitor</TabsTrigger>
          <TabsTrigger value="usage">Cost &amp; usage</TabsTrigger>
          <TabsTrigger value="discovery">Weekly discovery</TabsTrigger>
        </TabsList>

        {/* Providers */}
        <TabsContent value="providers" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Provider health</CardTitle>
              <CardDescription>
                Live router state. Secrets are never returned — only whether a key exists. Manage providers in AI Providers.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Enabled</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead>Free status</TableHead>
                    <TableHead>Quota (reported)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.providers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-sm text-slate-500">
                        No providers are configured. Add one in AI Providers, or set a free provider key in the environment.
                      </TableCell>
                    </TableRow>
                  )}
                  {data.providers.map((provider) => (
                    <TableRow key={provider.id}>
                      <TableCell>
                        <div className="font-medium">{provider.name}</div>
                        <div className="text-xs text-slate-500">{provider.baseUrl ?? 'default endpoint'}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{provider.provider}</Badge>
                        {provider.isLocal && <Badge variant="outline" className="ml-1 border-sky-200 bg-sky-50 text-sky-700">local</Badge>}
                      </TableCell>
                      <TableCell className="text-xs">{provider.companyId ? 'tenant' : 'shared'}</TableCell>
                      <TableCell>
                        {provider.isEnabled ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-slate-400" />
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{provider.hasApiKey ? 'stored' : 'none'}</TableCell>
                      <TableCell className="text-xs">
                        {provider.lastHealthStatus ?? 'unknown'}
                        {provider.lastHealthLatencyMs != null && ` · ${provider.lastHealthLatencyMs}ms`}
                        {provider.lastError && <div className="text-red-600">{provider.lastError}</div>}
                      </TableCell>
                      <TableCell className="text-xs">
                        {provider.verification ? (
                          <Badge variant="outline" className={FREE_STATUS_STYLES[provider.verification.freeTierEligibility] ?? ''}>
                            {provider.verification.freeTierEligibility}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className={FREE_STATUS_STYLES.unverified}>unverified</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {provider.quota
                          ? `${provider.quota.remainingRequests ?? '?'} / ${provider.quota.limitRequests ?? '?'} requests`
                          : 'unknown'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {data.envConfiguredProviders.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Environment-provided keys</CardTitle>
                <CardDescription>Detected from the server environment. Values are never exposed.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {data.envConfiguredProviders.map((entry) => (
                  <Badge key={entry.envVar} variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                    {entry.label} · KEY IN ENV
                  </Badge>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Model registry */}
        <TabsContent value="models">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Model registry</CardTitle>
              <CardDescription>
                Configured models only. A model is labelled verified_free only when a verification record names it and the pricing evidence is fresh.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Context</TableHead>
                    <TableHead>Capabilities</TableHead>
                    <TableHead>Licence</TableHead>
                    <TableHead>Free status</TableHead>
                    <TableHead>Quota default</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.models.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-sm text-slate-500">
                        No models are registered. Provider catalogues populate this table once a provider is configured.
                      </TableCell>
                    </TableRow>
                  )}
                  {data.models.map((model) => (
                    <TableRow key={`${model.providerConfigId}:${model.id}`}>
                      <TableCell className="font-mono text-xs">{model.id}</TableCell>
                      <TableCell className="text-xs">
                        {model.providerName}
                        {model.isLocal && <Badge variant="outline" className="ml-1 border-sky-200 bg-sky-50 text-sky-700">local</Badge>}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {model.contextLength ? model.contextLength.toLocaleString() : 'unknown'}
                      </TableCell>
                      <TableCell className="text-xs">{model.capabilities.join(', ') || 'unknown'}</TableCell>
                      <TableCell className="text-xs">{model.licence ?? 'unknown'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={FREE_STATUS_STYLES[model.freeStatus] ?? FREE_STATUS_STYLES.unverified}>
                          {model.freeStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {model.quotaDefault ? `${model.quotaDefault.limit}/${model.quotaDefault.period}` : 'unlimited (local)'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Failover */}
        <TabsContent value="failover" className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard icon={ArrowRightLeft} label="Fallbacks (7d)" value={String(data.failover.totalFallbacks)} />
            <StatCard icon={CheckCircle2} label="Successful fallbacks" value={String(data.failover.successfulFallbacks)} />
            <StatCard icon={Activity} label="Blocked / deferred" value={String(usage.blocked + usage.deferred)} hint="No paid fallback attempted" />
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent failover events</CardTitle>
              <CardDescription>From ModelRoutingDecision. Original task context is preserved across every switch.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead>Failed provider</TableHead>
                    <TableHead>Selected fallback</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Latency</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.failover.events.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-sm text-slate-500">
                        No fallbacks recorded in the last 7 days. A fallback row appears only when a provider actually failed over.
                      </TableCell>
                    </TableRow>
                  )}
                  {data.failover.events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="text-xs">{new Date(event.occurredAt).toLocaleString()}</TableCell>
                      <TableCell className="font-mono text-xs">{event.requestedModel}</TableCell>
                      <TableCell className="text-xs">{event.failedProvider ?? '—'}</TableCell>
                      <TableCell className="text-xs">
                        {event.currentProvider ?? '—'}
                        {event.selectedModel && <span className="text-slate-500"> · {event.selectedModel}</span>}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">{event.attempts}</TableCell>
                      <TableCell>
                        {event.success ? (
                          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">recovered</Badge>
                        ) : (
                          <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">{event.errorCode ?? 'failed'}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">{event.latencyMs != null ? `${event.latencyMs}ms` : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Usage */}
        <TabsContent value="usage" className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Activity} label="Requests (7d)" value={String(usage.requests)} hint={`${usage.successes} succeeded`} />
            <StatCard icon={Cpu} label="Tokens" value={usage.tokens.toLocaleString()} />
            <StatCard icon={XCircle} label="Failures" value={String(usage.failures)} />
            <StatCard icon={DollarSign} label="Recorded cost" value={money(usage.costUsd)} hint="Inference charges only" />
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Usage by provider</CardTitle>
              <CardDescription>Aggregated from ModelUsageRecord for the last 7 days.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Requests</TableHead>
                    <TableHead>Failures</TableHead>
                    <TableHead>Tokens</TableHead>
                    <TableHead>Avg latency</TableHead>
                    <TableHead>Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byProvider.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-sm text-slate-500">
                        No AI usage recorded in the last 7 days.
                      </TableCell>
                    </TableRow>
                  )}
                  {data.byProvider.map((row) => (
                    <TableRow key={row.provider}>
                      <TableCell className="text-xs">{row.provider}</TableCell>
                      <TableCell className="text-xs tabular-nums">{row.requests}</TableCell>
                      <TableCell className="text-xs tabular-nums">{row.failures}</TableCell>
                      <TableCell className="text-xs tabular-nums">{row.tokens.toLocaleString()}</TableCell>
                      <TableCell className="text-xs tabular-nums">{row.avgLatencyMs != null ? `${row.avgLatencyMs}ms` : '—'}</TableCell>
                      <TableCell className="text-xs tabular-nums">{money(row.costUsd)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent failures, deferrals and blocks</CardTitle>
              <CardDescription>Failures never silently escalate to a paid provider.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Rate limited</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.failures.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-sm text-slate-500">No failures, deferrals or blocks recorded.</TableCell>
                    </TableRow>
                  )}
                  {data.failures.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs">{new Date(row.createdAt).toLocaleString()}</TableCell>
                      <TableCell className="text-xs">{row.provider ?? '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{row.model ?? '—'}</TableCell>
                      <TableCell className="text-xs">{row.status}</TableCell>
                      <TableCell className="text-xs">{row.errorCode ?? '—'}</TableCell>
                      <TableCell className="text-xs">{row.rateLimitResponse ? 'yes' : 'no'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Discovery */}
        <TabsContent value="discovery" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Weekly open-source AI discovery</CardTitle>
              <CardDescription>
                Read-only. Probes configured free providers and writes a reviewable report. It never activates or replaces a production model.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600">
              {data.discovery ? (
                <>
                  <p>Providers queried: <strong>{data.discovery.providersQueried}</strong></p>
                  <p>New models observed: <strong>{data.discovery.newModels}</strong> (review candidates only)</p>
                  <p className="text-xs text-slate-500">Generated {new Date(data.discovery.generatedAt).toLocaleString()}</p>
                </>
              ) : (
                <p>No discovery run could be completed. Reports appear in <code>docs/discovery/</code> after a scheduled run.</p>
              )}
              <p className="text-xs text-slate-500">
                Full reports: <code>docs/discovery/model-discovery-&lt;date&gt;.json</code>
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Notes */}
      <Card className="border-slate-200 bg-slate-50">
        <CardContent className="space-y-1 p-4 text-xs text-slate-600">
          <p className="font-semibold text-slate-700">How to read these numbers</p>
          {data.notes.map((note) => (
            <p key={note}>• {note}</p>
          ))}
          {onNavigate && (
            <button type="button" className="mt-2 underline" onClick={() => onNavigate('ai-providers')}>
              Manage providers and credentials
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
