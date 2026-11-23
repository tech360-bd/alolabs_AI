/**
 * Browser-side telemetry reporter (`metricsCollector`).
 *
 * This is deliberately SEPARATE from `src/lib/metrics-collector.ts`, which
 * imports Prisma and is server-only. Client components need this reporter, and
 * a shared module would pull the database driver into the browser bundle —
 * Next.js rejects that at build time with "Module not found: Can't resolve
 * 'bindings'".
 *
 * Reporting is best-effort: it must never throw and never block rendering, so
 * a failed beacon is swallowed rather than propagated into the component tree.
 */

export interface MetricReportContext {
  /** Extra structured detail. Serialised and truncated before sending. */
  [key: string]: unknown
}

const MAX_CONTEXT_BYTES = 2_000

function serialiseContext(context: MetricReportContext): Record<string, unknown> {
  try {
    const json = JSON.stringify(context)
    if (json.length <= MAX_CONTEXT_BYTES) return context
    return { truncated: true, preview: json.slice(0, MAX_CONTEXT_BYTES) }
  } catch {
    return { unserialisable: true }
  }
}

function send(payload: Record<string, unknown>): void {
  try {
    if (typeof fetch !== 'function') return
    void fetch('/api/metrics/client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(payload),
    }).catch(() => {})
  } catch {
    // Telemetry must never break the caller.
  }
}

export const metricsCollector = {
  /** Report a handled error from a UI surface. */
  reportError(component: string, event: string, context: MetricReportContext = {}): void {
    send({
      kind: 'error',
      component,
      event,
      context: serialiseContext(context),
      at: new Date().toISOString(),
    })
  },

  /** Report a non-error event (execution started, refresh, etc.). */
  reportEvent(component: string, event: string, context: MetricReportContext = {}): void {
    send({
      kind: 'event',
      component,
      event,
      context: serialiseContext(context),
      at: new Date().toISOString(),
    })
  },
}
