/**
 * TTS / ASR adapter interfaces + registries for the ALO Labs voice stack.
 *
 * HONEST STATUS (do not soften this in marketing):
 * - Interfaces and metering are implemented and tested.
 * - The BUILT-IN speech adapters in this repository are placeholders that
 *   report `available: false` until a real engine is deployed (Piper /
 *   Whisper-family for local inference, or a replaceable external provider).
 * - Jobs created while no engine is available fail with error
 *   `no_speech_provider_configured` — the platform NEVER returns synthetic
 *   audio or fabricated transcripts pretending to be real output.
 *
 * Bangla (`bn-BD`) is the primary product language; adapters carry a language
 * capability list so callers can check support BEFORE spending metered units.
 * Model evaluation plan: docs/BANGLA_VOICE_MODEL_EVALUATION.md.
 */

export interface VoiceOption {
  id: string
  name: string
  language: string // e.g. bn-BD, en-US, hi-IN, ar-SA
  gender: 'male' | 'female' | 'neutral'
  style?: string
  previewAvailable: boolean
}

export interface SpeechEngineInfo {
  id: string
  label: string
  /** False when the engine is a placeholder with no deployed model. */
  available: boolean
  local: boolean
  languages: string[] // BCP-47 tags
  capabilities: string[]
}

export interface TtsRequest {
  text: string
  language: string
  voiceId?: string
  settings?: {
    speed?: number // 0.5 – 2.0
    pitch?: number // semitone offset
    stability?: number // 0 – 1
    format?: 'mp3' | 'wav'
  }
}

export interface TtsResult {
  audioKey: string // object-storage key of the rendered audio
  format: string
  durationSeconds: number
  characters: number
  simulated: boolean
}

export interface TtsEngine {
  readonly info: SpeechEngineInfo
  voices(): Promise<VoiceOption[]>
  synthesize(req: TtsRequest): Promise<TtsResult>
}

export interface AsrRequest {
  audioKey: string
  language?: string // omit for auto-detect
  enableDiarization?: boolean
  enableTimestamps?: boolean
  customVocabulary?: string[]
}

export interface AsrSegment {
  speaker?: string
  text: string
  startMs: number
  endMs: number
  confidence?: number
}

export interface AsrResult {
  transcript: string
  segments: AsrSegment[]
  language: string
  confidence: number
  durationSeconds: number
  simulated: boolean
}

export interface AsrEngine {
  readonly info: SpeechEngineInfo
  transcribe(req: AsrRequest): Promise<AsrResult>
}

export class SpeechEngineUnavailableError extends Error {
  constructor(engineId: string, what: string) {
    super(`Speech engine "${engineId}" is not available: ${what}`)
    this.name = 'SpeechEngineUnavailableError'
  }
}

/**
 * Placeholder local engine. Present so the registry shape, UI and metering are
 * complete; refuses to synthesize/transcribe until a real model is deployed.
 */
export class PlaceholderLocalSpeechEngine {
  readonly info: SpeechEngineInfo

  constructor(id: string, label: string, capabilities: string[]) {
    this.info = {
      id,
      label,
      available: false,
      local: true,
      languages: ['bn-BD', 'bn-IN', 'en-US', 'hi-IN', 'ar-SA'],
      capabilities,
    }
  }

  protected unavailable(what: string): never {
    throw new SpeechEngineUnavailableError(this.info.id, what)
  }
}

export class PlaceholderTtsEngine extends PlaceholderLocalSpeechEngine implements TtsEngine {
  constructor() {
    super('local-tts', 'Local TTS (not deployed)', ['tts', 'streaming', 'ssml'])
  }
  async voices(): Promise<VoiceOption[]> {
    // Advertising voices that do not exist would be fabrication — return none.
    return []
  }
  async synthesize(): Promise<never> {
    this.unavailable('no local TTS model is deployed — deploy an engine and register it in the registry')
  }
}

export class PlaceholderAsrEngine extends PlaceholderLocalSpeechEngine implements AsrEngine {
  constructor() {
    super('local-asr', 'Local ASR (not deployed)', ['streaming', 'diarization', 'timestamps'])
  }
  async transcribe(): Promise<never> {
    this.unavailable('no local ASR model is deployed — deploy an engine and register it in the registry')
  }
}

// ---- Registries ----

const ttsEngines = new Map<string, TtsEngine>([['local-tts', new PlaceholderTtsEngine()]])
const asrEngines = new Map<string, AsrEngine>([['local-asr', new PlaceholderAsrEngine()]])

export function registerTtsEngine(engine: TtsEngine): void {
  ttsEngines.set(engine.info.id, engine)
}
export function registerAsrEngine(engine: AsrEngine): void {
  asrEngines.set(engine.info.id, engine)
}
export function ttsEngineIds(): string[] {
  return [...ttsEngines.keys()]
}
export function asrEngineIds(): string[] {
  return [...asrEngines.keys()]
}

export function resolveTtsEngine(id?: string | null): TtsEngine {
  if (id) {
    const engine = ttsEngines.get(id)
    if (engine) return engine
  }
  const first = [...ttsEngines.values()].find((e) => e.info.available)
  if (!first) {
    // Fall back to the placeholder so callers get the honest unavailable error.
    return ttsEngines.get('local-tts')!
  }
  return first
}

export function resolveAsrEngine(id?: string | null): AsrEngine {
  if (id) {
    const engine = asrEngines.get(id)
    if (engine) return engine
  }
  const first = [...asrEngines.values()].find((e) => e.info.available)
  if (!first) return asrEngines.get('local-asr')!
  return first
}

// ---- Metering (pure, pre-persistence) ----

export function countTtsCharacters(text: string): number {
  // Count grapheme-ish: Bangla combines marks; counting code points is the
  // standard conservative billing basis and is what we document.
  return [...text].length
}

/** Rough duration estimate for capacity planning only — never billed as fact. */
export function estimateSpeechDurationSeconds(text: string, wordsPerMinute = 130): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.max(0, Math.round((words / wordsPerMinute) * 60))
}

/** Language support check callers must run before metering. */
export function engineSupportsLanguage(engineInfo: SpeechEngineInfo, language: string): boolean {
  if (!engineInfo.available) return false
  const base = language.split('-')[0].toLowerCase()
  return engineInfo.languages.some((l) => l.toLowerCase() === language.toLowerCase() || l.toLowerCase().split('-')[0] === base)
}
