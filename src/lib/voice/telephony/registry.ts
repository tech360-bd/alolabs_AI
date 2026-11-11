/**
 * Telephony adapter registry.
 *
 * Resolution rules
 * ----------------
 * - `sandbox` → in-memory simulated adapter (default). Clearly flagged.
 * - `asterisk` / `freeswitch` / `external_sip` → real media-server adapters.
 *   These require a reachable telephony server; until one is configured and
 *   verified this registry hands back a `NotConnectedAdapter` that FAILS
 *   HONESTLY on every operation and reports reachable=false — it never
 *   pretends a call was placed. See docs/TELEPHONY_ARCHITECTURE.md.
 *
 * Business logic must call `resolveTelephonyAdapter(provider)`; direct imports
 * of concrete adapters are limited to the registry and tests.
 */

import {
  TelephonyUnsupportedError,
  type TelephonyAdapter,
  type TelephonyAdapterInfo,
} from './adapter'
import { sandboxTelephonyAdapter } from './sandbox-adapter'

/**
 * Placeholder for a real provider that is configured in the DB but whose
 * media server is not (yet) reachable/verified. Every operation throws so a
 * broken telephony backend can never produce silent fake success.
 */
export class NotConnectedAdapter implements TelephonyAdapter {
  readonly info: TelephonyAdapterInfo

  constructor(adapterId: string, private readonly reason: string) {
    this.info = {
      id: adapterId,
      label: `${adapterId} (not connected)`,
      simulated: false,
      capabilities: {
        outboundPstn: false,
        inboundPstn: false,
        webrtc: false,
        transfer: false,
        hold: false,
        conference: false,
        recording: false,
        dtmf: false,
        numberProvisioning: false,
      },
    }
  }

  private fail(): never {
    throw new TelephonyUnsupportedError(
      this.info.id,
      `operation — provider not connected: ${this.reason}`,
    )
  }

  async placeCall(): Promise<never> {
    this.fail()
  }
  async hangup(): Promise<never> {
    this.fail()
  }
  async reject(): Promise<never> {
    this.fail()
  }
  async transfer(): Promise<never> {
    this.fail()
  }
  async hold(): Promise<never> {
    this.fail()
  }
  async record(): Promise<never> {
    this.fail()
  }
  async health(): Promise<{ reachable: boolean; detail: string }> {
    return { reachable: false, detail: this.reason }
  }
}

export const TELEPHONY_PROVIDER_IDS = ['sandbox', 'asterisk', 'freeswitch', 'external_sip'] as const
export type TelephonyProviderId = (typeof TELEPHONY_PROVIDER_IDS)[number]

export function isTelephonyProviderId(value: string): value is TelephonyProviderId {
  return (TELEPHONY_PROVIDER_IDS as readonly string[]).includes(value)
}

export interface AdapterOverrides {
  sandbox?: TelephonyAdapter
  asterisk?: TelephonyAdapter
  freeswitch?: TelephonyAdapter
  external_sip?: TelephonyAdapter
}

/**
 * Resolve the adapter for a provider id. `overrides` exists for dependency
 * injection in tests (and later, for wiring real Asterisk/FreeSWITCH clients
 * without touching call-site code).
 */
export function resolveTelephonyAdapter(
  provider: string | null | undefined,
  overrides: AdapterOverrides = {},
): TelephonyAdapter {
  const id = provider && isTelephonyProviderId(provider) ? provider : 'sandbox'
  const overridden = overrides[id as keyof AdapterOverrides]
  if (overridden) return overridden
  switch (id) {
    case 'sandbox':
      return sandboxTelephonyAdapter
    case 'asterisk':
      return new NotConnectedAdapter('asterisk', 'no verified Asterisk ARI connection configured')
    case 'freeswitch':
      return new NotConnectedAdapter('freeswitch', 'no verified FreeSWITCH ESL connection configured')
    case 'external_sip':
      return new NotConnectedAdapter('external_sip', 'no verified external SIP trunk configured')
  }
}

/** True when the adapter for this provider only simulates calls. */
export function isSimulatedProvider(provider: string | null | undefined): boolean {
  return resolveTelephonyAdapter(provider).info.simulated
}
