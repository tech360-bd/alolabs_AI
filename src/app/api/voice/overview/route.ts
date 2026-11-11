import { db } from '@/lib/db'
import { withCompany } from '@/lib/voice/api-helpers'
import { usageSummary } from '@/lib/voice/metering'
import { resolveTelephonyAdapter } from '@/lib/voice/telephony/registry'
import { resolveTtsEngine, resolveAsrEngine } from '@/lib/voice/speech'

export const dynamic = 'force-dynamic'

/**
 * Contact-center overview (Module L executive view, tenant scope).
 * Every number is a REAL count from the database — the route reports zeros
 * when there is no data and labels provider/engine availability honestly.
 */
export async function GET() {
  return withCompany(async (auth) => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const [
      totalNumbers,
      activeNumbers,
      totalCalls,
      inboundCalls,
      outboundCalls,
      aiHandled,
      humanHandled,
      completedCalls,
      failedCalls,
      avgDuration,
      totalDuration,
      simCalls,
      campaigns,
      activeCampaigns,
      voiceAgents,
      dncCount,
      usage,
    ] = await Promise.all([
      db.phoneNumber.count({ where: { companyId: auth.companyId } }),
      db.phoneNumber.count({ where: { companyId: auth.companyId, status: 'active' } }),
      db.callSession.count({ where: { companyId: auth.companyId } }),
      db.callSession.count({ where: { companyId: auth.companyId, direction: 'inbound' } }),
      db.callSession.count({ where: { companyId: auth.companyId, direction: 'outbound' } }),
      db.callSession.count({ where: { companyId: auth.companyId, agentType: 'ai' } }),
      db.callSession.count({ where: { companyId: auth.companyId, agentType: 'human' } }),
      db.callSession.count({ where: { companyId: auth.companyId, status: 'completed' } }),
      db.callSession.count({ where: { companyId: auth.companyId, status: 'failed' } }),
      db.callSession.aggregate({
        where: { companyId: auth.companyId, status: 'completed' },
        _avg: { durationSeconds: true },
      }),
      db.callSession.aggregate({
        where: { companyId: auth.companyId, status: 'completed' },
        _sum: { durationSeconds: true },
      }),
      db.callSession.count({ where: { companyId: auth.companyId, simulated: true } }),
      db.campaign.count({ where: { companyId: auth.companyId } }),
      db.campaign.count({ where: { companyId: auth.companyId, status: { in: ['scheduled', 'running'] } } }),
      db.voiceAgent.count({ where: { companyId: auth.companyId } }),
      db.dncEntry.count({ where: { companyId: auth.companyId } }),
      usageSummary(auth.companyId, since),
    ])

    const providerHealth = (['sandbox', 'asterisk', 'freeswitch', 'external_sip'] as const).map((id) => {
      const adapter = resolveTelephonyAdapter(id)
      return { id, label: adapter.info.label, simulated: adapter.info.simulated }
    })
    const ttsEngine = resolveTtsEngine()
    const asrEngine = resolveAsrEngine()

    return {
      data: {
        numbers: { total: totalNumbers, active: activeNumbers },
        calls: {
          total: totalCalls,
          inbound: inboundCalls,
          outbound: outboundCalls,
          aiHandled,
          humanHandled,
          completed: completedCalls,
          failed: failedCalls,
          successRate: totalCalls > 0 ? Math.round((completedCalls / totalCalls) * 1000) / 10 : null,
          avgDurationSeconds: avgDuration._avg.durationSeconds != null
            ? Math.round(avgDuration._avg.durationSeconds)
            : null,
          totalMinutes: Math.ceil((totalDuration._sum.durationSeconds ?? 0) / 60),
          simulated: simCalls,
        },
        campaigns: { total: campaigns, active: activeCampaigns },
        agents: { voiceAgents, dncEntries: dncCount },
        usage,
        infrastructure: {
          telephonyProviders: providerHealth,
          speechEngines: {
            tts: { id: ttsEngine.info.id, available: ttsEngine.info.available, label: ttsEngine.info.label },
            asr: { id: asrEngine.info.id, available: asrEngine.info.available, label: asrEngine.info.label },
          },
        },
        periodDays: 30,
      },
    }
  })
}
