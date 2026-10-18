/**
 * Media generation — provider request builders, configuration and validation.
 *
 * This module is deliberately dependency-free (no database, no storage) so the
 * request shapes can be unit-tested without a running app.
 *
 * Failure policy: without configuration every call throws
 * `Configuration required: ...` and the route returns 503. No placeholder
 * images, silent successes or fake job ids are ever produced.
 */


export type MediaKind = 'image' | 'audio' | 'video' | 'music';

export interface MediaProviderConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  imageModel: string;
  audioModel: string;
  videoEndpoint: string | null;
  videoStatusEndpoint: string | null;
  videoModel: string | null;
  musicEndpoint: string | null;
  musicStatusEndpoint: string | null;
  musicModel: string | null;
}

// ─── Configuration ─────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

export function resolveMediaProvider(env: Record<string, string | undefined> = process.env): {
  config: MediaProviderConfig | null;
  missing: string[];
} {
  const apiKey = env.MEDIA_API_KEY ?? env.OPENAI_API_KEY ?? '';
  const baseUrl = (env.MEDIA_BASE_URL ?? env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const videoEndpoint = env.MEDIA_VIDEO_ENDPOINT ?? null;
  const videoStatusEndpoint = env.MEDIA_VIDEO_STATUS_ENDPOINT ?? null;
  const musicEndpoint = env.MEDIA_MUSIC_ENDPOINT ?? null;
  const musicStatusEndpoint = env.MEDIA_MUSIC_STATUS_ENDPOINT ?? null;

  const missing: string[] = [];
  if (!apiKey && !videoEndpoint) missing.push('MEDIA_API_KEY (or OPENAI_API_KEY)');
  if (!apiKey && videoEndpoint) missing.push('MEDIA_API_KEY for image/audio generation');

  if (!apiKey) {
    return { config: null, missing };
  }

  return {
    config: {
      provider: env.MEDIA_PROVIDER ?? 'openai-compatible',
      apiKey,
      baseUrl,
      imageModel: env.MEDIA_IMAGE_MODEL ?? 'gpt-image-1',
      audioModel: env.MEDIA_AUDIO_MODEL ?? 'gpt-4o-mini-tts',
      videoEndpoint,
      videoStatusEndpoint,
      videoModel: env.MEDIA_VIDEO_MODEL ?? null,
      musicEndpoint,
      musicStatusEndpoint,
      musicModel: env.MEDIA_MUSIC_MODEL ?? null,
    },
    missing,
  };
}

export class MediaConfigurationError extends Error {
  constructor(message: string) {
    super(`Configuration required: ${message}`);
    this.name = 'MediaConfigurationError';
  }
}

// ─── Request builders (pure, unit-tested) ─────────────────────────────────

export interface ImageRequestOptions {
  prompt: string;
  count: number;
  model: string;
  size?: string;
}

/** OpenAI Images API request (`POST {base}/images/generations`). */
export function buildImageRequest(config: MediaProviderConfig, options: ImageRequestOptions) {
  const count = Math.min(4, Math.max(1, Math.round(options.count)));
  return {
    url: `${config.baseUrl}/images/generations`,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: {
      model: options.model || config.imageModel,
      prompt: options.prompt,
      n: count,
      size: options.size ?? '1024x1024',
    },
  };
}

export interface SpeechRequestOptions {
  text: string;
  voice?: string;
  model?: string;
  format?: 'mp3' | 'wav' | 'opus';
  /** Delivery guidance supported by gpt-4o-mini-tts-style models. */
  instructions?: string;
}

/** OpenAI Speech API request (`POST {base}/audio/speech`, binary response). */
export function buildSpeechRequest(config: MediaProviderConfig, options: SpeechRequestOptions) {
  return {
    url: `${config.baseUrl}/audio/speech`,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: {
      model: options.model || config.audioModel,
      input: options.text,
      voice: options.voice ?? 'alloy',
      response_format: options.format ?? 'mp3',
      ...(options.instructions ? { instructions: options.instructions.slice(0, 400) } : {}),
    },
  };
}

export interface VideoRequestOptions {
  prompt: string;
  durationSeconds?: number;
  model?: string;
}

/** Configurable video-job submission. Contract documented in docs/MEDIA_GENERATION.md. */
export function buildVideoRequest(config: MediaProviderConfig, options: VideoRequestOptions) {
  if (!config.videoEndpoint) {
    throw new MediaConfigurationError(
      'video generation needs MEDIA_VIDEO_ENDPOINT (and optionally MEDIA_VIDEO_STATUS_ENDPOINT)',
    );
  }
  return {
    url: config.videoEndpoint,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: {
      model: options.model || config.videoModel,
      prompt: options.prompt,
      duration_seconds: Math.min(60, Math.max(1, options.durationSeconds ?? 5)),
    },
  };
}

export interface MusicRequestOptions {
  prompt: string;
  genre?: string;
  mood?: string;
  model?: string;
  /** Beats per minute; providers that support it honour the value. */
  tempo?: number;
  instrumental?: boolean;
  lyrics?: string;
}

/** Configurable music-job submission (Mureka / Suno-style APIs). */
export function buildMusicRequest(config: MediaProviderConfig, options: MusicRequestOptions) {
  if (!config.musicEndpoint) {
    throw new MediaConfigurationError(
      'music generation needs MEDIA_MUSIC_ENDPOINT (and optionally MEDIA_MUSIC_STATUS_ENDPOINT)',
    );
  }
  return {
    url: config.musicEndpoint,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: {
      model: options.model || config.musicModel,
      prompt: [options.prompt, options.genre ? `genre: ${options.genre}` : '', options.mood ? `mood: ${options.mood}` : '']
        .filter(Boolean)
        .join('. '),
      genre: options.genre,
      mood: options.mood,
      ...(options.tempo ? { tempo: options.tempo } : {}),
      ...(options.instrumental !== undefined ? { instrumental: options.instrumental } : {}),
      ...(options.lyrics ? { lyrics: options.lyrics.slice(0, 3000) } : {}),
    },
  };
}

export interface GenerationInput {
  kind: MediaKind;
  prompt: string;
  model?: string;
  count?: number;
  size?: string;
  voice?: string;
  format?: 'mp3' | 'wav' | 'opus';
  durationSeconds?: number;
  genre?: string;
  mood?: string;
  style?: string;
  tempo?: number;
  instrumental?: boolean;
  lyrics?: string;
  voiceStyle?: string;
  consent?: boolean;
  /** Speech delivery instructions (gpt-4o-mini-tts `instructions`). */
  instructions?: string;
}

/** Validate a generation request before any provider call. */
export function validateGenerationInput(input: Partial<GenerationInput>): GenerationInput {
  const kind = input.kind;
  if (kind !== 'image' && kind !== 'audio' && kind !== 'video' && kind !== 'music') {
    throw new Error('kind must be "image", "audio", "video" or "music"');
  }
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
  if (prompt.length < 3) throw new Error('prompt must be at least 3 characters');
  if (prompt.length > 4000) throw new Error('prompt must be at most 4000 characters');

  if (input.count !== undefined && (!Number.isInteger(input.count) || input.count < 1 || input.count > 4)) {
    throw new Error('count must be an integer between 1 and 4');
  }
  if (input.durationSeconds !== undefined && (typeof input.durationSeconds !== 'number' || input.durationSeconds < 1)) {
    throw new Error('durationSeconds must be a positive number');
  }
  if (input.format !== undefined && !['mp3', 'wav', 'opus'].includes(input.format)) {
    throw new Error('format must be mp3, wav or opus');
  }
  if (input.tempo !== undefined && (typeof input.tempo !== 'number' || input.tempo < 20 || input.tempo > 300)) {
    throw new Error('tempo must be between 20 and 300 BPM');
  }
  if (input.lyrics !== undefined && input.lyrics.length > 3000) {
    throw new Error('lyrics must be at most 3000 characters');
  }
  return {
    kind,
    prompt,
    ...(input.model ? { model: String(input.model).slice(0, 120) } : {}),
    ...(input.count ? { count: input.count } : {}),
    ...(input.size ? { size: String(input.size).slice(0, 20) } : {}),
    ...(input.voice ? { voice: String(input.voice).slice(0, 40) } : {}),
    ...(input.format ? { format: input.format } : {}),
    ...(input.durationSeconds ? { durationSeconds: input.durationSeconds } : {}),
    ...(input.genre ? { genre: String(input.genre).slice(0, 60) } : {}),
    ...(input.mood ? { mood: String(input.mood).slice(0, 60) } : {}),
    ...(input.tempo ? { tempo: input.tempo } : {}),
    ...(input.instrumental !== undefined ? { instrumental: Boolean(input.instrumental) } : {}),
    ...(input.lyrics ? { lyrics: String(input.lyrics).slice(0, 3000) } : {}),
    ...(input.style ? { style: String(input.style).slice(0, 60) } : {}),
    ...(input.voiceStyle ? { voiceStyle: String(input.voiceStyle).slice(0, 60) } : {}),
    ...(input.consent !== undefined ? { consent: Boolean(input.consent) } : {}),
    ...(input.instructions ? { instructions: String(input.instructions).slice(0, 400) } : {}),
  };
}

