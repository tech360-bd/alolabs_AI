/**
 * Sandbox telephony adapter — a fully SIMULATED provider.
 *
 * WHAT THIS IS
 * ------------
 * A deterministic, in-memory adapter that drives the exact same call lifecycle
 * as a real PSTN/SIP provider (queued → ringing → in_progress → terminal) so
 * the routing, metering, CRM and campaign logic can be exercised end-to-end in
 * tests and in demo mode.
 *
 * WHAT THIS IS NOT
 * ----------------
 * This is NOT a phone network. It cannot reach a real handset, and every call
 * it produces is stamped `simulated: true` by the call service (from
 * `info.simulated`). The UI must display these records with an explicit
 * "Simulated" badge. See docs/TELEPHONY_ARCHITECTURE.md for the path to real
 * PSTN connectivity (Asterisk/FreeSWITCH + authorized SIP trunk).
 *
 * Behavior is configured per-call via `behaviorHint` so tests can script
 * no-answer, busy and failure paths deterministically.
 */

import {
  requireCapability,
  type PlaceCallInput,
  type TelephonyAdapter,
  type TelephonyAdapterInfo,
  type TelephonyCallStatus,
} from './adapter'

export type SandboxBehavior = 'answer' | 'no_answer' | 'busy' | 'fail' | 'voicemail'

const CAPABILITIES = {
  // The sandbox simulates everything so the full workflow is testable, but it
  // can never reach a real network — info.simulated marks it accordingly.
  outboundPstn: true,
  inboundPstn: true,
  webrtc: true,
  transfer: true,
  hold: true,
  conference: true,
  recording: true,
  dtmf: true,
  numberProvisioning: true,
}

export interface SandboxCallRecord {
  providerCallId: string
  callSessionId: string
  from: string
  to: string
  behavior: SandboxBehavior
  state: TelephonyCallStatus['state']
  events: Array<{ type: string; at: Date; detail?: string }>
}

export class SandboxTelephonyAdapter implements TelephonyAdapter {
  readonly info: TelephonyAdapterInfo = {
    id: 'sandbox',
    label: 'Sandbox (simulated)',
    simulated: true,
    capabilities: { ...CAPABILITIES },
  }

  private seq = 0
  private calls = new Map<string, SandboxCallRecord>()

  /** Deterministic provider call ids for test assertions. */
  static providerCallId(callSessionId: string, seq: number): string {
    return `sbx-${callSessionId}-${seq}`
  }

  listCalls(): SandboxCallRecord[] {
    return [...this.calls.values()]
  }

  getCall(providerCallId: string): SandboxCallRecord | undefined {
    return this.calls.get(providerCallId)
  }

  reset(): void {
    this.calls.clear()
    this.seq = 0
  }

  async placeCall(input: PlaceCallInput & { behaviorHint?: SandboxBehavior }): Promise<TelephonyCallStatus> {
    requireCapability(this, 'outboundPstn', 'placeCall')
    const behavior = input.behaviorHint ?? 'answer'
    const providerCallId = SandboxTelephonyAdapter.providerCallId(input.callSessionId, ++this.seq)
    const state: TelephonyCallStatus['state'] =
      behavior === 'fail' ? 'failed' : behavior === 'answer' ? 'ringing' : behavior
    const record: SandboxCallRecord = {
      providerCallId,
      callSessionId: input.callSessionId,
      from: input.from,
      to: input.to,
      behavior,
      state,
      events: [{ type: 'place_call', at: new Date(), detail: `behavior=${behavior}` }],
    }
    this.calls.set(providerCallId, record)
    return { providerCallId, state, raw: { simulated: true } }
  }

  async hangup(providerCallId: string): Promise<void> {
    requireCapability(this, 'outboundPstn', 'hangup')
    const call = this.calls.get(providerCallId)
    if (call) {
      call.state = 'completed'
      call.events.push({ type: 'hangup', at: new Date() })
    }
  }

  async reject(providerCallId: string, reason?: string): Promise<void> {
    const call = this.calls.get(providerCallId)
    if (call) {
      call.state = 'failed'
      call.events.push({ type: 'reject', at: new Date(), detail: reason })
    }
  }

  async transfer(providerCallId: string, target: string): Promise<void> {
    requireCapability(this, 'transfer', 'transfer')
    const call = this.calls.get(providerCallId)
    if (call) {
      call.events.push({ type: 'transfer', at: new Date(), detail: `to=${target}` })
    }
  }

  async hold(providerCallId: string, on: boolean): Promise<void> {
    requireCapability(this, 'hold', 'hold')
    const call = this.calls.get(providerCallId)
    if (call) call.events.push({ type: on ? 'hold' : 'unhold', at: new Date() })
  }

  async record(providerCallId: string, on: boolean): Promise<void> {
    requireCapability(this, 'recording', 'record')
    const call = this.calls.get(providerCallId)
    if (call) call.events.push({ type: on ? 'record_start' : 'record_stop', at: new Date() })
  }

  /**
   * Honest recording metadata: the sandbox has NO audio stream, so there is
   * no recording to persist. Recording.ts only writes a CallRecording row
   * when an adapter returns real media metadata — a fake "recording" of a
   * call that had no audio would be fabricated evidence.
   */
  async recordingMetadata(): Promise<null> {
    return null
  }

  async health(): Promise<{ reachable: boolean; detail?: string }> {
    return { reachable: true, detail: 'sandbox adapter is always reachable (simulated)' }
  }
}

/** Shared singleton used by the registry and tests. */
export const sandboxTelephonyAdapter = new SandboxTelephonyAdapter()
