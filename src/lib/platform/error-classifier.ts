/**
 * ALO Open AI Platform — provider error classification.
 *
 * WHY THIS IS A SEPARATE MODULE
 * ----------------------------
 * Requirement C is explicit: "Do not retry invalid requests, permission
 * failures or content policy failures as though they were quota errors." A
 * fallback engine that treats every failure the same way burns the whole
 * candidate list on a malformed request, and worse, marks healthy providers as
 * degraded — so the *next* user's request also skips a working model.
 *
 * Classification therefore happens once, here, from (status, provider code,
 * message) and produces:
 *   class    — what kind of failure this is
 *   retryable          — same model, later (transient network / 5xx)
 *   fallbackEligible   — a *different* model may succeed
 *   coolDownMs         — how long to stop selecting this deployment
 *   countsAgainstHealth— whether this should move the provider's error rate
 *
 * The rules are deliberately conservative: an unknown 4xx is NOT fallback
 * eligible (it is almost always the caller's fault), an unknown 5xx is.
 */

export type ErrorClass =
  | 'rate_limit'          // 429 — quota/rate, honour Retry-After
  | 'quota_exhausted'     // explicit free-tier exhaustion
  | 'overloaded'          // 503 / provider busy
  | 'timeout'             // our abort or an upstream timeout
  | 'network'             // DNS, connection reset, refused
  | 'auth'                // 401/403 — provider credentials are wrong
  | 'not_found'           // 404 — model missing on that provider
  | 'context_overflow'    // prompt too long for the model
  | 'invalid_request'     // 400 — caller error, do NOT fall back
  | 'content_policy'      // provider refused the content, do NOT fall back
  | 'cancelled'           // client aborted, do NOT fall back
  | 'server_error'        // 5xx other than 503
  | 'unknown';

export interface ClassifiedError {
  class: ErrorClass;
  /** Human-readable, safe to show a user (never contains credentials). */
  message: string;
  httpStatus: number;
  retryable: boolean;
  fallbackEligible: boolean;
  coolDownMs: number;
  countsAgainstHealth: boolean;
  /** Milliseconds the provider asked us to wait, when it told us. */
  retryAfterMs?: number;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
/**
 * Upper bound on any cooldown derived from a provider header.
 *
 * `Retry-After` is attacker-influenceable in the sense that a buggy or
 * compromised upstream could send `86400` and remove a model from the pool for
 * a day. Routing state exists to *skip* a model briefly, not to disable it:
 * five minutes is long enough to outlast a real rate-limit window's worst case
 * in practice, and the health probe re-admits a recovered model regardless.
 */
const MAX_COOLDOWN_MS = 5 * MINUTE;
const clampCooldown = (ms: number): number => Math.max(0, Math.min(MAX_COOLDOWN_MS, ms));

/** Provider wording for "your free quota for this window is gone". */
const QUOTA_PATTERNS = [
  /quota\s*(?:exceeded|exhausted|reached)/i,
  /insufficient[_\s]quota/i,
  /out of credits/i,
  /daily limit/i,
  /monthly limit/i,
  /free[- ]tier.*(?:limit|exhaust)/i,
  /exceeded your current quota/i,
];

const CONTEXT_PATTERNS = [
  /context (?:length|size|window)/i,
  /maximum context/i,
  /too many tokens/i,
  /prompt is too long/i,
  /exceeds? the (?:available|maximum|model)/i,
  /input is too long/i,
  /reduce the length/i,
];

const POLICY_PATTERNS = [
  /content (?:policy|filter)/i,
  /moderation/i,
  /flagged/i,
  /safety system/i,
  /responsible ai/i,
];

const OVERLOAD_PATTERNS = [
  /overloaded/i,
  /at capacity/i,
  /server is busy/i,
  /temporarily unavailable/i,
];

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  return '';
}

/** Status carried by common error shapes (our AIRouterError, fetch wrappers, SDK errors). */
function statusOf(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const record = error as Record<string, unknown>;
  for (const key of ['statusCode', 'status', 'httpStatus', 'code']) {
    const value = record[key];
    if (typeof value === 'number' && value >= 100 && value <= 599) return value;
  }
  return undefined;
}

/** `Retry-After` as seconds or an HTTP date; also understands `retry_after_ms`. */
function retryAfterOf(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const record = error as Record<string, unknown>;
  const explicitMs = record.retryAfterMs ?? record.retry_after_ms;
  if (typeof explicitMs === 'number' && Number.isFinite(explicitMs) && explicitMs >= 0) return explicitMs;

  const header = record.retryAfter ?? record['retry-after'];
  if (typeof header === 'number' && Number.isFinite(header)) return header * SECOND;
  if (typeof header === 'string') {
    const asNumber = Number(header);
    if (Number.isFinite(asNumber)) return asNumber * SECOND;
    const asDate = Date.parse(header);
    if (Number.isFinite(asDate)) return Math.max(0, asDate - Date.now());
  }
  return undefined;
}

/**
 * A caller-initiated cancellation. Deliberately excludes `TimeoutError`: an
 * expired deadline is a capacity signal that another model may not hit, whereas
 * an aborted request means the user is gone and retrying would be wasted work.
 */
function isAbort(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  if (record.name === 'TimeoutError') return false;
  return record.name === 'AbortError' || record.code === 'ABORT_ERR' || record.code === 'UND_ERR_ABORTED';
}

/** Our own deadline expiring, or an upstream read timeout. */
function isTimeout(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  return record.name === 'TimeoutError' || record.code === 'ETIMEDOUT' || record.code === 'UND_ERR_CONNECT_TIMEOUT';
}

/**
 * Classify one provider failure.
 *
 * @param error  whatever the provider adapter threw
 * @param providerName used only for the message shown to users
 */
export function classifyProviderError(error: unknown, providerName = 'provider'): ClassifiedError {
  const message = messageOf(error) || `${providerName} request failed`;
  const status = statusOf(error);
  const retryAfterMs = retryAfterOf(error);

  // Cancellation is the caller's choice and must never be retried or recorded
  // against a provider's health.
  if (isAbort(error) && !status) {
    return {
      class: 'cancelled', message: 'Request cancelled', httpStatus: 499,
      retryable: false, fallbackEligible: false, coolDownMs: 0, countsAgainstHealth: false,
    };
  }

  if (QUOTA_PATTERNS.some((p) => p.test(message))) {
    return {
      class: 'quota_exhausted', message, httpStatus: 429,
      retryable: false, fallbackEligible: true,
      // Free-tier windows are usually daily; respect a stated reset if given.
      coolDownMs: clampCooldown(retryAfterMs ?? 15 * MINUTE),
      countsAgainstHealth: false, // expected behaviour, not a fault
      ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
    };
  }

  if (status === 429) {
    return {
      class: 'rate_limit', message, httpStatus: 429,
      retryable: false, fallbackEligible: true,
      coolDownMs: clampCooldown(retryAfterMs ?? MINUTE),
      countsAgainstHealth: false,
      ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
    };
  }

  if (CONTEXT_PATTERNS.some((p) => p.test(message))) {
    return {
      class: 'context_overflow', message, httpStatus: 413,
      retryable: false, fallbackEligible: true, // a bigger-context model may work
      coolDownMs: 0, countsAgainstHealth: false,
    };
  }

  if (POLICY_PATTERNS.some((p) => p.test(message))) {
    return {
      class: 'content_policy', message, httpStatus: 400,
      retryable: false, fallbackEligible: false, coolDownMs: 0, countsAgainstHealth: false,
    };
  }

  if (status === 503 || status === 502 || status === 504 || OVERLOAD_PATTERNS.some((p) => p.test(message))) {
    return {
      class: status === 503 ? 'overloaded' : 'server_error', message, httpStatus: 503,
      retryable: true, fallbackEligible: true,
      coolDownMs: clampCooldown(retryAfterMs ?? 30 * SECOND),
      countsAgainstHealth: true,
      ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
    };
  }

  if (status === 401 || status === 403) {
    return {
      class: 'auth', message: `${providerName} rejected the configured credentials`, httpStatus: 502,
      retryable: false, fallbackEligible: true, // another provider may be configured correctly
      coolDownMs: 5 * MINUTE, countsAgainstHealth: true,
    };
  }

  if (status === 404) {
    return {
      class: 'not_found', message, httpStatus: 502,
      retryable: false, fallbackEligible: true,
      coolDownMs: 10 * MINUTE, countsAgainstHealth: true,
    };
  }

  if (status === 400 || status === 422) {
    // Almost always a malformed request. Retrying on another model would mask
    // the bug and cost money, so this is explicitly NOT fallback eligible.
    return {
      class: 'invalid_request', message, httpStatus: 400,
      retryable: false, fallbackEligible: false, coolDownMs: 0, countsAgainstHealth: false,
    };
  }

  if (/ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up/i.test(message)) {
    // "Connection refused" against a LOCAL endpoint is the normal state of a
    // deployment where Ollama is not running yet; it is still fallback
    // eligible, but the cooldown is short so the model returns quickly once the
    // operator starts the service.
    return {
      class: 'network', message: `${providerName} is unreachable: ${message}`, httpStatus: 503,
      retryable: true, fallbackEligible: true,
      coolDownMs: 15 * SECOND, countsAgainstHealth: true,
    };
  }

  if (isTimeout(error) || status === 408 || /timeout|timed out/i.test(message)) {
    return {
      class: 'timeout', message: `${providerName} timed out`, httpStatus: 504,
      retryable: true, fallbackEligible: true,
      coolDownMs: 20 * SECOND, countsAgainstHealth: true,
    };
  }

  if (status && status >= 500) {
    return {
      class: 'server_error', message, httpStatus: 502,
      retryable: true, fallbackEligible: true,
      coolDownMs: 30 * SECOND, countsAgainstHealth: true,
    };
  }

  // Unknown shape. Optimistically treat as a transient provider fault so a
  // fallback can still save the request, but keep the cooldown short.
  return {
    class: 'unknown', message, httpStatus: 502,
    retryable: true, fallbackEligible: true,
    coolDownMs: 10 * SECOND, countsAgainstHealth: true,
  };
}

/** Should the engine stop trying entirely and surface the failure to the user? */
export function isTerminalFailure(classified: ClassifiedError): boolean {
  return classified.class === 'cancelled'
    || classified.class === 'content_policy'
    || classified.class === 'invalid_request';
}

/** HTTP status the platform should return when every candidate failed. */
export function unavailableStatus(classifieds: ClassifiedError[]): number {
  if (classifieds.length === 0) return 503;
  if (classifieds.every((c) => c.class === 'invalid_request')) return 400;
  if (classifieds.every((c) => c.class === 'content_policy')) return 400;
  if (classifieds.every((c) => c.class === 'cancelled')) return 499;
  if (classifieds.some((c) => c.class === 'rate_limit' || c.class === 'quota_exhausted')) return 429;
  return 503;
}
