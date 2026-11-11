'use client'

/**
 * /portal/webhooks — manage the caller's webhook configs and view deliveries.
 *
 * Calls the existing webhook surface:
 *   - GET    /api/webhooks?company=<slug>   — list (filtered by company slug)
 *   - POST   /api/webhooks                  — register (companyId from context)
 *   - GET    /api/webhooks/deliveries?webhookId=<id>  — delivery log rows
 *
 * SECURITY NOTE: the /api/webhooks GET endpoint is NOT YET hardened like
 * /api/api-keys was in P0-A. Without `?company=<slug>`, it returns every
 * tenant's webhooks. The portal always passes the caller's company slug from
 * the server-resolved context; this fixes the exposure at the UI layer but the
 * endpoint itself should still be hardened (see report).
 *
 * Honest empty states everywhere. No fake webhooks.
 */

import * as React from 'react'
import { useApiGet } from '@/hooks/use-api-actions'
import { fetchApi, buildQueryString } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  PortalPageHero,
  SectionCard,
  StateList,
  Pill,
  Spinner,
  usePortalUser,
  fmtDate,
} from '@/components/portal/portal-primitives'
import { BRAND } from '@/lib/brand/tokens'
import { Plus, Webhook, Eye, RefreshCw, X, Check, AlertTriangle, Copy } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────

interface WebhookConfig {
  id: string
  name: string
  companyId?: string
  companyName?: string
  url: string
  events: string[]
  isActive: boolean
  lastTriggeredAt: string | null
  createdAt: string
  updatedAt?: string
}

interface WebhookListResponse {
  data: WebhookConfig[]
}

interface WebhookDeliveryRow {
  id: string
  webhookId: string
  eventId?: string | null
  payload?: string | null
  responseStatus?: number | null
  responseBody?: string | null
  durationMs?: number | null
  retryCount?: number
  success?: boolean
  createdAt: string
}

interface DeliveriesResponse {
  data: WebhookDeliveryRow[]
  total?: number
  page?: number
  limit?: number
}

interface CreateWebhookResponse {
  id: string
  name: string
  secret: string
}

const DEFAULT_EVENTS = 'task.completed,task.failed,entitlement.revoked'

// ── Page ───────────────────────────────────────────────────────────────────

export default function PortalWebhooksPage() {
  const user = usePortalUser()
  // The webhooks GET endpoint still keys off `?company=<slug>`. Without the
  // filter, it would return every tenant's webhooks — we always pass the
  // caller's slug. See the SECURITY NOTE above.
  const endpoint = React.useMemo(() => {
    if (user.companySlug) return `/api/webhooks?company=${encodeURIComponent(user.companySlug)}`
    return '/api/webhooks'
  }, [user.companySlug])

  const { data, loading, error, refresh } = useApiGet<WebhookListResponse>(endpoint)
  const webhooks = React.useMemo(() => data?.data ?? [], [data])

  const [showCreate, setShowCreate] = React.useState(false)
  const [newSecret, setNewSecret] = React.useState<{ name: string; secret: string } | null>(null)
  const [viewDeliveriesFor, setViewDeliveriesFor] = React.useState<WebhookConfig | null>(null)

  return (
    <>
      <PortalPageHero
        eyebrow="Webhooks"
        title="Outbound webhook configs"
        lead="ALO Labs posts signed events to your endpoints when tasks complete, entitlements change, or deliveries fail. Register an endpoint, then inspect every delivery attempt."
        actions={
          <Button
            size="sm"
            className="gap-2"
            onClick={() => setShowCreate((v) => !v)}
            style={{ background: BRAND.orange, color: '#FFFFFF' }}
          >
            <Plus className="size-3.5" /> Register webhook
          </Button>
        }
      />

      {/* Dismissible secret alert */}
      {newSecret ? (
        <SecretAlert
          name={newSecret.name}
          secret={newSecret.secret}
          onClose={() => setNewSecret(null)}
        />
      ) : null}

      {/* Create form */}
      {showCreate ? (
        <RegisterWebhookForm
          onSubmit={async (values) => {
            const res = await fetchApi<CreateWebhookResponse>('/api/webhooks', {
              method: 'POST',
              body: JSON.stringify({
                companyId: user.companyId,
                name: values.name,
                url: values.url,
                events: values.events,
              }),
            })
            setNewSecret({ name: res.name, secret: res.secret })
            setShowCreate(false)
            refresh()
          }}
          onCancel={() => setShowCreate(false)}
        />
      ) : null}

      {/* List */}
      <SectionCard
        title="Webhooks"
        description="Tenant-scoped to your company. Sorted newest first."
        action={
          <button
            type="button"
            onClick={refresh}
            className="text-[12px] font-semibold inline-flex items-center gap-1"
            style={{ color: BRAND.orange }}
          >
            <RefreshCw className="size-3.5" /> Refresh
          </button>
        }
      >
        <StateList
          loading={loading}
          error={error}
          isEmpty={webhooks.length === 0}
          onRetry={refresh}
          emptyTitle="No webhooks registered"
          emptyHint="Register an endpoint to start receiving signed event deliveries."
          emptyAction={
            <Button
              size="sm"
              className="gap-2"
              onClick={() => setShowCreate(true)}
              style={{ background: BRAND.orange, color: '#FFFFFF' }}
            >
              <Plus className="size-3.5" /> Register your first webhook
            </Button>
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Events</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last triggered</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {webhooks.map((wh) => (
                <TableRow key={wh.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-[13px]" style={{ color: BRAND.ink }}>
                        {wh.name}
                      </span>
                      <span className="font-mono text-[10px]" style={{ color: BRAND.graySoft }}>
                        {wh.id}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span
                      className="font-mono text-[11px] block max-w-[280px] truncate"
                      style={{ color: BRAND.ink }}
                      title={wh.url}
                    >
                      {wh.url}
                    </span>
                  </TableCell>
                  <TableCell>
                    {wh.events && wh.events.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {wh.events.map((ev) => (
                          <Pill key={ev} tone="blue">
                            {ev}
                          </Pill>
                        ))}
                      </div>
                    ) : (
                      <Pill tone="gray">no events</Pill>
                    )}
                  </TableCell>
                  <TableCell>
                    {wh.isActive ? <Pill tone="green">Active</Pill> : <Pill tone="gray">Disabled</Pill>}
                  </TableCell>
                  <TableCell className="text-[12px]" style={{ color: BRAND.gray }}>
                    {fmtDate(wh.lastTriggeredAt)}
                  </TableCell>
                  <TableCell className="text-[12px]" style={{ color: BRAND.gray }}>
                    {fmtDate(wh.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setViewDeliveriesFor(wh)}
                    >
                      <Eye className="size-3.5" />
                      <span className="hidden sm:inline">Deliveries</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </StateList>
      </SectionCard>

      {/* Deliveries drawer */}
      {viewDeliveriesFor ? (
        <DeliveriesDrawer webhook={viewDeliveriesFor} onClose={() => setViewDeliveriesFor(null)} />
      ) : null}
    </>
  )
}

// ── Register-webhook form ───────────────────────────────────────────────────

function RegisterWebhookForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (values: { name: string; url: string; events: string[] }) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = React.useState('')
  const [url, setUrl] = React.useState('')
  const [events, setEvents] = React.useState(DEFAULT_EVENTS)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState('')

  const onFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const parsedEvents = events
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (!name || !url || parsedEvents.length === 0) {
        setError('Name, URL, and at least one event are required.')
        setSubmitting(false)
        return
      }
      // Basic URL validation — the dispatcher has SSRF guards; this is a UX check.
      try {
        new URL(url)
      } catch {
        setError('Please enter a valid URL.')
        setSubmitting(false)
        return
      }
      await onSubmit({ name, url, events: parsedEvents })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SectionCard
      title="Register a new webhook"
      description="A secret is auto-generated and returned once. The dispatcher signs every payload with HMAC-SHA256."
    >
      <form onSubmit={onFormSubmit} className="space-y-4">
        <div className="grid gap-1.5">
          <Label htmlFor="wh-name">Name</Label>
          <Input
            id="wh-name"
            required
            placeholder="Production webhook"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="wh-url">URL</Label>
          <Input
            id="wh-url"
            type="url"
            required
            placeholder="https://example.com/hooks/alolabs"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <p className="text-[11px]" style={{ color: BRAND.graySoft }}>
            Must be HTTPS in production. The dispatcher runs SSRF and private-range checks.
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="wh-events">Events (comma-separated)</Label>
          <Input
            id="wh-events"
            required
            placeholder={DEFAULT_EVENTS}
            value={events}
            onChange={(e) => setEvents(e.target.value)}
          />
          <p className="text-[11px]" style={{ color: BRAND.graySoft }}>
            Common events: task.completed, task.failed, entitlement.revoked
          </p>
        </div>
        {error ? (
          <p className="text-[12px] font-mono" style={{ color: '#b91c1c' }}>
            {error}
          </p>
        ) : null}
        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={submitting} className="gap-2" style={{ background: BRAND.orange, color: '#FFFFFF' }}>
            {submitting ? <Spinner /> : <Plus className="size-3.5" />}
            Register
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        </div>
      </form>
    </SectionCard>
  )
}

// ── Deliveries drawer ───────────────────────────────────────────────────────

function DeliveriesDrawer({
  webhook,
  onClose,
}: {
  webhook: WebhookConfig
  onClose: () => void
}) {
  // Use the explicit endpoint so the drawer re-fetches when the webhook changes.
  const endpoint = React.useMemo(() => {
    const qs = buildQueryString({ webhookId: webhook.id, limit: 50 })
    return `/api/webhooks/deliveries${qs}`
  }, [webhook.id])

  const { data, loading, error, refresh } = useApiGet<DeliveriesResponse>(endpoint)
  const deliveries = React.useMemo(() => data?.data ?? [], [data])

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
      <button
        aria-label="Close deliveries panel"
        className="absolute inset-0 cursor-default"
        style={{ background: 'rgba(15,23,42,0.40)' }}
        onClick={onClose}
        type="button"
      />
      <aside
        className="relative h-full w-full max-w-[680px] overflow-y-auto border-l shadow-xl"
        style={{ background: '#FFFFFF', borderColor: BRAND.grayLine }}
      >
        <header
          className="sticky top-0 flex items-center justify-between gap-3 border-b px-5 py-3"
          style={{ borderColor: BRAND.grayLine, background: '#FFFFFF' }}
        >
          <div className="flex items-center gap-2">
            <Webhook className="size-4" style={{ color: BRAND.orange }} />
            <div className="flex flex-col leading-none">
              <span
                className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: BRAND.gray }}
              >
                Deliveries
              </span>
              <span className="mt-0.5 text-[13px] font-semibold" style={{ color: BRAND.blue }}>
                {webhook.name}
              </span>
              <span
                className="mt-0.5 font-mono text-[11px] max-w-[420px] truncate"
                style={{ color: BRAND.graySoft }}
                title={webhook.url}
              >
                {webhook.url}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={refresh}
              className="inline-flex items-center justify-center size-7 rounded-md hover:bg-slate-100"
              aria-label="Refresh deliveries"
            >
              <RefreshCw className="size-4" style={{ color: BRAND.ink }} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center size-7 rounded-md hover:bg-slate-100"
              aria-label="Close"
            >
              <X className="size-4" style={{ color: BRAND.ink }} />
            </button>
          </div>
        </header>

        <div className="p-5">
          <StateList
            loading={loading}
            error={error}
            isEmpty={deliveries.length === 0}
            onRetry={refresh}
            emptyTitle="No deliveries yet"
            emptyHint="Delivery attempts will appear here the moment ALO Labs posts an event to this webhook."
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>HTTP</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.map((d) => {
                  const ok = d.success === true
                  return (
                    <TableRow key={d.id}>
                      <TableCell>
                        <span className="font-mono text-[11px]" style={{ color: BRAND.ink }}>
                          {d.eventId || d.id}
                        </span>
                      </TableCell>
                      <TableCell>
                        {ok ? (
                          <Pill tone="green">
                            <Check className="size-3" /> Delivered
                          </Pill>
                        ) : (
                          <Pill tone="red">
                            <AlertTriangle className="size-3" /> Failed
                          </Pill>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-[12px]" style={{ color: BRAND.ink }}>
                        {d.responseStatus ?? '—'}
                      </TableCell>
                      <TableCell className="font-mono text-[12px]" style={{ color: BRAND.ink }}>
                        {d.retryCount ?? 0}
                      </TableCell>
                      <TableCell className="font-mono text-[12px]" style={{ color: BRAND.gray }}>
                        {d.durationMs != null ? `${d.durationMs}ms` : '—'}
                      </TableCell>
                      <TableCell className="text-[12px]" style={{ color: BRAND.gray }}>
                        {fmtDate(d.createdAt)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </StateList>
        </div>
      </aside>
    </div>
  )
}

// ── Secret alert ───────────────────────────────────────────────────────────

function SecretAlert({
  name,
  secret,
  onClose,
}: {
  name: string
  secret: string
  onClose: () => void
}) {
  const [copied, setCopied] = React.useState(false)
  const onCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }, [secret])

  return (
    <div
      className="mb-6 rounded-md border p-4"
      style={{
        borderColor: 'rgba(255,106,0,0.45)',
        background: 'rgba(255,106,0,0.06)',
      }}
      role="alert"
    >
      <div className="flex flex-wrap items-start gap-3">
        <AlertTriangle className="size-5 mt-0.5 shrink-0" style={{ color: BRAND.orange }} />
        <div className="flex-1 min-w-[200px]">
          <p className="text-[13px] font-semibold" style={{ color: BRAND.ink }}>
            Webhook signing secret for “{name}”
          </p>
          <p className="mt-1 text-[12px]" style={{ color: BRAND.gray }}>
            Store this in your secrets manager now. ALO Labs stores only a hash; the plaintext is shown once.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code
              className="block max-w-full overflow-x-auto rounded-md border px-3 py-2 font-mono text-[12px] break-all"
              style={{ borderColor: BRAND.grayLine, background: '#FFFFFF', color: BRAND.ink }}
            >
              {secret}
            </code>
            <Button size="sm" variant="outline" onClick={onCopy} className="gap-1.5">
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
        <Button variant="ghost" size="iconSm" onClick={onClose} aria-label="Dismiss">
          <X className="size-4" />
        </Button>
      </div>
    </div>
  )
}
