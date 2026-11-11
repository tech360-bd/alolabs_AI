'use client'

/**
 * Call History & lifecycle actions (Modules A/E/F). Every action goes through
 * the state machine on the server; simulated calls are badged.
 */

import { useState } from 'react'
import { PhoneCall } from 'lucide-react'
import {
  Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  EmptyState, ErrorNote, InfoNote, Input, Label, SimulatedBadge, Skeleton,
  StatusBadge, TableWrap, Td, Th, voiceMutate, useVoiceApi, fmtDate, fmtDuration,
} from './kit'

interface CallRow {
  id: string; direction: string; channel: string; fromNumber: string; toNumber: string
  status: string; agentType: string; durationSeconds: number; disposition: string | null
  transferred: boolean; simulated: boolean; createdAt: string; endedAt: string | null
}

export default function VoiceCallsPanel() {
  const { data, error, loading, refresh } = useVoiceApi<{ data: CallRow[]; total: number }>('/api/voice/calls?limit=50')
  const [from, setFrom] = useState('+8801700000001')
  const [to, setTo] = useState('+8801712345678')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const start = async () => {
    setMsg(null)
    const res = await voiceMutate('/api/voice/calls', 'POST', { from, to, direction: 'outbound' })
    const body = (res.data as { data?: { id?: string; simulated?: boolean }; notice?: string }) ?? {}
    setMsg(res.ok
      ? { ok: true, text: `Call ${body.data?.id ?? ''} started. ${body.notice ?? ''}` }
      : { ok: false, text: res.error ?? 'Failed' })
    await refresh()
  }

  const act = async (callId: string, action: string, extra: Record<string, unknown> = {}) => {
    setBusyId(callId)
    setMsg(null)
    const res = await voiceMutate('/api/voice/calls', 'PATCH', { callId, action, ...extra })
    setMsg(res.ok ? { ok: true, text: `Action "${action}" applied.` } : { ok: false, text: res.error ?? 'Failed' })
    await refresh()
    setBusyId(null)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Call History &amp; Control</h2>
        <p className="text-sm text-slate-500">Every state change is validated and audited server-side.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Place a call (sandbox)</CardTitle>
          <CardDescription>Demonstrates the full lifecycle without touching the telephone network.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="call-from">From</Label>
            <Input id="call-from" value={from} onChange={(e) => setFrom(e.target.value)} className="w-52" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="call-to">To</Label>
            <Input id="call-to" value={to} onChange={(e) => setTo(e.target.value)} className="w-52" />
          </div>
          <Button onClick={start}>Dial (simulated)</Button>
        </CardContent>
      </Card>

      {msg && (msg.ok ? <InfoNote>{msg.text}</InfoNote> : <ErrorNote message={msg.text} />)}
      {error && <ErrorNote message={error} />}
      {loading ? <Skeleton className="h-40" /> : !data || data.data.length === 0 ? (
        <EmptyState title="No calls yet" hint="Place a sandbox call above, or connect a real provider." />
      ) : (
        <TableWrap>
          <thead>
            <tr><Th>Direction</Th><Th>From → To</Th><Th>Status</Th><Th>Agent</Th><Th>Duration</Th><Th>Placed</Th><Th>Actions</Th></tr>
          </thead>
          <tbody>
            {data.data.map((c) => (
              <tr key={c.id}>
                <Td>{c.direction}</Td>
                <Td className="font-mono text-xs">{c.fromNumber} → {c.toNumber}</Td>
                <Td className="space-x-1"><StatusBadge status={c.status} /> {c.simulated && <SimulatedBadge />}</Td>
                <Td>{c.agentType}</Td>
                <Td className="tabular-nums">{fmtDuration(c.durationSeconds)}</Td>
                <Td>{fmtDate(c.createdAt)}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {c.status === 'ringing' && <Button size="sm" variant="outline" disabled={busyId === c.id} onClick={() => act(c.id, 'answer')}>Answer</Button>}
                    {c.status === 'in_progress' && (
                      <>
                        <Button size="sm" variant="outline" disabled={busyId === c.id} onClick={() => act(c.id, 'hold')}>Hold</Button>
                        <Button size="sm" variant="outline" disabled={busyId === c.id} onClick={() => act(c.id, 'transfer', { target: 'queue-support', reason: 'manual transfer' })}>Transfer</Button>
                        <Button size="sm" variant="outline" disabled={busyId === c.id} onClick={() => act(c.id, 'end')}>End</Button>
                      </>
                    )}
                    {c.status === 'on_hold' && <Button size="sm" variant="outline" disabled={busyId === c.id} onClick={() => act(c.id, 'resume')}>Resume</Button>}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </div>
  )
}
