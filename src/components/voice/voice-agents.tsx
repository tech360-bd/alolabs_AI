'use client'

/**
 * AI Voice Agent Builder (Module B). Create and configure Bangla-first voice
 * agents: greeting, instructions, fallback, escalation, working hours, max
 * duration. Conversation behavior itself runs through the orchestrator.
 */

import { useState } from 'react'
import { Bot, Plus } from 'lucide-react'
import {
  Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  EmptyState, ErrorNote, InfoNote, Input, Label, Skeleton, StatusBadge,
  TableWrap, Td, Th, voiceMutate, useVoiceApi, fmtDate,
} from './kit'

interface AgentRow {
  id: string; name: string; language: string; status: string
  greeting: string | null; fallbackMessage: string | null
  maxCallSeconds: number; createdAt: string
}

export default function VoiceAgentsPanel() {
  const { data, error, loading, refresh } = useVoiceApi<{ data: AgentRow[]; total: number }>('/api/voice/agents')
  const [form, setForm] = useState({ name: '', language: 'bn-BD', greeting: '', systemInstructions: '', fallbackMessage: '', maxCallSeconds: 600 })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const create = async () => {
    setBusy(true); setMsg(null)
    const res = await voiceMutate('/api/voice/agents', 'POST', {
      name: form.name,
      language: form.language,
      greeting: form.greeting || undefined,
      systemInstructions: form.systemInstructions || undefined,
      fallbackMessage: form.fallbackMessage || undefined,
      maxCallSeconds: Number(form.maxCallSeconds) || 600,
    })
    setMsg(res.ok ? { ok: true, text: 'Agent created (draft). Assign a phone number to make it answer calls.' } : { ok: false, text: res.error ?? 'Failed' })
    if (res.ok) { setForm({ ...form, name: '', greeting: '', systemInstructions: '', fallbackMessage: '' }); await refresh() }
    setBusy(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">AI Voice Agent Builder</h2>
        <p className="text-sm text-slate-500">Bangla-first receptionists and outbound agents with human handoff built in.</p>
      </div>

      <InfoNote>
        Mandatory handoff rules are structural: if a caller asks for a human, disputes a payment, raises a legal issue, or
        recognition fails repeatedly, the call is transferred regardless of the agent&apos;s instructions.
      </InfoNote>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Plus className="h-4 w-4" /> New AI voice agent</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="va-name">Agent name</Label>
            <Input id="va-name" placeholder="Dhaka Receptionist" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="va-lang">Language</Label>
            <Input id="va-lang" placeholder="bn-BD" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="va-greeting">Greeting (Bangla recommended)</Label>
            <Input id="va-greeting" placeholder="আসসালামু আলাইকুম! আমি আপনাকে কীভাবে সাহায্য করতে পারি?" value={form.greeting} onChange={(e) => setForm({ ...form, greeting: e.target.value })} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="va-inst">Conversation instructions</Label>
            <Input id="va-inst" placeholder="Business hours, pricing policy, escalation policy…" value={form.systemInstructions} onChange={(e) => setForm({ ...form, systemInstructions: e.target.value })} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="va-fallback">Fallback response (when confidence is low)</Label>
            <Input id="va-fallback" placeholder="দুঃখিত, আমি বুঝতে পারিনি — আমি একজন প্রতিনিধির সাথে সংযোগ করে দিচ্ছি।" value={form.fallbackMessage} onChange={(e) => setForm({ ...form, fallbackMessage: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="va-max">Max call duration (seconds)</Label>
            <Input id="va-max" type="number" value={form.maxCallSeconds} onChange={(e) => setForm({ ...form, maxCallSeconds: Number(e.target.value) })} />
          </div>
          <div className="flex items-end">
            <Button onClick={create} disabled={busy || !form.name.trim()} className="inline-flex items-center gap-2"><Bot className="h-4 w-4" /> Create agent</Button>
          </div>
        </CardContent>
      </Card>

      {msg && (msg.ok ? <InfoNote>{msg.text}</InfoNote> : <ErrorNote message={msg.text} />)}
      {error && <ErrorNote message={error} />}
      {loading ? <Skeleton className="h-40" /> : !data || data.data.length === 0 ? (
        <EmptyState title="No voice agents yet" hint="Create your first agent above — it stays in draft until you assign a phone number." />
      ) : (
        <TableWrap>
          <thead><tr><Th>Name</Th><Th>Language</Th><Th>Status</Th><Th>Greeting</Th><Th>Max duration</Th><Th>Created</Th></tr></thead>
          <tbody>
            {data.data.map((a) => (
              <tr key={a.id}>
                <Td className="font-medium">{a.name}</Td>
                <Td>{a.language}</Td>
                <Td><StatusBadge status={a.status} /></Td>
                <Td className="max-w-72 truncate">{a.greeting ?? '—'}</Td>
                <Td className="tabular-nums">{Math.floor(a.maxCallSeconds / 60)} min</Td>
                <Td>{fmtDate(a.createdAt)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </div>
  )
}
