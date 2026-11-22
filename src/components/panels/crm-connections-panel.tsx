'use client'

/**
 * CRM Connections — real verification and real draft runs.
 *
 * This panel replaces the previous demonstration UI. It never shows a
 * "connected" badge from a stored flag: every connection row displays the
 * persisted verdict of the last real request, and the only way to become
 * green is to re-verify against the CRM. Draft runs are queued on the durable
 * worker and their results are read back from the database (artifacts), not
 * from a local optimistic state.
 */

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CheckCircle2, XCircle, RefreshCw, Play, ShieldCheck, FileText, AlertTriangle } from 'lucide-react'

interface ConnectionRow {
  id: string
  name: string
  integrationType: string
  endpoint: string | null
  status: string
  connected: boolean
  hasSecret: boolean
  lastVerifiedAt: string | null
  capabilities: { name: string; enabled: boolean }[]
}

interface Verification {
  state: string
  message: string
  endpointHost: string | null
  httpStatus?: number
  latencyMs: number
  lastVerifiedAt: string | null
}

interface PreflightCheck {
  id: string
  label: string
  status: 'pass' | 'fail' | 'missing'
  detail: string
}

interface PreflightReport {
  preflight_status: 'ok' | 'error'
  /** Deprecated alias of workflow_execution_ready. */
  ready: boolean
  workflow_execution_ready: boolean
  checkedAt: string
  credentialId: string | null
  liveVerified: boolean
  checks: PreflightCheck[]
  missing_dependencies: { id: string; label: string; status: string; detail: string }[]
  blockers: string[]
}

interface FollowupRun {
  runId: string
  status: string
  createdAt: string
  completedAt: string | null
  provider: string | null
  model: string | null
  error: string | null
  drafts: { leadId: string; artifactId: string; checksum: string; content: string }[]
}

const TERMINAL = new Set(['completed', 'failed', 'blocked', 'timed_out', 'cancelled'])

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'connected' || status === 'completed') return 'default'
  if (status === 'authentication_failed' || status === 'permission_denied' || status === 'failed') return 'destructive'
  if (status === 'blocked' || status === 'timed_out' || status === 'unreachable' || status === 'sync_failed') return 'secondary'
  return 'outline'
}

export default function CrmConnectionsPanel() {
  const [rows, setRows] = useState<ConnectionRow[]>([])
  const [runs, setRuns] = useState<FollowupRun[]>([])
  const [preflight, setPreflight] = useState<PreflightReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const [connectionsRes, runsRes, preflightRes] = await Promise.all([
        apiFetch('/api/crm-connections'),
        apiFetch('/api/v1/crm/followup-drafts'),
        apiFetch('/api/v1/crm/preflight'),
      ])
      const connectionsJson = await connectionsRes.json()
      const runsJson = await runsRes.json()
      const preflightJson = await preflightRes.json().catch(() => null)
      setRows(Array.isArray(connectionsJson.data) ? connectionsJson.data : [])
      setRuns(Array.isArray(runsJson?.data?.runs) ? runsJson.data.runs : [])
      setPreflight(preflightJson?.data ?? null)
    } catch {
      setNotice({ tone: 'warn', text: 'Could not load CRM connections.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const act = useCallback(async (credentialId: string, action: 'test' | 'sync') => {
    setBusy(`${credentialId}-${action}`)
    try {
      const res = await apiFetch('/api/crm-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentialId, action }),
      })
      const json = await res.json()
      if (action === 'test' && json.verification) {
        const verification = json.verification as Verification
        setNotice({
          tone: verification.state === 'connected' ? 'ok' : 'warn',
          text: `${verification.state}: ${verification.message} (${verification.latencyMs} ms)`,
        })
      } else {
        setNotice({ tone: json.success ? 'ok' : 'warn', text: json.message || 'No verdict returned' })
      }
      await load()
    } finally {
      setBusy(null)
    }
  }, [load])

  const startRun = useCallback(async (credentialId: string) => {
    setBusy(`${credentialId}-run`)
    try {
      const res = await apiFetch('/api/v1/crm/followup-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentialId }),
      })
      const json = await res.json()
      const payload = json?.data ?? json
      if (res.ok && payload?.runId) {
        setNotice({ tone: 'ok', text: `Run ${payload.runId} queued. Status: ${payload.status}. This is not completion.` })
        await load()
      } else {
        setNotice({ tone: 'warn', text: payload?.error?.message || json?.error?.message || 'Run was not accepted' })
      }
    } finally {
      setBusy(null)
    }
  }, [load])

  const livePreflight = useCallback(async () => {
    setBusy('preflight')
    try {
      const id = preflight?.credentialId
      const res = await apiFetch(`/api/v1/crm/preflight?verify=1${id ? `&credentialId=${encodeURIComponent(id)}` : ''}`)
      const json = await res.json()
      const report = (json?.data ?? null) as PreflightReport | null
      if (report) {
        setPreflight(report)
        setNotice({
          tone: report.workflow_execution_ready ? 'ok' : 'warn',
          text: report.workflow_execution_ready
            ? 'Configuration complete. Real CRM + AI execution is still unproven until one run is independently verified.'
            : `External execution blocked: ${report.missing_dependencies.map((d) => d.label).join(', ')}`,
        })
      }
    } finally {
      setBusy(null)
    }
  }, [preflight])

  const refreshRun = useCallback(async () => {
    setBusy('refresh-runs')
    try { await load() } finally { setBusy(null) }
  }, [load])

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">CRM Connections</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Read-only lead access via the ALO Lead API v1 contract. A connection is healthy only when the last real
          verification succeeded; a stored URL and key are not evidence on their own.
        </p>
      </div>

      {notice && (
        <div
          className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${notice.tone === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
          role="status"
        >
          {notice.tone === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="break-words">{notice.text}</span>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Staging readiness</h2>
          <div className="flex items-center gap-2">
            {preflight && (
              <>
                <Badge variant="outline">preflight: {preflight.preflight_status}</Badge>
                <Badge variant={preflight.workflow_execution_ready ? 'default' : 'secondary'}>
                  {preflight.workflow_execution_ready ? 'execution: ready' : `execution: BLOCKED · ${preflight.missing_dependencies.length} missing`}
                </Badge>
              </>
            )}
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={livePreflight}>
              <ShieldCheck className="mr-1 h-4 w-4" />{busy === 'preflight' ? 'Checking…' : 'Run live preflight'}
            </Button>
          </div>
        </div>
        {preflight ? (
          <ul className="space-y-1 rounded-lg border p-4 text-sm">
            {preflight.checks.map((check) => (
              <li key={check.id} className="flex flex-wrap items-baseline gap-2">
                <Badge variant={check.status === 'pass' ? 'default' : check.status === 'missing' ? 'outline' : 'destructive'}>
                  {check.status}
                </Badge>
                <span className="font-medium">{check.label}</span>
                <span className="text-muted-foreground">{check.detail}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">Preflight unavailable.</div>
        )}
        <p className="text-xs text-muted-foreground">
          Preflight health only says the check ran. {preflight?.workflow_execution_ready ? '' : 'External execution: BLOCKED — '}
          a missing CRM connection, CRM URL, CRM credential, AI provider or model is listed above as a missing dependency.
          The workflow stays blocked until every dependency is present and a real run is independently verified;
          nothing is simulated.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Stored connections</h2>
        {rows.length === 0 && (
          <div className="rounded-lg border bg-muted/30 p-6 text-sm text-muted-foreground">
            No CRM connection is stored for this tenant. An administrator can add one at
            <code className="mx-1 rounded bg-background px-1">/api/company/integrations</code>
            with integration type <code className="mx-1 rounded bg-background px-1">crm.alo-lead-api</code>, a base URL and
            a read-only API key. Keys are encrypted at rest and never returned.
          </div>
        )}
        {rows.map((row) => (
          <article key={row.id} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{row.name}</h3>
                  <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.endpoint ?? 'no endpoint'} · {row.integrationType} · key {row.hasSecret ? 'stored' : 'missing'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Last successful verification: {row.lastVerifiedAt ? new Date(row.lastVerifiedAt).toLocaleString() : 'never'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => act(row.id, 'test')}>
                  <ShieldCheck className="mr-1 h-4 w-4" />
                  {busy === `${row.id}-test` ? 'Verifying…' : 'Verify now'}
                </Button>
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => act(row.id, 'sync')}>
                  <RefreshCw className="mr-1 h-4 w-4" />Read 5 leads
                </Button>
                <Button size="sm" disabled={busy !== null || !row.connected} onClick={() => startRun(row.id)}>
                  <Play className="mr-1 h-4 w-4" />
                  {busy === `${row.id}-run` ? 'Queueing…' : 'Draft follow-ups'}
                </Button>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Follow-up runs</h2>
          <Button size="sm" variant="ghost" disabled={busy !== null} onClick={refreshRun}>
            <RefreshCw className={`mr-1 h-4 w-4 ${busy === 'refresh-runs' ? 'animate-spin' : ''}`} />Refresh
          </Button>
        </div>
        {runs.length === 0 && (
          <div className="rounded-lg border bg-muted/30 p-6 text-sm text-muted-foreground">
            No follow-up run yet. A run reads five real leads, generates one Bengali draft per lead and stores every
            draft with its source record id. Nothing is sent.
          </div>
        )}
        {runs.map((run) => (
          <article key={run.runId} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
                <span className="text-sm font-medium">{run.drafts.length}/5 drafts</span>
                {run.provider && <span className="text-xs text-muted-foreground">{run.provider} · {run.model}</span>}
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(run.createdAt).toLocaleString()}
                {!TERMINAL.has(run.status) ? ' · in progress' : ''}
              </span>
            </div>
            {run.error && <p className="mt-2 text-xs text-destructive">{run.error}</p>}
            {run.drafts.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm">Show drafts and evidence</summary>
                <ul className="mt-2 space-y-2">
                  {run.drafts.map((draft) => (
                    <li key={draft.artifactId} className="rounded-md border bg-muted/20 p-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <FileText className="h-3 w-3" />
                        <span>lead {draft.leadId}</span>
                        <span>artifact {draft.artifactId}</span>
                        <span className="font-mono">{draft.checksum.slice(0, 23)}…</span>
                      </div>
                      <pre className="mt-2 whitespace-pre-wrap break-words text-sm">{draft.content}</pre>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </article>
        ))}
      </section>

      <p className="text-xs text-muted-foreground">
        <XCircle className="mr-1 inline h-3 w-3" />
        A queued or running status is not completion. Completion requires five persisted drafts whose source record ids
        match the CRM records returned by the verification read — nothing here sends WhatsApp, email or SMS.
      </p>
    </div>
  )
}
