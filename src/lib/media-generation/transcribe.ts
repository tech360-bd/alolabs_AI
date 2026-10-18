/**
 * Speech-to-text / subtitle generation (the VideoCaptioner capability).
 *
 * Uses the OpenAI-compatible transcription contract:
 *   POST {base}/audio/transcriptions  (multipart: file, model, language, prompt)
 *   response_format=verbose_json → { text, language, segments: [{ start, end, text }] }
 *
 * Pure helpers live here (request shape + subtitle formatting) so they can be
 * unit-tested without network access; `transcribe` performs the call.
 */

import type { MediaProviderConfig } from './requests';

export interface TranscriptionOptions {
  buffer: Buffer;
  filename: string;
  mimeType?: string;
  language?: string;
  prompt?: string;
  model?: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptResult {
  text: string;
  language: string | null;
  segments: TranscriptSegment[];
  srt: string;
  vtt: string;
}

export function buildTranscriptionRequest(config: MediaProviderConfig, options: TranscriptionOptions) {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(options.buffer)], { type: options.mimeType || 'application/octet-stream' }), options.filename);
  form.append('model', options.model || process.env.MEDIA_TRANSCRIBE_MODEL || 'whisper-1');
  form.append('response_format', 'verbose_json');
  if (options.language) form.append('language', options.language);
  if (options.prompt) form.append('prompt', options.prompt.slice(0, 1000));

  return {
    url: `${config.baseUrl}/audio/transcriptions`,
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: form,
  };
}

function pad(value: number, width = 2): string {
  return String(Math.floor(value)).padStart(width, '0');
}

/** SRT timestamp: HH:MM:SS,mmm */
export function srtTimestamp(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const millis = Math.round((safe - Math.floor(safe)) * 1000);
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${pad(millis, 3)}`;
}

/** WebVTT timestamp: HH:MM:SS.mmm */
export function vttTimestamp(seconds: number): string {
  return srtTimestamp(seconds).replace(',', '.');
}

export function formatSrt(segments: TranscriptSegment[]): string {
  return segments
    .filter((segment) => segment.text.trim().length > 0)
    .map((segment, index) => {
      const start = Math.min(segment.start, segment.end);
      const end = Math.max(segment.start, segment.end);
      return `${index + 1}\n${srtTimestamp(start)} --> ${srtTimestamp(end)}\n${segment.text.trim()}`;
    })
    .join('\n\n')
    .concat(segments.length ? '\n' : '');
}

export function formatVtt(segments: TranscriptSegment[]): string {
  const body = segments
    .filter((segment) => segment.text.trim().length > 0)
    .map((segment) => {
      const start = Math.min(segment.start, segment.end);
      const end = Math.max(segment.start, segment.end);
      return `${vttTimestamp(start)} --> ${vttTimestamp(end)}\n${segment.text.trim()}`;
    })
    .join('\n\n');
  return `WEBVTT\n\n${body}${body ? '\n' : ''}`;
}

export function normaliseSegments(raw: unknown): TranscriptSegment[] {
  if (!Array.isArray(raw)) return [];
  const segments: TranscriptSegment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const start = Number(record.start);
    const end = Number(record.end);
    const text = typeof record.text === 'string' ? record.text : '';
    if (!Number.isFinite(start) || !Number.isFinite(end) || !text) continue;
    segments.push({ start, end, text });
  }
  return segments.sort((a, b) => a.start - b.start);
}

export async function transcribe(
  config: MediaProviderConfig,
  options: TranscriptionOptions,
): Promise<TranscriptResult> {
  const request = buildTranscriptionRequest(config, options);
  const response = await fetch(request.url, {
    method: 'POST',
    headers: request.headers,
    body: request.body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let message = text.slice(0, 300) || `HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } | string };
      if (typeof parsed.error === 'string') message = parsed.error;
      else if (parsed.error?.message) message = parsed.error.message;
    } catch {
      // keep the raw text
    }
    throw new Error(`Transcription provider error: ${message}`);
  }

  const payload = (await response.json()) as {
    text?: string;
    language?: string;
    segments?: unknown;
  };
  const segments = normaliseSegments(payload.segments);

  return {
    text: (payload.text ?? segments.map((segment) => segment.text).join(' ')).trim(),
    language: payload.language ?? null,
    segments,
    srt: formatSrt(segments),
    vtt: formatVtt(segments),
  };
}
