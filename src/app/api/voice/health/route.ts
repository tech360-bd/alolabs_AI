import { withCompany } from '@/lib/voice/api-helpers';
import { speechCapabilitySnapshot } from '@/lib/voice/speech-bootstrap';

/**
 * GET /api/voice/health — what the voice stack can actually do right now.
 *
 * Every field here is derived from live probes and configuration, never from a
 * static assumption. When no speech provider is configured the TTS/ASR entries
 * report `available: false` and callers must treat generation as unavailable
 * rather than optimistically queueing work that can only fail.
 */
export async function GET() {
  return withCompany(async () => {
    const speech = await speechCapabilitySnapshot();

    const telephonyConfigured = Boolean(
      process.env.VOICE_TELEPHONY_PROVIDER &&
        process.env.VOICE_TELEPHONY_PROVIDER !== 'none' &&
        process.env.VOICE_TELEPHONY_API_KEY,
    );

    return {
      speech,
      telephony: {
        provider: process.env.VOICE_TELEPHONY_PROVIDER || 'none',
        configured: telephonyConfigured,
        // Live call capacity is a commercial/telecom question that has not been
        // measured on this deployment, so it is reported as unknown on purpose.
        maxConcurrentCalls: null,
        note: telephonyConfigured
          ? 'Provider credentials present. Concurrency must still be confirmed against the carrier contract.'
          : 'No telephony provider configured. Inbound/outbound PSTN calls are unavailable; call simulation and routing dry-runs still work.',
      },
      limits: {
        note: 'Bangla ASR/TTS quality and call concurrency must be validated with native speakers and a carrier load test before production claims are made.',
      },
    };
  });
}

export const dynamic = 'force-dynamic';
