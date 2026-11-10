import { v1Handler } from '@/lib/v1'
import { db } from '@/lib/db'
import { resolveTelephonyAdapter } from '@/lib/voice/telephony/registry'
import { resolveTtsEngine, resolveAsrEngine } from '@/lib/voice/speech'

/**
 * /api/v1/voice/health — voice subsystem health (master prompt §22).
 * Reports the REAL state of each dependency: telephony adapter reachability,
 * speech engine availability (placeholders report available:false), queue
 * depth. No component is ever reported healthy when it is not.
 */
export const dynamic = 'force-dynamic'

export const GET = v1Handler(async ({ identity }) => {
  const [providers, tts, asr, queueDepth] = await Promise.all([
    db.telephonyProviderConfig.findMany({ where: { companyId: identity.companyId } }),
    Promise.resolve(resolveTtsEngine()),
    Promise.resolve(resolveAsrEngine()),
    db.queueItem.count({ where: { queue: { name: 'voice' }, status: 'queued' } }),
  ])

  const adapterHealth = await Promise.all(
    providers.map(async (p) => {
      const adapter = resolveTelephonyAdapter(p.adapter)
      const health = await adapter.health()
      return {
        id: p.id,
        adapter: p.adapter,
        label: p.label,
        configuredStatus: p.status,
        reachable: health.reachable,
        detail: health.detail ?? null,
        simulated: adapter.info.simulated,
      }
    }),
  )

  const defaultAdapter = resolveTelephonyAdapter('sandbox')

  return {
    status: 'ok', // the API surface itself is up; component states listed honestly
    telephony: {
      default: { id: defaultAdapter.info.id, simulated: defaultAdapter.info.simulated },
      configured: adapterHealth,
    },
    speech: {
      tts: { id: tts.info.id, available: tts.info.available, languages: tts.info.languages },
      asr: { id: asr.info.id, available: asr.info.available, languages: asr.info.languages },
    },
    dialer: {
      voiceQueueDepth: queueDepth,
    },
  }
})
