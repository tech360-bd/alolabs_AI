'use client'

/**
 * Billing & Usage view (tenant scope) + API/Webhooks reference. Billing
 * figures come from real metering rows; provider costs stay empty until a
 * real provider reports them (never invented).
 */

import { useState } from 'react'
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Button, EmptyState, ErrorNote, InfoNote, Skeleton, TableWrap, Td, Th, useVoiceApi } from './kit'

interface FreeResourceRow {
  id: string
  name: string
  category: string
  free: 'free' | 'quota' | 'no-free-tier'
  selfHostable: boolean
  freeAllowance: string
  verifyUrl: string
  usedBy: string[]
  caveat: string
}

interface FreeResourcesResponse {
  data: FreeResourceRow[]
  total: number
  coverage: { total: number; selfHostedUnlimited: number; hostedQuota: number; paidOnly: number; caveat: string }
}

const FREE_LABEL: Record<FreeResourceRow['free'], { text: string; className: string }> = {
  free: { text: 'Self-hosted · no quota', className: 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400' },
  quota: { text: 'Hosted allowance · re-verify', className: 'border-amber-500/50 text-amber-600 dark:text-amber-400' },
  'no-free-tier': { text: 'Paid — not free', className: 'border-red-500/50 text-red-600 dark:text-red-400' },
}

interface UsageResponse {
  data: Array<{ dimension: string; total: number; simulatedTotal: number; unit: string }>
}

const ENDPOINTS: Array<[string, string, string]> = [
  ['GET /api/voice/phone-numbers', 'List phone numbers', 'POST provisions a sandbox number'],
  ['GET /api/voice/calls', 'Call history (paginated)', 'POST starts a call · PATCH answer/hold/transfer/end'],
  ['GET /api/voice/agents', 'AI voice agents', 'POST create · PATCH update'],
  ['GET /api/voice/campaigns', 'Campaigns', 'PATCH action=prepare|dial (compliance-gated)'],
  ['POST /api/voice/tts', 'Bangla TTS job', 'fails honestly without a deployed engine'],
  ['POST /api/voice/asr', 'Transcription job', 'fails honestly without a deployed engine'],
  ['GET /api/voice/usage', 'Metered usage', 'simulated usage listed separately'],
  ['GET /api/voice/presence', 'Agent presence', 'POST sets your status'],
  ['GET /api/voice/dnc', 'Do-Not-Call registry', 'POST add · DELETE only non-opt-out entries'],
  ['GET /api/voice/voices', 'Voice library', 'clones require verified consent'],
  ['GET /api/voice/consents', 'Clone consent records', 'PATCH verify/revoke — revocation is instant'],
  ['POST /api/voice/telephony/webhook', 'Provider webhook', 'x-alolabs-webhook-secret header required'],
  ['GET /api/voice/ivr', 'IVR flows', 'POST creates · PATCH action=activate · PUT validates only'],
  ['GET /api/voice/queues', 'Call queues & rosters', 'PATCH action=add_member/remove_member/update'],
  ['GET /api/voice/business-hours', 'Business hours & holidays', 'returns live open/closed evaluation'],
  ['POST /api/voice/routing', 'Inbound routing', 'dryRun:true returns the plan + reason chain'],
  ['GET /api/voice/voicemail', 'Voicemail box', 'media only when a real adapter delivered audio'],
  ['GET /api/voice/recordings', 'Recordings & transcripts', '?transcript=<id>&format=srt|vtt exports subtitles'],
  ['GET /api/voice/crm', 'Customer 360 & CSV', '?export=csv · ?duplicates= · ?contactability='],
  ['PATCH /api/voice/crm', 'CSV contact import', 'per-row report; duplicates skipped'],
  ['GET /api/voice/intelligence', 'Call intelligence', 'insights carry quoted evidence + confidence'],
  ['GET /api/voice/inbox', 'Omnichannel inbox', 'threads, timelines and templates'],
  ['POST /api/voice/inbox', 'Approve AI drafts', 'action=approve requires a human approver'],
  ['GET /api/voice/supervisor', 'Live floor & QA', 'metadata only — no live audio'],
  ['GET /api/voice/benchmarks', 'Bangla speech benchmarks', 'WER computed server-side, not client-supplied'],
  ['PUT /api/voice/pronunciation', 'Spoken-text preview', 'exact normalized text + substitution list'],
]

export default function VoiceBillingApiPanel() {
  const usage = useVoiceApi<UsageResponse>('/api/voice/usage')
  const free = useVoiceApi<FreeResourcesResponse>('/api/free-resources')
  const [showAll, setShowAll] = useState(false)
  const freeRows = free.data?.data ?? []
  const visibleFree = showAll ? freeRows : freeRows.filter((r) => r.free !== 'no-free-tier')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Billing, Usage &amp; Developer API</h2>
        <p className="text-sm text-slate-500">Real metering only. Provider costs stay empty until a real provider reports them.</p>
      </div>

      <InfoNote>
        Subscription plans, invoices and payments already run on the existing AgentOS billing system (Billing panel).
        The voice dimensions below extend that metering for calls, TTS and ASR.
      </InfoNote>

      <Card>
        <CardHeader><CardTitle className="text-base">Metered usage (all time)</CardTitle></CardHeader>
        <CardContent>
          {usage.loading ? <Skeleton className="h-32" /> : usage.error ? <ErrorNote message={usage.error} /> :
          !usage.data || usage.data.data.length === 0 ? (
            <EmptyState title="No usage recorded yet" hint="Call minutes, TTS characters and ASR seconds appear here as they are consumed." />
          ) : (
            <TableWrap>
              <thead><tr><Th>Dimension</Th><Th>Billable total</Th><Th>Unit</Th><Th>Simulated (excluded)</Th></tr></thead>
              <tbody>
                {usage.data.data.map((u) => (
                  <tr key={u.dimension}>
                    <Td className="font-medium">{u.dimension.replace(/_/g, ' ')}</Td>
                    <Td className="tabular-nums">{Math.round((u.total - u.simulatedTotal) * 100) / 100}</Td>
                    <Td>{u.unit}</Td>
                    <Td className="tabular-nums text-amber-600 dark:text-amber-400">{Math.round(u.simulatedTotal * 100) / 100}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run it at zero marginal cost</CardTitle>
          <CardDescription>
            The subset of the free-for.dev catalogue that maps onto a capability this product actually implements.
            Nothing here is enabled automatically, and every allowance must be re-verified before production use.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {free.loading ? <Skeleton className="h-32" /> : free.error ? (
            <ErrorNote message={`Could not load free resources: ${free.error}`} />
          ) : (
            <>
              {free.data && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div><div className="text-xs text-slate-500">Catalogued</div><div className="text-lg font-semibold tabular-nums">{free.data.coverage.total}</div></div>
                  <div><div className="text-xs text-slate-500">Self-hosted, no quota</div><div className="text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{free.data.coverage.selfHostedUnlimited}</div></div>
                  <div><div className="text-xs text-slate-500">Hosted allowance</div><div className="text-lg font-semibold tabular-nums text-amber-600 dark:text-amber-400">{free.data.coverage.hostedQuota}</div></div>
                  <div><div className="text-xs text-slate-500">Paid only</div><div className="text-lg font-semibold tabular-nums text-red-600 dark:text-red-400">{free.data.coverage.paidOnly}</div></div>
                </div>
              )}
              {visibleFree.length === 0 ? (
                <EmptyState title="No resources" hint="The catalogue endpoint returned nothing for this tenant." />
              ) : (
                <TableWrap>
                  <thead><tr><Th>Resource</Th><Th>Category</Th><Th>Tier</Th><Th>Free allowance</Th><Th>Wired to</Th></tr></thead>
                  <tbody>
                    {visibleFree.map((r) => (
                      <tr key={r.id}>
                        <Td className="font-medium">
                          <a href={r.verifyUrl} target="_blank" rel="noreferrer noopener" className="underline decoration-dotted underline-offset-2">
                            {r.name}
                          </a>
                        </Td>
                        <Td className="text-xs text-slate-500">{r.category}</Td>
                        <Td><Badge variant="outline" className={FREE_LABEL[r.free].className}>{FREE_LABEL[r.free].text}</Badge></Td>
                        <Td className="text-xs">
                          {r.freeAllowance}
                          <div className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">{r.caveat}</div>
                        </Td>
                        <Td className="font-mono text-[11px] text-slate-500">{r.usedBy[0]}</Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              )}
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? 'Hide paid-only entries' : 'Show paid-only entries'}
                </Button>
                <span className="text-xs text-slate-500">{visibleFree.length} of {freeRows.length} shown</span>
              </div>
              {free.data && <InfoNote>{free.data.coverage.caveat}</InfoNote>}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Developer API</CardTitle>
          <CardDescription>Session cookie or Bearer token; pass X-Company-Id to address a specific tenant. Company API keys are managed in the existing API Keys panel.</CardDescription>
        </CardHeader>
        <CardContent>
          <TableWrap>
            <thead><tr><Th>Endpoint</Th><Th>Purpose</Th><Th>Notes</Th></tr></thead>
            <tbody>
              {ENDPOINTS.map(([ep, purpose, notes]) => (
                <tr key={ep}>
                  <Td className="font-mono text-xs">{ep}</Td>
                  <Td>{purpose}</Td>
                  <Td className="text-xs text-slate-500">{notes}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </CardContent>
      </Card>
    </div>
  )
}
