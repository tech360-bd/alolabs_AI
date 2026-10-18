'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ImageIcon, Video, Music, Mic, Sparkles, Loader2, ExternalLink } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { toast } from 'sonner'

type Kind = 'image' | 'music' | 'video' | 'audio'

interface MediaJob {
  id: string
  kind: Kind
  prompt: string
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'
  assets: Array<{ id: string; url: string; mimeType: string; name: string }>
  error: string | null
  createdAt: string
}

const TABS: Array<{ id: Kind; label: string; icon: typeof ImageIcon; hint: string }> = [
  { id: 'image', label: 'Image', icon: ImageIcon, hint: 'Text-to-image generation' },
  { id: 'music', label: 'Music', icon: Music, hint: 'Text-to-music generation' },
  { id: 'video', label: 'Video', icon: Video, hint: 'Text-to-video generation' },
  { id: 'audio', label: 'Voice', icon: Mic, hint: 'Text-to-speech voice-over' },
]

const STATUS_CLASS: Record<MediaJob['status'], string> = {
  completed: 'bg-emerald-100 text-emerald-700',
  processing: 'bg-amber-100 text-amber-700',
  queued: 'bg-slate-100 text-slate-600',
  failed: 'bg-rose-100 text-rose-700',
  cancelled: 'bg-slate-100 text-slate-500',
}

export default function MediaStudioPanel() {
  const [kind, setKind] = useState<Kind>('image')
  const [prompt, setPrompt] = useState('')
  const [size, setSize] = useState('1024x1024')
  const [genre, setGenre] = useState('pop')
  const [duration, setDuration] = useState('5')
  const [voice, setVoice] = useState('alloy')
  const [busy, setBusy] = useState(false)
  const [jobs, setJobs] = useState<MediaJob[]>([])
  const [loadingJobs, setLoadingJobs] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)

  const loadJobs = useCallback(async () => {
    setLoadingJobs(true)
    try {
      const res = await fetchApi<{ data: MediaJob[] }>('/api/media/generate')
      setJobs(res.data ?? [])
    } catch (error) {
      // A failed list is not fatal for the composer; surface it quietly.
      setNotice(error instanceof Error ? error.message : 'Could not load recent jobs')
    } finally {
      setLoadingJobs(false)
    }
  }, [])

  useEffect(() => {
    void loadJobs()
  }, [loadJobs])

  const generate = async () => {
    if (prompt.trim().length < 3) return
    setBusy(true)
    setNotice(null)
    try {
      const body: Record<string, unknown> = { kind, prompt }
      if (kind === 'image') body.size = size
      if (kind === 'music') body.genre = genre
      if (kind === 'video') body.durationSeconds = Number(duration)
      if (kind === 'audio') body.voice = voice

      const res = await fetchApi<{ job: MediaJob }>('/api/media/generate', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      const job = res.job
      if (job?.status === 'failed') {
        toast.error('Generation failed', { description: job.error ?? undefined })
      } else if (job?.status === 'processing') {
        toast.info('Generation submitted', { description: 'The provider is still working on this job.' })
      } else {
        toast.success('Generated')
      }
      await loadJobs()
    } catch (error) {
      const raw = error instanceof Error ? error.message : 'Generation failed'
      let message = raw
      try {
        const parsed = JSON.parse(raw) as { error?: string }
        if (parsed?.error) message = parsed.error
      } catch {
        // not JSON — keep the raw message
      }
      // 503 responses carry the exact environment variables to configure.
      setNotice(message)
      toast.error('Generation failed', { description: message })
    } finally {
      setBusy(false)
    }
  }

  const active = TABS.find((t) => t.id === kind)!

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-[#003ABC] to-[#1a56db] p-5 text-white">
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-5 w-5" />
            <h2 className="text-xl font-bold">Media Studio</h2>
          </div>
          <p className="text-sm text-white/80">
            Generate images, music, video and voice-over through the configured media provider.
          </p>
        </div>
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
      </div>

      {notice && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Media provider not available</p>
          <p className="mt-1 font-mono text-xs break-words">{notice}</p>
        </div>
      )}

      <Card className="bg-white border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <active.icon className="h-4 w-4 text-[#003ABC]" />
            {active.label} — {active.hint}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {TABS.map((tab) => (
              <Button
                key={tab.id}
                type="button"
                size="sm"
                variant={kind === tab.id ? 'default' : 'outline'}
                className={kind === tab.id ? 'bg-[#003ABC] hover:bg-[#002B8C] text-white' : ''}
                onClick={() => setKind(tab.id)}
              >
                <tab.icon className="h-3.5 w-3.5 mr-1.5" />
                {tab.label}
              </Button>
            ))}
          </div>

          <div>
            <Label htmlFor="media-prompt">
              {kind === 'audio' ? 'Script' : 'Prompt'}
            </Label>
            <Textarea
              id="media-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder={
                kind === 'image'
                  ? 'A product shot on a warm paper background, editorial style…'
                  : kind === 'music'
                    ? 'A restrained electronic bed for a product demo, 90 BPM…'
                    : kind === 'video'
                      ? 'A slow push-in on a desk setup, cinematic lighting…'
                      : 'Read the onboarding summary aloud in a professional tone…'
              }
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {kind === 'image' && (
              <div>
                <Label htmlFor="media-size">Size</Label>
                <select
                  id="media-size"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="1024x1024">1024 × 1024</option>
                  <option value="1024x768">1024 × 768</option>
                  <option value="768x1024">768 × 1024</option>
                  <option value="512x512">512 × 512</option>
                </select>
              </div>
            )}
            {kind === 'music' && (
              <div>
                <Label htmlFor="media-genre">Genre</Label>
                <select
                  id="media-genre"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="pop">Pop</option>
                  <option value="rock">Rock</option>
                  <option value="jazz">Jazz</option>
                  <option value="electronic">Electronic</option>
                  <option value="classical">Classical</option>
                  <option value="hip-hop">Hip hop</option>
                </select>
              </div>
            )}
            {kind === 'video' && (
              <div>
                <Label htmlFor="media-duration">Duration (seconds)</Label>
                <Input
                  id="media-duration"
                  type="number"
                  min={1}
                  max={60}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                />
              </div>
            )}
            {kind === 'audio' && (
              <div>
                <Label htmlFor="media-voice">Voice</Label>
                <select
                  id="media-voice"
                  value={voice}
                  onChange={(e) => setVoice(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="alloy">Alloy</option>
                  <option value="echo">Echo</option>
                  <option value="fable">Fable</option>
                  <option value="onyx">Onyx</option>
                  <option value="nova">Nova</option>
                  <option value="shimmer">Shimmer</option>
                </select>
              </div>
            )}
          </div>

          <Button
            onClick={generate}
            disabled={busy || prompt.trim().length < 3}
            className="w-full bg-[#003ABC] hover:bg-[#002B8C] text-white"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating…
              </>
            ) : (
              <>Generate {active.label.toLowerCase()}</>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-white border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent generations</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingJobs ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : jobs.length === 0 ? (
            <p className="text-sm text-slate-500">
              No generations yet. Produced assets are registered in the Media Library automatically.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {jobs.slice(0, 12).map((job) => (
                <li key={job.id} className="py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{job.prompt}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {job.kind} · {new Date(job.createdAt).toLocaleString()}
                      {job.error ? ` · ${job.error}` : ''}
                    </p>
                  </div>
                  <Badge className={STATUS_CLASS[job.status]}>{job.status}</Badge>
                  {job.assets[0] && (
                    <a
                      href={job.assets[0].url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#003ABC] hover:underline inline-flex items-center gap-1 text-xs"
                    >
                      Open <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
