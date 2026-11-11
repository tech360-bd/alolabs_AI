'use client'

/**
 * Voice & Contact Center overview — executive tenant view (Module L style,
 * tenant-scoped). Shows ONLY real database counts and honest infrastructure
 * status; every simulated figure is broken out explicitly.
 */

import { PhoneCall, Phone, Bot, Users, Megaphone, ShieldAlert } from 'lucide-react'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
  EmptyState, ErrorNote, InfoNote, SimulatedBadge, Skeleton, Stat, StatusBadge,
  TableWrap, Td, Th, fmtDuration, useVoiceApi,
} from './kit'

interface OverviewResponse {
  data: {
    numbers: { total: number; active: number }
    calls: {
      total: number; inbound: number; outbound: number; aiHandled: number; humanHandled: number
      completed: number; failed: number; successRate: number | null
      avgDurationSeconds: number | null; totalMinutes: number; simulated: number
    }
    campaigns: { total: number; active: number }
    agents: { voiceAgents: number; dncEntries: number }
    usage: Array<{ dimension: string; total: number; simulatedTotal: number; unit: string }>
    infrastructure: {
      telephonyProviders: Array<{ id: string; label: string; simulated: boolean }>
      speechEngines: {
        tts: { id: string; available: boolean; label: string }
        asr: { id: string; available: boolean; label: string }
      }
    }
    periodDays: number
  }
}

export default function VoiceOverviewPanel() {
  const { data, error, loading } = useVoiceApi<OverviewResponse>('/api/voice/overview')

  if (loading) return <div className="grid gap-4 md:grid-cols-4">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
  if (error) return <ErrorNote message={error} />
  if (!data) return <EmptyState title="No data" />

  const d = data.data
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Contact Center Overview</h2>
        <p className="text-sm text-slate-500">Last {d.periodDays} days. All figures are live database counts for your tenant.</p>
      </div>

      {d.calls.simulated > 0 && (
        <InfoNote>
          {d.calls.simulated} of {d.calls.total} calls were produced by the <strong>sandbox adapter</strong>. <SimulatedBadge /> They are test/demo records and are excluded from real billing.
        </InfoNote>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Phone numbers (active)" value={`${d.numbers.total} (${d.numbers.active})`} />
        <Stat label="Total calls" value={d.calls.total} sub={`${d.calls.inbound} inbound · ${d.calls.outbound} outbound`} />
        <Stat label="AI-handled calls" value={d.calls.aiHandled} sub={`${d.calls.humanHandled} by human agents`} />
        <Stat label="Completed / failed" value={`${d.calls.completed} / ${d.calls.failed}`} sub={d.calls.successRate != null ? `${d.calls.successRate}% success rate` : 'no completed calls yet'} />
        <Stat label="Total talk time" value={fmtDuration(d.calls.totalMinutes * 60)} sub={d.calls.avgDurationSeconds != null ? `avg ${fmtDuration(d.calls.avgDurationSeconds)} per call` : undefined} />
        <Stat label="Voice AI agents" value={d.agents.voiceAgents} />
        <Stat label="Campaigns (active)" value={`${d.campaigns.total} (${d.campaigns.active})`} />
        <Stat label="DNC entries" value={d.agents.dncEntries} sub="customer opt-outs honored automatically" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><PhoneCall className="h-4 w-4" /> Telephony providers</CardTitle>
            <CardDescription>Only a provider marked &quot;connected&quot; can touch the real telephone network.</CardDescription>
          </CardHeader>
          <CardContent>
            <TableWrap>
              <thead><tr><Th>Provider</Th><Th>Status</Th></tr></thead>
              <tbody>
                {d.infrastructure.telephonyProviders.map((p) => (
                  <tr key={p.id}>
                    <Td>{p.label}</Td>
                    <Td>{p.simulated ? <SimulatedBadge /> : <StatusBadge status="offline" />}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Speech engines (Bangla first)</CardTitle>
            <CardDescription>bn-BD is the primary product language; en / hi / ar are extensible.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span>TTS — {d.infrastructure.speechEngines.tts.label}</span>
              <StatusBadge status={d.infrastructure.speechEngines.tts.available ? 'active' : 'pending'} />
            </div>
            <div className="flex items-center justify-between">
              <span>ASR — {d.infrastructure.speechEngines.asr.label}</span>
              <StatusBadge status={d.infrastructure.speechEngines.asr.available ? 'active' : 'pending'} />
            </div>
            <p className="pt-2 text-xs text-slate-400">
              No speech engine is bundled pretending to work. Deploy a Bangla-capable engine and register it via
              <code className="mx-1 rounded bg-slate-100 px-1 dark:bg-slate-800">registerTtsEngine()</code>/
              <code className="mx-1 rounded bg-slate-100 px-1 dark:bg-slate-800">registerAsrEngine()</code>.
              Evaluation plan: docs/BANGLA_VOICE_MODEL_EVALUATION.md.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Metered usage (30 days)</CardTitle>
          <CardDescription>simulated usage is listed separately and excluded from real billing.</CardDescription>
        </CardHeader>
        <CardContent>
          {d.usage.length === 0 ? (
            <EmptyState title="No metered usage yet" hint="Usage appears here after calls, TTS or ASR jobs run." />
          ) : (
            <TableWrap>
              <thead><tr><Th>Dimension</Th><Th>Total</Th><Th>Unit</Th><Th>Of which simulated</Th></tr></thead>
              <tbody>
                {d.usage.map((u) => (
                  <tr key={u.dimension}>
                    <Td className="font-medium">{u.dimension.replace(/_/g, ' ')}</Td>
                    <Td className="tabular-nums">{Math.round(u.total * 100) / 100}</Td>
                    <Td>{u.unit}</Td>
                    <Td className="tabular-nums text-amber-600 dark:text-amber-400">{Math.round(u.simulatedTotal * 100) / 100}</Td>
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
