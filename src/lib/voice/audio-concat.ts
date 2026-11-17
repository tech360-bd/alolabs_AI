/**
 * Audio concatenation for multi-chunk speech jobs.
 *
 * WHY THIS EXISTS
 * ---------------
 * Long text is split into sentence-sized chunks and synthesised separately, so
 * the engine returns N independent audio files. The old code did
 * `Buffer.concat(parts)` and stored the result. That is only correct for a
 * streamable codec. For WAV it produced a file whose header declares the size
 * of the FIRST chunk while 4x more data follows — so a player plays the first
 * sentence and stops, silently truncating the rest.
 *
 * This module merges WAV chunks properly: one RIFF header, concatenated PCM
 * data, and a correct data/RIFF length. Chunks whose format does not match the
 * first one are rejected rather than silently mixed, because mixing sample
 * rates yields pitch-shifted garbage that sounds like a broken engine.
 *
 * MP3 is handled by plain concatenation, which IS valid: an MPEG stream is a
 * sequence of independent frames and players decode them back to back.
 */

export interface WavFormat {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
}

export class AudioConcatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AudioConcatError';
  }
}

function isRiff(buffer: Buffer): boolean {
  return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE';
}

interface ParsedWav {
  format: WavFormat;
  pcm: Buffer;
}

/**
 * Parse a canonical PCM WAV file.
 *
 * Only uncompressed PCM (audioFormat 1) is accepted. A float/ADPCM/compressed
 * payload cannot be merged by byte concatenation, and pretending otherwise
 * would produce a file that plays as noise.
 */
export function parseWav(buffer: Buffer): ParsedWav {
  if (!isRiff(buffer)) throw new AudioConcatError('not a RIFF/WAVE file');

  let offset = 12;
  let format: WavFormat | null = null;
  let pcm: Buffer | null = null;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    // A truncated tail is a real failure, not something to paper over.
    if (body + chunkSize > buffer.length) {
      throw new AudioConcatError(`truncated WAV: chunk "${chunkId}" claims ${chunkSize} bytes, ${buffer.length - body} available`);
    }

    if (chunkId === 'fmt ' && chunkSize >= 16) {
      format = {
        audioFormat: buffer.readUInt16LE(body),
        channels: buffer.readUInt16LE(body + 2),
        sampleRate: buffer.readUInt32LE(body + 4),
        bitsPerSample: buffer.readUInt16LE(body + 14),
      };
    } else if (chunkId === 'data') {
      pcm = buffer.subarray(body, body + chunkSize);
    }

    // Chunks are word-aligned: an odd size is followed by one pad byte.
    offset = body + chunkSize + (chunkSize % 2);
  }

  if (!format) throw new AudioConcatError('WAV has no "fmt " chunk');
  if (!pcm) throw new AudioConcatError('WAV has no "data" chunk');
  if (format.audioFormat !== 1) {
    throw new AudioConcatError(`unsupported WAV encoding ${format.audioFormat} — only uncompressed PCM can be merged`);
  }
  return { format, pcm };
}

function sameFormat(a: WavFormat, b: WavFormat): boolean {
  return a.audioFormat === b.audioFormat && a.channels === b.channels &&
    a.sampleRate === b.sampleRate && a.bitsPerSample === b.bitsPerSample;
}

/** Build a canonical 44-byte PCM WAV header for `dataLength` bytes of PCM. */
export function buildWavHeader(format: WavFormat, dataLength: number): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = format.sampleRate * format.channels * (format.bitsPerSample / 8);
  const blockAlign = format.channels * (format.bitsPerSample / 8);

  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataLength, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(format.audioFormat, 20);
  header.writeUInt16LE(format.channels, 22);
  header.writeUInt32LE(format.sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(format.bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataLength, 40);
  return header;
}

/**
 * Merge N WAV files into one playable WAV.
 *
 * Throws `AudioConcatError` when the parts are not all the same PCM format,
 * because a silently mixed file is worse than a loud failure: it would reach a
 * customer as distorted audio attributed to the model.
 */
export function concatWavBuffers(parts: Buffer[]): Buffer {
  if (parts.length === 0) throw new AudioConcatError('no audio parts to merge');

  const parsed = parts.map((part, index) => {
    try {
      return parseWav(part);
    } catch (err) {
      throw new AudioConcatError(`part ${index + 1}/${parts.length}: ${err instanceof Error ? err.message : 'unparseable'}`);
    }
  });

  const [first, ...rest] = parsed;
  for (let i = 0; i < rest.length; i++) {
    if (!sameFormat(first.format, rest[i].format)) {
      throw new AudioConcatError(
        `part ${i + 2}/${parts.length} has a different format ` +
        `(${rest[i].format.sampleRate}Hz/${rest[i].format.channels}ch/${rest[i].format.bitsPerSample}bit) ` +
        `than the first part (${first.format.sampleRate}Hz/${first.format.channels}ch/${first.format.bitsPerSample}bit)`,
      );
    }
  }

  const pcm = Buffer.concat([first.pcm, ...rest.map((p) => p.pcm)]);
  return Buffer.concat([buildWavHeader(first.format, pcm.length), pcm]);
}

/** Duration of a canonical PCM WAV, in seconds. */
export function wavDurationSeconds(buffer: Buffer): number {
  const { format, pcm } = parseWav(buffer);
  const bytesPerSecond = format.sampleRate * format.channels * (format.bitsPerSample / 8);
  return bytesPerSecond > 0 ? pcm.length / bytesPerSecond : 0;
}

/**
 * Merge speech chunks into one deliverable.
 *
 * `format` comes from the job's own request, so the decision of how to combine
 * the parts is explicit rather than guessed from the first four bytes.
 */
export function concatSpeechChunks(parts: Buffer[], format: string): Buffer {
  if (parts.length === 0) throw new AudioConcatError('no audio parts to merge');
  if (parts.length === 1) return parts[0];
  if (format === 'wav') return concatWavBuffers(parts);
  // MP3 (and other frame-based streams) concatenate cleanly.
  return Buffer.concat(parts);
}
