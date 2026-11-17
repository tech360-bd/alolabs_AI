'use client'

/**
 * Call Intelligence (Module J) — insight, evidence, trends, QA review.
 *
 * The panel's core rule: an insight is only shown WITH its quoted evidence and
 * its confidence. Tone is labeled "automated estimate" everywhere, per the
 * master prompt's requirement not to present sentiment as fact.
 */

import { useState } from 'react'
import { Brain, Quote, TrendingUp, Star, ShieldCheck } from 'lucide-react'
import {
  Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  EmptyState, ErrorNote, InfoNote, Input, Label, Skeleton, TableWrap, Td, Th,
  useVoiceApi, voiceMutate, fmtDate,
} from './kit'

interface CallRow { id: string; direction: string; status: string; durationSeconds: number; createdAt: string; language: string }

interface Insight {
  kind: string; label: string; value: string; confidence: number | null
  evidence: Array<{ segmentIndex: number; quote: string }>; model: string | null
}

interface CallInsightResponse {
  data: {
    call: { id: string; disposition: string | null; status: string; transferred: boolean; language: string }
    insights: Insight[]
    hasTranscript: boolean
    transcriptConfidence: number | null
    disclaimer: string
  }
}

interface TrendResponse {
  data: { trends: Array<{ key: string; kind: string; label: string; callCount: number; occurrences: number }>; periodDays: number }
}

const CRITERIA = ['greeting', 'disclosure', 'accuracy', 'empathy', 'resolution', 'compliance', 'closing'] as const

export default function VoiceIntelligencePanel() {
  const calls = useVoiceApi<{ data: CallRow[]; total: number }>('/api/voice/calls?limit=25')
  const trends = useVoiceApi<TrendResponse>('/api/voice/intelligence?days=30')
  const [selectedCall, setSelectedCall] = useState<string | null>(null)
  const detail = useVoiceApi<CallInsightResponse>(selectedCall ? `/api/voice/intelligence?callSessionId=${selectedCall}` : '/api/voice/intelligence?days=1')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [scores, setScores] = useState<Record<string, number>>({})

  const analyze = async (callSessionId: string) => {
    setBusy(true); setMsg(null)
    const res = await voiceMutate('/api/voice/intelligence', 'POST', { action: 'analyze', callSessionId })
    setMsg(res.ok ? { ok: true, text: 'Insights derived from the stored transcript.' } : { ok: false, text: res.error ?? 'Failed' })
    setSelectedCall(callSessionId)
    await detail.refresh()
    await trends.refresh()
    setBusy(false)
  }

  const submitReview = async () => {
    if (!selectedCall) return
    const filled = Object.fromEntries(Object.entries(scores).filter(([, v]) => v > 0))
    if (Object.keys(filled).length === 0) { setMsg({ ok: false, text: 'Score at least one criterion.' }); return }
    setBusy(true)
    const res = await voiceMutate('/api/voice/supervisor', 'POST', { callSessionId: selectedCall, criteria: filled })
    setMsg(res.ok ? { ok: true, text: 'QA review submitted.' } : { ok: false, text: res.error ?? 'Failed' })
    setBusy(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2"><Brain className="h-5 w-5" /> Call Intelligence</h2>
        <p className="text-sm text-slate-500">
          Insights are derived from stored transcripts and always carry the quoted evidence that produced them.
          Tone is an automated estimate of language, never a claim about the person.
        </p>
      </div>

      {msg && (msg.ok ? <InfoNote>{msg.text}</InfoNote> : <ErrorNote message={msg.text} />)}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Analyze a call</CardTitle>
            <CardDescription>Transcripts exist only for AI conversations or completed ASR jobs.</CardDescription>
          </CardHeader>
          <CardContent>
            {calls.loading ? <Skeleton className="h-32" /> : !calls.data || calls.data.data.length === 0 ? (
              <EmptyState title="No calls yet" hint="Place or receive a call, then analyze it here." />
            ) : (
              <TableWrap>
                <thead><tr><Th>When</Th><Th>Dir</Th><Th>Status</Th><Th /></tr></thead>
                <tbody>
                  {calls.data.data.map((call) => (
                    <tr key={call.id}>
                      <Td>{fmtDate(call.createdAt)}</Td>
                      <Td>{call.direction}</Td>
                      <Td>{call.status}</Td>
                      <Td>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => analyze(call.id)}>Analyze</Button>
                          <Button size="sm" variant="ghost" onClick={() => setSelectedCall(call.id)}>View</Button>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Repeated issues (30d)</CardTitle>
            <CardDescription>Intents and objections appearing across multiple calls — the fix list.</CardDescription>
          </CardHeader>
          <CardContent>
            {(trends.data?.data?.trends?.length ?? 0) === 0 ? (
              <EmptyState title="Not enough analyzed calls" hint="Trends need at least two calls sharing an intent." />
            ) : (
              <TableWrap>
                <thead><tr><Th>Insight</Th><Th>Kind</Th><Th>Calls</Th></tr></thead>
                <tbody>
                  {trends.data!.data.trends.slice(0, 12).map((trend) => (
                    <tr key={trend.key}>
                      <Td className="font-medium">{trend.label}</Td>
                      <Td><Badge variant="outline">{trend.kind.replace(/_/g, ' ')}</Badge></Td>
                      <Td className="tabular-nums">{trend.callCount}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedCall && detail.data?.data?.call && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Call {selectedCall.slice(0, 12)}…</CardTitle>
            <CardDescription>
              {detail.data.data.call.language} · disposition {detail.data.data.call.disposition ?? '—'} ·
              {detail.data.data.hasTranscript ? ' transcript available' : ' no transcript'}
              {detail.data.data.transcriptConfidence != null ? ` (ASR confidence ${detail.data.data.transcriptConfidence})` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <InfoNote>{detail.data.data.disclaimer}</InfoNote>

            {detail.data.data.insights.length === 0 ? (
              <EmptyState title="No insights yet" hint="Run Analyze to derive them from the transcript." />
            ) : (
              <div className="space-y-2">
                {detail.data.data.insights.map((insight, index) => (
                  <div key={`${insight.kind}-${index}`} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{insight.kind.replace(/_/g, ' ')}</Badge>
                      <span className="text-sm font-medium">{insight.label}</span>
                      {insight.confidence != null && (
                        <Badge variant="outline" className="ml-auto tabular-nums">
                          confidence {Math.round(insight.confidence * 100)}%
                        </Badge>
                      )}
                    </div>
                    {insight.evidence.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {insight.evidence.map((item, i) => (
                          <li key={i} className="flex gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                            <Quote className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                            <span>“{item.quote}” <span className="text-slate-400">(segment {item.segmentIndex})</span></span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {insight.kind === 'quality' && insight.value.startsWith('[') && (
                      <QualityChecks raw={insight.value} />
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-lg border p-3">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium"><Star className="h-4 w-4" /> Supervisor QA review</p>
              <div className="grid gap-2 sm:grid-cols-4">
                {CRITERIA.map((criterion) => (
                  <div key={criterion} className="space-y-1">
                    <Label htmlFor={`crit-${criterion}`} className="text-xs capitalize">{criterion}</Label>
                    <Input id={`crit-${criterion}`} type="number" min={1} max={5} value={scores[criterion] ?? ''}
                      onChange={(e) => setScores({ ...scores, [criterion]: Number(e.target.value) })} className="h-8" />
                  </div>
                ))}
              </div>
              <Button className="mt-2" size="sm" onClick={submitReview} disabled={busy}>Submit review (1–5)</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function QualityChecks({ raw }: { raw: string }) {
  let checks: Array<{ name: string; passed: boolean; detail: string }> = []
  try {
    checks = JSON.parse(raw) as typeof checks
  } catch {
    return null
  }
  return (
    <ul className="mt-2 space-y-0.5 text-xs">
      {checks.map((check) => (
        <li key={check.name} className="flex items-center gap-1.5">
          <ShieldCheck className={`h-3 w-3 ${check.passed ? 'text-emerald-500' : 'text-red-500'}`} />
          <span className={check.passed ? 'text-slate-600 dark:text-slate-300' : 'text-red-600 dark:text-red-400'}>
            {check.name.replace(/_/g, ' ')} — {check.detail}
          </span>
        </li>
      ))}
    </ul>
  )
}
