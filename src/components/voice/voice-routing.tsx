'use client'

/**
 * Inbound Routing Manager (Module A/E): IVR flows, call queues, ring groups,
 * business hours & holidays, plus a DRY-RUN tester so an operator can see how a
 * call would be routed before publishing it.
 *
 * Every control here writes through a validated API — an invalid IVR graph is
 * rejected server-side with the exact reason, and the panel shows it verbatim.
 */

import { useEffect, useState } from 'react'
import { GitBranch, Clock, Users, PhoneIncoming, Play, Plus, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react'
import {
  Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  EmptyState, ErrorNote, InfoNote, Input, Label, Skeleton, StatusBadge,
  TableWrap, Td, Th, Textarea, voiceMutate, useVoiceApi, fmtDate,
} from './kit'

interface IvrFlowRow {
  id: string; name: string; description: string | null; active: boolean
  entryNodeId: string | null; nodes: Array<{ id: string; type: string }>; updatedAt: string
}
interface QueueRow {
  id: string; name: string; ringStrategy: string; priority: number; maxWaitSeconds: number
  overflowVoiceAgentId: string | null
  members: Array<{ userId: string; name: string | null; presence: string; routable: boolean; priority: number }>
  availableAgents: number
}
interface HoursRow {
  id: string; name: string; timezone: string
  weeklySchedule: Array<{ day: number; open?: string; close?: string; closed?: boolean }>
  holidays: string[]
  currentStatus: { open: boolean; reason: string; localTime: string; localDate: string }
}
interface PlanResult {
  action: string; voiceAgentId?: string; queueId?: string; userId?: string
  nodeId?: string; prompt?: string; reasons: string[]; overflowed?: boolean
  businessHours: { open: boolean; reason: string; localTime: string; localDate: string }
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const DEFAULT_GRAPH = JSON.stringify({
  entryNodeId: 'greet',
  nodes: [
    { id: 'greet', type: 'greeting', prompt: 'আসসালামু আলাইকুম, ALO Labs-এ কল করার জন্য ধন্যবাদ।' },
    {
      id: 'main', type: 'menu', prompt: 'বাংলার জন্য ১, ইংরেজির জন্য ২, অপারেটরের জন্য ০ চাপুন।',
      options: [
        { digit: '1', label: 'Bengali', action: 'queue', actionTargetId: '' },
        { digit: '2', label: 'English', action: 'voice_agent', actionTargetId: '' },
        { digit: '0', label: 'Operator', action: 'voicemail' },
      ],
    },
    { id: 'bye', type: 'hangup' },
  ],
}, null, 2)

export default function VoiceRoutingPanel() {
  const flows = useVoiceApi<{ data: IvrFlowRow[] }>('/api/voice/ivr')
  const queues = useVoiceApi<{ data: QueueRow[] }>('/api/voice/queues')
  const hours = useVoiceApi<{ data: HoursRow[] }>('/api/voice/business-hours')
  const inventory = useVoiceApi<{ data: { numbers: Array<{ id: string; e164: string; status: string }>; ivrFlows: Array<{ id: string; name: string; active: boolean }> } }>('/api/voice/routing')

  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'ivr' | 'queues' | 'hours' | 'test'>('ivr')

  // IVR form
  const [ivrName, setIvrName] = useState('')
  const [graphJson, setGraphJson] = useState(DEFAULT_GRAPH)
  const [validation, setValidation] = useState<{ ok: boolean; errors: string[]; warnings: string[] } | null>(null)

  // Queue form
  const [queueName, setQueueName] = useState('')
  const [strategy, setStrategy] = useState('round_robin')
  const [memberUserId, setMemberUserId] = useState('')

  // Hours form
  const [hoursName, setHoursName] = useState('Office hours')
  const [tz, setTz] = useState('Asia/Dhaka')
  const [weekly, setWeekly] = useState(
    DAYS.map((_, day) => ({ day, open: '09:00', close: '18:00', closed: day === 0 || day === 6 })),
  )
  const [holidays, setHolidays] = useState('')

  // Routing test
  const [testNumber, setTestNumber] = useState('')
  const [testDigit, setTestDigit] = useState('')
  const [plan, setPlan] = useState<PlanResult | null>(null)

  useEffect(() => {
    const first = inventory.data?.data.numbers[0]
    if (first && !testNumber) setTestNumber(first.e164)
  }, [inventory.data, testNumber])

  const parseGraph = (): { nodes: unknown[]; entryNodeId?: string } | null => {
    try {
      const parsed = JSON.parse(graphJson) as { nodes?: unknown[]; entryNodeId?: string }
      if (!Array.isArray(parsed.nodes)) {
        setMsg({ ok: false, text: 'Graph JSON must contain a "nodes" array.' })
        return null
      }
      return { nodes: parsed.nodes, entryNodeId: parsed.entryNodeId }
    } catch (err) {
      setMsg({ ok: false, text: `JSON error: ${err instanceof Error ? err.message : 'invalid'}` })
      return null
    }
  }

  const validate = async () => {
    const graph = parseGraph()
    if (!graph) return
    // Validate WITHOUT creating: the route exposes the validator as PUT.
    const res = await voiceMutate('/api/voice/ivr', 'PUT', graph)
    if (!res.ok) { setMsg({ ok: false, text: res.error ?? 'Validation failed' }); return }
    setValidation((res.data as { data?: { ok: boolean; errors: string[]; warnings: string[] } })?.data ?? null)
  }

  const createIvr = async () => {
    const graph = parseGraph()
    if (!graph) return
    setBusy(true); setMsg(null)
    const res = await voiceMutate('/api/voice/ivr', 'POST', { name: ivrName, ...graph })
    if (res.ok) {
      const data = (res.data as { data?: { validation?: { warnings?: string[] } } })?.data
      setMsg({ ok: true, text: `IVR "${ivrName}" saved${data?.validation?.warnings?.length ? ` with ${data.validation.warnings.length} warning(s)` : ''}.` })
      setIvrName('')
      await flows.refresh()
      await inventory.refresh()
    } else setMsg({ ok: false, text: res.error ?? 'Failed' })
    setBusy(false)
  }

  const activateIvr = async (flowId: string) => {
    setBusy(true)
    const res = await voiceMutate('/api/voice/ivr', 'PATCH', { flowId, action: 'activate' })
    setMsg(res.ok ? { ok: true, text: 'IVR activated — it now answers this tenant’s inbound calls.' } : { ok: false, text: res.error ?? 'Failed' })
    await flows.refresh(); await inventory.refresh()
    setBusy(false)
  }

  const deleteIvr = async (flowId: string) => {
    setBusy(true)
    const res = await voiceMutate('/api/voice/ivr', 'DELETE', { flowId })
    setMsg(res.ok ? { ok: true, text: 'IVR deleted.' } : { ok: false, text: res.error ?? 'Failed' })
    await flows.refresh()
    setBusy(false)
  }

  const createQueue = async () => {
    setBusy(true); setMsg(null)
    const res = await voiceMutate('/api/voice/queues', 'POST', { name: queueName, ringStrategy: strategy })
    setMsg(res.ok ? { ok: true, text: `Queue "${queueName}" created. Add agents so it can ring.` } : { ok: false, text: res.error ?? 'Failed' })
    if (res.ok) setQueueName('')
    await queues.refresh()
    setBusy(false)
  }

  const addMember = async (queueId: string) => {
    if (!memberUserId.trim()) { setMsg({ ok: false, text: 'Enter a user id to add (see the members panel for ids).' }); return }
    setBusy(true)
    const res = await voiceMutate('/api/voice/queues', 'PATCH', { queueId, action: 'add_member', userId: memberUserId.trim() })
    setMsg(res.ok ? { ok: true, text: 'Agent added to queue.' } : { ok: false, text: res.error ?? 'Failed' })
    await queues.refresh()
    setBusy(false)
  }

  const createHours = async () => {
    setBusy(true); setMsg(null)
    const res = await voiceMutate('/api/voice/business-hours', 'POST', {
      name: hoursName,
      timezone: tz,
      weeklySchedule: weekly,
      holidays: holidays.split(',').map((h) => h.trim()).filter(Boolean),
    })
    setMsg(res.ok ? { ok: true, text: 'Business hours saved — after-hours routing now follows this schedule.' } : { ok: false, text: res.error ?? 'Failed' })
    await hours.refresh()
    setBusy(false)
  }

  const runTest = async () => {
    setBusy(true); setPlan(null); setMsg(null)
    const res = await voiceMutate('/api/voice/routing', 'POST', {
      toNumber: testNumber, digit: testDigit || undefined, dryRun: true,
    })
    if (res.ok) {
      const data = (res.data as { data?: { plan: PlanResult } })?.data
      setPlan(data?.plan ?? null)
    } else setMsg({ ok: false, text: res.error ?? 'Failed' })
    setBusy(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2"><GitBranch className="h-5 w-5" /> Inbound Routing</h2>
        <p className="text-sm text-slate-500">
          IVR menus, queues, business hours and dry-run routing tests. Nothing here places a real call.
        </p>
      </div>

      {msg && (msg.ok ? <InfoNote>{msg.text}</InfoNote> : <ErrorNote message={msg.text} />)}

      <div className="flex flex-wrap gap-2">
        {([
          ['ivr', 'IVR flows', GitBranch],
          ['queues', 'Queues & ring groups', Users],
          ['hours', 'Business hours', Clock],
          ['test', 'Routing test', PhoneIncoming],
        ] as const).map(([id, label, Icon]) => (
          <Button key={id} size="sm" variant={tab === id ? 'default' : 'outline'} onClick={() => setTab(id)} className="inline-flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5" /> {label}
          </Button>
        ))}
      </div>

      {/* ── IVR ─────────────────────────────────────────────────────────── */}
      {tab === 'ivr' && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Plus className="h-4 w-4" /> New IVR flow</CardTitle>
              <CardDescription>A broken graph is rejected — a caller is never routed into a dead end.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="ivr-name">Flow name</Label>
                <Input id="ivr-name" value={ivrName} onChange={(e) => setIvrName(e.target.value)} placeholder="Main reception IVR" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ivr-graph">Graph (JSON)</Label>
                <Textarea id="ivr-graph" value={graphJson} onChange={(e) => setGraphJson(e.target.value)} rows={12} className="font-mono text-xs" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={createIvr} disabled={busy || !ivrName.trim()}>Save flow</Button>
                <Button variant="outline" onClick={validate} disabled={busy}>Validate only</Button>
              </div>
              {validation && (
                <div className="space-y-1 text-xs">
                  {validation.errors.map((error, i) => (
                    <p key={i} className="flex items-center gap-1 text-red-600 dark:text-red-400"><AlertTriangle className="h-3 w-3" /> {error}</p>
                  ))}
                  {validation.warnings.map((warning, i) => (
                    <p key={i} className="flex items-center gap-1 text-amber-600 dark:text-amber-400"><AlertTriangle className="h-3 w-3" /> {warning}</p>
                  ))}
                  {validation.ok && validation.errors.length === 0 && (
                    <p className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3" /> Graph is structurally valid.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Saved flows</CardTitle></CardHeader>
            <CardContent>
              {flows.loading ? <Skeleton className="h-32" /> : !flows.data || flows.data.data.length === 0 ? (
                <EmptyState title="No IVR flows yet" hint="Create one above, then activate it. Only one flow can be active at a time." />
              ) : (
                <TableWrap>
                  <thead><tr><Th>Name</Th><Th>Nodes</Th><Th>Entry</Th><Th>Status</Th><Th>Updated</Th><Th>Actions</Th></tr></thead>
                  <tbody>
                    {flows.data.data.map((flow) => (
                      <tr key={flow.id}>
                        <Td className="font-medium">{flow.name}</Td>
                        <Td className="tabular-nums">{flow.nodes.length}</Td>
                        <Td className="font-mono text-xs">{flow.entryNodeId ?? '—'}</Td>
                        <Td>{flow.active ? <StatusBadge status="active" /> : <StatusBadge status="draft" />}</Td>
                        <Td>{fmtDate(flow.updatedAt)}</Td>
                        <Td>
                          <div className="flex gap-1">
                            {!flow.active && <Button size="sm" variant="outline" disabled={busy} onClick={() => activateIvr(flow.id)}>Activate</Button>}
                            <Button size="sm" variant="ghost" disabled={busy || flow.active} onClick={() => deleteIvr(flow.id)} aria-label="Delete flow">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Queues ──────────────────────────────────────────────────────── */}
      {tab === 'queues' && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Plus className="h-4 w-4" /> New queue</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="q-name">Queue name</Label>
                <Input id="q-name" value={queueName} onChange={(e) => setQueueName(e.target.value)} placeholder="Sales" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="q-strategy">Ring strategy</Label>
                <select id="q-strategy" value={strategy} onChange={(e) => setStrategy(e.target.value)}
                  className="h-9 w-full rounded-md border bg-transparent px-2 text-sm">
                  <option value="round_robin">Round robin</option>
                  <option value="least_recent">Least recently served</option>
                  <option value="simultaneous">Ring all simultaneously</option>
                </select>
              </div>
              <div className="flex items-end">
                <Button onClick={createQueue} disabled={busy || !queueName.trim()}>Create queue</Button>
              </div>
            </CardContent>
          </Card>

          {queues.loading ? <Skeleton className="h-40" /> : !queues.data || queues.data.data.length === 0 ? (
            <EmptyState title="No queues yet" hint="A queue rings available agents in order; if none are available it overflows to an AI agent or voicemail." />
          ) : queues.data.data.map((queue) => (
            <Card key={queue.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{queue.name}</span>
                  <Badge variant="outline">{queue.availableAgents} available / {queue.members.length} members</Badge>
                </CardTitle>
                <CardDescription>
                  {queue.ringStrategy.replace(/_/g, ' ')} · max wait {Math.round(queue.maxWaitSeconds / 60)} min ·
                  overflow: {queue.overflowVoiceAgentId ? <code className="text-xs">{queue.overflowVoiceAgentId}</code> : 'none (voicemail when empty)'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {queue.members.length === 0 ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">No members — calls to this queue will go straight to overflow.</p>
                ) : (
                  <TableWrap>
                    <thead><tr><Th>Agent</Th><Th>Presence</Th><Th>Routable</Th><Th>Priority</Th></tr></thead>
                    <tbody>
                      {queue.members.map((member) => (
                        <tr key={member.userId}>
                          <Td>{member.name ?? <span className="font-mono text-xs">{member.userId}</span>}</Td>
                          <Td><StatusBadge status={member.presence} /></Td>
                          <Td>{member.routable ? 'Yes' : 'No'}</Td>
                          <Td className="tabular-nums">{member.priority}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </TableWrap>
                )}
                <div className="flex flex-wrap items-end gap-2 pt-1">
                  <div className="space-y-1">
                    <Label htmlFor={`member-${queue.id}`}>Add agent (user id)</Label>
                    <Input id={`member-${queue.id}`} value={memberUserId} onChange={(e) => setMemberUserId(e.target.value)} placeholder="usr_…" className="w-64" />
                  </div>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => addMember(queue.id)}>Add member</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </>
      )}

      {/* ── Business hours ──────────────────────────────────────────────── */}
      {tab === 'hours' && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Business hours &amp; holidays</CardTitle>
              <CardDescription>Times are evaluated in the schedule timezone. Overnight windows are rejected.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="h-name">Schedule name</Label>
                  <Input id="h-name" value={hoursName} onChange={(e) => setHoursName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="h-tz">Timezone (IANA)</Label>
                  <Input id="h-tz" value={tz} onChange={(e) => setTz(e.target.value)} placeholder="Asia/Dhaka" />
                </div>
              </div>
              <TableWrap>
                <thead><tr><Th>Day</Th><Th>Closed</Th><Th>Opens</Th><Th>Closes</Th></tr></thead>
                <tbody>
                  {weekly.map((slot, index) => (
                    <tr key={slot.day}>
                      <Td>{DAYS[slot.day]}</Td>
                      <Td>
                        <input type="checkbox" checked={Boolean(slot.closed)} aria-label={`${DAYS[slot.day]} closed`}
                          onChange={(e) => setWeekly(weekly.map((w, i) => i === index ? { ...w, closed: e.target.checked } : w))} />
                      </Td>
                      <Td>
                        <Input value={slot.open} disabled={slot.closed} className="h-8 w-24"
                          onChange={(e) => setWeekly(weekly.map((w, i) => i === index ? { ...w, open: e.target.value } : w))} />
                      </Td>
                      <Td>
                        <Input value={slot.close} disabled={slot.closed} className="h-8 w-24"
                          onChange={(e) => setWeekly(weekly.map((w, i) => i === index ? { ...w, close: e.target.value } : w))} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
              <div className="space-y-1">
                <Label htmlFor="h-holidays">Holidays (comma-separated YYYY-MM-DD)</Label>
                <Input id="h-holidays" value={holidays} onChange={(e) => setHolidays(e.target.value)} placeholder="2026-12-16, 2027-03-26" />
              </div>
              <Button onClick={createHours} disabled={busy}>Save schedule</Button>
            </CardContent>
          </Card>

          {hours.data?.data.map((row) => (
            <Card key={row.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{row.name}</span>
                  <StatusBadge status={row.currentStatus.open ? 'active' : 'offline'} />
                </CardTitle>
                <CardDescription>
                  {row.timezone} · now {row.currentStatus.localDate} {row.currentStatus.localTime} · {row.currentStatus.reason}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">
                {row.holidays.length > 0 ? `Holidays: ${row.holidays.join(', ')}` : 'No holidays configured.'}
              </CardContent>
            </Card>
          ))}
        </>
      )}

      {/* ── Routing test ────────────────────────────────────────────────── */}
      {tab === 'test' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Play className="h-4 w-4" /> Dry-run routing</CardTitle>
            <CardDescription>
              Simulates an inbound call and returns the routing plan with its full reason chain — no call leg is created and no provider is contacted.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="t-number">Called number</Label>
                <Input id="t-number" value={testNumber} onChange={(e) => setTestNumber(e.target.value)} placeholder="+8801XXXXXXXXX" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="t-digit">IVR digit (optional)</Label>
                <Input id="t-digit" value={testDigit} onChange={(e) => setTestDigit(e.target.value)} placeholder="1" maxLength={1} />
              </div>
              <div className="flex items-end">
                <Button onClick={runTest} disabled={busy || !testNumber.trim()}>Run test</Button>
              </div>
            </div>

            {plan && (
              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-blue-500/50 text-blue-600 dark:text-blue-400">{plan.action.replace(/_/g, ' ')}</Badge>
                  {plan.voiceAgentId && <Badge variant="outline">agent {plan.voiceAgentId}</Badge>}
                  {plan.queueId && <Badge variant="outline">queue {plan.queueId}</Badge>}
                  {plan.userId && <Badge variant="outline">user {plan.userId}</Badge>}
                  {plan.overflowed && <Badge variant="outline" className="border-amber-500/50 text-amber-600">overflow</Badge>}
                </div>
                {plan.prompt && <p className="rounded bg-slate-50 p-2 text-sm dark:bg-slate-900">{plan.prompt}</p>}
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Decision chain</p>
                  <ol className="list-inside list-decimal space-y-0.5 text-xs text-slate-600 dark:text-slate-300">
                    {plan.reasons.map((reason, i) => <li key={i}>{reason}</li>)}
                  </ol>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
