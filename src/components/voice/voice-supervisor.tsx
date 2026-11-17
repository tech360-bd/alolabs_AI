'use client'

/**
 * Supervisor Dashboard (Module G).
 *
 * Live floor (metadata only), queue depth, agent performance from real call
 * data, and QA scorecard. Deliberately does NOT show live audio/transcript of
 * in-progress calls — that requires consent the caller has not given.
 */

import { useState } from 'react'
import { Activity, Users, Headphones, BarChart3, ShieldCheck } from 'lucide-react'
import {
  Badge, Card, CardContent, CardDescription, CardHeader, CardTitle,
  EmptyState, ErrorNote, InfoNote, Skeleton, Stat, StatusBadge,
  TableWrap, Td, Th, useVoiceApi, fmtDuration,
} from './kit'

interface FloorResponse {
  data: {
    agents: Array<{
      userId: string; name: string | null; email: string | null; presence: string
      activeCalls: Array<{ callSessionId: string; status: string; direction: string; secondsOnCall: number; agentType: string }>
      callsToday: number; talkSecondsToday: number
    }>
    queues: Array<{ id: string; name: string; waiting: number; longestWaitSeconds: number; availableAgents: number }>
    totals: { activeCalls: number; waitingCalls: number; agentsAvailable: number; agentsOnCall: number }
  }
  privacy: string
}

interface PerformanceResponse {
  data: {
    agents: Array<{
      userId: string; name: string | null; callsHandled: number; answered: number
      answerRate: number | null; talkMinutes: number; averageHandleSeconds: number; transfers: number
    }>
    periodDays: number
  }
}

interface QaResponse {
  data: {
    reviewCount: number; averageScore: number | null
    byCriterion: Array<{ criterion: string; average: number; samples: number }>
    periodDays: number
  }
}

export default function VoiceSupervisorPanel() {
  const [days, setDays] = useState(30)
  const floor = useVoiceApi<FloorResponse>('/api/voice/supervisor?view=floor')
  const performance = useVoiceApi<PerformanceResponse>(`/api/voice/supervisor?view=performance&days=${days}`)
  const qa = useVoiceApi<QaResponse>(`/api/voice/supervisor?view=qa&days=${days}`)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Activity className="h-5 w-5" /> Supervisor Dashboard</h2>
          <p className="text-sm text-slate-500">Live floor state, queue depth, agent throughput and quality scores from real records.</p>
        </div>
        <div className="flex gap-1">
          {[7, 30, 90].map((option) => (
            <button key={option} type="button" onClick={() => setDays(option)}
              className={`rounded-md border px-2 py-1 text-xs ${days === option ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : ''}`}>
              {option}d
            </button>
          ))}
        </div>
      </div>

      {floor.error && <ErrorNote message={floor.error} />}
      {floor.data && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Stat label="Active calls" value={floor.data.data.totals.activeCalls} />
            <Stat label="Waiting" value={floor.data.data.totals.waitingCalls} sub="queued or ringing" />
            <Stat label="Agents available" value={floor.data.data.totals.agentsAvailable} />
            <Stat label="Agents on a call" value={floor.data.data.totals.agentsOnCall} />
          </div>
          <InfoNote>{floor.data.privacy}</InfoNote>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Live floor</CardTitle>
            </CardHeader>
            <CardContent>
              {floor.loading ? <Skeleton className="h-40" /> : floor.data.data.agents.length === 0 ? (
                <EmptyState title="No agents in this workspace" hint="Team members appear here once they exist in the tenant." />
              ) : (
                <TableWrap>
                  <thead><tr><Th>Agent</Th><Th>Presence</Th><Th>Current call</Th><Th>Today</Th><Th>Talk time today</Th></tr></thead>
                  <tbody>
                    {floor.data.data.agents.map((agent) => (
                      <tr key={agent.userId}>
                        <Td className="font-medium">{agent.name ?? <span className="font-mono text-xs">{agent.userId}</span>}</Td>
                        <Td><StatusBadge status={agent.presence} /></Td>
                        <Td>
                          {agent.activeCalls.length === 0 ? <span className="text-slate-400">—</span> : agent.activeCalls.map((call) => (
                            <span key={call.callSessionId} className="mr-1 inline-flex items-center gap-1">
                              <Badge variant="outline">{call.status.replace(/_/g, ' ')}</Badge>
                              <span className="tabular-nums text-xs">{fmtDuration(call.secondsOnCall)}</span>
                            </span>
                          ))}
                        </Td>
                        <Td className="tabular-nums">{agent.callsToday}</Td>
                        <Td className="tabular-nums">{fmtDuration(agent.talkSecondsToday)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Headphones className="h-4 w-4" /> Queues</CardTitle>
              <CardDescription>Depth and longest wait are computed from live call records.</CardDescription>
            </CardHeader>
            <CardContent>
              {floor.data.data.queues.length === 0 ? (
                <EmptyState title="No queues configured" hint="Create one in Inbound Routing → Queues." />
              ) : (
                <TableWrap>
                  <thead><tr><Th>Queue</Th><Th>Waiting</Th><Th>Longest wait</Th><Th>Available agents</Th></tr></thead>
                  <tbody>
                    {floor.data.data.queues.map((queue) => (
                      <tr key={queue.id}>
                        <Td className="font-medium">{queue.name}</Td>
                        <Td className="tabular-nums">{queue.waiting}</Td>
                        <Td className="tabular-nums">{fmtDuration(queue.longestWaitSeconds)}</Td>
                        <Td className="tabular-nums">{queue.availableAgents}</Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Agent performance ({days}d)</CardTitle>
            <CardDescription>Human-handled calls only; answered = completed.</CardDescription>
          </CardHeader>
          <CardContent>
            {performance.loading ? <Skeleton className="h-32" /> : performance.error ? (
              <ErrorNote message={`Could not load performance: ${performance.error}`} />
            ) : !performance.data || performance.data.data.agents.length === 0 ? (
              <EmptyState title="No human-handled calls yet" hint="Metrics appear when calls are assigned to agents." />
            ) : (
              <TableWrap>
                <thead><tr><Th>Agent</Th><Th>Calls</Th><Th>Answer rate</Th><Th>AHT</Th><Th>Transfers</Th></tr></thead>
                <tbody>
                  {performance.data.data.agents.map((agent) => (
                    <tr key={agent.userId}>
                      <Td className="font-medium">{agent.name ?? agent.userId.slice(0, 10)}</Td>
                      <Td className="tabular-nums">{agent.callsHandled}</Td>
                      <Td className="tabular-nums">{agent.answerRate != null ? `${agent.answerRate}%` : '—'}</Td>
                      <Td className="tabular-nums">{fmtDuration(agent.averageHandleSeconds)}</Td>
                      <Td className="tabular-nums">{agent.transfers}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Quality assurance ({days}d)</CardTitle>
            <CardDescription>Human-submitted reviews only. Automated scores live in Call Intelligence.</CardDescription>
          </CardHeader>
          <CardContent>
            {qa.loading ? <Skeleton className="h-32" /> : qa.error ? (
              <ErrorNote message={`Could not load QA reviews: ${qa.error}`} />
            ) : !qa.data || qa.data.data.reviewCount === 0 ? (
              <EmptyState title="No reviews submitted" hint="Review a call from Call Intelligence to start tracking QA." />
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded border p-2"><p className="text-xs text-slate-400">Reviews</p><p className="text-xl tabular-nums">{qa.data.data.reviewCount}</p></div>
                  <div className="rounded border p-2"><p className="text-xs text-slate-400">Average score</p><p className="text-xl tabular-nums">{qa.data.data.averageScore ?? '—'}/5</p></div>
                </div>
                <TableWrap>
                  <thead><tr><Th>Criterion</Th><Th>Average</Th><Th>Samples</Th></tr></thead>
                  <tbody>
                    {qa.data.data.byCriterion.map((row) => (
                      <tr key={row.criterion}>
                        <Td className="capitalize">{row.criterion}</Td>
                        <Td className="tabular-nums">{row.average}/5</Td>
                        <Td className="tabular-nums">{row.samples}</Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
