/**
 * Speech engine bootstrap.
 *
 * `speech.ts` ships placeholders that always refuse. This module turns a
 * DEPLOYED engine into a registered one, without changing the honesty
 * guarantees:
 *
 *   - No env configuration  → placeholders stay; every job still fails with
 *     `no_speech_provider_configured` (unchanged behavior).
 *   - Configuration present → the HTTP adapters are registered and health-
 *     probed. An engine that is configured but DOWN stays registered with
 *     `available: false` so the API can report the real reason instead of
 *     pretending the platform has no speech capability.
 *
 * `ensureSpeechEngines()` is idempotent and cheap after the first call, so it
 * can be called at the top of any route or worker that needs speech.
 */

import { registerAsrEngine, registerTtsEngine, resolveAsrEngine, resolveTtsEngine, ttsEngineIds } from './speech'
import { buildConfiguredEngines } from './speech-adapters/http-engine'

let initialized = false
let bootstrapReport: {
  tts: { id: string; available: boolean; label: string; local: boolean; detail?: string } | null
  asr: { id: string; available: boolean; label: string; local: boolean; detail?: string } | null
  configured: boolean
} | null = null

/**
 * Register configured engines once per process. Returns the boot report so a
 * health route can show exactly what was found and whether it answered.
 */
export async function ensureSpeechEngines(): Promise<typeof bootstrapReport> {
  if (initialized && bootstrapReport) return bootstrapReport

  const { tts, asr } = buildConfiguredEngines()
  initialized = true

  if (!tts && !asr) {
    bootstrapReport = { tts: null, asr: null, configured: false }
    return bootstrapReport
  }

  let ttsReport: NonNullable<typeof bootstrapReport>['tts'] = null
  let asrReport: NonNullable<typeof bootstrapReport>['asr'] = null

  if (tts) {
    registerTtsEngine(tts)
    const health = await tts.health()
    ttsReport = { id: tts.info.id, available: health.available, label: tts.info.label, local: tts.info.local, detail: health.detail }
  }
  if (asr) {
    registerAsrEngine(asr)
    const health = await asr.health()
    asrReport = { id: asr.info.id, available: health.available, label: asr.info.label, local: asr.info.local, detail: health.detail }
  }

  bootstrapReport = { tts: ttsReport, asr: asrReport, configured: true }
  return bootstrapReport
}

/** Test hook: forget the bootstrap so a new env is picked up. */
export function resetSpeechEngineBootstrapForTests(): void {
  initialized = false
  bootstrapReport = null
}

/**
 * Current speech capability snapshot for health/overview endpoints. Reports the
 * engine actually selected for new jobs plus whether it is really reachable.
 */
export async function speechCapabilitySnapshot(): Promise<{
  tts: { id: string; label: string; available: boolean; local: boolean; languages: string[]; detail?: string }
  asr: { id: string; label: string; available: boolean; local: boolean; languages: string[]; detail?: string }
  registeredEngines: string[]
  configured: boolean
}> {
  const report = await ensureSpeechEngines()
  const ttsEngine = resolveTtsEngine()
  const asrEngine = resolveAsrEngine()

  // A configured engine's liveness comes from the boot probe; the placeholder
  // is structurally unavailable.
  const ttsAvailable = report?.tts ? report.tts.available : ttsEngine.info.available
  const asrAvailable = report?.asr ? report.asr.available : asrEngine.info.available

  return {
    tts: {
      id: ttsEngine.info.id,
      label: ttsEngine.info.label,
      available: ttsAvailable,
      local: ttsEngine.info.local,
      languages: ttsEngine.info.languages,
      ...(report?.tts?.detail ? { detail: report.tts.detail } : {}),
    },
    asr: {
      id: asrEngine.info.id,
      label: asrEngine.info.label,
      available: asrAvailable,
      local: asrEngine.info.local,
      languages: asrEngine.info.languages,
      ...(report?.asr?.detail ? { detail: report.asr.detail } : {}),
    },
    registeredEngines: ttsEngineIds(),
    configured: report?.configured ?? false,
  }
}
