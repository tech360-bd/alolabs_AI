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

interface EngineInfo {
  id: string; label: string; available: boolean; local: boolean; languages: string[]; detail?: string
}
interface EngineSnapshot {
  tts: EngineInfo; asr: EngineInfo; registeredEngines: string[]; configured: boolean
}
interface TtsJobRow {
  id: string; text: string; language: string; status: string
  characters: number; durationSeconds: number | null; provider: string | null
  simulated: boolean; error: string | null; outputKey: string | null; outputFormat: string | null
  settings?: string; createdAt: string
}
interface TtsResult {
  status: string; chunks: number; normalizedText?: string
  substitutions?: Array<{ from: string; to: string; rule: string }>; error?: string
  outputKey?: string; durationSeconds?: number
}
interface AsrJobRow {
  id: string; audioStorageKey: string; language: string | null; status: string
  transcript: string | null; confidence: number | null; simulated: boolean
  error: string | null; createdAt: string
}

export default function VoiceStudioPanel() {
  const tts = useVoiceApi<{ data: TtsJobRow[]; engines: EngineSnapshot }>('/api/voice/tts')
  const asr = useVoiceApi<{ data: AsrJobRow[]; engines: EngineSnapshot }>('/api/voice/asr')
  const [tab, setTab] = useState<'tts' | 'asr'>('tts')
  const [text, setText] = useState('')
  const [audioKey, setAudioKey] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [language, setLanguage] = useState('bn-BD')
  const [speed, setSpeed] = useState(1)
  const [format, setFormat] = useState<'mp3' | 'wav'>('mp3')
  const [lastResult, setLastResult] = useState<TtsResult | null>(null)
  const [preview, setPreview] = useState<{ text: string; substitutions: Array<{ from: string; to: string; rule: string }> } | null>(null)

  const synth = async () => {
    setBusy(true); setMsg(null)
    const res = await voiceMutate('/api/voice/tts', 'POST', { text, language, settings: { speed, format } })
    const body = (res.data as { data?: { job?: TtsJobRow; result?: TtsResult }; notice?: string }) ?? {}
    const result = body.data?.result
    setLastResult(result ?? null)
    if (res.ok) {
      const failed = result?.status === 'failed'
      setMsg({ ok: !failed, text: failed ? `${result?.error}: ${body.notice ?? ''}` : (body.notice ?? 'Speech generated.') })
    } else {
      setMsg({ ok: false, text: res.error ?? 'Failed' })
    }
    await tts.refresh()
    setBusy(false)
  }

  const previewNormalization = async () => {
    setBusy(true); setPreview(null)
    const res = await voiceMutate('/api/voice/pronunciation', 'PUT', { text, language })
    if (res.ok) setPreview((res.data as { data?: { text: string; substitutions: Array<{ from: string; to: string; rule: string }> } }).data ?? null)
    else setMsg({ ok: false, text: res.error ?? 'Failed' })
    setBusy(false)
  }

  const transcribe = async () => {
    setBusy(true); setMsg(null)
    const res = await voiceMutate('/api/voice/asr', 'POST', { audioStorageKey: audioKey, language })
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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Engine status</CardTitle>
          <CardDescription>
            An engine is registered only from configuration; a job never returns synthetic audio.
            Configure <code>VOICE_TTS_PROVIDER</code>/<code>VOICE_TTS_BASE_URL</code> (and the ASR equivalents) to enable.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 text-sm">
          {[['Text-to-speech', tts.data?.engines?.tts], ['Speech-to-text', asr.data?.engines?.asr]].map(([label, engine]) => {
            const info = engine as EngineInfo | undefined
            return (
              <div key={String(label)} className="flex items-start justify-between gap-2 rounded border p-2">
                <div>
                  <p className="font-medium">{String(label)}</p>
                  <p className="text-xs text-slate-500">{info ? `${info.label} · ${info.local ? 'local' : 'remote'} · ${info.languages.join(', ')}` : 'not reported'}</p>
                  {info?.detail && <p className="text-xs text-amber-600 dark:text-amber-400">{info.detail}</p>}
                </div>
                <StatusBadge status={info?.available ? 'active' : 'pending'} />
              </div>
            )
          })}
        </CardContent>
      </Card>

      {!tts.data?.engines?.tts?.available && (
        <InfoNote>
          <strong>Honest status:</strong> the job pipeline, normalization, metering and storage are live, but no speech engine is
          reachable in this environment, so jobs fail with <code>no_speech_provider_configured</code> instead of producing fake
          audio. Deploy a Bangla-capable engine (see docs/BANGLA_VOICE_MODEL_EVALUATION.md) and it is picked up without code changes.
        </InfoNote>
      )}

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
                <Textarea id="tts-text" rows={4} placeholder="আসসালামু আলাইকুম, আপনার বিল ৳1,250.50 এবং তারিখ 2026-11-17…" value={text} onChange={(e) => setText(e.target.value)} />
                <p className="text-xs text-slate-400">
                  Numbers, currency, dates, times and phone numbers are converted to Bangla words before synthesis; your
                  pronunciation dictionary is applied first.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="tts-lang">Language</Label>
                  <select id="tts-lang" value={language} onChange={(e) => setLanguage(e.target.value)}
                    className="h-9 w-full rounded-md border bg-transparent px-2 text-sm">
                    <option value="bn-BD">bn-BD (Bangladesh Bangla)</option>
                    <option value="bn-IN">bn-IN</option>
                    <option value="en-US">en-US</option>
                    <option value="hi-IN">hi-IN</option>
                    <option value="ar-SA">ar-SA</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="tts-speed">Speed ({speed.toFixed(2)}×)</Label>
                  <input id="tts-speed" type="range" min={0.5} max={2} step={0.05} value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))} className="w-full" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="tts-format">Format</Label>
                  <select id="tts-format" value={format} onChange={(e) => setFormat(e.target.value as 'mp3' | 'wav')}
                    className="h-9 w-full rounded-md border bg-transparent px-2 text-sm">
                    <option value="mp3">MP3</option><option value="wav">WAV</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={synth} disabled={busy || !text.trim()}>Generate speech</Button>
                <Button variant="outline" onClick={previewNormalization} disabled={busy || !text.trim()}>Preview spoken text</Button>
              </div>
              {preview && (
                <div className="space-y-1 rounded border p-2 text-xs">
                  <p className="font-semibold uppercase tracking-wide text-slate-400">Exact text sent to the engine</p>
                  <p className="whitespace-pre-wrap">{preview.text}</p>
                  {preview.substitutions.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-slate-500">
                      {preview.substitutions.slice(0, 8).map((sub, i) => (
                        <li key={i}>{sub.rule}: “{sub.from}” → “{sub.to}”</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {lastResult && lastResult.status === 'completed' && lastResult.outputKey && (
                <div className="rounded border p-2 text-xs">
                  <p className="mb-1">Rendered in {lastResult.chunks} chunk(s) · {lastResult.durationSeconds ?? 0}s</p>
                  <audio controls src={`/api/storage/files/${encodeURIComponent(lastResult.outputKey)}`} className="w-full" />
                </div>
              )}
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
