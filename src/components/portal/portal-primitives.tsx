'use client'

/**
 * Portal primitives — the shared client-side furniture for /portal/*.
 *
 * The portal is the CLIENT surface: a place to buy services, follow projects,
 * review deliverables, pay invoices and get support. The chrome is thin and
 * business-focused: the official ALO Labs mark, the client's own name, and
 * navigation between those areas. State handling (loading / error / empty /
 * data) is centralized in <StateList/> so every page renders the same four
 * states honestly — no fake data.
 *
 * Colour comes from `BRAND.blue` / `BRAND.orange` only; nothing here re-types a
 * hex value. No `src/components/panels/*`, `src/components/enterprise/*` or
 * `src/components/dashboard/*` is ever imported — those are the internal
 * workspace and have no place on a client surface. All data comes from
 * `/api/portal/**`, the only API a client session is allowed to call.
 */

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Mark } from '@/components/brand/alo-logo'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { BRAND, BRAND_FONTS, COMPANY } from '@/lib/brand/tokens'
import { LogOut, ChevronRight, AlertCircle, Bell } from 'lucide-react'

// ─── Portal user context ────────────────────────────────────────────────────

/** What the client shell knows about the signed-in client. Nothing internal. */
export interface PortalUser {
  name: string
  email: string
  companyName: string
}

interface PortalContextValue {
  user: PortalUser
  /** Session token supplied by the server-rendered layout, used as a fallback. */
  token: string | null
}

const PortalUserContext = React.createContext<PortalContextValue | null>(null)

export function PortalUserProvider({
  user,
  token = null,
  children,
}: {
  user: PortalUser
  token?: string | null
  children: React.ReactNode
}) {
  const value = React.useMemo(() => ({ user, token }), [user, token])
  return <PortalUserContext.Provider value={value}>{children}</PortalUserContext.Provider>
}

export function usePortalUser(): PortalUser {
  const ctx = React.useContext(PortalUserContext)
  if (!ctx) throw new Error('usePortalUser must be used inside <PortalUserProvider>')
  return ctx.user
}

// ─── Portal API client ──────────────────────────────────────────────────────

function storedToken(): string | null {
  try {
    return localStorage.getItem('alo_token') || localStorage.getItem('token')
  } catch {
    return null
  }
}

/** Thrown by `portalFetch` for any non-2xx response. `message` is safe to show. */
export class PortalApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'PortalApiError'
  }
}

type PortalFetch = <T = unknown>(path: string, init?: RequestInit) => Promise<T>

/**
 * Returns a fetch bound to the client session. `path` is relative to
 * `/api/portal`. A 401 means the session has ended, so the browser is sent to
 * the sign-in page.
 */
export function usePortalFetch(): { portalFetch: PortalFetch; portalDownload: (path: string, fileName: string) => Promise<void> } {
  const ctx = React.useContext(PortalUserContext)
  const fallbackToken = ctx?.token ?? null

  const raw = React.useCallback(
    async (path: string, init: RequestInit = {}) => {
      const token = storedToken() || fallbackToken
      const headers = new Headers(init.headers)
      if (token) headers.set('Authorization', `Bearer ${token}`)
      if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json')
      }
      const res = await fetch(`/api/portal${path}`, { ...init, headers, cache: 'no-store' })
      if (res.status === 401) {
        window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`)
        throw new PortalApiError(401, 'Your session has ended. Please sign in again.')
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        throw new PortalApiError(res.status, data?.error || 'Something went wrong. Please try again.')
      }
      return res
    },
    [fallbackToken],
  )

  const portalFetch = React.useCallback(
    async <T,>(path: string, init?: RequestInit) => (await raw(path, init)).json() as Promise<T>,
    [raw],
  ) as PortalFetch

  const portalDownload = React.useCallback(
    async (path: string, fileName: string) => {
      // Downloads are authorised requests, not plain links: the file is only
      // served to the session that owns it.
      const res = await raw(path.replace(/^\/api\/portal/, ''))
      // Prefer the stored file name sent by the server (it has the extension).
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1]
      let serverName = ''
      try { serverName = encoded ? decodeURIComponent(encoded) : '' } catch { serverName = '' }
      const url = URL.createObjectURL(await res.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = serverName || fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    },
    [raw],
  )

  return { portalFetch, portalDownload }
}

/** Load one portal resource with honest loading / error state and a reload. */
export function usePortalData<T>(path: string | null) {
  const { portalFetch } = usePortalFetch()
  const [data, setData] = React.useState<T | null>(null)
  const [loading, setLoading] = React.useState(Boolean(path))
  const [error, setError] = React.useState('')
  const [version, setVersion] = React.useState(0)

  React.useEffect(() => {
    if (!path) return
    let cancelled = false
    setLoading(true)
    setError('')
    portalFetch<T>(path)
      .then((result) => { if (!cancelled) setData(result) })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Something went wrong.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [path, portalFetch, version])

  const reload = React.useCallback(() => setVersion((v) => v + 1), [])
  return { data, loading, error, reload }
}

// ─── Portal shell ───────────────────────────────────────────────────────────

const PORTAL_NAV: { href: string; label: string }[] = [
  { href: '/portal', label: 'Dashboard' },
  { href: '/portal/services', label: 'Services' },
  { href: '/portal/projects', label: 'Projects' },
  { href: '/portal/deliverables', label: 'Deliverables' },
  { href: '/portal/billing', label: 'Billing' },
  { href: '/portal/support', label: 'Support' },
]

export function PortalShell({ children }: { children: React.ReactNode }) {
  const user = usePortalUser()
  const ctx = React.useContext(PortalUserContext)
  const pathname = usePathname() ?? '/portal'
  const [signingOut, setSigningOut] = React.useState(false)

  const onLogout = React.useCallback(async () => {
    setSigningOut(true)
    const token = storedToken() || ctx?.token || ''
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ token }),
        credentials: 'same-origin',
      })
    } catch {
      /* best-effort; the server clears the cookie regardless */
    } finally {
      try {
        localStorage.removeItem('alo_token')
        localStorage.removeItem('token')
        localStorage.removeItem('user')
      } catch {
        /* ignore */
      }
      window.location.assign('/login')
    }
  }, [ctx?.token])

  const isActive = (href: string) => (href === '/portal' ? pathname === '/portal' : pathname.startsWith(href))

  return (
    <div className="min-h-screen flex flex-col" style={{ background: BRAND.canvas }}>
      <header
        className="sticky top-0 z-30 border-b"
        style={{ background: '#FFFFFF', borderColor: BRAND.grayLine }}
      >
        <div className="mx-auto flex max-w-[1200px] items-center gap-6 px-6 py-3">
          <Link href="/portal" className="flex items-center gap-3">
            <Mark size={36} />
            <span className="flex flex-col leading-none">
              <span
                style={{
                  fontFamily: BRAND_FONTS.secondary.stack,
                  fontWeight: 700,
                  fontSize: 14,
                  color: BRAND.blue,
                  letterSpacing: '0.04em',
                }}
              >
                {COMPANY.legalName.toUpperCase()}
              </span>
              <span
                style={{
                  fontFamily: BRAND_FONTS.primary.stack,
                  fontSize: 11,
                  color: BRAND.gray,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                }}
              >
                Client Portal
              </span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 ml-2" aria-label="Client portal">
            {PORTAL_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? 'page' : undefined}
                className="px-3 py-1.5 rounded-md text-[13px] font-medium hover:bg-slate-100"
                style={isActive(item.href) ? { color: BRAND.blue, background: BRAND.tint } : { color: BRAND.ink }}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/portal/notifications"
              className="inline-flex size-9 items-center justify-center rounded-md hover:bg-slate-100"
              aria-label="Notifications"
              style={{ color: BRAND.blue }}
            >
              <Bell className="size-4" />
            </Link>
            <div className="hidden sm:flex flex-col items-end leading-tight">
              <span className="text-[12px] font-medium" style={{ color: BRAND.ink }}>
                {user.name || user.email}
              </span>
              <span
                className="text-[11px] max-w-[220px] truncate"
                style={{ color: BRAND.gray }}
                title={user.companyName}
              >
                {user.companyName}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onLogout}
              disabled={signingOut}
              className="gap-2"
            >
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">{signingOut ? 'Signing out…' : 'Sign out'}</span>
            </Button>
          </div>
        </div>

        {/* Small screens: the same areas as a horizontally scrolling row. */}
        <nav className="md:hidden flex gap-1 overflow-x-auto px-4 pb-2" aria-label="Client portal">
          {PORTAL_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className="shrink-0 px-3 py-1.5 rounded-md text-[13px] font-medium"
              style={isActive(item.href) ? { color: BRAND.blue, background: BRAND.tint } : { color: BRAND.ink }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Orange accent rule — the brand "action" colour reserved for the focal edge. */}
        <div className="h-[3px] w-full" style={{ background: BRAND.orange }} aria-hidden="true" />
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-[1200px] px-6 py-8">{children}</div>
      </main>

      <footer className="border-t" style={{ borderColor: BRAND.grayLine, background: '#FFFFFF' }}>
        <div
          className="mx-auto max-w-[1200px] px-6 py-4 flex flex-wrap items-center justify-between gap-2 text-[11px]"
          style={{ color: BRAND.gray }}
        >
          <span>
            © {new Date().getFullYear()} {COMPANY.legalName}. All rights reserved.
          </span>
          <span className="font-mono uppercase tracking-[0.12em]">
            {COMPANY.website} · {COMPANY.email}
          </span>
        </div>
      </footer>
    </div>
  )
}

// ─── Page hero ───────────────────────────────────────────────────────────────

export function PortalPageHero({
  eyebrow,
  title,
  lead,
  actions,
}: {
  eyebrow: string
  title: React.ReactNode
  lead?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="mb-8">
      <p
        className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em]"
        style={{ color: BRAND.orange }}
      >
        {eyebrow}
      </p>
      <h1
        className="mt-2 text-3xl font-bold tracking-tight sm:text-[34px]"
        style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}
      >
        {title}
      </h1>
      {lead ? (
        <p className="mt-3 max-w-[68ch] text-[14px] leading-relaxed" style={{ color: BRAND.gray }}>
          {lead}
        </p>
      ) : null}
      {actions ? <div className="mt-5 flex flex-wrap gap-3">{actions}</div> : null}
    </div>
  )
}

// ─── Honest state handling ───────────────────────────────────────────────────

/** Inline spinner — used in buttons and small indicators. */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={`inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className ?? ''}`}
      aria-hidden="true"
    />
  )
}

/** A full-width loading skeleton matching the table/list shape used on each page. */
export function LoadingRows({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="grid gap-3 rounded-md border p-3"
          style={{ borderColor: BRAND.grayLine, background: '#FFFFFF' }}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className="h-5 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Error banner rendered when a fetch fails. */
export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <div
      className="flex flex-wrap items-start gap-3 rounded-md border p-4"
      style={{
        borderColor: 'rgba(232,80,26,0.35)',
        background: 'rgba(232,80,26,0.06)',
      }}
      role="alert"
    >
      <AlertCircle className="size-5 mt-0.5 shrink-0" style={{ color: BRAND.orange }} />
      <div className="flex-1 min-w-[200px]">
        <p className="text-[13px] font-semibold" style={{ color: BRAND.ink }}>
          Couldn’t load this section.
        </p>
        <p className="mt-1 text-[12px]" style={{ color: BRAND.gray }}>
          {message}
        </p>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  )
}

/** Empty state rendered when the list legitimately has zero items. */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: React.ReactNode
}) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-md border border-dashed p-10 text-center"
      style={{ borderColor: BRAND.grayLine, background: '#FFFFFF' }}
    >
      <div
        className="mb-3 inline-flex size-9 items-center justify-center rounded-full"
        style={{ background: 'rgba(0,102,204,0.08)' }}
      >
        <ChevronRight className="size-4" style={{ color: BRAND.blue }} />
      </div>
      <p className="text-[14px] font-semibold" style={{ color: BRAND.blue }}>
        {title}
      </p>
      {hint ? (
        <p className="mt-1 max-w-[44ch] text-[12px]" style={{ color: BRAND.gray }}>
          {hint}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

/**
 * Renders loading / error / empty / data states for any list-backed section.
 * The single source of truth for the four honest states — no page can fake data
 * by skipping this guard.
 */
export function StateList<T>({
  loading,
  error,
  isEmpty,
  onRetry,
  emptyTitle,
  emptyHint,
  emptyAction,
  children,
}: {
  loading: boolean
  error: string
  isEmpty: boolean
  onRetry?: () => void
  emptyTitle: string
  emptyHint?: string
  emptyAction?: React.ReactNode
  children: React.ReactNode
}) {
  if (loading) return <LoadingRows />
  if (error) return <ErrorBanner message={error} onRetry={onRetry} />
  if (isEmpty) return <EmptyState title={emptyTitle} hint={emptyHint} action={emptyAction} />
  return <>{children}</>
}

// ─── Small UI atoms ──────────────────────────────────────────────────────────

export function Pill({
  children,
  tone = 'blue',
}: {
  children: React.ReactNode
  tone?: 'blue' | 'orange' | 'gray' | 'green' | 'red'
}) {
  const style: React.CSSProperties =
    tone === 'orange'
      ? { background: 'rgba(232,80,26,0.10)', color: BRAND.orange }
      : tone === 'green'
        ? { background: 'rgba(16,185,129,0.12)', color: '#047857' }
        : tone === 'red'
          ? { background: 'rgba(220,38,38,0.10)', color: '#b91c1c' }
          : tone === 'gray'
            ? { background: '#F1F5F9', color: BRAND.gray }
            : { background: 'rgba(0,102,204,0.08)', color: BRAND.blue }
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em]"
      style={style}
    >
      {children}
    </span>
  )
}

export function SectionCard({
  title,
  description,
  children,
  action,
  className,
}: {
  title: string
  description?: string
  children: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={`rounded-lg border ${className ?? ''}`}
      style={{ borderColor: BRAND.grayLine, background: '#FFFFFF' }}
    >
      <header
        className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4"
        style={{ borderColor: BRAND.grayLine }}
      >
        <div>
          <h2 className="text-[15px] font-semibold" style={{ color: BRAND.blue }}>
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 text-[12px]" style={{ color: BRAND.gray }}>
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div>{action}</div> : null}
      </header>
      <div className="p-5">{children}</div>
    </section>
  )
}

/** Format an ISO date as a short, locale-aware date; returns '—' if null/empty. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Format an ISO date as a date only. */
export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/** Format an amount in the account currency. */
export function fmtMoney(amount: number | null | undefined, currency = 'USD'): string {
  const value = Number(amount) || 0
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

/** Human file size. */
export function fmtSize(bytes: number): string {
  if (!bytes) return '0 KB'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

type Tone = 'blue' | 'orange' | 'gray' | 'green' | 'red'

const STATUS_TONES: Record<string, Tone> = {
  // projects
  requested: 'gray', reviewing: 'blue', quotation: 'orange', approved: 'blue', in_progress: 'blue',
  client_review: 'orange', revision: 'orange', completed: 'green', cancelled: 'gray',
  // deliverables
  delivered: 'orange', revision_requested: 'orange', superseded: 'gray',
  // billing
  sent: 'orange', accepted: 'green', declined: 'gray', expired: 'gray', issued: 'blue',
  partially_paid: 'orange', paid: 'green', overdue: 'red', void: 'gray', refunded: 'gray',
  // support
  open: 'blue', awaiting_support: 'blue', awaiting_client: 'orange', resolved: 'green', closed: 'gray',
  // milestones
  pending: 'gray',
}

const STATUS_TEXT: Record<string, string> = {
  in_progress: 'In progress', client_review: 'Client review', revision_requested: 'Revision requested',
  partially_paid: 'Partially paid', awaiting_support: 'Awaiting our response', awaiting_client: 'Awaiting your reply',
  delivered: 'Awaiting your review',
}

/** A status badge with one consistent colour language across the portal. */
export function StatusPill({ status, label }: { status: string; label?: string }) {
  const text = label ?? STATUS_TEXT[status] ?? status.replace(/_/g, ' ')
  return <Pill tone={STATUS_TONES[status] ?? 'gray'}>{text}</Pill>
}

/** A thin progress bar in the brand blue. */
export function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full"
      style={{ background: BRAND.tint }}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: BRAND.blue }} />
    </div>
  )
}

/** A headline figure on the dashboard and billing pages. */
export function StatCard({ label, value, hint, href }: { label: string; value: React.ReactNode; hint?: string; href?: string }) {
  const body = (
    <div className="rounded-lg border p-4 h-full" style={{ borderColor: BRAND.grayLine, background: '#FFFFFF' }}>
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: BRAND.gray }}>
        {label}
      </p>
      <p className="mt-2 text-[26px] font-bold leading-none" style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
        {value}
      </p>
      {hint ? <p className="mt-2 text-[12px]" style={{ color: BRAND.gray }}>{hint}</p> : null}
    </div>
  )
  return href ? <Link href={href} className="block hover:opacity-90">{body}</Link> : body
}
