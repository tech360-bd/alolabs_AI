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
 *
 * LIVENESS IS NOT A ONE-TIME FACT
 * ------------------------------
 * Registration happens once, but reachability does NOT: an engine process that
 * dies keeps the old "available: true" forever if health is only probed at
 * boot. `speechCapabilitySnapshot()` therefore re-probes a configured engine
 * (throttled to HEALTH_REPROBE_MS) and reports it unavailable once its health
 * endpoint stops answering, so the dashboard says "config is present but the
 * engine is down" instead of claiming a capability that no longer exists.
 */

import { registerAsrEngine, registerTtsEngine, resolveAsrEngine, resolveTtsEngine, ttsEngineIds } from './speech'
import { buildConfiguredEngines } from './speech-adapters/http-engine'

/** How long a health result is trusted before re-probing the engine. */
const HEALTH_REPROBE_MS = 10_000

let initialized = false
let lastProbeAt = 0
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
  lastProbeAt = 0
  bootstrapReport = null
}

type Probeable = { health?: () => Promise<{ available: boolean; detail?: string }> }

/**
 * Probe an engine's liveness, tolerating both a missing `health()` and a
 * throwing one. A probe that fails is itself evidence the engine is down, so it
 * reports unavailable rather than assuming the best.
 */
async function probeHealth(engine: unknown): Promise<{ available: boolean; detail?: string } | null> {
  const candidate = engine as Probeable
  if (typeof candidate.health !== 'function') return null
  try {
    return await candidate.health()
  } catch (err) {
    return { available: false, detail: err instanceof Error ? err.message : 'health probe failed' }
  }
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

  // Re-probe a configured engine so a dead process cannot keep reporting as
  // available. Throttled: an engine ping must not be paid on every page view.
  // `health()` is optional on the interface (placeholders have none), so the
  // probe is guarded rather than assumed.
  if (report && report.configured && Date.now() - lastProbeAt > HEALTH_REPROBE_MS) {
    lastProbeAt = Date.now()
    if (report.tts) {
      const health = await probeHealth(ttsEngine)
      if (health) report.tts = { ...report.tts, available: health.available, detail: health.detail }
    }
    if (report.asr) {
      const health = await probeHealth(asrEngine)
      if (health) report.asr = { ...report.asr, available: health.available, detail: health.detail }
    }
  }

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
