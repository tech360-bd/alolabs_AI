'use client'

/**
 * Phone Number Manager (Module A). Lists tenant numbers and provisions
 * sandbox numbers (clearly labeled). Real PSTN provisioning is refused by the
 * API until a real SIP/carrier adapter is configured — the UI explains this.
 */

import { useState } from 'react'
import { Phone, Plus } from 'lucide-react'
import {
  Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  EmptyState, ErrorNote, InfoNote, Input, Label, SimulatedBadge, Skeleton,
  StatusBadge, TableWrap, Td, Th, voiceMutate, useVoiceApi, fmtDate,
} from './kit'

interface NumberRow {
  id: string; e164: string; label: string | null; country: string; numberType: string
  status: string; provider: string; timezone: string; recordingMode: string
  monthlyCost: number | null; createdAt: string
}

export default function VoiceNumbersPanel() {
  const { data, error, loading, refresh } = useVoiceApi<{ data: NumberRow[]; total: number }>('/api/voice/phone-numbers')
  const [e164, setE164] = useState('')
  const [label, setLabel] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const provision = async () => {
    setBusy(true)
    setMsg(null)
    const res = await voiceMutate('/api/voice/phone-numbers', 'POST', { e164, label: label || undefined })
    setMsg(res.ok
      ? { ok: true, text: String((res.data as { notice?: string })?.notice ?? 'Provisioned (sandbox).') }
      : { ok: false, text: res.error ?? 'Failed' })
    if (res.ok) { setE164(''); setLabel(''); await refresh() }
    setBusy(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Phone Number Manager</h2>
        <p className="text-sm text-slate-500">Business numbers, recording policy and timezone per number.</p>
      </div>

      <InfoNote>
        Numbers provisioned here through the <strong>sandbox</strong> provider exist only inside this platform and cannot
        place or receive real telephone calls. Real provisioning requires an authorized SIP trunk / carrier connection —
        see <em>docs/TELEPHONY_ARCHITECTURE.md</em>. No monthly cost is invented: cost stays empty until a real provider reports it.
      </InfoNote>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Plus className="h-4 w-4" /> Provision a sandbox number</CardTitle>
          <CardDescription>E.164 format, e.g. +8801712345678</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="num-e164">Number (E.164)</Label>
            <Input id="num-e164" placeholder="+8801712345678" value={e164} onChange={(e) => setE164(e.target.value)} className="w-56" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="num-label">Label (optional)</Label>
            <Input id="num-label" placeholder="Dhaka support line" value={label} onChange={(e) => setLabel(e.target.value)} className="w-56" />
          </div>
          <Button onClick={provision} disabled={busy || !e164.trim()}>Provision (sandbox)</Button>
        </CardContent>
      </Card>

      {msg && (msg.ok ? <InfoNote>{msg.text}</InfoNote> : <ErrorNote message={msg.text} />)}
      {error && <ErrorNote message={error} />}
      {loading ? <Skeleton className="h-40" /> : !data || data.data.length === 0 ? (
        <EmptyState title="No phone numbers yet" hint="Provision a sandbox number above to explore inbound/outbound flows." />
      ) : (
        <TableWrap>
          <thead>
            <tr><Th>Number</Th><Th>Label</Th><Th>Status</Th><Th>Provider</Th><Th>Timezone</Th><Th>Recording</Th><Th>Monthly cost</Th><Th>Added</Th></tr>
          </thead>
          <tbody>
            {data.data.map((n) => (
              <tr key={n.id}>
                <Td className="font-medium">{n.e164}</Td>
                <Td>{n.label ?? '—'}</Td>
                <Td><StatusBadge status={n.status} /></Td>
                <Td>{n.provider === 'sandbox' ? <span className="inline-flex items-center gap-1">sandbox <SimulatedBadge /></span> : n.provider}</Td>
                <Td>{n.timezone}</Td>
                <Td>{n.recordingMode}</Td>
                <Td>{n.monthlyCost != null ? `$${n.monthlyCost}` : '—'}</Td>
                <Td>{fmtDate(n.createdAt)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </div>
  )
}
