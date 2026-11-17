/**
 * Regression tests for multi-chunk audio merging.
 *
 * The bug these guard against: a two-sentence TTS job produced a WAV whose
 * header declared 62 KB while 247 KB followed (two files concatenated), so
 * players played sentence one and stopped. It shipped silently — status
 * "completed", `simulated: false`, real audio — and only a byte-level check
 * caught it. These tests exist so it cannot come back.
 */
import { describe, expect, it } from 'vitest'
import {
  AudioConcatError,
  buildWavHeader,
  concatSpeechChunks,
  concatWavBuffers,
  parseWav,
  wavDurationSeconds,
} from '@/lib/voice/audio-concat'

const FORMAT_22K = { audioFormat: 1, channels: 1, sampleRate: 22050, bitsPerSample: 16 }

/** Build a WAV of `seconds` of silence (or a constant value) at 22050 Hz mono 16-bit. */
function makeWav(seconds: number, format = FORMAT_22K, fill = 1000): Buffer {
  const samples = Math.round(format.sampleRate * seconds)
  const pcm = Buffer.alloc(samples * 2)
  for (let i = 0; i < samples; i++) pcm.writeInt16LE(fill, i * 2)
  return Buffer.concat([buildWavHeader(format, pcm.length), pcm])
}

describe('parseWav', () => {
  it('reads format and PCM payload', () => {
    const wav = makeWav(1)
    const parsed = parseWav(wav)
    expect(parsed.format).toEqual(FORMAT_22K)
    expect(parsed.pcm.length).toBe(44100)
  })

  it('rejects a non-WAV buffer instead of guessing', () => {
    expect(() => parseWav(Buffer.from('ID3 mp3 pretending'))).toThrow(AudioConcatError)
  })

  it('rejects a truncated WAV rather than returning partial audio', () => {
    const wav = makeWav(1)
    const truncated = wav.subarray(0, wav.length - 500)
    expect(() => parseWav(truncated)).toThrow(/truncated/i)
  })

  it('rejects compressed encodings that cannot be byte-merged', () => {
    const adpcm = makeWav(0.1, { ...FORMAT_22K, audioFormat: 2 })
    expect(() => parseWav(adpcm)).toThrow(/unsupported WAV encoding/i)
  })
})

describe('concatWavBuffers', () => {
  it('produces ONE RIFF header whose declared size matches the payload', () => {
    const merged = concatWavBuffers([makeWav(1), makeWav(0.5), makeWav(2)])

    // The original defect: one "RIFF" per chunk.
    const riffCount = (merged.toString('latin1').match(/RIFF/g) || []).length
    expect(riffCount).toBe(1)

    const declared = merged.readUInt32LE(40)
    expect(declared).toBe(merged.length - 44)
    expect(merged.readUInt32LE(4)).toBe(merged.length - 8)
  })

  it('sums the durations of every part', () => {
    const merged = concatWavBuffers([makeWav(1), makeWav(0.5), makeWav(2)])
    expect(wavDurationSeconds(merged)).toBeCloseTo(3.5, 2)
  })

  it('keeps the PCM samples of every part in order', () => {
    const merged = concatWavBuffers([makeWav(0.1, FORMAT_22K, 111), makeWav(0.1, FORMAT_22K, 222)])
    const { pcm } = parseWav(merged)
    expect(pcm.readInt16LE(0)).toBe(111)
    // second part starts after the first part's 2205 samples
    expect(pcm.readInt16LE(2205 * 2)).toBe(222)
  })

  it('refuses to mix differing sample rates instead of emitting pitch-shifted audio', () => {
    const a = makeWav(0.5)
    const b = makeWav(0.5, { ...FORMAT_22K, sampleRate: 16000 })
    expect(() => concatWavBuffers([a, b])).toThrow(/different format/i)
  })

  it('refuses to mix different channel counts', () => {
    const a = makeWav(0.5)
    const b = makeWav(0.5, { ...FORMAT_22K, channels: 2 })
    expect(() => concatWavBuffers([a, b])).toThrow(/different format/i)
  })

  it('rejects an empty part list', () => {
    expect(() => concatWavBuffers([])).toThrow(AudioConcatError)
  })

  it('names the offending part so a failure is diagnosable', () => {
    expect(() => concatWavBuffers([makeWav(0.1), Buffer.from('junk')])).toThrow(/part 2\/2/)
  })
})

describe('concatSpeechChunks', () => {
  it('merges WAV correctly when the job format is wav', () => {
    const merged = concatSpeechChunks([makeWav(1), makeWav(1)], 'wav')
    expect((merged.toString('latin1').match(/RIFF/g) || []).length).toBe(1)
    expect(wavDurationSeconds(merged)).toBeCloseTo(2, 2)
  })

  it('byte-concatenates frame-based formats like mp3', () => {
    const a = Buffer.from([0xff, 0xfb, 0x90, 0x00])
    const b = Buffer.from([0xff, 0xfb, 0x90, 0x00])
    expect(concatSpeechChunks([a, b], 'mp3')).toEqual(Buffer.concat([a, b]))
  })

  it('returns a single chunk untouched (no needless re-encode)', () => {
    const only = makeWav(1)
    expect(concatSpeechChunks([only], 'wav')).toBe(only)
  })
})
