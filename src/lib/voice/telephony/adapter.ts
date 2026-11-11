/**
 * Telephony provider adapter interface.
 *
 * DESIGN RULES (from the owner requirements)
 * ------------------------------------------
 * 1. External telephony providers MUST be replaceable through adapters. No
 *    business logic may import a concrete adapter directly — always resolve
 *    through `telephony/registry.ts`.
 * 2. An adapter that cannot reach real telephony infrastructure must declare
 *    `simulated: true`. The call service stamps `CallSession.simulated` from
 *    this flag so demo/sandbox records can never be mistaken for real calls.
 * 3. Adapters NEVER fabricate usage, cost or call data. If a capability is
 *    unavailable, `capabilities` says so and calls must fail honestly.
 * 4. Real PSTN connectivity requires an authorized carrier/SIP service and
 *    local telecom compliance. This interface models the control plane only;
 *    media (RTP/WebRTC) is handled by the chosen media server architecture —
 *    see docs/TELEPHONY_ARCHITECTURE.md.
 */

export interface TelephonyCapabilities {
  /** Can place outbound calls to PSTN numbers. */
  outboundPstn: boolean
  /** Can receive inbound calls from PSTN. */
  inboundPstn: boolean
  /** Browser-based calling (WebRTC/SIP.js). */
  webrtc: boolean
  /** Server-side call transfer (blind/attended). */
  transfer: boolean
  /** Hold/resume on the media server. */
  hold: boolean
  /** Conference bridges. */
  conference: boolean
  /** Server-side recording. */
  recording: boolean
  /** DTMF collection (IVR menus). */
  dtmf: boolean
  /** Provision new numbers through this provider. */
  numberProvisioning: boolean
}

export interface TelephonyAdapterInfo {
  id: string
  label: string
  /** True when this adapter only simulates the call lifecycle (tests/demo). */
  simulated: boolean
  capabilities: TelephonyCapabilities
}

export interface PlaceCallInput {
  callSessionId: string
  from: string
  to: string
  /** Optional human-readable caller ID name. */
  callerName?: string
  /** IVR/AI answer URL or handler id the adapter should invoke on answer. */
  answerHandler?: string
  timeoutSeconds?: number
  /**
   * Adapter-specific hint. The sandbox adapter interprets it as the scripted
   * outcome (answer | no_answer | busy | fail | voicemail) for tests/demo;
   * real adapters ignore it.
   */
  behaviorHint?: string
}

export interface TelephonyCallStatus {
  providerCallId?: string
  state: 'queued' | 'ringing' | 'in_progress' | 'no_answer' | 'busy' | 'voicemail' | 'failed' | 'completed'
  raw?: Record<string, unknown>
}

export interface TelephonyAdapter {
  readonly info: TelephonyAdapterInfo

  /**
   * Place an outbound call. Implementations must throw (never silently
   * succeed) when the operation is unsupported or the provider is unreachable.
   */
  placeCall(input: PlaceCallInput): Promise<TelephonyCallStatus>

  /** Hang up an active call leg. */
  hangup(providerCallId: string): Promise<void>

  /** Reject/ignore an inbound ringing leg (e.g. outside business hours). */
  reject(providerCallId: string, reason?: string): Promise<void>

  /** Transfer an active call to another number/agent. */
  transfer(providerCallId: string, target: string): Promise<void>

  /** Put a call on hold / resume. */
  hold(providerCallId: string, on: boolean): Promise<void>

  /** Start/stop server-side recording where legally configured. */
  record(providerCallId: string, on: boolean): Promise<void>

  /**
   * Health check. Real adapters ping their media server / provider API.
   * Must return reachable=false rather than throwing when offline.
   */
  health(): Promise<{ reachable: boolean; detail?: string }>
}

export class TelephonyUnsupportedError extends Error {
  constructor(adapterId: string, operation: string) {
    super(`Telephony adapter "${adapterId}" does not support ${operation}`)
    this.name = 'TelephonyUnsupportedError'
  }
}

/** Helper for adapters to declare capability-gated operations. */
export function requireCapability(
  adapter: TelephonyAdapter,
  op: keyof TelephonyCapabilities,
  operation: string,
): void {
  if (!adapter.info.capabilities[op]) throw new TelephonyUnsupportedError(adapter.info.id, operation)
}
