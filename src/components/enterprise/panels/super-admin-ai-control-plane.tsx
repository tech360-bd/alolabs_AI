'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, Building2, CheckCircle2, Cpu, KeyRound, Loader2, Plus, RefreshCw, ShieldCheck, Users, XCircle } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import SuperCommandingChat from '@/components/panels/super-commanding-chat'

interface CompanyItem {
  id: string
  name: string
  slug: string
  domain?: string | null
  status: string
  paidApiAllowed?: boolean
  monthlyUsageLimit?: number
  usageCount?: number
  userCount?: number
}

interface ProviderModel {
  id: string
  name?: string
  contextLength?: number
  capabilities?: string[]
  costPerMillionTokens?: number
}

interface ProviderConfig {
  id: string
  companyId: string | null
  provider: string
  name: string
  routerName: string
  baseUrl: string | null
  hasApiKey: boolean
  keyFingerprint: string | null
  isEnabled: boolean
  isLocal: boolean
  fallbackEligible: boolean
  priority: number
  lastHealthStatus: string | null
  lastHealthAt: string | null
  lastError: string | null
  models: ProviderModel[]
}

interface CompanyMember {
  id: string
  companyId: string
  userId: string
  role: string
  user: { id: string; name: string; email: string; isActive: boolean; lastLoginAt: string | null } | null
}

interface CompanyConfig {
  company: { id: string; name: string; slug: string; status: string; paidApiAllowed: boolean }
  settings: {
    externalDataProcessingApproved: boolean
    confidentialDataExternalAllowed: boolean
    dataProcessingPolicyUrl: string | null
    primaryColor: string
    locale: string
    timezone: string
  } | null
  budget: {
    monthlyTokenBudget: number
    dailyTokenBudget: number
    maxPaidBudgetUsd: number
    paidApiAllowed: boolean
    autoBillingEnabled: boolean
  } | null
  policies: Array<{
    id: string
    profile: string
    allowedProviderConfigIds: string[]
    preferLocal: boolean
    allowVerifiedFree: boolean
    allowPaid: boolean
    externalDataAllowed: boolean
    maxOutputTokens: number
  }>
}

interface UsageResult {
  totals: {
    attempts: number; successes: number; failures: number; blocked: number; deferred: number
    inputTokens: number; outputTokens: number; totalTokens: number
    estimatedCostUsd: number; confirmedCostUsd: number; providerReportedCostUsd: number
  }
  records: Array<{
    id: string; companyId: string | null; agentId: string | null; provider: string | null; model: string | null
    profile: string; status: string; totalTokens: number; usageSource: string; estimatedCostUsd: number | null
    confirmedCostUsd: number | null; providerReportedCostUsd: number | null; errorCode: string | null; createdAt: string
  }>
  truncated: boolean
}

const PROVIDER_KINDS = [
  'ollama', 'llama-cpp', 'custom-self-hosted', 'openai-compatible', 'openai-compatible-free', 'openrouter-free',
  'unorouter-free',
  'openrouter', 'groq', 'deepseek', 'mistral', 'qwen', 'huggingface', 'github-models', 'cerebras', 'gemini',
  'cloudflare-workers-ai', 'cohere', 'zai-sdk',
] as const
const PROFILES = ['local_fast', 'local_general', 'free_general', 'free_coding', 'free_reasoning', 'free_vision', 'free_embeddings', 'free_translation', 'approved_paid'] as const
const CAPABILITIES = ['chat', 'streaming', 'function-calling', 'vision', 'json-mode', 'embedding', 'code-generation', 'reasoning', 'audio', 'translation'] as const

function toNumber(value: string, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function inputClassName() {
  return 'h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-50'
}

async function send<T>(path: string, method: string, body?: unknown): Promise<T> {
  return fetchApi<T>(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
}

export default function SuperAdminAIControlPlane() {
  const [companies, setCompanies] = useState<CompanyItem[]>([])
  const [providers, setProviders] = useState<ProviderConfig[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [members, setMembers] = useState<CompanyMember[]>([])
  const [usage, setUsage] = useState<UsageResult | null>(null)
  const [companyConfig, setCompanyConfig] = useState<CompanyConfig | null>(null)
  const [activeProfile, setActiveProfile] = useState<(typeof PROFILES)[number]>('free_general')
  const [policyDraft, setPolicyDraft] = useState({
    allowedProviderConfigIds: [] as string[], preferLocal: true, allowVerifiedFree: true, allowPaid: false,
    externalDataAllowed: false, maxOutputTokens: 4096,
  })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [forbidden, setForbidden] = useState(false)

  const [companyForm, setCompanyForm] = useState({ name: '', slug: '', domain: '', ownerUserId: '' })
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'employee' })
  const [inviteToken, setInviteToken] = useState('')
  const [acceptToken, setAcceptToken] = useState('')

  const [providerForm, setProviderForm] = useState({
    provider: 'ollama' as string, name: 'Local Ollama', baseUrl: 'http://localhost:11434/v1', apiKey: '',
    scope: 'global' as 'global' | 'company', modelId: '', contextLength: '8192', costPerMillionTokens: '0',
    capabilities: ['chat', 'code-generation', 'reasoning'] as string[], isLocal: true, fallbackEligible: true,
  })
  const [verifyForm, setVerifyForm] = useState({
    providerConfigId: '', officialDocsUrl: '', freeTierEligibility: 'unknown', verifiedModels: '',
    pricingEvidenceUrl: '', verifiedModelCosts: '',
    commercialUse: 'unknown', billingBehavior: 'unknown', quotaPeriod: 'unknown',
    apiCompatibility: 'unknown', dataRetention: 'unknown', authenticationRequirements: 'unknown', notes: '',
  })
  const [quotaForm, setQuotaForm] = useState({
    providerConfigId: '', quotaKind: 'unknown', quotaPeriod: 'unknown', remainingRequests: '', remainingTokens: '',
    limitRequests: '', limitTokens: '', officialSource: '', notes: '',
  })
  const [evidence, setEvidence] = useState<{ verifications: Array<Record<string, unknown>>; quotas: Array<Record<string, unknown>> }>({ verifications: [], quotas: [] })
  const [permissionDraft, setPermissionDraft] = useState({ providerConfigId: '', modelId: '', isAllowed: true, allowPaid: false })
  const [usageAgentId, setUsageAgentId] = useState('')

  const selectedCompany = companies.find((company) => company.id === selectedCompanyId) ?? null
  const eligibleProviders = useMemo(
    () => providers.filter((provider) => provider.companyId === null || provider.companyId === selectedCompanyId),
    [providers, selectedCompanyId],
  )

  const loadCompanies = useCallback(async () => {
    const response = await fetchApi<{ data?: CompanyItem[] }>('/api/companies')
    const next = response.data ?? []
    setCompanies(next)
    setSelectedCompanyId((current) => current && next.some((company) => company.id === current) ? current : '')
    return next
  }, [])

  const loadProviders = useCallback(async () => {
    const response = await fetchApi<{ configs?: ProviderConfig[] }>('/api/super-admin/ai/providers')
    setProviders(response.configs ?? [])
  }, [])

  const loadMembers = useCallback(async (companyId: string) => {
    if (!companyId) { setMembers([]); return }
    const response = await fetchApi<{ data?: CompanyMember[] }>(`/api/company/members?companyId=${encodeURIComponent(companyId)}`)
    setMembers(response.data ?? [])
  }, [])

  const loadCompanyConfig = useCallback(async (companyId: string, profile = activeProfile) => {
    if (!companyId) { setCompanyConfig(null); return }
    const response = await fetchApi<CompanyConfig>(`/api/super-admin/ai/company-config?companyId=${encodeURIComponent(companyId)}`)
    setCompanyConfig(response)
    const policy = response.policies.find((item) => item.profile === profile)
    setPolicyDraft({
      allowedProviderConfigIds: policy?.allowedProviderConfigIds ?? [],
      preferLocal: policy?.preferLocal ?? true,
      allowVerifiedFree: policy?.allowVerifiedFree ?? true,
      allowPaid: policy?.allowPaid ?? false,
      externalDataAllowed: policy?.externalDataAllowed ?? false,
      maxOutputTokens: policy?.maxOutputTokens ?? 4096,
    })
  }, [activeProfile])

  const loadEvidence = useCallback(async () => {
    const [verifications, quotas] = await Promise.all([
      fetchApi<{ data?: Array<Record<string, unknown>> }>('/api/super-admin/ai/provider-verifications'),
      fetchApi<{ data?: Array<Record<string, unknown>> }>('/api/super-admin/ai/provider-quotas'),
    ])
    setEvidence({ verifications: verifications.data ?? [], quotas: quotas.data ?? [] })
  }, [])

  const refreshAll = useCallback(async () => {
    setLoading(true); setError(''); setForbidden(false)
    try {
      await Promise.all([loadCompanies(), loadProviders(), loadEvidence()])
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load control-plane data.'
      setError(message)
      setForbidden(/403|forbidden/i.test(message))
    } finally { setLoading(false) }
  }, [loadCompanies, loadEvidence, loadProviders])

  useEffect(() => { void refreshAll() }, [refreshAll])
  useEffect(() => { if (selectedCompanyId) { void loadMembers(selectedCompanyId); void loadCompanyConfig(selectedCompanyId) } }, [selectedCompanyId, loadMembers, loadCompanyConfig])
  useEffect(() => {
    const current = companyConfig?.policies.find((policy) => policy.profile === activeProfile)
    setPolicyDraft({
      allowedProviderConfigIds: current?.allowedProviderConfigIds ?? [], preferLocal: current?.preferLocal ?? true,
      allowVerifiedFree: current?.allowVerifiedFree ?? true, allowPaid: current?.allowPaid ?? false,
      externalDataAllowed: current?.externalDataAllowed ?? false, maxOutputTokens: current?.maxOutputTokens ?? 4096,
    })
  }, [activeProfile, companyConfig])

  const createCompany = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(''); setNotice('')
    try {
      await send('/api/companies', 'POST', {
        name: companyForm.name.trim(),
        ...(companyForm.slug.trim() ? { slug: companyForm.slug.trim() } : {}),
        ...(companyForm.domain.trim() ? { domain: companyForm.domain.trim() } : {}),
        ...(companyForm.ownerUserId.trim() ? { ownerUserId: companyForm.ownerUserId.trim() } : {}),
      })
      setCompanyForm({ name: '', slug: '', domain: '', ownerUserId: '' });
      await loadCompanies(); setNotice('Company created with paid calls disabled and a zero-dollar paid budget.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Company creation failed.') }
    finally { setSaving(false) }
  }

  const changeCompanyStatus = async (company: CompanyItem) => {
    const status = company.status === 'active' ? 'suspended' : 'active'
    setBusyId(company.id); setError(''); setNotice('')
    try {
      await send(`/api/companies/${encodeURIComponent(company.id)}`, 'PUT', { status })
      await loadCompanies(); setNotice(`${company.name} is now ${status}.`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Company status update failed.') }
    finally { setBusyId('') }
  }

  const inviteMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!selectedCompanyId) return
    setSaving(true); setError(''); setNotice(''); setInviteToken('')
    try {
      const result = await send<{ inviteToken: string }>('/api/company/members', 'POST', { companyId: selectedCompanyId, email: inviteForm.email.trim(), role: inviteForm.role })
      setInviteToken(result.inviteToken); setInviteForm({ email: '', role: 'employee' }); await loadMembers(selectedCompanyId)
      setNotice('Invitation created. Copy the token once and deliver it through your approved secure channel; no email was sent.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Invitation failed.') }
    finally { setSaving(false) }
  }

  const updateMemberRole = async (member: CompanyMember, role: string) => {
    setBusyId(member.id); setError('')
    try {
      await send('/api/company/members', 'PATCH', { companyId: selectedCompanyId, userId: member.userId, role })
      await loadMembers(selectedCompanyId); setNotice('Membership role updated and audited.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Role update failed.') }
    finally { setBusyId('') }
  }

  const removeMember = async (member: CompanyMember) => {
    if (!window.confirm(`Remove ${member.user?.email ?? member.userId} from ${selectedCompany?.name ?? 'this company'}?`)) return
    setBusyId(member.id); setError('')
    try {
      await fetchApi(`/api/company/members?companyId=${encodeURIComponent(selectedCompanyId)}&userId=${encodeURIComponent(member.userId)}`, { method: 'DELETE' })
      await loadMembers(selectedCompanyId); setNotice('Company membership removed and audited.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Membership removal failed.') }
    finally { setBusyId('') }
  }

  const acceptInvitation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(''); setNotice('')
    try {
      await send('/api/company/invitations/accept', 'POST', { token: acceptToken.trim() })
      setAcceptToken(''); await loadCompanies(); setNotice('Invitation accepted. Select the new company from the company switcher in the header.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Invitation could not be accepted.') }
    finally { setSaving(false) }
  }

  const createProvider = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(''); setNotice('')
    try {
      const model = providerForm.modelId.trim() ? [{
        id: providerForm.modelId.trim(), contextLength: toNumber(providerForm.contextLength, 8192),
        capabilities: providerForm.capabilities, costPerMillionTokens: toNumber(providerForm.costPerMillionTokens),
      }] : []
      await send('/api/super-admin/ai/providers', 'POST', {
        provider: providerForm.provider, name: providerForm.name.trim(), scope: providerForm.scope,
        ...(providerForm.scope === 'company' ? { companyId: selectedCompanyId } : {}),
        ...(providerForm.baseUrl.trim() ? { baseUrl: providerForm.baseUrl.trim() } : {}),
        ...(providerForm.apiKey.trim() ? { apiKey: providerForm.apiKey.trim() } : {}),
        models: model, isEnabled: true, isLocal: providerForm.isLocal, fallbackEligible: providerForm.fallbackEligible, priority: 100,
      })
      setProviderForm((current) => ({ ...current, apiKey: '' })); await loadProviders(); setNotice('Provider configuration saved. The secret is server-side encrypted and cannot be read back.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Provider configuration failed.') }
    finally { setSaving(false) }
  }

  const testProvider = async (provider: ProviderConfig) => {
    setBusyId(provider.id); setError(''); setNotice('')
    try {
      const result = await send<{ status: string; models: string[]; error?: string }>(`/api/v1/providers/${encodeURIComponent(provider.id)}/test`, 'POST', {})
      await loadProviders(); setNotice(`Connectivity test: ${result.status}. ${result.models?.length ?? 0} models discovered.${result.error ? ` ${result.error}` : ''}`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Provider test failed.') }
    finally { setBusyId('') }
  }

  const toggleProvider = async (provider: ProviderConfig, field: 'isEnabled' | 'fallbackEligible', value: boolean) => {
    setBusyId(provider.id); setError('')
    try { await send(`/api/super-admin/ai/providers/${encodeURIComponent(provider.id)}`, 'PATCH', { [field]: value }); await loadProviders() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Provider update failed.') }
    finally { setBusyId('') }
  }

  const saveVerification = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(''); setNotice('')
    try {
      await send('/api/super-admin/ai/provider-verifications', 'POST', {
        providerConfigId: verifyForm.providerConfigId, officialDocsUrl: verifyForm.officialDocsUrl.trim() || null,
        freeTierEligibility: verifyForm.freeTierEligibility,
        verifiedModels: verifyForm.verifiedModels.split(',').map((item) => item.trim()).filter(Boolean),
        pricingEvidenceUrl: verifyForm.pricingEvidenceUrl.trim() || null,
        verifiedModelCosts: verifyForm.verifiedModelCosts.split(',').map((item) => item.trim()).filter(Boolean).map((item) => {
          const [modelId, rawCost] = item.split('=')
          return { modelId: modelId?.trim() ?? '', costPerMillionTokens: Number(rawCost) }
        }),
        commercialUse: verifyForm.commercialUse, billingBehavior: verifyForm.billingBehavior, quotaPeriod: verifyForm.quotaPeriod,
        apiCompatibility: verifyForm.apiCompatibility, dataRetention: verifyForm.dataRetention,
        authenticationRequirements: verifyForm.authenticationRequirements, notes: verifyForm.notes.trim() || null,
      })
      await loadEvidence(); setNotice('Dated provider verification saved. This records an operator-reviewed fact; it does not independently validate provider terms.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Verification could not be saved.') }
    finally { setSaving(false) }
  }

  const saveQuota = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(''); setNotice('')
    const optionalNumber = (value: string) => value.trim() ? toNumber(value, 0) : undefined
    try {
      await send('/api/super-admin/ai/provider-quotas', 'POST', {
        providerConfigId: quotaForm.providerConfigId, quotaKind: quotaForm.quotaKind, quotaPeriod: quotaForm.quotaPeriod,
        ...(optionalNumber(quotaForm.remainingRequests) !== undefined ? { remainingRequests: optionalNumber(quotaForm.remainingRequests) } : {}),
        ...(optionalNumber(quotaForm.remainingTokens) !== undefined ? { remainingTokens: optionalNumber(quotaForm.remainingTokens) } : {}),
        ...(optionalNumber(quotaForm.limitRequests) !== undefined ? { limitRequests: optionalNumber(quotaForm.limitRequests) } : {}),
        ...(optionalNumber(quotaForm.limitTokens) !== undefined ? { limitTokens: optionalNumber(quotaForm.limitTokens) } : {}),
        ...(quotaForm.officialSource.trim() ? { officialSource: quotaForm.officialSource.trim() } : {}),
        notes: quotaForm.notes.trim() || null,
      })
      await loadEvidence(); setNotice('Quota snapshot recorded with its source category and capture time. Unknown quota remains ineligible for verified-free routing.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Quota snapshot could not be saved.') }
    finally { setSaving(false) }
  }

  const loadUsage = async () => {
    setSaving(true); setError('')
    try {
      const params = new URLSearchParams({ limit: '1000' })
      if (selectedCompanyId) params.set('companyId', selectedCompanyId)
      if (usageAgentId.trim()) params.set('agentId', usageAgentId.trim())
      const response = await fetchApi<UsageResult>(`/api/super-admin/ai/usage?${params.toString()}`)
      setUsage(response)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Usage query failed.') }
    finally { setSaving(false) }
  }

  const loadCompanyGovernance = async () => {
    if (!selectedCompanyId) { setError('Select a company first.'); return }
    setSaving(true); setError(''); setNotice('')
    try {
      await send('/api/super-admin/ai/company-config', 'PUT', {
        companyId: selectedCompanyId,
        settings: {
          externalDataProcessingApproved: companyConfig?.settings?.externalDataProcessingApproved ?? false,
          confidentialDataExternalAllowed: companyConfig?.settings?.confidentialDataExternalAllowed ?? false,
          dataProcessingPolicyUrl: companyConfig?.settings?.dataProcessingPolicyUrl || null,
        },
        budget: {
          monthlyTokenBudget: companyConfig?.budget?.monthlyTokenBudget ?? 1_000_000,
          dailyTokenBudget: companyConfig?.budget?.dailyTokenBudget ?? 50_000,
          maxPaidBudgetUsd: companyConfig?.budget?.maxPaidBudgetUsd ?? 0,
          paidApiAllowed: companyConfig?.budget?.paidApiAllowed ?? false,
          autoBillingEnabled: false,
        },
      })
      await loadCompanyConfig(selectedCompanyId); setNotice('Company data-processing and budget controls saved and audited. Automatic billing remains off.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Company governance could not be saved.') }
    finally { setSaving(false) }
  }

  const savePolicy = async () => {
    if (!selectedCompanyId) { setError('Select a company first.'); return }
    setSaving(true); setError(''); setNotice('')
    try {
      await send('/api/super-admin/ai/routing-policies', 'PUT', { companyId: selectedCompanyId, profile: activeProfile, ...policyDraft, fallbackBehavior: 'defer' })
      await loadCompanyConfig(selectedCompanyId); setNotice(`${activeProfile} policy saved. Any unverified or exhausted external route is deferred; paid fallback is not implicit.`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Routing policy could not be saved.') }
    finally { setSaving(false) }
  }

  const saveModelPermission = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!selectedCompanyId) return
    setSaving(true); setError(''); setNotice('')
    try {
      await send('/api/super-admin/ai/model-permissions', 'POST', { companyId: selectedCompanyId, ...permissionDraft })
      setPermissionDraft((current) => ({ ...current, modelId: '' })); setNotice('Model permission saved and audited. Paid permission is available only after the company budget gate is approved.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Model grant could not be saved.') }
    finally { setSaving(false) }
  }

  const copyInviteToken = async () => {
    try { await navigator.clipboard.writeText(inviteToken); setNotice('Invitation token copied. Send it only through your approved secure channel.') }
    catch { setError('Clipboard access failed. Select and copy the invitation token manually.') }
  }

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading control plane…</div>
  if (forbidden) return (
    <div className="mx-auto max-w-3xl p-6">
      <Card className="border-red-200"><CardContent className="flex items-start gap-3 p-6"><ShieldCheck className="mt-1 h-5 w-5 text-red-600" /><div><h2 className="font-semibold">Super Admin access required</h2><p className="mt-1 text-sm text-slate-600">Provider secrets, paid budgets, external data-processing approvals, and cross-company usage are restricted to Super Admin. The server enforces this even if this navigation item is visible.</p></div></CardContent></Card>
    </div>
  )

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-blue-700" /><h1 className="text-2xl font-bold text-slate-900">Super Admin AI Control Plane</h1><Badge variant="outline">Audited</Badge></div>
          <p className="mt-1 text-sm text-slate-600">Tenant administration, model permissions, provider evidence, capability routing, and usage. Paid calls and external confidential processing are off unless explicitly approved.</p>
        </div>
        <Button variant="outline" onClick={() => void refreshAll()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="flex items-center gap-3 p-4"><Building2 className="h-8 w-8 text-blue-700" /><div><p className="text-xl font-bold">{companies.length}</p><p className="text-xs text-slate-500">Companies visible to this Super Admin</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><Cpu className="h-8 w-8 text-indigo-700" /><div><p className="text-xl font-bold">{providers.length}</p><p className="text-xs text-slate-500">Configured model providers</p></div></CardContent></Card>
        <Card className="border-amber-200"><CardContent className="flex items-center gap-3 p-4"><KeyRound className="h-8 w-8 text-amber-700" /><div><p className="text-sm font-bold text-amber-900">Paid calls: disabled by default</p><p className="text-xs text-amber-800">Zero paid budget; no automatic billing</p></div></CardContent></Card>
        <Card className="border-emerald-200"><CardContent className="flex items-center gap-3 p-4"><CheckCircle2 className="h-8 w-8 text-emerald-700" /><div><p className="text-sm font-bold text-emerald-900">Free-first / local-first</p><p className="text-xs text-emerald-800">Unknown quota or verification means defer</p></div></CardContent></Card>
      </div>

      {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {notice && <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}

      <Tabs defaultValue="tenants" className="space-y-4">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="tenants">Companies & members</TabsTrigger>
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="policy">Budgets & routing</TabsTrigger>
          <TabsTrigger value="evidence">Verification & quota</TabsTrigger>
          <TabsTrigger value="usage">Usage ledger</TabsTrigger>
          <TabsTrigger value="chat">Super Chat</TabsTrigger>
        </TabsList>

        <TabsContent value="tenants" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.9fr)]">
            <Card>
              <CardHeader><CardTitle>Create company</CardTitle><CardDescription>New tenants receive a central-company record, default roles, settings, and a zero-dollar paid budget.</CardDescription></CardHeader>
              <CardContent>
                <form onSubmit={createCompany} className="grid gap-3 sm:grid-cols-2">
                  <div><Label htmlFor="company-name">Name</Label><Input id="company-name" value={companyForm.name} onChange={(event) => setCompanyForm({ ...companyForm, name: event.target.value })} required minLength={2} maxLength={120} /></div>
                  <div><Label htmlFor="company-slug">Slug (optional)</Label><Input id="company-slug" value={companyForm.slug} onChange={(event) => setCompanyForm({ ...companyForm, slug: event.target.value })} placeholder="sister-company" /></div>
                  <div><Label htmlFor="company-domain">Domain (optional)</Label><Input id="company-domain" value={companyForm.domain} onChange={(event) => setCompanyForm({ ...companyForm, domain: event.target.value })} placeholder="example.org" /></div>
                  <div><Label htmlFor="company-owner">Existing owner user ID (optional)</Label><Input id="company-owner" value={companyForm.ownerUserId} onChange={(event) => setCompanyForm({ ...companyForm, ownerUserId: event.target.value })} /></div>
                  <div className="sm:col-span-2"><Button disabled={saving}><Plus className="mr-2 h-4 w-4" />Create company</Button></div>
                </form>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Company directory</CardTitle><CardDescription>All company lifecycle changes require Super Admin and are audited.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {companies.length === 0 ? <p className="text-sm text-slate-500">No companies found.</p> : companies.map((company) => (
                  <div key={company.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ${selectedCompanyId === company.id ? 'border-blue-300 bg-blue-50/50' : 'border-slate-200'}`}>
                    <button onClick={() => setSelectedCompanyId(company.id)} className="min-w-0 text-left">
                      <span className="block truncate font-semibold">{company.name}</span><span className="text-xs text-slate-500">{company.slug} · {company.userCount ?? '—'} members</span>
                    </button>
                    <div className="flex items-center gap-2"><Badge variant={company.status === 'active' ? 'default' : 'secondary'}>{company.status}</Badge><Button variant="outline" size="sm" disabled={busyId === company.id} onClick={() => void changeCompanyStatus(company)}>{busyId === company.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : company.status === 'active' ? 'Suspend' : 'Activate'}</Button></div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" />Company membership access</CardTitle><CardDescription>Choose a company, invite by email, assign company roles, and retain at least one owner.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="max-w-sm"><Label htmlFor="membership-company">Selected company</Label><select id="membership-company" className={inputClassName()} value={selectedCompanyId} onChange={(event) => setSelectedCompanyId(event.target.value)}><option value="">Choose a company</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></div>
              {selectedCompanyId ? <>
                <form onSubmit={inviteMember} className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
                  <div><Label htmlFor="invite-email">Invite email</Label><Input id="invite-email" type="email" value={inviteForm.email} onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })} required /></div>
                  <div><Label htmlFor="invite-role">Company role</Label><select id="invite-role" className={inputClassName()} value={inviteForm.role} onChange={(event) => setInviteForm({ ...inviteForm, role: event.target.value })}><option value="employee">Employee</option><option value="operator">Operator</option><option value="manager">Manager</option><option value="admin">Admin</option></select></div>
                  <Button disabled={saving}>Create invite</Button>
                </form>
                {inviteToken && <div className="rounded-md border border-amber-300 bg-amber-50 p-3"><p className="text-xs font-semibold text-amber-900">Invitation token — shown once</p><div className="mt-2 flex gap-2"><Input readOnly value={inviteToken} aria-label="Invitation token" /><Button type="button" variant="outline" onClick={() => void copyInviteToken()}>Copy</Button></div></div>}
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[640px] text-sm"><thead><tr className="bg-slate-50 text-left text-xs text-slate-500"><th className="p-3">Member</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead><tbody>
                    {members.map((member) => <tr key={member.id} className="border-t"><td className="p-3"><span className="font-medium">{member.user?.name ?? 'Account'}</span><span className="block text-xs text-slate-500">{member.user?.email ?? member.userId}</span></td><td className="p-3"><select className="h-8 rounded border px-2 text-xs" value={member.role} disabled={busyId === member.id} onChange={(event) => void updateMemberRole(member, event.target.value)}><option value="owner">Owner</option><option value="admin">Admin</option><option value="manager">Manager</option><option value="operator">Operator</option><option value="employee">Employee</option></select></td><td className="p-3">{member.user?.isActive ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</td><td className="p-3"><Button variant="ghost" size="sm" disabled={busyId === member.id} onClick={() => void removeMember(member)} className="text-red-700">Remove</Button></td></tr>)}
                    {members.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-sm text-slate-500">No members have been assigned yet.</td></tr>}
                  </tbody></table>
                </div>
              </> : <p className="text-sm text-slate-500">Select a company to manage memberships.</p>}
              <form onSubmit={acceptInvitation} className="grid gap-2 border-t pt-4 sm:grid-cols-[1fr_auto] sm:items-end"><div><Label htmlFor="accept-invite">Accept an invitation for the signed-in email</Label><Input id="accept-invite" value={acceptToken} onChange={(event) => setAcceptToken(event.target.value)} placeholder="Paste the one-time invitation token" minLength={20} required /></div><Button variant="outline" disabled={saving}>Accept invite</Button></form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="providers" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Register a provider</CardTitle><CardDescription>Credentials are encrypted server-side and never returned. Local or custom models must have honest capability metadata; unknown external pricing/quota does not mean free.</CardDescription></CardHeader>
            <CardContent>
              <form onSubmit={createProvider} className="grid gap-3 md:grid-cols-3">
                <div><Label htmlFor="provider-kind">Provider kind</Label><select id="provider-kind" className={inputClassName()} value={providerForm.provider} onChange={(event) => { const kind = event.target.value; const local = kind === 'ollama' || kind === 'llama-cpp' || kind === 'custom-self-hosted'; setProviderForm({ ...providerForm, provider: kind, isLocal: local, name: `${kind} provider` }) }}>{PROVIDER_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select></div>
                <div><Label htmlFor="provider-name">Display name</Label><Input id="provider-name" value={providerForm.name} onChange={(event) => setProviderForm({ ...providerForm, name: event.target.value })} minLength={2} maxLength={64} required /></div>
                <div><Label htmlFor="provider-scope">Scope</Label><select id="provider-scope" className={inputClassName()} value={providerForm.scope} onChange={(event) => setProviderForm({ ...providerForm, scope: event.target.value as 'global' | 'company' })}><option value="global">Shared / platform</option><option value="company">Selected company only</option></select></div>
                <div><Label htmlFor="provider-url">Base URL</Label><Input id="provider-url" type="url" value={providerForm.baseUrl} onChange={(event) => setProviderForm({ ...providerForm, baseUrl: event.target.value })} placeholder="https://provider.example/v1" /></div>
                <div><Label htmlFor="provider-key">API key (optional for local; write-only)</Label><Input id="provider-key" type="password" autoComplete="new-password" value={providerForm.apiKey} onChange={(event) => setProviderForm({ ...providerForm, apiKey: event.target.value })} placeholder="Saved encrypted; never returned" /></div>
                <div><Label htmlFor="provider-model">Model ID</Label><Input id="provider-model" value={providerForm.modelId} onChange={(event) => setProviderForm({ ...providerForm, modelId: event.target.value })} placeholder="model-name" /></div>
                <div><Label htmlFor="provider-context">Context tokens</Label><Input id="provider-context" type="number" min={1} value={providerForm.contextLength} onChange={(event) => setProviderForm({ ...providerForm, contextLength: event.target.value })} /></div>
                <div><Label htmlFor="provider-cost">Cost / million tokens (estimate)</Label><Input id="provider-cost" type="number" min={0} step="0.000001" value={providerForm.costPerMillionTokens} onChange={(event) => setProviderForm({ ...providerForm, costPerMillionTokens: event.target.value })} /></div>
                <div className="md:col-span-3"><Label htmlFor="provider-capabilities">Model capabilities (comma separated)</Label><Input id="provider-capabilities" value={providerForm.capabilities.join(', ')} onChange={(event) => setProviderForm({ ...providerForm, capabilities: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} /></div>
                <div className="flex flex-wrap gap-4 text-sm md:col-span-3"><label className="flex items-center gap-2"><input type="checkbox" checked={providerForm.isLocal} onChange={(event) => setProviderForm({ ...providerForm, isLocal: event.target.checked })} />Trust as local/on-prem</label><label className="flex items-center gap-2"><input type="checkbox" checked={providerForm.fallbackEligible} onChange={(event) => setProviderForm({ ...providerForm, fallbackEligible: event.target.checked })} />Allow as an authorized fallback</label></div>
                {providerForm.scope === 'company' && !selectedCompanyId && <p className="text-sm text-amber-800 md:col-span-3">Select a company in the Budgets & routing tab before creating a company-scoped provider.</p>}
                <div className="md:col-span-3"><Button disabled={saving || (providerForm.scope === 'company' && !selectedCompanyId)}><Plus className="mr-2 h-4 w-4" />Save provider</Button></div>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Configured providers</CardTitle><CardDescription>No secret values are displayed. Health tests do not send an external chat prompt.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {providers.map((provider) => <div key={provider.id} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_auto] md:items-center">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{provider.name}</span><Badge variant="outline">{provider.provider}</Badge><Badge variant={provider.isLocal ? 'default' : 'secondary'}>{provider.isLocal ? 'local' : 'external'}</Badge><Badge variant="outline">{provider.companyId ? `Company ${provider.companyId}` : 'Shared'}</Badge></div><p className="mt-1 truncate text-xs text-slate-500">{provider.baseUrl || 'Environment/default endpoint'} · {provider.models.length} configured models · key {provider.hasApiKey ? 'stored' : 'not stored'}{provider.keyFingerprint ? ` · ${provider.keyFingerprint}` : ''}</p><p className="mt-1 text-xs text-slate-500">Health: {provider.lastHealthStatus ?? 'not tested'} · {provider.lastHealthAt ? new Date(provider.lastHealthAt).toLocaleString() : 'no recent check'}{provider.lastError ? ` · ${provider.lastError}` : ''}</p></div>
                <div className="flex flex-wrap items-center gap-3 text-xs"><label className="flex items-center gap-1.5"><input type="checkbox" checked={provider.isEnabled} disabled={busyId === provider.id} onChange={(event) => void toggleProvider(provider, 'isEnabled', event.target.checked)} />Enabled</label><label className="flex items-center gap-1.5"><input type="checkbox" checked={provider.fallbackEligible} disabled={busyId === provider.id} onChange={(event) => void toggleProvider(provider, 'fallbackEligible', event.target.checked)} />Fallback eligible</label><Button size="sm" variant="outline" disabled={busyId === provider.id} onClick={() => void testProvider(provider)}>{busyId === provider.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Test'}</Button></div>
              </div>)}
              {providers.length === 0 && <p className="text-sm text-slate-500">No provider configs are registered. A healthy local provider may still be configured through server environment settings.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="policy" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Company security and budget controls</CardTitle><CardDescription>These settings are Super Admin-controlled. Confidential and restricted data remain local unless the company policy and this approval both permit external processing.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="max-w-lg"><Label htmlFor="policy-company">Company</Label><select id="policy-company" className={inputClassName()} value={selectedCompanyId} onChange={(event) => setSelectedCompanyId(event.target.value)}><option value="">Choose a company</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name} · {company.status}</option>)}</select></div>
              {selectedCompany && <>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="flex items-start gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" className="mt-1" checked={companyConfig?.settings?.externalDataProcessingApproved ?? false} onChange={(event) => setCompanyConfig((current) => current ? { ...current, settings: { ...(current.settings ?? { primaryColor: '#003ABC', locale: 'en', timezone: 'Asia/Dhaka', dataProcessingPolicyUrl: null, externalDataProcessingApproved: false, confidentialDataExternalAllowed: false }), externalDataProcessingApproved: event.target.checked } } : current)} /><span><strong>Allow external data processing</strong><span className="mt-1 block text-xs text-slate-500">Requires a data-processing policy URL.</span></span></label>
                  <label className="flex items-start gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" className="mt-1" checked={companyConfig?.settings?.confidentialDataExternalAllowed ?? false} onChange={(event) => setCompanyConfig((current) => current ? { ...current, settings: { ...(current.settings ?? { primaryColor: '#003ABC', locale: 'en', timezone: 'Asia/Dhaka', dataProcessingPolicyUrl: null, externalDataProcessingApproved: false, confidentialDataExternalAllowed: false }), confidentialDataExternalAllowed: event.target.checked } } : current)} /><span><strong>Allow confidential data externally</strong><span className="mt-1 block text-xs text-slate-500">Requires external processing approval.</span></span></label>
                  <div><Label htmlFor="processing-policy-url">Data-processing policy URL</Label><Input id="processing-policy-url" type="url" value={companyConfig?.settings?.dataProcessingPolicyUrl ?? ''} onChange={(event) => setCompanyConfig((current) => current ? { ...current, settings: { ...(current.settings ?? { primaryColor: '#003ABC', locale: 'en', timezone: 'Asia/Dhaka', dataProcessingPolicyUrl: null, externalDataProcessingApproved: false, confidentialDataExternalAllowed: false }), dataProcessingPolicyUrl: event.target.value || null } } : current)} placeholder="https://..." /></div>
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  <div><Label htmlFor="monthly-budget">Monthly token limit</Label><Input id="monthly-budget" type="number" min={0} value={companyConfig?.budget?.monthlyTokenBudget ?? 1_000_000} onChange={(event) => setCompanyConfig((current) => current ? { ...current, budget: { ...(current.budget ?? { dailyTokenBudget: 50_000, maxPaidBudgetUsd: 0, paidApiAllowed: false, autoBillingEnabled: false }), monthlyTokenBudget: toNumber(event.target.value) } } : current)} /></div>
                  <div><Label htmlFor="daily-budget">Daily token limit</Label><Input id="daily-budget" type="number" min={0} value={companyConfig?.budget?.dailyTokenBudget ?? 50_000} onChange={(event) => setCompanyConfig((current) => current ? { ...current, budget: { ...(current.budget ?? { monthlyTokenBudget: 1_000_000, maxPaidBudgetUsd: 0, paidApiAllowed: false, autoBillingEnabled: false }), dailyTokenBudget: toNumber(event.target.value) } } : current)} /></div>
                  <div><Label htmlFor="paid-budget">Explicit paid budget (USD/month)</Label><Input id="paid-budget" type="number" min={0} step="0.01" value={companyConfig?.budget?.maxPaidBudgetUsd ?? 0} onChange={(event) => setCompanyConfig((current) => current ? { ...current, budget: { ...(current.budget ?? { monthlyTokenBudget: 1_000_000, dailyTokenBudget: 50_000, paidApiAllowed: false, autoBillingEnabled: false }), maxPaidBudgetUsd: toNumber(event.target.value) } } : current)} /></div>
                  <label className="flex items-center gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" checked={companyConfig?.budget?.paidApiAllowed ?? false} onChange={(event) => setCompanyConfig((current) => current ? { ...current, budget: { ...(current.budget ?? { monthlyTokenBudget: 1_000_000, dailyTokenBudget: 50_000, maxPaidBudgetUsd: 0, autoBillingEnabled: false }), paidApiAllowed: event.target.checked } } : current)} />Explicitly enable paid calls</label>
                </div>
                <p className="text-xs text-amber-800">Automatic billing is always disabled. Paid authorization alone does not cause paid calls: a matching approved_paid profile, per-model grant, positive budget, and external data authorization are also required.</p>
                <Button onClick={() => void loadCompanyGovernance()} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save company controls</Button>
              </>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Capability routing policy</CardTitle><CardDescription>Local models are preferred; provider-reported quota and dated official-source verification are required for external free models; all failure behavior defers.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3"><div><Label htmlFor="routing-profile">Capability profile</Label><select id="routing-profile" className={inputClassName()} value={activeProfile} onChange={(event) => setActiveProfile(event.target.value as (typeof PROFILES)[number])}>{PROFILES.map((profile) => <option key={profile} value={profile}>{profile}</option>)}</select></div><div><Label htmlFor="max-output-tokens">Maximum output tokens</Label><Input id="max-output-tokens" type="number" min={1} max={32768} value={policyDraft.maxOutputTokens} onChange={(event) => setPolicyDraft({ ...policyDraft, maxOutputTokens: toNumber(event.target.value, 4096) })} /></div><div className="flex items-end text-sm text-slate-500">Fallback behavior: defer (fixed)</div></div>
              <div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={policyDraft.preferLocal} onChange={(event) => setPolicyDraft({ ...policyDraft, preferLocal: event.target.checked })} />Prefer local</label><label className="flex items-center gap-2"><input type="checkbox" checked={policyDraft.allowVerifiedFree} onChange={(event) => setPolicyDraft({ ...policyDraft, allowVerifiedFree: event.target.checked })} />Allow verified free tier</label><label className="flex items-center gap-2"><input type="checkbox" checked={policyDraft.allowPaid} disabled={activeProfile !== 'approved_paid'} onChange={(event) => setPolicyDraft({ ...policyDraft, allowPaid: event.target.checked })} />Allow paid (approved_paid only)</label><label className="flex items-center gap-2"><input type="checkbox" checked={policyDraft.externalDataAllowed} onChange={(event) => setPolicyDraft({ ...policyDraft, externalDataAllowed: event.target.checked })} />Allow external data under company controls</label></div>
              <div><p className="mb-2 text-sm font-medium">Provider allow-list (empty means all explicitly eligible providers)</p><div className="grid gap-2 md:grid-cols-2">{eligibleProviders.map((provider) => <label key={provider.id} className="flex items-center gap-2 rounded border p-2 text-xs"><input type="checkbox" checked={policyDraft.allowedProviderConfigIds.includes(provider.id)} onChange={(event) => setPolicyDraft((current) => ({ ...current, allowedProviderConfigIds: event.target.checked ? [...current.allowedProviderConfigIds, provider.id] : current.allowedProviderConfigIds.filter((id) => id !== provider.id) }))} /><span className="font-medium">{provider.name}</span><span className="text-slate-500">{provider.isLocal ? 'local' : provider.provider}</span></label>)}{eligibleProviders.length === 0 && <p className="text-xs text-slate-500">No provider configs; platform environment-based local models remain eligible.</p>}</div></div>
              <Button onClick={() => void savePolicy()} disabled={saving || !selectedCompanyId}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save routing policy</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Per-company model grants</CardTitle><CardDescription>Shared provider models are unavailable until explicitly granted. Paid grants remain separately gated by the company budget and paid routing profile.</CardDescription></CardHeader>
            <CardContent>
              <form onSubmit={saveModelPermission} className="grid gap-3 md:grid-cols-4 md:items-end">
                <div><Label htmlFor="grant-provider">Provider</Label><select id="grant-provider" className={inputClassName()} value={permissionDraft.providerConfigId} onChange={(event) => setPermissionDraft({ ...permissionDraft, providerConfigId: event.target.value, modelId: '' })}><option value="">Choose provider</option>{eligibleProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></div>
                <div><Label htmlFor="grant-model">Model ID</Label><Input id="grant-model" value={permissionDraft.modelId} onChange={(event) => setPermissionDraft({ ...permissionDraft, modelId: event.target.value })} required /></div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={permissionDraft.isAllowed} onChange={(event) => setPermissionDraft({ ...permissionDraft, isAllowed: event.target.checked, allowPaid: event.target.checked ? permissionDraft.allowPaid : false })} />Allow model</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={permissionDraft.allowPaid} disabled={!permissionDraft.isAllowed} onChange={(event) => setPermissionDraft({ ...permissionDraft, allowPaid: event.target.checked })} />Allow paid calls</label>
                <div className="md:col-span-4"><Button disabled={saving || !selectedCompanyId || !permissionDraft.providerConfigId}>Save model grant</Button></div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="evidence" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Record provider verification</CardTitle><CardDescription>Enter facts reviewed against official provider documentation. This system does not presume a provider is free.</CardDescription></CardHeader>
              <CardContent>
                <form onSubmit={saveVerification} className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2"><Label htmlFor="verify-provider">Provider configuration</Label><select id="verify-provider" className={inputClassName()} value={verifyForm.providerConfigId} onChange={(event) => setVerifyForm({ ...verifyForm, providerConfigId: event.target.value })} required><option value="">Choose provider</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} · {provider.provider}</option>)}</select></div>
                  <div className="sm:col-span-2"><Label htmlFor="verify-docs">Official documentation URL</Label><Input id="verify-docs" type="url" value={verifyForm.officialDocsUrl} onChange={(event) => setVerifyForm({ ...verifyForm, officialDocsUrl: event.target.value })} placeholder="https://official-provider.example/docs" /></div>
                  <div><Label htmlFor="free-status">Free-tier eligibility</Label><select id="free-status" className={inputClassName()} value={verifyForm.freeTierEligibility} onChange={(event) => setVerifyForm({ ...verifyForm, freeTierEligibility: event.target.value })}><option value="unknown">Unknown</option><option value="verified_free">Verified free</option><option value="not_free">Not free</option></select></div>
                  <div><Label htmlFor="verified-models">Verified free model IDs</Label><Input id="verified-models" value={verifyForm.verifiedModels} onChange={(event) => setVerifyForm({ ...verifyForm, verifiedModels: event.target.value })} placeholder="id-a, id-b" /></div>
                  <div className="sm:col-span-2"><Label htmlFor="pricing-evidence">Official pricing evidence URL</Label><Input id="pricing-evidence" type="url" value={verifyForm.pricingEvidenceUrl} onChange={(event) => setVerifyForm({ ...verifyForm, pricingEvidenceUrl: event.target.value })} placeholder="Official pricing documentation URL" /></div>
                  <div className="sm:col-span-2"><Label htmlFor="verified-prices">Verified costs per million tokens</Label><Input id="verified-prices" value={verifyForm.verifiedModelCosts} onChange={(event) => setVerifyForm({ ...verifyForm, verifiedModelCosts: event.target.value })} placeholder="model-id=0.50, another-model=0.25" /><p className="mt-1 text-xs text-slate-500">Only enter values reviewed against the official pricing page. Each cost must exactly match the configured model cost; evidence expires after 30 days.</p></div>
                  <div><Label htmlFor="commercial-use">Commercial use</Label><select id="commercial-use" className={inputClassName()} value={verifyForm.commercialUse} onChange={(event) => setVerifyForm({ ...verifyForm, commercialUse: event.target.value })}><option value="unknown">Unknown</option><option value="allowed">Allowed</option><option value="restricted">Restricted</option></select></div>
                  <div><Label htmlFor="billing-behavior">Billing behavior</Label><select id="billing-behavior" className={inputClassName()} value={verifyForm.billingBehavior} onChange={(event) => setVerifyForm({ ...verifyForm, billingBehavior: event.target.value })}><option value="unknown">Unknown</option><option value="no_automatic_billing">No automatic billing</option><option value="prepaid_only">Prepaid only</option><option value="manual_top_up">Manual top-up</option><option value="auto_billing">Automatic billing</option></select></div>
                  <div><Label htmlFor="quota-period">Quota period</Label><select id="quota-period" className={inputClassName()} value={verifyForm.quotaPeriod} onChange={(event) => setVerifyForm({ ...verifyForm, quotaPeriod: event.target.value })}>{['unknown', 'request', 'minute', 'daily', 'monthly'].map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
                  <div><Label htmlFor="api-compatibility">API compatibility</Label><select id="api-compatibility" className={inputClassName()} value={verifyForm.apiCompatibility} onChange={(event) => setVerifyForm({ ...verifyForm, apiCompatibility: event.target.value })}>{['unknown', 'openai-compatible', 'native', 'partial', 'incompatible'].map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
                  <div><Label htmlFor="data-retention">Data retention</Label><select id="data-retention" className={inputClassName()} value={verifyForm.dataRetention} onChange={(event) => setVerifyForm({ ...verifyForm, dataRetention: event.target.value })}>{['unknown', 'no-training', 'retained', 'configurable', 'restricted'].map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
                  <div className="sm:col-span-2"><Label htmlFor="verify-notes">Review notes</Label><Input id="verify-notes" value={verifyForm.notes} onChange={(event) => setVerifyForm({ ...verifyForm, notes: event.target.value })} maxLength={2000} /></div>
                  <div className="sm:col-span-2"><Button disabled={saving || !verifyForm.providerConfigId}>Record dated verification</Button></div>
                </form>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Record quota snapshot</CardTitle><CardDescription>Provider-reported remaining values and locally estimated usage are stored as different categories.</CardDescription></CardHeader>
              <CardContent>
                <form onSubmit={saveQuota} className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2"><Label htmlFor="quota-provider">Provider configuration</Label><select id="quota-provider" className={inputClassName()} value={quotaForm.providerConfigId} onChange={(event) => setQuotaForm({ ...quotaForm, providerConfigId: event.target.value })} required><option value="">Choose provider</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} · {provider.provider}</option>)}</select></div>
                  <div><Label htmlFor="quota-kind">Quota source type</Label><select id="quota-kind" className={inputClassName()} value={quotaForm.quotaKind} onChange={(event) => setQuotaForm({ ...quotaForm, quotaKind: event.target.value })}><option value="unknown">Unknown</option><option value="provider_verified_quota">Provider-verified limit</option><option value="provider_reported_remaining">Provider-reported remaining</option><option value="local_estimate">Local estimate</option></select></div>
                  <div><Label htmlFor="quota-period-value">Quota period</Label><select id="quota-period-value" className={inputClassName()} value={quotaForm.quotaPeriod} onChange={(event) => setQuotaForm({ ...quotaForm, quotaPeriod: event.target.value })}>{['unknown', 'request', 'minute', 'daily', 'monthly'].map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
                  <div><Label htmlFor="remaining-requests">Remaining requests</Label><Input id="remaining-requests" type="number" min={0} value={quotaForm.remainingRequests} onChange={(event) => setQuotaForm({ ...quotaForm, remainingRequests: event.target.value })} /></div>
                  <div><Label htmlFor="remaining-tokens">Remaining tokens</Label><Input id="remaining-tokens" type="number" min={0} value={quotaForm.remainingTokens} onChange={(event) => setQuotaForm({ ...quotaForm, remainingTokens: event.target.value })} /></div>
                  <div><Label htmlFor="limit-requests">Verified request limit</Label><Input id="limit-requests" type="number" min={0} value={quotaForm.limitRequests} onChange={(event) => setQuotaForm({ ...quotaForm, limitRequests: event.target.value })} /></div>
                  <div><Label htmlFor="limit-tokens">Verified token limit</Label><Input id="limit-tokens" type="number" min={0} value={quotaForm.limitTokens} onChange={(event) => setQuotaForm({ ...quotaForm, limitTokens: event.target.value })} /></div>
                  <div className="sm:col-span-2"><Label htmlFor="quota-source">Official source URL (required for provider-sourced quota)</Label><Input id="quota-source" type="url" value={quotaForm.officialSource} onChange={(event) => setQuotaForm({ ...quotaForm, officialSource: event.target.value })} /></div>
                  <div className="sm:col-span-2"><Label htmlFor="quota-notes">Notes</Label><Input id="quota-notes" value={quotaForm.notes} onChange={(event) => setQuotaForm({ ...quotaForm, notes: event.target.value })} /></div>
                  <div className="sm:col-span-2"><Button disabled={saving || !quotaForm.providerConfigId}>Record quota snapshot</Button></div>
                </form>
              </CardContent>
            </Card>
          </div>
          <Card><CardHeader><CardTitle>Recent provider evidence</CardTitle><CardDescription>Verification timestamps and quota types are displayed separately; `UNKNOWN` is not treated as zero or as free.</CardDescription></CardHeader><CardContent className="grid gap-4 xl:grid-cols-2">
            <div><h3 className="mb-2 text-sm font-semibold">Verifications</h3><div className="space-y-2">{evidence.verifications.slice(0, 8).map((row, index) => <div key={String(row.id ?? index)} className="rounded border p-2 text-xs"><strong>{String((row.providerConfig as Record<string, unknown> | undefined)?.name ?? row.providerConfigId ?? 'Provider')}</strong> · {String(row.freeTierEligibility)} · verified {new Date(String(row.verifiedAt)).toLocaleString()}<div className="truncate text-slate-500">{String(row.officialDocsUrl ?? 'No official source recorded')}</div><div className="text-slate-500">Pricing {row.pricingVerifiedAt ? `verified ${new Date(String(row.pricingVerifiedAt)).toLocaleString()}` : 'unknown'} · {String(row.pricingEvidenceUrl ?? 'no pricing source')}</div></div>)}{evidence.verifications.length === 0 && <p className="text-xs text-slate-500">No official verification records. Provider status is unknown.</p>}</div></div>
            <div><h3 className="mb-2 text-sm font-semibold">Quota snapshots</h3><div className="space-y-2">{evidence.quotas.slice(0, 8).map((row, index) => <div key={String(row.id ?? index)} className="rounded border p-2 text-xs"><strong>{String((row.providerConfig as Record<string, unknown> | undefined)?.name ?? row.providerConfigId ?? 'Provider')}</strong> · {String(row.quotaKind)} · requests {String(row.remainingRequests ?? 'unknown')} · tokens {String(row.remainingTokens ?? 'unknown')}<div className="text-slate-500">Captured {new Date(String(row.capturedAt)).toLocaleString()}</div></div>)}{evidence.quotas.length === 0 && <p className="text-xs text-slate-500">No quota snapshots. Quota status is unknown.</p>}</div></div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="usage" className="space-y-4">
          <Card><CardHeader><CardTitle>Company and agent usage</CardTitle><CardDescription>Per-attempt ledger with provider-reported, estimated, and confirmed cost separated. No prompt bodies are stored or returned.</CardDescription></CardHeader><CardContent className="space-y-3">
            <div className="flex flex-wrap items-end gap-3"><div className="min-w-[220px] flex-1"><Label htmlFor="usage-company">Company (all companies if none selected)</Label><select id="usage-company" className={inputClassName()} value={selectedCompanyId} onChange={(event) => setSelectedCompanyId(event.target.value)}><option value="">All companies</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></div><div className="min-w-[200px] flex-1"><Label htmlFor="usage-agent">Agent ID (optional)</Label><Input id="usage-agent" value={usageAgentId} onChange={(event) => setUsageAgentId(event.target.value)} /></div><Button onClick={() => void loadUsage()} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Load usage</Button></div>
            {usage && <>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{[
                ['Attempts', usage.totals.attempts], ['Tokens', usage.totals.totalTokens.toLocaleString()], ['Blocked / deferred', `${usage.totals.blocked} / ${usage.totals.deferred}`], ['Estimated / confirmed cost', `$${usage.totals.estimatedCostUsd.toFixed(6)} / $${usage.totals.confirmedCostUsd.toFixed(6)}`],
              ].map(([label, value]) => <div key={String(label)} className="rounded-lg border bg-slate-50 p-3"><p className="text-lg font-bold">{value}</p><p className="text-xs text-slate-500">{label}</p></div>)}</div>
              <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[900px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr>{['Company', 'Agent', 'Provider / model', 'Profile', 'Status', 'Tokens', 'Usage source', 'Cost fields', 'Time'].map((head) => <th key={head} className="p-2">{head}</th>)}</tr></thead><tbody>{usage.records.map((row) => <tr key={row.id} className="border-t"><td className="p-2 font-mono">{row.companyId ?? 'unassigned'}</td><td className="p-2 font-mono">{row.agentId ?? '—'}</td><td className="p-2">{row.provider ?? '—'} / {row.model ?? '—'}</td><td className="p-2">{row.profile}</td><td className="p-2"><Badge variant={row.status === 'success' ? 'default' : 'secondary'}>{row.status}</Badge>{row.errorCode ? <span className="ml-1 text-red-700">{row.errorCode}</span> : null}</td><td className="p-2">{row.totalTokens.toLocaleString()}</td><td className="p-2">{row.usageSource}</td><td className="p-2">est {row.estimatedCostUsd == null ? '—' : `$${row.estimatedCostUsd.toFixed(6)}`}<br />confirmed {row.confirmedCostUsd == null ? '—' : `$${row.confirmedCostUsd.toFixed(6)}`}<br />provider {row.providerReportedCostUsd == null ? '—' : `$${row.providerReportedCostUsd.toFixed(6)}`}</td><td className="p-2">{new Date(row.createdAt).toLocaleString()}</td></tr>)}{usage.records.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-slate-500">No usage records found for this filter.</td></tr>}</tbody></table></div>
              {usage.truncated && <p className="text-xs text-amber-800">Results are capped at 1,000 most recent records. Add a company or agent filter for more precise usage review.</p>}
            </>}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="chat"><Card><CardHeader><CardTitle>Super Admin Chat</CardTitle><CardDescription>This chat is audited and uses the central AI service. It does not dispatch agents, execute broadcasts, or perform operational actions.</CardDescription></CardHeader><CardContent className="min-h-[520px]"><SuperCommandingChat /></CardContent></Card></TabsContent>
      </Tabs>
      <p className="flex items-start gap-2 text-xs text-slate-500"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />A dashboard only reports state. Production readiness still requires verified provider terms, migrations validated on staging, isolation tests, a verified backup, and successful application-level tests.</p>
    </div>
  )
}
