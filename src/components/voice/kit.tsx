'use client'

/**
 * Shared client toolkit for the Voice & Contact Center panels.
 *
 * Design rules:
 * - All data comes from the /api/voice/* routes (tenant-scoped server-side).
 * - Simulated/demo data is ALWAYS shown with a "Simulated" badge — never
 *   styled to look like production data.
 * - Unavailable capabilities (no telephony provider, no speech engine) are
 *   stated plainly instead of being hidden.
 */

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'

export { Badge, Button, Card, CardContent, CardHeader, CardTitle, CardDescription, Input, Label, Skeleton, Textarea }

export function useVoiceApi<T>(url: string) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(url, { cache: 'no-store' })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`)
      setData(body as T)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }, [url])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { data, error, loading, refresh }
}

export async function voiceMutate(url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: json?.error ?? `HTTP ${res.status}` }
    return { ok: true, data: json }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Request failed' }
  }
}

/** Badge marking sandbox/simulated records. Required on all demo data. */
export function SimulatedBadge() {
  return (
    <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400" title="Produced by the sandbox adapter — no real telephone network or speech engine was involved">
      Simulated
    </Badge>
  )
}

export function NotConnectedBadge({ label }: { label?: string }) {
  return (
    <Badge variant="outline" className="border-slate-400/50 text-slate-500">
      {label ?? 'Not connected'}
    </Badge>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400',
    completed: 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400',
    verified: 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400',
    in_progress: 'border-blue-500/50 text-blue-600 dark:text-blue-400',
    ringing: 'border-blue-500/50 text-blue-600 dark:text-blue-400',
    dialing: 'border-blue-500/50 text-blue-600 dark:text-blue-400',
    available: 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400',
    queued: 'border-amber-500/50 text-amber-600 dark:text-amber-400',
    pending: 'border-amber-500/50 text-amber-600 dark:text-amber-400',
    processing: 'border-amber-500/50 text-amber-600 dark:text-amber-400',
    draft: 'border-slate-400/50 text-slate-500',
    failed: 'border-red-500/50 text-red-600 dark:text-red-400',
    revoked: 'border-red-500/50 text-red-600 dark:text-red-400',
    cancelled: 'border-slate-400/50 text-slate-500',
    no_answer: 'border-slate-400/50 text-slate-500',
    busy: 'border-slate-400/50 text-slate-500',
    offline: 'border-slate-400/50 text-slate-500',
    dnc_blocked: 'border-red-500/50 text-red-600 dark:text-red-400',
    outside_hours: 'border-amber-500/50 text-amber-600 dark:text-amber-400',
    max_attempts: 'border-amber-500/50 text-amber-600 dark:text-amber-400',
  }
  return <Badge variant="outline" className={map[status] ?? 'border-slate-400/50 text-slate-500'}>{status.replace(/_/g, ' ')}</Badge>
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm text-red-600 dark:text-red-400">
      {message}
    </div>
  )
}

export function InfoNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-blue-500/30 bg-blue-500/5 px-3 py-2 text-sm text-blue-700 dark:text-blue-300">
      {children}
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed py-10 text-center">
      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{title}</p>
      {hint ? <p className="max-w-md text-xs text-slate-400">{hint}</p> : null}
    </div>
  )
}

export function Stat({ label, value, sub }: { label: string; value: string | number | null; sub?: string }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardDescription className="text-xs">{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value ?? '—'}</CardTitle>
      </CardHeader>
      {sub ? <CardContent className="pt-0 text-xs text-slate-400">{sub}</CardContent> : null}
    </Card>
  )
}

export function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">{children}</table>
    </div>
  )
}

export function Th({ children }: { children: React.ReactNode }) {
  return <th className="border-b bg-slate-50 px-3 py-2 text-left font-medium text-slate-500 dark:bg-slate-900 dark:text-slate-400">{children}</th>
}
export function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`border-b px-3 py-2 align-middle ${className ?? ''}`}>{children}</td>
}

/** Formats seconds as m:ss; returns '—' for null. */
export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' })
}
