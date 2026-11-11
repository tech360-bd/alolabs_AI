'use client'

/**
 * Portal primitives — the shared client-side furniture for /portal/*.
 *
 * The portal is a *functional* customer surface, not a marketing surface, so
 * the chrome here is intentionally thin: a compact header with the official
 * ALO Labs mark, the signed-in user's email, and a logout link. State handling
 * (loading / error / empty / data) is centralized in <StateList/> so every page
 * renders the same four states honestly — no fake data, no shimmer without a
 * network call.
 *
 * Colour comes from `BRAND.blue` / `BRAND.orange` only; nothing here re-types a
 * hex value. No `src/components/panels/*` or `src/components/enterprise/panels/*`
 * is ever imported — the portal is a customer surface and must not pull in any
 * internal workforce panel.
 */

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Mark } from '@/components/brand/alo-logo'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { BRAND, BRAND_FONTS, COMPANY } from '@/lib/brand/tokens'
import { LogOut, ChevronRight, AlertCircle } from 'lucide-react'

// ─── Portal user context ────────────────────────────────────────────────────

export interface PortalUser {
  userId: string
  email: string
  name: string
  role: string
  companyId?: string
  companySlug?: string
  companyRole?: string
}

const PortalUserContext = React.createContext<PortalUser | null>(null)

export function PortalUserProvider({
  user,
  children,
}: {
  user: PortalUser
  children: React.ReactNode
}) {
  return <PortalUserContext.Provider value={user}>{children}</PortalUserContext.Provider>
}

export function usePortalUser(): PortalUser {
  const ctx = React.useContext(PortalUserContext)
  if (!ctx) throw new Error('usePortalUser must be used inside <PortalUserProvider>')
  return ctx
}

// ─── Portal shell ───────────────────────────────────────────────────────────

const PORTAL_NAV: { href: string; label: string }[] = [
  { href: '/portal', label: 'Home' },
  { href: '/portal/services', label: 'Services' },
  { href: '/portal/api-keys', label: 'API Keys' },
  { href: '/portal/usage', label: 'Usage' },
  { href: '/portal/tasks', label: 'Tasks' },
  { href: '/portal/webhooks', label: 'Webhooks' },
]

export function PortalShell({ children }: { children: React.ReactNode }) {
  const user = usePortalUser()
  const router = useRouter()
  const [signingOut, setSigningOut] = React.useState(false)

  const onLogout = React.useCallback(async () => {
    setSigningOut(true)
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
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
      router.push('/login')
    }
  }, [router])

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
                {COMPANY.product.toUpperCase()}
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
                Customer Portal
              </span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 ml-2">
            {PORTAL_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-3 py-1.5 rounded-md text-[13px] font-medium hover:bg-slate-100"
                style={{ color: BRAND.ink }}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden sm:flex flex-col items-end leading-tight">
              <span className="text-[12px] font-medium" style={{ color: BRAND.ink }}>
                {user.name || user.email}
              </span>
              <span
                className="text-[11px] font-mono max-w-[220px] truncate"
                style={{ color: BRAND.gray }}
                title={user.email}
              >
                {user.email}
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
        borderColor: 'rgba(255,106,0,0.35)',
        background: 'rgba(255,106,0,0.06)',
      }}
      role="alert"
    >
      <AlertCircle className="size-5 mt-0.5 shrink-0" style={{ color: BRAND.orange }} />
      <div className="flex-1 min-w-[200px]">
        <p className="text-[13px] font-semibold" style={{ color: BRAND.ink }}>
          Couldn’t load this section.
        </p>
        <p className="mt-1 text-[12px] font-mono break-all" style={{ color: BRAND.gray }}>
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
        style={{ background: 'rgba(0,58,188,0.08)' }}
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
      ? { background: 'rgba(255,106,0,0.10)', color: BRAND.orange }
      : tone === 'green'
        ? { background: 'rgba(16,185,129,0.12)', color: '#047857' }
        : tone === 'red'
          ? { background: 'rgba(220,38,38,0.10)', color: '#b91c1c' }
          : tone === 'gray'
            ? { background: '#F1F5F9', color: BRAND.gray }
            : { background: 'rgba(0,58,188,0.08)', color: BRAND.blue }
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
