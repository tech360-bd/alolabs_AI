import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkRateLimit } from '@/lib/rate-limiter'
import { requireCompanyAuth } from '@/lib/api-auth'

/**
 * POST /api/metrics/client — client-side telemetry sink.
 *
 * Receives the best-effort beacons emitted by `metricsCollector`
 * (`src/lib/metrics-collector.ts`) from UI panels. Beacons are fire-and-forget
 * and must never surface an error to the user, so every failure mode here
 * answers with a cheap, non-retryable status.
 *
 * Design constraints:
 *  - Unauthenticated callers are ignored (204, not 401) so a logged-out panel
 *    cannot cause a retry storm in the browser.
 *  - The payload is bounded and strictly validated; unknown keys are stripped
 *    rather than persisted.
 *  - Per-principal rate limit keeps a runaway render loop from writing rows.
 *  - Never stores free-form user content — only component/event names and the
 *    already-truncated context produced by the collector.
 */

const MAX_BODY_BYTES = 8_192

const BeaconSchema = z.object({
  kind: z.enum(['error', 'event']),
  component: z.string().min(1).max(120),
  event: z.string().min(1).max(120),
  context: z.record(z.string(), z.unknown()).optional(),
  at: z.string().max(64).optional(),
})

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof requireCompanyAuth>>
  try {
    user = await requireCompanyAuth()
  } catch {
    // Anonymous beacon: accept and drop. Reporting 401 would make the browser
    // retry a request that can never succeed.
    return new NextResponse(null, { status: 204 })
  }

  const rate = await checkRateLimit(`metrics:client:${user.userId}`, 120, 60_000)
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  let parsed: z.infer<typeof BeaconSchema>
  try {
    parsed = BeaconSchema.parse(JSON.parse(raw))
  } catch {
    return NextResponse.json({ error: 'Invalid beacon payload' }, { status: 400 })
  }

  console.warn('[metrics/client]', JSON.stringify({
    kind: parsed.kind,
    component: parsed.component,
    event: parsed.event,
    companyId: user.companyId,
    userId: user.userId,
    at: parsed.at ?? new Date().toISOString(),
  }))

  return new NextResponse(null, { status: 204 })
}
