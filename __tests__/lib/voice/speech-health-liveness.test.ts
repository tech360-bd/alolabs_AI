/**
 * Liveness regressions for the speech engine health surface.
 *
 * Two defects these pin down, both found by running the real engine rather than
 * reading the code:
 *
 *  1. Health was probed ONCE at boot and cached forever, so killing the engine
 *     process left `/api/voice/health` reporting `available: true`. The
 *     dashboard claimed a capability that had ceased to exist.
 *  2. A dead local engine surfaced Node's bare `fetch failed`, while the actual
 *     cause (`ECONNREFUSED 127.0.0.1:8880`) sat unread in `err.cause` — so an
 *     operator could not tell a crashed engine from a wrong base URL.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { useRealFetch } from '../../helpers/real-fetch'

// The global test setup stubs `fetch` to always answer 200. Left in place, every
// "engine is down" assertion below would pass for the wrong reason and a real
// regression would stay hidden. These tests are about actual reachability, so
// they run against real loopback sockets with the captured real fetch.
let restoreFetch: () => void

beforeAll(() => {
  restoreFetch = useRealFetch()
})

afterAll(() => {
  restoreFetch()
})

// ─── (2) error clarity in the HTTP adapter ──────────────────────────────────

describe('piper adapter error reporting', () => {
  it('names the URL and the underlying cause when the engine is unreachable', async () => {
    const { HttpTtsEngine } = await import('@/lib/voice/speech-adapters/http-engine')

    const engine = new HttpTtsEngine({
      id: 'tts-test',
      label: 'test engine',
      baseUrl: 'http://127.0.0.1:65535',
      languages: ['bn-BD'],
      local: true,
      contract: 'piper',
      timeoutMs: 2000,
    } as never)

    const err = await engine.synthesizeBytes({ text: 'পরীক্ষা' } as never).catch((e) => e)

    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('SpeechEngineUnavailableError')
    // The URL must be present so a bad VOICE_TTS_BASE_URL is obvious.
    expect(err.message).toContain('http://127.0.0.1:65535')
    // Not just "fetch failed" — the cause must be surfaced too.
    expect(err.message.toLowerCase()).toMatch(/econnrefused|cannot reach/)
  })

  it('rejects a zero-byte body instead of storing an empty audio file', async () => {
    const { HttpTtsEngine } = await import('@/lib/voice/speech-adapters/http-engine')
    const { SpeechEngineUnavailableError } = await import('@/lib/voice/speech')
    const engine = new HttpTtsEngine({
      id: 'tts-empty',
      label: 'empty engine',
      baseUrl: 'http://engine.invalid',
      languages: ['bn-BD'],
      local: true,
      contract: 'piper',
      timeoutMs: 2000,
    } as never)

    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(0), { status: 200 })))
    try {
      const err = await engine.synthesizeBytes({ text: 'x' } as never).catch((e) => e)
      expect(err).toBeInstanceOf(SpeechEngineUnavailableError)
      expect(err.message).toMatch(/zero bytes/i)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

// ─── content type must follow the bytes, not the request ────────────────────

describe('sniffContentType', () => {
  it('labels real WAV bytes as audio/wav even when mp3 was requested', async () => {
    const { sniffContentType } = await import('@/lib/voice/speech-adapters/http-engine')
    const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(64)])
    expect(sniffContentType(wav, 'mp3')).toBe('audio/wav')
  })

  it('labels an ID3-tagged stream as audio/mpeg even when wav was requested', async () => {
    const { sniffContentType } = await import('@/lib/voice/speech-adapters/http-engine')
    expect(sniffContentType(Buffer.from('ID3 something'), 'wav')).toBe('audio/mpeg')
  })

  it('detects a bare MPEG frame sync', async () => {
    const { sniffContentType } = await import('@/lib/voice/speech-adapters/http-engine')
    expect(sniffContentType(Buffer.from([0xff, 0xfb, 0x90, 0x00]), 'wav')).toBe('audio/mpeg')
  })

  it('falls back to the requested format for unrecognised bytes', async () => {
    const { sniffContentType } = await import('@/lib/voice/speech-adapters/http-engine')
    expect(sniffContentType(Buffer.from([0, 1, 2, 3]), 'wav')).toBe('audio/wav')
    expect(sniffContentType(Buffer.from([0, 1, 2, 3]), 'mp3')).toBe('audio/mpeg')
  })
})

// ─── (1) health re-probing ──────────────────────────────────────────────────

describe('speechCapabilitySnapshot liveness', () => {
  /**
   * A real HTTP server, not a module mock: the defect was that health was
   * cached from boot, and only a genuine "server answered, then stopped
   * answering" sequence proves the fix.
   */
  it('reports unavailable once a live engine stops answering', async () => {
    const http = await import('node:http')
    let alive = true
    const server = http.createServer((_req, res) => {
      if (!alive) {
        res.destroy() // simulate the process being killed
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{"object":"list"}')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as { port: number }).port
    const baseUrl = `http://127.0.0.1:${port}`

    const env = { ...process.env }
    process.env.VOICE_TTS_PROVIDER = 'piper'
    process.env.VOICE_TTS_BASE_URL = baseUrl
    process.env.VOICE_TTS_LANGUAGES = 'bn-BD'
    delete process.env.VOICE_ASR_PROVIDER

    vi.resetModules()
    try {
      const { speechCapabilitySnapshot, resetSpeechEngineBootstrapForTests } =
        await import('@/lib/voice/speech-bootstrap')
      resetSpeechEngineBootstrapForTests()

      const up = await speechCapabilitySnapshot()
      expect(up.tts.available).toBe(true)

      // Engine dies. Bypass both caches (the adapter's 10s TTL and the
      // snapshot's throttle) the way elapsed time would.
      alive = false
      await new Promise((resolve) => server.close(resolve))
      const realNow = Date.now
      Date.now = () => realNow() + 60_000
      try {
        const down = await speechCapabilitySnapshot()
        expect(down.tts.available).toBe(false)
      } finally {
        Date.now = realNow
      }
    } finally {
      process.env = env
      vi.resetModules()
    }
  })

  it('reports unavailable, with a reason, when the engine never answered at boot', async () => {
    const env = { ...process.env }
    process.env.VOICE_TTS_PROVIDER = 'piper'
    // Nothing is listening on this port.
    process.env.VOICE_TTS_BASE_URL = 'http://127.0.0.1:65534'
    process.env.VOICE_TTS_LANGUAGES = 'bn-BD'

    vi.resetModules()
    try {
      const { speechCapabilitySnapshot, resetSpeechEngineBootstrapForTests } =
        await import('@/lib/voice/speech-bootstrap')
      resetSpeechEngineBootstrapForTests()
      const snapshot = await speechCapabilitySnapshot()
      expect(snapshot.tts.available).toBe(false)
      // The engine stays REGISTERED (so the reason can be reported), it is just
      // not available — that distinction is what makes the failure diagnosable.
      expect(snapshot.registeredEngines).toContain('http-tts-piper')
    } finally {
      process.env = env
      vi.resetModules()
    }
  })
})
