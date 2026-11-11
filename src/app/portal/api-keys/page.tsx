'use client'

/**
 * /portal/api-keys — manage the caller's company API keys.
 *
 * All writes go through the tenant-scoped surface fixed in P0-A:
 *   - GET    /api/api-keys            — list (scoped server-side to caller's company)
 *   - POST   /api/api-keys            — create (companyId resolved server-side)
 *   - PATCH  /api/api-keys/[id]       — action=revoke | action=rotate
 *
 * The plaintext key (from create or rotate) is shown ONCE in a dismissible
 * alert — never stored, never re-displayable. The page refreshes the list
 * after every mutation.
 */

import * as React from 'react'
import { useApiGet } from '@/hooks/use-api-actions'
import { fetchApi } from '@/lib/api'
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
  fmtDate,
} from '@/components/portal/portal-primitives'
import { BRAND } from '@/lib/brand/tokens'
import { Plus, RotateCw, Ban, Copy, Check, AlertTriangle, X } from 'lucide-react'

interface ApiKey {
  id: string
  name: string
  companyId: string
  companyName?: string
  companySlug?: string
  keyPrefix: string
  keySuffix?: string
  keyType: string
  scopes: string[]
  rateLimit: number
  isActive: boolean
  lastUsedAt: string | null
  rotatedAt: string | null
  expiresAt: string | null
  createdAt: string
}

interface ListResponse {
  data: ApiKey[]
}

interface CreateResponse {
  id: string
  name: string
  plainKey: string
  keyPrefix: string
}

interface RotateResponse {
  success: boolean
  id: string
  key: string
  keyPrefix: string
  rotatedAt: string
}

const SCOPE_SUGGESTIONS = ['ai:chat', 'ai:knowledge-search', 'ai:tasks', 'webhooks:read', 'webhooks:write']

export default function PortalApiKeysPage() {
  const { data, loading, error, refresh } = useApiGet<ListResponse>('/api/api-keys')
  const keys = data?.data ?? []

  // The plaintext key, when one has just been created or rotated. Dismissible.
  const [newKey, setNewKey] = React.useState<{
    label: string
    plainKey: string
    notice: string
  } | null>(null)

  // Create-form state
  const [showCreate, setShowCreate] = React.useState(false)
  const [createName, setCreateName] = React.useState('')
  const [createScopes, setCreateScopes] = React.useState('')
  const [createExpiresAt, setCreateExpiresAt] = React.useState('')
  const [creating, setCreating] = React.useState(false)
  const [createError, setCreateError] = React.useState('')

  // Per-row action state
  const [actingOn, setActingOn] = React.useState<string | null>(null)
  const [actionError, setActionError] = React.useState<{ id: string; message: string } | null>(null)

  // ── Create key ─────────────────────────────────────────────────────────
  const onCreate = React.useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setCreating(true)
      setCreateError('')
      try {
        const scopes = createScopes
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        const body: Record<string, unknown> = { name: createName, scopes }
        if (createExpiresAt) body.expiresAt = createExpiresAt
        const res = await fetchApi<CreateResponse>('/api/api-keys', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        setNewKey({
          label: res.name,
          plainKey: res.plainKey,
          notice: 'Copy your new API key now. It will not be shown again.',
        })
        setShowCreate(false)
        setCreateName('')
        setCreateScopes('')
        setCreateExpiresAt('')
        refresh()
      } catch (err) {
        setCreateError(err instanceof Error ? err.message : String(err))
      } finally {
        setCreating(false)
      }
    },
    [createName, createScopes, createExpiresAt, refresh],
  )

  // ── Revoke ──────────────────────────────────────────────────────────────
  const onRevoke = React.useCallback(
    async (id: string, name: string) => {
      if (!window.confirm(`Revoke the key "${name}"? This cannot be undone.`)) return
      setActingOn(id)
      setActionError(null)
      try {
        await fetchApi(`/api/api-keys/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ action: 'revoke' }),
        })
        refresh()
      } catch (err) {
        setActionError({
          id,
          message: err instanceof Error ? err.message : String(err),
        })
      } finally {
        setActingOn(null)
      }
    },
    [refresh],
  )

  // ── Rotate ──────────────────────────────────────────────────────────────
  const onRotate = React.useCallback(
    async (id: string, name: string) => {
      if (
        !window.confirm(
          `Rotate the key "${name}"? The old key stops working immediately and a new plaintext will be issued.`,
        )
      )
        return
      setActingOn(id)
      setActionError(null)
      try {
        const res = await fetchApi<RotateResponse>(`/api/api-keys/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ action: 'rotate' }),
        })
        setNewKey({
          label: `${name} (rotated)`,
          plainKey: res.key,
          notice: 'The previous key is now invalid. Copy the new key now — it will not be shown again.',
        })
        refresh()
      } catch (err) {
        setActionError({
          id,
          message: err instanceof Error ? err.message : String(err),
        })
      } finally {
        setActingOn(null)
      }
    },
    [refresh],
  )

  return (
    <>
      <PortalPageHero
        eyebrow="API Keys"
        title="Your company API keys"
        lead="Keys are scoped to your company and never leave this tenant. Create, rotate, or revoke them here. Plaintext is shown exactly once — copy it immediately."
        actions={
          <Button
            size="sm"
            className="gap-2"
            onClick={() => setShowCreate((v) => !v)}
            style={{ background: BRAND.orange, color: '#FFFFFF' }}
          >
            <Plus className="size-3.5" /> Create key
          </Button>
        }
      />

      {/* Dismissible plaintext-key alert */}
      {newKey ? <PlaintextKeyAlert data={newKey} onClose={() => setNewKey(null)} /> : null}

      {/* Create form */}
      {showCreate ? (
        <CreateKeyForm
          name={createName}
          scopes={createScopes}
          expiresAt={createExpiresAt}
          submitting={creating}
          error={createError}
          onName={setCreateName}
          onScopes={setCreateScopes}
          onExpiresAt={setCreateExpiresAt}
          onSubmit={onCreate}
          onCancel={() => {
            setShowCreate(false)
            setCreateError('')
          }}
        />
      ) : null}

      {/* Keys table */}
      <SectionCard
        title="Keys"
        description="Tenant-scoped to your company. Sorted newest first."
        action={
          <Button variant="outline" size="sm" onClick={refresh}>
            Refresh
          </Button>
        }
      >
        <StateList
          loading={loading}
          error={error}
          isEmpty={keys.length === 0}
          onRetry={refresh}
          emptyTitle="No API keys yet"
          emptyHint="Create your first key to start calling the ALO Labs public API."
          emptyAction={
            <Button
              size="sm"
              className="gap-2"
              onClick={() => setShowCreate(true)}
              style={{ background: BRAND.orange, color: '#FFFFFF' }}
            >
              <Plus className="size-3.5" /> Create your first key
            </Button>
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => {
                const isActing = actingOn === key.id
                const rowError = actionError && actionError.id === key.id ? actionError.message : ''
                return (
                  <TableRow key={key.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-[13px]" style={{ color: BRAND.ink }}>
                          {key.name}
                        </span>
                        <span className="font-mono text-[10px]" style={{ color: BRAND.graySoft }}>
                          {key.keyType}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-[12px]" style={{ color: BRAND.ink }}>
                        {key.keyPrefix}
                        {key.keySuffix ? `…${key.keySuffix}` : '…'}
                      </span>
                    </TableCell>
                    <TableCell>
                      {key.scopes && key.scopes.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {key.scopes.map((scope) => (
                            <Pill key={scope} tone="blue">
                              {scope}
                            </Pill>
                          ))}
                        </div>
                      ) : (
                        <Pill tone="gray">no scopes</Pill>
                      )}
                    </TableCell>
                    <TableCell>
                      {key.isActive ? <Pill tone="green">Active</Pill> : <Pill tone="red">Revoked</Pill>}
                    </TableCell>
                    <TableCell className="text-[12px]" style={{ color: BRAND.gray }}>
                      {fmtDate(key.lastUsedAt)}
                    </TableCell>
                    <TableCell className="text-[12px]" style={{ color: BRAND.gray }}>
                      {fmtDate(key.expiresAt)}
                    </TableCell>
                    <TableCell className="text-[12px]" style={{ color: BRAND.gray }}>
                      {fmtDate(key.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          disabled={isActing || !key.isActive}
                          onClick={() => onRotate(key.id, key.name)}
                          title="Rotate — issues a new plaintext, invalidates the old key"
                        >
                          {isActing ? <Spinner /> : <RotateCw className="size-3.5" />}
                          <span className="hidden sm:inline">Rotate</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          disabled={isActing || !key.isActive}
                          onClick={() => onRevoke(key.id, key.name)}
                          title="Revoke — permanently disables the key"
                          style={{ color: '#b91c1c' }}
                        >
                          <Ban className="size-3.5" />
                          <span className="hidden sm:inline">Revoke</span>
                        </Button>
                      </div>
                      {rowError ? (
                        <p className="mt-1 text-[11px] font-mono" style={{ color: '#b91c1c' }}>
                          {rowError}
                        </p>
                      ) : null}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </StateList>
      </SectionCard>
    </>
  )
}

// ─── Create-key form ──────────────────────────────────────────────────────────

function CreateKeyForm({
  name,
  scopes,
  expiresAt,
  submitting,
  error,
  onName,
  onScopes,
  onExpiresAt,
  onSubmit,
  onCancel,
}: {
  name: string
  scopes: string
  expiresAt: string
  submitting: boolean
  error: string
  onName: (v: string) => void
  onScopes: (v: string) => void
  onExpiresAt: (v: string) => void
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
}) {
  return (
    <SectionCard
      title="Create a new key"
      description="Scopes are comma-separated, e.g. ai:chat, ai:tasks. Leave expiresAt blank for no expiry."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-1.5">
          <Label htmlFor="key-name">Name</Label>
          <Input
            id="key-name"
            required
            placeholder="Production chat key"
            value={name}
            onChange={(e) => onName(e.target.value)}
            autoFocus
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="key-scopes">Scopes (comma-separated)</Label>
          <Input
            id="key-scopes"
            placeholder="ai:chat, ai:tasks"
            value={scopes}
            onChange={(e) => onScopes(e.target.value)}
          />
          <p className="text-[11px]" style={{ color: BRAND.graySoft }}>
            Suggestions: {SCOPE_SUGGESTIONS.join(' · ')}
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="key-expires">Expires at (optional)</Label>
          <Input
            id="key-expires"
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => onExpiresAt(e.target.value)}
          />
        </div>
        {error ? (
          <p className="text-[12px] font-mono" style={{ color: '#b91c1c' }}>
            {error}
          </p>
        ) : null}
        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={submitting} className="gap-2" style={{ background: BRAND.orange, color: '#FFFFFF' }}>
            {submitting ? <Spinner /> : <Plus className="size-3.5" />}
            Create key
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        </div>
      </form>
    </SectionCard>
  )
}

// ─── Plaintext key alert ──────────────────────────────────────────────────────

function PlaintextKeyAlert({
  data,
  onClose,
}: {
  data: { label: string; plainKey: string; notice: string }
  onClose: () => void
}) {
  const [copied, setCopied] = React.useState(false)

  const onCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(data.plainKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore — clipboard may be unavailable in non-secure contexts */
    }
  }, [data.plainKey])

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
            New plaintext key for “{data.label}”
          </p>
          <p className="mt-1 text-[12px]" style={{ color: BRAND.gray }}>
            {data.notice}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code
              className="block max-w-full overflow-x-auto rounded-md border px-3 py-2 font-mono text-[12px] break-all"
              style={{ borderColor: BRAND.grayLine, background: '#FFFFFF', color: BRAND.ink }}
            >
              {data.plainKey}
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
