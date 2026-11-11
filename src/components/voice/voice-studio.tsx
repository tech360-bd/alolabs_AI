'use client'

/**
 * AI Voice Generation Studio (Module C) + Transcription Viewer (Module D).
 * TTS and ASR jobs with honest status: until a speech engine is deployed the
 * job fails with `no_speech_provider_configured` and the panel explains why.
 */

import { useState } from 'react'
import { Mic, Volume2 } from 'lucide-react'
import {
  Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  EmptyState, ErrorNote, InfoNote, Input, Label, SimulatedBadge, Skeleton,
  StatusBadge, TableWrap, Td, Th, Textarea, voiceMutate, useVoiceApi, fmtDate,
} from './kit'

interface TtsJobRow {
  id: string; text: string; language: string; status: string
  characters: number; durationSeconds: number | null; provider: string | null
  simulated: boolean; error: string | null; createdAt: string
}
interface AsrJobRow {
  id: string; audioStorageKey: string; language: string | null; status: string
  transcript: string | null; confidence: number | null; simulated: boolean
  error: string | null; createdAt: string
}

export default function VoiceStudioPanel() {
  const tts = useVoiceApi<{ data: TtsJobRow[] }>('/api/voice/tts')
  const asr = useVoiceApi<{ data: AsrJobRow[] }>('/api/voice/asr')
  const [tab, setTab] = useState<'tts' | 'asr'>('tts')
  const [text, setText] = useState('')
  const [audioKey, setAudioKey] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const synth = async () => {
    setBusy(true); setMsg(null)
    const res = await voiceMutate('/api/voice/tts', 'POST', { text })
    const job = (res.data as { data?: TtsJobRow; notice?: string }) ?? {}
    if (res.ok) {
      const failed = job.data?.status === 'failed'
      setMsg({ ok: !failed, text: failed ? `${job.data?.error}: ${job.notice ?? ''}` : 'Speech generated.' })
    } else {
      setMsg({ ok: false, text: res.error ?? 'Failed' })
    }
    await tts.refresh()
    setBusy(false)
  }

  const transcribe = async () => {
    setBusy(true); setMsg(null)
    const res = await voiceMutate('/api/voice/asr', 'POST', { audioStorageKey: audioKey })
    const body = (res.data as { data?: AsrJobRow; notice?: string }) ?? {}
    if (res.ok) {
      const failed = body.data?.status === 'failed'
      setMsg({ ok: !failed, text: failed ? `${body.data?.error}: ${body.notice ?? ''}` : 'Transcription completed.' })
    } else {
      setMsg({ ok: false, text: res.error ?? 'Failed' })
    }
    await asr.refresh()
    setBusy(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">AI Voice Studio — Bangla TTS &amp; Speech-to-Text</h2>
        <p className="text-sm text-slate-500">bn-BD primary · English, Hindi, Arabic extensible.</p>
      </div>

      <InfoNote>
        <strong>Honest status:</strong> the job pipeline, metering and storage are live, but no speech engine is deployed in
        this environment yet, so jobs fail with <code>no_speech_provider_configured</code> instead of producing fake audio.
        Deploy a Bangla-capable engine (see docs/BANGLA_VOICE_MODEL_EVALUATION.md) and it becomes available without code changes.
      </InfoNote>

      <div className="flex gap-2">
        <Button variant={tab === 'tts' ? 'default' : 'outline'} onClick={() => setTab('tts')} className="inline-flex items-center gap-2"><Volume2 className="h-4 w-4" /> Text-to-Speech</Button>
        <Button variant={tab === 'asr' ? 'default' : 'outline'} onClick={() => setTab('asr')} className="inline-flex items-center gap-2"><Mic className="h-4 w-4" /> Speech-to-Text</Button>
      </div>

      {msg && (msg.ok ? <InfoNote>{msg.text}</InfoNote> : <ErrorNote message={msg.text} />)}

      {tab === 'tts' ? (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Generate speech</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="tts-text">Text (Bangla supported)</Label>
                <Textarea id="tts-text" rows={4} placeholder="আসসালামু আলাইকুম, এলো ল্যাবসে স্বাগতম…" value={text} onChange={(e) => setText(e.target.value)} />
              </div>
              <Button onClick={synth} disabled={busy || !text.trim()}>Generate</Button>
            </CardContent>
          </Card>
          {tts.loading ? <Skeleton className="h-32" /> : !tts.data || tts.data.data.length === 0 ? (
            <EmptyState title="No TTS jobs yet" />
          ) : (
            <TableWrap>
              <thead><tr><Th>Text</Th><Th>Language</Th><Th>Status</Th><Th>Chars</Th><Th>Duration</Th><Th>Engine</Th><Th>Created</Th></tr></thead>
              <tbody>
                {tts.data.data.map((j) => (
                  <tr key={j.id}>
                    <Td className="max-w-72 truncate">{j.text}</Td>
                    <Td>{j.language}</Td>
                    <Td className="space-x-1"><StatusBadge status={j.status} /> {j.simulated && <SimulatedBadge />}</Td>
                    <Td className="tabular-nums">{j.characters}</Td>
                    <Td>{j.durationSeconds != null ? `${Math.round(j.durationSeconds)}s` : '—'}</Td>
                    <Td>{j.provider ?? '—'}</Td>
                    <Td>{fmtDate(j.createdAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Transcribe audio</CardTitle><CardDescription>Provide an object-storage key of the uploaded audio.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="asr-key">Audio storage key</Label>
                <Input id="asr-key" placeholder="uploads/call-recordings/rec-01.wav" value={audioKey} onChange={(e) => setAudioKey(e.target.value)} />
              </div>
              <Button onClick={transcribe} disabled={busy || !audioKey.trim()}>Transcribe</Button>
            </CardContent>
          </Card>
          {asr.loading ? <Skeleton className="h-32" /> : !asr.data || asr.data.data.length === 0 ? (
            <EmptyState title="No transcription jobs yet" />
          ) : (
            <TableWrap>
              <thead><tr><Th>Audio</Th><Th>Language</Th><Th>Status</Th><Th>Transcript</Th><Th>Confidence</Th><Th>Created</Th></tr></thead>
              <tbody>
                {asr.data.data.map((j) => (
                  <tr key={j.id}>
                    <Td className="max-w-48 truncate font-mono text-xs">{j.audioStorageKey}</Td>
                    <Td>{j.language ?? 'auto'}</Td>
                    <Td className="space-x-1"><StatusBadge status={j.status} /> {j.simulated && <SimulatedBadge />}</Td>
                    <Td className="max-w-72 truncate">{j.transcript ?? j.error ?? '—'}</Td>
                    <Td>{j.confidence != null ? `${Math.round(j.confidence * 100)}%` : '—'}</Td>
                    <Td>{fmtDate(j.createdAt)}</Td>
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
