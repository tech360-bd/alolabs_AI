'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Router,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ProviderConfig {
  id: string
  companyId: string | null
  provider: string
  name: string
  baseUrl: string | null
  hasApiKey: boolean
  freeOnly: boolean
  isEnabled: boolean
  lastHealthStatus: string | null
  lastHealthAt: string | null
  lastError: string | null
  models: Array<{ id: string; costPerMillionTokens?: number }>
}

interface ProviderListResponse {
  configs: ProviderConfig[]
  runtime: Array<{ provider: string; initialized: boolean; circuitOpen: boolean; models: string[] }>
}

interface ProviderTestResult {
  id: string
  status: 'healthy' | 'degraded' | 'unreachable' | 'unauthorized' | 'misconfigured'
  models: string[]
  error?: string
  testedAt: string
}

type FreeProviderKind = 'openrouter-free' | 'unorouter-free' | 'openai-compatible-free'

const FREE_KIND_DETAILS: Record<FreeProviderKind, { label: string; help: string }> = {
  'openrouter-free': {
    label: 'OpenRouter — verified $0 models',
    help: 'Uses OpenRouter’s live catalog and keeps only models with both input and output prices reported as $0.',
  },
  'unorouter-free': {
    label: 'UnoRouter — free :free models only',
    help: 'Uses UnoRouter’s live catalog (https://api.unorouter.com/v1) and keeps only free lanes: model ids ending in ":free" with $0 input and output. Paid lanes are refused by the adapter.',
  },
  'openai-compatible-free': {
    label: 'Other OpenAI-compatible endpoint',
    help: 'For endpoints in your list that implement /models. The upstream catalog must expose explicit zero input and output prices; missing pricing is excluded.',
  },
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export default function AIProvidersPanel() {
  const [configs, setConfigs] = useState<ProviderConfig[]>([])
  const [discovered, setDiscovered] = useState<Record<string, ProviderTestResult>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [provider, setProvider] = useState<FreeProviderKind>('openrouter-free')
  const [name, setName] = useState('OpenRouter Free')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')

  const loadConfigs = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const data = await fetchApi<ProviderListResponse>('/api/v1/providers')
      setConfigs(data.configs ?? [])
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadConfigs()
  }, [loadConfigs])

  const chooseProvider = (value: FreeProviderKind) => {
    setProvider(value)
    setName(value === 'openrouter-free' ? 'OpenRouter Free' : value === 'unorouter-free' ? 'UnoRouter Free' : 'Free Compatible Endpoint')
    setBaseUrl('')
  }

  const discoverModels = async (config: ProviderConfig) => {
    setTestingId(config.id)
    setError(null)
    try {
      const result = await fetchApi<ProviderTestResult>(
        `/api/v1/providers/${encodeURIComponent(config.id)}/test`,
        { method: 'POST' },
      )
      setDiscovered((current) => ({ ...current, [config.id]: result }))
      await loadConfigs(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setTestingId(null)
    }
  }

  const createProvider = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)
    setSubmitting(true)
    try {
      const config = await fetchApi<ProviderConfig>('/api/v1/providers', {
        method: 'POST',
        body: JSON.stringify({
          provider,
          name: name.trim(),
          ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
          apiKey: apiKey.trim(),
          isEnabled: true,
          priority: 100,
        }),
      })
      setConfigs((current) => [config, ...current.filter((item) => item.id !== config.id)])
      setApiKey('')
      setDialogOpen(false)
      await discoverModels(config)
    } catch (err) {
      setFormError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const deleteProvider = async (config: ProviderConfig) => {
    if (config.companyId === null) return
    if (!window.confirm(`Remove ${config.name}? The encrypted key will be deleted.`)) return
    setDeletingId(config.id)
    setError(null)
    try {
      await fetchApi(`/api/v1/providers/${encodeURIComponent(config.id)}`, { method: 'DELETE' })
      setConfigs((current) => current.filter((item) => item.id !== config.id))
      setDiscovered((current) => {
        const next = { ...current }
        delete next[config.id]
        return next
      })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Router className="h-6 w-6 text-blue-700" />
            <h1 className="text-2xl font-semibold text-slate-900">Free Model Providers</h1>
            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">Strict $0 mode</Badge>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Connect OpenRouter, UnoRouter (free <code className="font-mono text-xs">:free</code> lanes only), or another OpenAI-compatible provider through ALO’s existing router.
            Only upstream catalogs that explicitly report zero input and output prices are eligible.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={() => void loadConfigs(true)} disabled={refreshing || loading}>
            {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); setFormError(null) }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Add provider
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Connect a free-model provider</DialogTitle>
                <DialogDescription>
                  API keys are encrypted by ALO before storage. They are never returned to the browser after saving.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={createProvider} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="free-provider-kind">Provider type</Label>
                  <Select value={provider} onValueChange={(value) => chooseProvider(value as FreeProviderKind)}>
                    <SelectTrigger id="free-provider-kind"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(FREE_KIND_DETAILS).map(([kind, details]) => (
                        <SelectItem key={kind} value={kind}>{details.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">{FREE_KIND_DETAILS[provider].help}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="free-provider-name">Display name</Label>
                  <Input id="free-provider-name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={64} required />
                </div>
                {provider === 'openai-compatible-free' && (
                  <div className="space-y-2">
                    <Label htmlFor="free-provider-url">OpenAI-compatible base URL</Label>
                    <Input
                      id="free-provider-url"
                      type="url"
                      placeholder="https://provider.example/v1"
                      value={baseUrl}
                      onChange={(event) => setBaseUrl(event.target.value)}
                      required
                    />
                    <p className="text-xs text-slate-500">Use the provider’s API endpoint, not its marketing site. Pricing must be present in its /models response.</p>
                  </div>
                )}
                {provider === 'openrouter-free' && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    Get a key from{' '}
                    <a className="inline-flex items-center gap-1 font-medium text-blue-700 underline" href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
                      OpenRouter <ExternalLink className="h-3 w-3" />
                    </a>
                    . The server uses the default OpenRouter endpoint; you only need to paste your key.
                  </div>
                )}
                {provider === 'unorouter-free' && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    Get a key from{' '}
                    <a className="inline-flex items-center gap-1 font-medium text-blue-700 underline" href="https://unorouter.com" target="_blank" rel="noreferrer">
                      UnoRouter <ExternalLink className="h-3 w-3" />
                    </a>{' '}
                    (no card required). The server uses the fixed endpoint <code className="font-mono text-xs">https://api.unorouter.com/v1</code>;
                    only <code className="font-mono text-xs">:free</code> models are discovered and served — free lanes cap at ~1 request/minute each.
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="free-provider-key">API key</Label>
                  <Input
                    id="free-provider-key"
                    type="password"
                    autoComplete="new-password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    minLength={8}
                    maxLength={4000}
                    required
                  />
                  <p className="flex items-center gap-1 text-xs text-slate-500"><KeyRound className="h-3 w-3" /> Never paste API keys into chat or source files.</p>
                </div>
                {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>Cancel</Button>
                  <Button type="submit" disabled={submitting || !name.trim() || apiKey.trim().length < 8 || (provider === 'openai-compatible-free' && !baseUrl.trim())}>
                    {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                    Save and discover $0 models
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="border-blue-100 bg-blue-50/70">
        <CardContent className="flex gap-3 p-4 text-sm text-blue-950">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
          <p>
            Free status is checked against live input <strong>and</strong> output pricing. Models with missing pricing, quota-only claims, trial credits, or any non-zero rate are excluded. Pricing is rechecked immediately before chat/stream calls; upstream pricing and quotas can still change outside ALO.
          </p>
        </CardContent>
      </Card>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1].map((value) => <div key={value} className="h-40 animate-pulse rounded-xl border bg-white" />)}
        </div>
      ) : configs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Activity className="mb-3 h-9 w-9 text-slate-400" />
            <h2 className="font-medium text-slate-900">No free-only provider connected</h2>
            <p className="mt-1 max-w-md text-sm text-slate-500">Add OpenRouter or UnoRouter for their explicitly $0 models, or connect a compatible API whose model catalog publishes zero prices.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {configs.map((config) => {
            const test = discovered[config.id]
            const isTesting = testingId === config.id
            const isDeleting = deletingId === config.id
            const health = test?.status ?? config.lastHealthStatus
            return (
              <Card key={config.id} className="border-slate-200">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">{config.name}</CardTitle>
                      <p className="mt-1 break-all text-xs text-slate-500">{config.provider === 'openrouter-free' ? 'OpenRouter' : config.provider === 'unorouter-free' ? 'UnoRouter — free models only' : (config.baseUrl ?? 'OpenAI-compatible')}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">$0 only</Badge>
                      {health === 'healthy' ? (
                        <Badge variant="outline" className="border-emerald-200 text-emerald-700"><CheckCircle2 className="mr-1 h-3 w-3" />Connected</Badge>
                      ) : health ? (
                        <Badge variant="outline" className="border-amber-200 text-amber-800"><XCircle className="mr-1 h-3 w-3" />{health}</Badge>
                      ) : <Badge variant="outline" className="text-slate-500">Not tested</Badge>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span className="inline-flex items-center gap-1"><KeyRound className="h-3 w-3" />{config.hasApiKey ? 'Encrypted key stored' : 'No API key'}</span>
                    <span>{test ? `${test.models.length} verified free model${test.models.length === 1 ? '' : 's'}` : `${config.models.length} configured model${config.models.length === 1 ? '' : 's'}`}</span>
                  </div>
                  {test?.error && <p className="break-words text-xs text-amber-800">{test.error}</p>}
                  {test?.models?.length ? (
                    <div className="max-h-24 overflow-auto rounded-md bg-slate-50 p-2 font-mono text-[11px] text-slate-700">
                      {test.models.slice(0, 8).map((model) => <div key={model}>{model}</div>)}
                      {test.models.length > 8 && <div className="pt-1 text-slate-500">+{test.models.length - 8} more</div>}
                    </div>
                  ) : null}
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => void discoverModels(config)} disabled={isTesting || isDeleting}>
                      {isTesting ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
                      Verify free models
                    </Button>
                    {config.companyId !== null && (
                      <Button size="sm" variant="ghost" className="text-red-700 hover:text-red-800" onClick={() => void deleteProvider(config)} disabled={isTesting || isDeleting}>
                        {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        <span className="sr-only">Remove {config.name}</span>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
