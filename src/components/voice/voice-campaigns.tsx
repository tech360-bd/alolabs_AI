'use client'

/**
 * Campaign Manager (Module F) + DNC registry. Prepare runs the compliance
 * gates (DNC → attempts → calling hours) server-side and shows exactly why a
 * contact was skipped; dialing only proceeds for contacts that passed.
 */

import { useState } from 'react'
import { Megaphone, PhoneOff } from 'lucide-react'
import {
  Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  EmptyState, ErrorNote, InfoNote, Input, Label, SimulatedBadge, Skeleton,
  StatusBadge, TableWrap, Td, Th, Textarea, voiceMutate, useVoiceApi, fmtDate,
} from './kit'

interface CampaignRow {
  id: string; name: string; type: string; status: string; respectDnc: boolean
  callingHours: string; maxAttemptsPerContact: number; createdAt: string
  campaignCalls: Array<{ id: string; destinationNumber: string; status: string; attempts: number; outcome: string | null }>
}
interface DncRow { id: string; phoneNumber: string; reason: string; createdAt: string }

export default function VoiceCampaignsPanel() {
  const campaigns = useVoiceApi<{ data: CampaignRow[] }>('/api/voice/campaigns')
  const dnc = useVoiceApi<{ data: DncRow[] }>('/api/voice/dnc')
  const [tab, setTab] = useState<'campaigns' | 'dnc'>('campaigns')
  const [form, setForm] = useState({ name: '', type: 'follow_up', script: '' })
  const [dncNumber, setDncNumber] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const createCampaign = async () => {
    setBusy(true); setMsg(null)
    const res = await voiceMutate('/api/voice/campaigns', 'POST', { ...form, script: form.script || undefined })
    setMsg(res.ok ? { ok: true, text: 'Campaign created as draft.' } : { ok: false, text: res.error ?? 'Failed' })
    if (res.ok) setForm({ ...form, name: '', script: '' })
    await campaigns.refresh()
    setBusy(false)
  }

  const prepare = async (campaignId: string) => {
    setBusy(true); setMsg(null)
    const res = await voiceMutate('/api/voice/campaigns', 'PATCH', {
      action: 'prepare', campaignId,
      contacts: [{ destinationNumber: '+8801712345678' }, { destinationNumber: '+8801999999999' }],
    })
    const body = res.data as { data?: Array<{ action: string; destinationNumber: string; reason: string }> } | undefined
    if (res.ok && body?.data) {
      const lines = body.data.map((r) => `${r.destinationNumber}: ${r.action} (${r.reason})`).join(' · ')
      setMsg({ ok: true, text: `Compliance check — ${lines}` })
    } else {
      setMsg({ ok: false, text: res.error ?? 'Failed' })
    }
    await campaigns.refresh()
    setBusy(false)
  }

  const addDnc = async () => {
    setBusy(true); setMsg(null)
    const res = await voiceMutate('/api/voice/dnc', 'POST', { phoneNumber: dncNumber, reason: 'customer_request' })
    setMsg(res.ok ? { ok: true, text: 'Number added to DNC. All campaigns will refuse to call it.' } : { ok: false, text: res.error ?? 'Failed' })
    if (res.ok) setDncNumber('')
    await dnc.refresh()
    setBusy(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Call Campaign Manager</h2>
        <p className="text-sm text-slate-500">Outbound campaigns with structural compliance — not an autodialer for spam.</p>
      </div>

      <InfoNote>
        Compliance is enforced in code, not policy text: DNC opt-outs (especially customer-requested) are always honored,
        calls stay inside the campaign&apos;s calling hours (default Asia/Dhaka 09:00–18:00, Fri–Tue), attempt caps and
        per-contact frequency gaps are applied, and every skipped contact is recorded with a reason.
      </InfoNote>

      <div className="flex gap-2">
        <Button variant={tab === 'campaigns' ? 'default' : 'outline'} onClick={() => setTab('campaigns')} className="inline-flex items-center gap-2"><Megaphone className="h-4 w-4" /> Campaigns</Button>
        <Button variant={tab === 'dnc' ? 'default' : 'outline'} onClick={() => setTab('dnc')} className="inline-flex items-center gap-2"><PhoneOff className="h-4 w-4" /> Do-Not-Call</Button>
      </div>

      {msg && (msg.ok ? <InfoNote>{msg.text}</InfoNote> : <ErrorNote message={msg.text} />)}

      {tab === 'campaigns' ? (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">New campaign</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="cmp-name">Name</Label>
                <Input id="cmp-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cmp-type">Type</Label>
                <Input id="cmp-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="reminder | survey | follow_up" />
              </div>
              <div className="space-y-1 md:col-span-3">
                <Label htmlFor="cmp-script">Script (AI agents read this; they never invent prices or policies)</Label>
                <Textarea id="cmp-script" rows={3} value={form.script} onChange={(e) => setForm({ ...form, script: e.target.value })} />
              </div>
              <div><Button onClick={createCampaign} disabled={busy || !form.name.trim()}>Create</Button></div>
            </CardContent>
          </Card>

          {campaigns.loading ? <Skeleton className="h-40" /> : !campaigns.data || campaigns.data.data.length === 0 ? (
            <EmptyState title="No campaigns yet" />
          ) : (
            <TableWrap>
              <thead><tr><Th>Name</Th><Th>Type</Th><Th>Status</Th><Th>DNC</Th><Th>Recent contacts</Th><Th>Actions</Th></tr></thead>
              <tbody>
                {campaigns.data.data.map((c) => (
                  <tr key={c.id}>
                    <Td className="font-medium">{c.name}</Td>
                    <Td>{c.type}</Td>
                    <Td><StatusBadge status={c.status} /></Td>
                    <Td>{c.respectDnc ? 'respected' : 'off'}</Td>
                    <Td>
                      {c.campaignCalls.length === 0 ? '—' : (
                        <div className="space-x-1">
                          {c.campaignCalls.slice(0, 4).map((cc) => (
                            <span key={cc.id} className="inline-flex items-center gap-0.5 text-xs">
                              <StatusBadge status={cc.status} />
                            </span>
                          ))}
                        </div>
                      )}
                    </Td>
                    <Td><Button size="sm" variant="outline" disabled={busy} onClick={() => prepare(c.id)}>Run compliance check</Button></Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Add a number to DNC</CardTitle><CardDescription>Customer-request opt-outs can never be removed through the API.</CardDescription></CardHeader>
            <CardContent className="flex items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="dnc-num">Phone number</Label>
                <Input id="dnc-num" placeholder="+8801712345678" value={dncNumber} onChange={(e) => setDncNumber(e.target.value)} className="w-56" />
              </div>
              <Button onClick={addDnc} disabled={busy || !dncNumber.trim()}>Add to DNC</Button>
            </CardContent>
          </Card>
          {dnc.loading ? <Skeleton className="h-32" /> : !dnc.data || dnc.data.data.length === 0 ? (
            <EmptyState title="DNC list is empty" />
          ) : (
            <TableWrap>
              <thead><tr><Th>Number</Th><Th>Reason</Th><Th>Added</Th></tr></thead>
              <tbody>
                {dnc.data.data.map((r) => (
                  <tr key={r.id}>
                    <Td className="font-mono text-xs">{r.phoneNumber}</Td>
                    <Td>{r.reason}</Td>
                    <Td>{fmtDate(r.createdAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </>
      )}
    </div>
  )
}
