'use client'

/**
 * Billing & Usage view (tenant scope) + API/Webhooks reference. Billing
 * figures come from real metering rows; provider costs stay empty until a
 * real provider reports them (never invented).
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, ErrorNote, InfoNote, Skeleton, TableWrap, Td, Th, useVoiceApi } from './kit'

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
