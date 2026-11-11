/**
 * Compliance gates: Do-Not-Call, calling hours, recording consent and
 * authorized voice cloning.
 *
 * OWNER REQUIREMENTS ENFORCED HERE
 * --------------------------------
 * - Outbound campaigns must respect consent and lawful calling basis.
 * - Calling-hour restrictions are enforced in the tenant's timezone and fail
 *   CLOSED when the timezone cannot be resolved.
 * - Recording only happens with a documented consent method.
 * - Voice cloning requires an explicit, verified, revocable consent record.
 * - The system is never designed for spam/deceptive impersonation: campaign
 *   frequency limits and DNC suppression are structural, not optional.
 */

import { businessHoursStatus, type BusinessHourConfig } from './routing'

// ---- Do Not Call ----

export interface DncCheckResult {
  blocked: boolean
  reason?: string
}

/** Normalize a phone number for comparison (digits and leading + only). */
export function normalizePhoneNumber(value: string): string {
  const trimmed = value.trim()
  const plus = trimmed.startsWith('+')
  const digits = trimmed.replace(/[^\d]/g, '')
  return plus ? `+${digits}` : digits
}

export function isDncBlocked(params: {
  number: string
  dncEntries: Array<{ phoneNumber: string; reason?: string }>
  respectDnc: boolean
}): DncCheckResult {
  if (!params.respectDnc) {
    // Even when a campaign disables DNC (lawful-basis use cases), a global
    // "customer_request" entry is still honored — an opt-out must never be
    // callable. Callers that need this must clear the entry explicitly.
    const hardBlock = params.dncEntries.find(
      (e) =>
        normalizePhoneNumber(e.phoneNumber) === normalizePhoneNumber(params.number) &&
        (e.reason ?? 'customer_request') === 'customer_request',
    )
    if (hardBlock) return { blocked: true, reason: 'dnc_customer_request_opt_out' }
    return { blocked: false }
  }
  const hit = params.dncEntries.find(
    (e) => normalizePhoneNumber(e.phoneNumber) === normalizePhoneNumber(params.number),
  )
  if (hit) return { blocked: true, reason: `dnc_${hit.reason ?? 'listed'}` }
  return { blocked: false }
}

// ---- Calling hours ----

export interface CallingHoursConfig extends BusinessHourConfig {
  /** Extra: minimum minutes between calls to the same contact. */
  minGapMinutesPerContact?: number
  /** Extra: max outbound attempts per contact for the campaign. */
  maxAttemptsPerContact?: number
}

export interface OutboundEligibility {
  allowed: boolean
  reason: string
  retryAfter?: string
}

/**
 * Decide whether an outbound call may be placed right now. Combines business
 * hours (fail-closed), attempt caps and per-contact frequency limits.
 */
export function outboundEligibility(params: {
  config: CallingHoursConfig | null | undefined
  attemptsSoFar: number
  lastAttemptAt?: Date | null
  at?: Date
}): OutboundEligibility {
  const at = params.at ?? new Date()
  const status = businessHoursStatus(params.config, at)
  if (!status.open) {
    return {
      allowed: false,
      reason: `outside_calling_hours: ${status.reason}`,
      retryAfter: status.localTime ? `${status.localDate} ${status.localTime} (${params.config?.timezone ?? 'Asia/Dhaka'})` : undefined,
    }
  }
  const maxAttempts = params.config?.maxAttemptsPerContact ?? 3
  if (params.attemptsSoFar >= maxAttempts) {
    return { allowed: false, reason: `max_attempts_reached (${maxAttempts})` }
  }
  const gapMin = params.config?.minGapMinutesPerContact ?? 0
  if (gapMin > 0 && params.lastAttemptAt) {
    const elapsedMin = (at.getTime() - params.lastAttemptAt.getTime()) / 60000
    if (elapsedMin < gapMin) {
      const waitMin = Math.ceil(gapMin - elapsedMin)
      return { allowed: false, reason: `frequency_limit: wait ${waitMin} more minute(s)` }
    }
  }
  return { allowed: true, reason: status.reason }
}

// ---- Recording consent ----

export type RecordingConsentMethod = 'ivr_announcement' | 'verbal' | 'written'

/**
 * Recording is only permitted when a consent disclosure has been configured
 * AND the consent outcome is recorded. `false` must disable recording —
 * default-deny is the compliance-safe default for Bangladesh, where
 * recording rules must be verified before production use
 * (see docs/SECURITY_AND_COMPLIANCE.md).
 */
export function recordingAllowed(params: {
  recordingMode: string // disabled | on_demand | always_with_consent
  disclosureText?: string | null
  consentGranted?: boolean | null
}): { allowed: boolean; reason: string } {
  if (params.recordingMode === 'disabled') return { allowed: false, reason: 'recording disabled for this number' }
  if (!params.disclosureText?.trim()) {
    return { allowed: false, reason: 'no disclosure text configured — recording blocked by default' }
  }
  if (!params.consentGranted) {
    return { allowed: false, reason: 'recording consent not granted/recorded' }
  }
  return { allowed: true, reason: `consent recorded (${params.recordingMode})` }
}

// ---- Authorized voice cloning ----

export interface VoiceCloneConsentCheck {
  allowed: boolean
  reason: string
}

/**
 * Voice cloning gate. Cloning a third party's voice without authorization, or
 * impersonation intended to deceive listeners, is forbidden. A clone may only
 * be created/used when a consent record exists, is verified, and is not revoked.
 */
export function voiceCloneAllowed(consent:
  | {
      status: string // pending | verified | rejected | revoked
      verificationMethod: string
      verifiedAt?: Date | null
      revokedAt?: Date | null
    }
  | null
  | undefined,
): VoiceCloneConsentCheck {
  if (!consent) return { allowed: false, reason: 'no consent record — voice cloning forbidden' }
  if (consent.status === 'revoked' || consent.revokedAt) {
    return { allowed: false, reason: 'consent revoked — clone access must be suspended' }
  }
  if (consent.status !== 'verified') {
    return { allowed: false, reason: `consent not verified (status: ${consent.status})` }
  }
  if (!consent.verifiedAt) {
    return { allowed: false, reason: 'consent verified without verification timestamp — record invalid' }
  }
  if (!['written', 'recorded_verbal', 'identity_verified'].includes(consent.verificationMethod)) {
    return { allowed: false, reason: `unknown verification method "${consent.verificationMethod}"` }
  }
  return { allowed: true, reason: `verified consent via ${consent.verificationMethod}` }
}

// ---- Human handoff safety rules ----

export type HandoffTrigger =
  | 'customer_requested_human'
  | 'low_confidence'
  | 'repeated_recognition_failure'
  | 'sensitive_account_action'
  | 'payment_dispute'
  | 'legal_or_safety'
  | 'policy_exception'
  | 'max_duration'
  | 'agent_error'

export interface HandoffRule {
  trigger: HandoffTrigger
  /** Always hand off (payment disputes, legal questions): not overridable by prompt confidence. */
  mandatory: boolean
  /** Detection pattern (keyword/phrase) for rule-based triggers. */
  patterns?: RegExp[]
}

/**
 * Structural handoff rules. The AI prompt may also request a handoff, but
 * these rules are evaluated by the orchestrator regardless of what the model
 * says — the AI cannot talk its way out of a mandatory transfer.
 */
export const HANDOFF_RULES: readonly HandoffRule[] = [
  { trigger: 'customer_requested_human', mandatory: true, patterns: [/(মানুষ|কর্মচারী|হিউম্যান|agent|human|representative|বক্তব্য মানুষ)/i] },
  { trigger: 'payment_dispute', mandatory: true, patterns: [/(refund|chargeback|payment dispute|টাকা ফেরত|অর্থ ফেরত)/i] },
  { trigger: 'legal_or_safety', mandatory: true, patterns: [/(lawyer|legal action|court|আইনজীবী|আদালত)/i] },
  { trigger: 'sensitive_account_action', mandatory: false, patterns: [/(close my account|account closure|একাউন্ট বন্ধ)/i] },
]

export interface HandoffDecision {
  handoff: boolean
  trigger?: HandoffTrigger
  mandatory: boolean
  reason: string
}

export function evaluateHandoff(params: {
  utterance?: string
  asrFailureCount?: number
  asrConfidence?: number | null
  lowConfidenceThreshold?: number
  callDurationSeconds?: number
  maxCallSeconds?: number
}): HandoffDecision {
  const text = params.utterance?.trim()
  if (text) {
    for (const rule of HANDOFF_RULES) {
      if (rule.patterns?.some((re) => re.test(text))) {
        return { handoff: true, trigger: rule.trigger, mandatory: rule.mandatory, reason: `matched rule: ${rule.trigger}` }
      }
    }
  }
  const threshold = params.lowConfidenceThreshold ?? 0.5
  if (typeof params.asrConfidence === 'number' && params.asrConfidence < threshold) {
    return { handoff: false, mandatory: false, reason: `asr confidence ${params.asrConfidence} < ${threshold} — clarify first; hand off if repeated` }
  }
  if ((params.asrFailureCount ?? 0) >= 3) {
    return { handoff: true, trigger: 'repeated_recognition_failure', mandatory: true, reason: '3+ consecutive recognition failures' }
  }
  if (params.maxCallSeconds && (params.callDurationSeconds ?? 0) >= params.maxCallSeconds) {
    return { handoff: true, trigger: 'max_duration', mandatory: true, reason: `max call duration ${params.maxCallSeconds}s reached` }
  }
  return { handoff: false, mandatory: false, reason: 'no handoff rule matched' }
}
