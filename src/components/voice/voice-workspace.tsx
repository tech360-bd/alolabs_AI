'use client'

/**
 * Human Agent Workspace (Module G): presence control and personal stats,
 * plus Supervisor view (presence board). Recording/monitoring is gated by
 * consent server-side — this panel never enables it directly.
 */

import { useState } from 'react'
import { Headphones, UserCheck } from 'lucide-react'
import {
  Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  EmptyState, ErrorNote, InfoNote, Skeleton, StatusBadge,
  TableWrap, Td, Th, voiceMutate, useVoiceApi, fmtDate,
} from './kit'

interface PresenceRow { id: string; userId: string; status: string; updatedAt: string }
const STATUSES = ['available', 'busy', 'after_call_work', 'break', 'offline'] as const

export default function VoiceWorkspacePanel() {
  const { data, error, loading, refresh } = useVoiceApi<{ data: PresenceRow[] }>('/api/voice/presence')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const setStatus = async (status: string) => {
    setBusy(true); setMsg(null)
    const res = await voiceMutate('/api/voice/presence', 'POST', { status })
    setMsg(res.ok ? { ok: true, text: `You are now "${status}".` } : { ok: false, text: res.error ?? 'Failed' })
    await refresh()
    setBusy(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2"><Headphones className="h-5 w-5" /> Agent Workspace</h2>
        <p className="text-sm text-slate-500">Presence, availability and queue readiness. Real call legs arrive when a telephony provider is connected.</p>
      </div>

      <InfoNote>
        Queue routing only delivers calls to agents whose presence is <strong>available</strong>. Ring strategy and priorities
        are configured per queue by supervisors.
      </InfoNote>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><UserCheck className="h-4 w-4" /> My presence</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <Button key={s} size="sm" variant="outline" disabled={busy} onClick={() => setStatus(s)}>{s.replace(/_/g, ' ')}</Button>
          ))}
        </CardContent>
      </Card>

      {msg && (msg.ok ? <InfoNote>{msg.text}</InfoNote> : <ErrorNote message={msg.text} />)}
      {error && <ErrorNote message={error} />}

      <Card>
        <CardHeader><CardTitle className="text-base">Team presence (supervisor view)</CardTitle></CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-32" /> : !data || data.data.length === 0 ? (
            <EmptyState title="No presence records yet" hint="Agents appear here after they set their status." />
          ) : (
            <TableWrap>
              <thead><tr><Th>Agent (user id)</Th><Th>Status</Th><Th>Last update</Th></tr></thead>
              <tbody>
                {data.data.map((p) => (
                  <tr key={p.id}>
                    <Td className="font-mono text-xs">{p.userId}</Td>
                    <Td><StatusBadge status={p.status} /></Td>
                    <Td>{fmtDate(p.updatedAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
