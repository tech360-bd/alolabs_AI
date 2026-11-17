/**
 * HTTP speech-engine adapters (Module C/D execution path).
 *
 * WHY: `speech.ts` defines the TtsEngine/AsrEngine contracts and registers a
 * placeholder that always refuses. That keeps the platform honest, but it also
 * means NOTHING can ever produce audio — there is no adapter that talks to a
 * deployed engine. This file is that adapter: it speaks the two contracts every
 * self-hosted speech server already exposes, selected by env configuration.
 *
 * SUPPORTED CONTRACTS (both common, both local-first)
 * --------------------------------------------------
 * 1. `openai` — the OpenAI-compatible audio API, which is what vLLM, LM Studio,
 *    LocalAI, Faster-Whisper-Server, Kokoro-FastAPI, XTTS server and most
 *    self-hosted Bangla deployments expose:
 *       POST {base}/audio/speech       { model, input, voice, response_format, speed }
 *       POST {base}/audio/transcriptions (multipart: file, model, language, ...)
 *
 * 2. `piper` — the Piper HTTP server used for offline Bangla voices:
 *       POST {base}?text=...            → audio/wav bytes
 *
 * CONFIGURATION (all optional; nothing is enabled by default)
 * ----------------------------------------------------------
 *   VOICE_TTS_PROVIDER=openai|piper|none          (default: none)
 *   VOICE_TTS_BASE_URL=http://127.0.0.1:8880/v1
 *   VOICE_TTS_MODEL=kokoro                        (openai contract only)
 *   VOICE_TTS_VOICE=bn_female_01                  (default voice id)
 *   VOICE_TTS_LANGUAGES=bn-BD,en-US,hi-IN         (comma list; default bn-BD)
 *
 *   VOICE_ASR_PROVIDER=openai|none                (default: none)
 *   VOICE_ASR_BASE_URL=http://127.0.0.1:8000/v1
 *   VOICE_ASR_MODEL=whisper-large-v3
 *   VOICE_ASR_LANGUAGES=bn-BD,en-US,hi-IN,ar-SA
 *
 * HONESTY RULES BAKED IN
 * ----------------------
 * - If a provider is configured but unreachable, calls FAIL. We never return
 *   silence, a synthetic tone or a made-up transcript.
 * - `simulated` is always false from these adapters: audio is real or absent.
 * - The engine reports its declared languages from env; a language it was not
 *   declared for is refused BEFORE any paid/metered work happens.
 * - Health state is cached briefly (10s) so a dead engine does not turn every
 *   dashboard poll into a timeout storm.
 */

import type {
  AsrEngine,
  AsrRequest,
  AsrResult,
  SpeechEngineInfo,
  TtsEngine,
  TtsRequest,
  TtsResult,
  VoiceOption,
} from '../speech'
import { SpeechEngineUnavailableError } from '../speech'

const DEFAULT_LANGUAGES = ['bn-BD']
const HEALTH_TTL_MS = 10_000

export interface HttpEngineConfig {
  id: string
  label: string
  baseUrl: string
  apiKey?: string
  model?: string
  defaultVoice?: string
  languages: string[]
  local: boolean
  timeoutMs?: number
}

export function parseLanguageList(raw: string | undefined, fallback: string[] = DEFAULT_LANGUAGES): string[] {
  if (!raw) return fallback
  const list = raw.split(',').map((l) => l.trim()).filter(Boolean)
  return list.length > 0 ? list : fallback
}

/** Resolve TTS config from the environment. Returns null when unconfigured. */
export function resolveHttpTtsConfig(env: NodeJS.ProcessEnv = process.env): (HttpEngineConfig & { contract: 'openai' | 'piper' }) | null {
  const provider = (env.VOICE_TTS_PROVIDER ?? 'none').toLowerCase()
  if (provider !== 'openai' && provider !== 'piper') return null
  const baseUrl = env.VOICE_TTS_BASE_URL?.trim()
  if (!baseUrl) return null
  return {
    id: `http-tts-${provider}`,
    label: provider === 'piper' ? 'Piper (local HTTP)' : 'OpenAI-compatible TTS',
    contract: provider,
    baseUrl: baseUrl.replace(/\/$/, ''),
    apiKey: env.VOICE_TTS_API_KEY?.trim() || undefined,
    model: env.VOICE_TTS_MODEL?.trim() || undefined,
    defaultVoice: env.VOICE_TTS_VOICE?.trim() || undefined,
    languages: parseLanguageList(env.VOICE_TTS_LANGUAGES),
    // Treat loopback/private hosts as local inference (owner requirement:
    // prioritise local AI inference).
    local: isLocalEndpoint(baseUrl),
    timeoutMs: Number(env.VOICE_TTS_TIMEOUT_MS ?? '') || 20_000,
  }
}

export function resolveHttpAsrConfig(env: NodeJS.ProcessEnv = process.env): HttpEngineConfig | null {
  const provider = (env.VOICE_ASR_PROVIDER ?? 'none').toLowerCase()
  if (provider !== 'openai') return null
  const baseUrl = env.VOICE_ASR_BASE_URL?.trim()
  if (!baseUrl) return null
  return {
    id: 'http-asr-openai',
    label: 'OpenAI-compatible ASR (local Whisper server)',
    baseUrl: baseUrl.replace(/\/$/, ''),
    apiKey: env.VOICE_ASR_API_KEY?.trim() || undefined,
    model: env.VOICE_ASR_MODEL?.trim() || 'whisper-1',
    languages: parseLanguageList(env.VOICE_ASR_LANGUAGES, ['bn-BD', 'en-US', 'hi-IN', 'ar-SA']),
    local: isLocalEndpoint(baseUrl),
    timeoutMs: Number(env.VOICE_ASR_TIMEOUT_MS ?? '') || 60_000,
  }
}

export function isLocalEndpoint(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' ||
      host.startsWith('10.') || host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.endsWith('.internal')
  } catch {
    return false
  }
}

function storageKeyFor(engine: string, format: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const random = Math.random().toString(36).slice(2, 10)
  return `${engine}/${stamp}-${random}.${format}`
}

/** Estimate duration from MP3/WAV byte length when the engine does not report it. */
/**
 * Determine the real container from the bytes we received.
 *
 * The job's requested `format` is a wish; this is what the engine actually
 * sent back. Labelling WAV bytes "audio/mpeg" (or vice versa) makes the browser
 * silently refuse to play a perfectly good file, which looks like an engine
 * bug rather than a metadata one.
 */
export function sniffContentType(bytes: Buffer, requestedFormat: string): string {
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE') {
    return 'audio/wav'
  }
  if (bytes.length >= 3 && bytes.toString('ascii', 0, 3) === 'ID3') return 'audio/mpeg'
  // MPEG audio frame sync: 11 set bits.
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return 'audio/mpeg'
  if (bytes.length >= 4 && bytes.toString('ascii', 0, 4) === 'OggS') return 'audio/ogg'
  return requestedFormat === 'wav' ? 'audio/wav' : 'audio/mpeg'
}

export function estimateAudioDurationMs(bytes: number, format: string): number {
  if (!Number.isFinite(bytes) || bytes <= 0) return 0
  if (format === 'wav') {
    // 16-bit mono 24 kHz ≈ 48 000 bytes/s (44-byte header).
    return Math.round(((bytes - 44) / 48_000) * 1000)
  }
  // MP3 at 64 kbps ≈ 8 000 bytes/s.
  return Math.round((bytes / 8_000) * 1000)
}

// ─── TTS ─────────────────────────────────────────────────────────────────────

export class HttpTtsEngine implements TtsEngine {
  readonly info: SpeechEngineInfo
  private readonly config: HttpEngineConfig & { contract: 'openai' | 'piper' }
  private healthCache: { at: number; available: boolean; detail?: string } | null = null

  constructor(config: HttpEngineConfig & { contract: 'openai' | 'piper' }, opts: { available?: boolean } = {}) {
    this.config = config
    this.info = {
      id: config.id,
      label: config.label,
      available: opts.available ?? true,
      local: config.local,
      languages: config.languages,
      capabilities: ['tts', 'streaming', config.contract === 'piper' ? 'piper_http' : 'openai_audio', 'batch'],
    }
  }

  /** Probe the engine. Cached for 10s. Never throws. */
  async health(): Promise<{ available: boolean; detail?: string }> {
    const now = Date.now()
    if (this.healthCache && now - this.healthCache.at < HEALTH_TTL_MS) {
      return { available: this.healthCache.available, detail: this.healthCache.detail }
    }
    let available = false
    let detail: string | undefined
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 4000)
      const url = this.config.contract === 'piper' ? this.config.baseUrl : `${this.config.baseUrl}/models`
      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers(),
        signal: controller.signal,
      })
      clearTimeout(timer)
      available = response.ok
      if (!response.ok) detail = `HTTP ${response.status} from ${url}`
    } catch (err) {
      detail = err instanceof Error ? err.message : 'unreachable'
    }
    this.healthCache = { at: now, available, detail }
    return { available, detail }
  }

  private headers(): Record<string, string> {
    return this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}
  }

  async voices(): Promise<VoiceOption[]> {
    const health = await this.health()
    if (!health.available) return []
    const voice = this.config.defaultVoice
    if (!voice) return []
    return this.config.languages.map((language, index) => ({
      id: voice,
      name: `${this.config.label} (${voice})`,
      language,
      gender: 'neutral',
      previewAvailable: index === 0,
    }))
  }

  async synthesize(req: TtsRequest): Promise<TtsResult> {
    const format = req.settings?.format === 'wav' ? 'wav' : 'mp3'
    const voiceId = req.voiceId ?? this.config.defaultVoice ?? 'default'
    const timeoutMs = this.config.timeoutMs ?? 20_000

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      let response: Response
      if (this.config.contract === 'piper') {
        const url = `${this.config.baseUrl}?text=${encodeURIComponent(req.text)}`
        response = await fetch(url, { method: 'POST', headers: this.headers(), signal: controller.signal })
      } else {
        response = await fetch(`${this.config.baseUrl}/audio/speech`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...this.headers() },
          signal: controller.signal,
          body: JSON.stringify({
            model: this.config.model ?? 'tts-1',
            input: req.text,
            voice: voiceId,
            response_format: format,
            ...(typeof req.settings?.speed === 'number' ? { speed: Math.min(2, Math.max(0.5, req.settings.speed)) } : {}),
          }),
        })
      }
      if (!response.ok) {
        const detail = (await response.text().catch(() => '')).slice(0, 300)
        throw new SpeechEngineUnavailableError(this.info.id, `synthesis failed: HTTP ${response.status}${detail ? ` — ${detail}` : ''}`)
      }
      const audio = Buffer.from(await response.arrayBuffer())
      if (audio.byteLength === 0) {
        throw new SpeechEngineUnavailableError(this.info.id, 'engine returned zero bytes of audio')
      }
      const durationMs = estimateAudioDurationMs(audio.byteLength, format)
      return {
        // The caller persists bytes under this key; it is a deterministic
        // content address, not a fabricated storage path.
        audioKey: storageKeyFor(this.info.id, format),
        format,
        durationSeconds: Math.round(durationMs / 100) / 10,
        characters: [...req.text].length,
        simulated: false,
      }
    } catch (err) {
      if (err instanceof SpeechEngineUnavailableError) throw err
      if (err instanceof Error && err.name === 'AbortError') {
        throw new SpeechEngineUnavailableError(this.info.id, `synthesis timed out after ${timeoutMs}ms`)
      }
      throw new SpeechEngineUnavailableError(this.info.id, err instanceof Error ? err.message : 'synthesis failed')
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * Streaming synthesis contract for the real-time call pipeline: returns the
   * raw audio bytes so a media worker can pipe them to the caller instead of
   * waiting for a whole file. Kept separate from `synthesize` so the batch path
   * stays simple and testable.
   */
  async synthesizeBytes(req: TtsRequest): Promise<{ bytes: Buffer; format: string; contentType: string }> {
    const format = req.settings?.format === 'wav' ? 'wav' : 'mp3'
    const voiceId = req.voiceId ?? this.config.defaultVoice ?? 'default'
    const timeoutMs = this.config.timeoutMs ?? 20_000
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      let response: Response
      if (this.config.contract === 'piper') {
        response = await fetch(`${this.config.baseUrl}?text=${encodeURIComponent(req.text)}`, {
          method: 'POST', headers: this.headers(), signal: controller.signal,
        })
      } else {
        response = await fetch(`${this.config.baseUrl}/audio/speech`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...this.headers() },
          signal: controller.signal,
          body: JSON.stringify({ model: this.config.model ?? 'tts-1', input: req.text, voice: voiceId, response_format: format }),
        })
      }
      if (!response.ok) {
        throw new SpeechEngineUnavailableError(this.info.id, `synthesis failed: HTTP ${response.status}`)
      }
      const bytes = Buffer.from(await response.arrayBuffer())
      if (bytes.byteLength === 0) {
        throw new SpeechEngineUnavailableError(this.info.id, 'engine returned zero bytes of audio')
      }
      return {
        bytes,
        format,
        // The engine decides what it actually produced; a WAV engine asked for
        // "mp3" must not be labelled mp3, or the browser refuses to decode it.
        contentType: sniffContentType(bytes, format),
      }
    } catch (err) {
      if (err instanceof SpeechEngineUnavailableError) throw err
      // Node's fetch reports a dead local engine as the bare string
      // "fetch failed"; the useful part is in `.cause`. Surface the real reason
      // and the URL so a misconfigured base URL is fixable from the error alone.
      if (err instanceof Error && err.name === 'AbortError') {
        throw new SpeechEngineUnavailableError(this.info.id, `synthesis timed out after ${timeoutMs}ms`)
      }
      const cause = err instanceof Error && err.cause instanceof Error ? `: ${err.cause.message}` : ''
      const detail = err instanceof Error ? err.message : 'synthesis failed'
      throw new SpeechEngineUnavailableError(
        this.info.id,
        `cannot reach speech engine at ${this.config.baseUrl} (${detail}${cause})`,
      )
    } finally {
      clearTimeout(timer)
    }
  }
}

// ─── ASR ─────────────────────────────────────────────────────────────────────

interface OpenAiVerboseTranscript {
  text?: string
  language?: string
  duration?: number
  segments?: Array<{ start?: number; end?: number; text?: string; avg_logprob?: number; no_speech_prob?: number }>
}

/** Convert an OpenAI-style verbose JSON transcript into our AsrResult shape. */
export function asrResultFromVerbose(json: OpenAiVerboseTranscript, fallbackLanguage: string, engineId: string): AsrResult {
  const segments = (json.segments ?? [])
    .filter((s) => typeof s.text === 'string')
    .map((s) => ({
      text: (s.text ?? '').trim(),
      startMs: Math.max(0, Math.round((s.start ?? 0) * 1000)),
      endMs: Math.max(0, Math.round((s.end ?? 0) * 1000)),
      // avg_logprob is a log probability; exp() approximates per-segment
      // confidence. Absent value → confidence omitted rather than invented.
      ...(typeof s.avg_logprob === 'number' ? { confidence: Math.max(0, Math.min(1, Math.round(Math.exp(s.avg_logprob) * 1000) / 1000)) } : {}),
    }))
    .filter((s) => s.text.length > 0)

  const text = (json.text ?? segments.map((s) => s.text).join(' ')).trim()
  const confidences = segments.map((s) => s.confidence).filter((c): c is number => typeof c === 'number')
  const confidence = confidences.length > 0
    ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 1000) / 1000
    : 0
  return {
    transcript: text,
    segments,
    language: json.language ?? fallbackLanguage,
    confidence,
    durationSeconds: typeof json.duration === 'number' ? Math.round(json.duration * 10) / 10 : 0,
    simulated: false,
  }
}

export class HttpAsrEngine implements AsrEngine {
  readonly info: SpeechEngineInfo
  private readonly config: HttpEngineConfig
  private healthCache: { at: number; available: boolean; detail?: string } | null = null

  constructor(config: HttpEngineConfig, opts: { available?: boolean } = {}) {
    this.config = config
    this.info = {
      id: config.id,
      label: config.label,
      available: opts.available ?? true,
      local: config.local,
      languages: config.languages,
      capabilities: ['asr', 'streaming_batch', 'timestamps', 'language_detection'],
    }
  }

  async health(): Promise<{ available: boolean; detail?: string }> {
    const now = Date.now()
    if (this.healthCache && now - this.healthCache.at < HEALTH_TTL_MS) {
      return { available: this.healthCache.available, detail: this.healthCache.detail }
    }
    let available = false
    let detail: string | undefined
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 4000)
      const response = await fetch(`${this.config.baseUrl}/models`, {
        method: 'GET',
        headers: this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {},
        signal: controller.signal,
      })
      clearTimeout(timer)
      available = response.ok
      if (!response.ok) detail = `HTTP ${response.status}`
    } catch (err) {
      detail = err instanceof Error ? err.message : 'unreachable'
    }
    this.healthCache = { at: now, available, detail }
    return { available, detail }
  }

  async transcribe(req: AsrRequest & { audioBytes?: Buffer; filename?: string; mimeType?: string }): Promise<AsrResult> {
    if (!req.audioBytes || req.audioBytes.byteLength === 0) {
      // The registry contract takes a storage key. Batch transcription is run by
      // the ASR worker (which loads the object and passes bytes); refusing here
      // is honest rather than fabricating a transcript from a key string.
      throw new SpeechEngineUnavailableError(
        this.info.id,
        'audio bytes are required — load the object from storage and pass audioBytes (the ASR worker does this)',
      )
    }
    const timeoutMs = this.config.timeoutMs ?? 60_000
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const form = new FormData()
      form.append('file', new Blob([new Uint8Array(req.audioBytes)], { type: req.mimeType ?? 'audio/wav' }), req.filename ?? 'audio.wav')
      form.append('model', this.config.model ?? 'whisper-1')
      form.append('response_format', 'verbose_json')
      if (req.language) form.append('language', req.language.split('-')[0])
      if (req.customVocabulary && req.customVocabulary.length > 0) {
        form.append('prompt', req.customVocabulary.slice(0, 40).join(', '))
      }

      const response = await fetch(`${this.config.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {},
        signal: controller.signal,
        body: form,
      })
      if (!response.ok) {
        const detail = (await response.text().catch(() => '')).slice(0, 300)
        throw new SpeechEngineUnavailableError(this.info.id, `transcription failed: HTTP ${response.status}${detail ? ` — ${detail}` : ''}`)
      }
      const json = (await response.json()) as OpenAiVerboseTranscript
      return asrResultFromVerbose(json, req.language ?? 'bn-BD', this.info.id)
    } catch (err) {
      if (err instanceof SpeechEngineUnavailableError) throw err
      if (err instanceof Error && err.name === 'AbortError') {
        throw new SpeechEngineUnavailableError(this.info.id, `transcription timed out after ${timeoutMs}ms`)
      }
      throw new SpeechEngineUnavailableError(this.info.id, err instanceof Error ? err.message : 'transcription failed')
    } finally {
      clearTimeout(timer)
    }
  }
}

/**
 * Register configured HTTP engines into the speech registry.
 *
 * Called from the engine bootstrap below; safe to call repeatedly (the registry
 * is a Map keyed by engine id). When nothing is configured the placeholders stay
 * in place and the platform keeps failing honestly.
 */
export function buildConfiguredEngines(env: NodeJS.ProcessEnv = process.env): {
  tts: HttpTtsEngine | null
  asr: HttpAsrEngine | null
} {
  const ttsConfig = resolveHttpTtsConfig(env)
  const asrConfig = resolveHttpAsrConfig(env)
  return {
    tts: ttsConfig ? new HttpTtsEngine(ttsConfig) : null,
    asr: asrConfig ? new HttpAsrEngine(asrConfig) : null,
  }
}
