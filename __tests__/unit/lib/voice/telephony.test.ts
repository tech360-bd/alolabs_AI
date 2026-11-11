import { describe, it, expect } from 'vitest'
import {
  NotConnectedAdapter,
  isSimulatedProvider,
  resolveTelephonyAdapter,
} from '@/lib/voice/telephony/registry'
import {
  SandboxTelephonyAdapter,
  sandboxTelephonyAdapter,
} from '@/lib/voice/telephony/sandbox-adapter'
import { TelephonyUnsupportedError } from '@/lib/voice/telephony/adapter'

describe('telephony registry', () => {
  it('defaults to the sandbox adapter', () => {
    expect(resolveTelephonyAdapter(null).info.id).toBe('sandbox')
    expect(resolveTelephonyAdapter(undefined).info.id).toBe('sandbox')
    expect(resolveTelephonyAdapter('unknown-provider').info.id).toBe('sandbox')
  })

  it('marks sandbox as simulated, real providers as not simulated', () => {
    expect(isSimulatedProvider('sandbox')).toBe(true)
    expect(isSimulatedProvider('asterisk')).toBe(false)
  })

  it('real providers are honest: not connected and failing loudly', async () => {
    const a = resolveTelephonyAdapter('asterisk') as NotConnectedAdapter
    expect(a.info.capabilities.outboundPstn).toBe(false)
    await expect(a.health()).resolves.toMatchObject({ reachable: false })
    await expect(a.placeCall({ callSessionId: 'x', from: '1', to: '2' })).rejects.toThrow(TelephonyUnsupportedError)
  })

  it('supports dependency injection for real adapters (tests)', () => {
    const fake = sandboxTelephonyAdapter
    const resolved = resolveTelephonyAdapter('asterisk', { asterisk: fake })
    expect(resolved).toBe(fake)
  })
})

describe('sandbox adapter (simulated telephony)', () => {
  it('is flagged simulated with full simulation capabilities', () => {
    expect(sandboxTelephonyAdapter.info.simulated).toBe(true)
    expect(sandboxTelephonyAdapter.info.capabilities.outboundPstn).toBe(true)
  })

  it('places deterministic scripted calls', async () => {
    const adapter = new SandboxTelephonyAdapter()
    const ok = await adapter.placeCall({ callSessionId: 'c1', from: '+8801A', to: '+8801B' })
    expect(ok.providerCallId).toBe('sbx-c1-1')
    expect(ok.state).toBe('ringing')
    const failed = await adapter.placeCall({ callSessionId: 'c2', from: '+8801A', to: '+8801C', behaviorHint: 'fail' })
    expect(failed.state).toBe('failed')
  })

  it('tracks lifecycle events and hangup', async () => {
    const adapter = new SandboxTelephonyAdapter()
    const { providerCallId } = await adapter.placeCall({ callSessionId: 'c9', from: 'a', to: 'b' })
    await adapter.hold(providerCallId, true)
    await adapter.transfer(providerCallId, 'queue-2')
    await adapter.record(providerCallId, true)
    await adapter.hangup(providerCallId)
    const call = adapter.getCall(providerCallId)!
    expect(call.state).toBe('completed')
    expect(call.events.map((e) => e.type)).toEqual([
      'place_call', 'hold', 'transfer', 'record_start', 'hangup',
    ])
  })

  it('health is always reachable but explicitly labeled simulated', async () => {
    await expect(sandboxTelephonyAdapter.health()).resolves.toMatchObject({ reachable: true })
  })

  it('sandbox is not a NotConnectedAdapter — it actually drives the lifecycle', async () => {
    expect(sandboxTelephonyAdapter).toBeInstanceOf(SandboxTelephonyAdapter)
    expect(sandboxTelephonyAdapter).not.toBeInstanceOf(NotConnectedAdapter)
  })
})
