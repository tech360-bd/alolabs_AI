import { describe, expect, it } from 'vitest';
import {
  buildImageRequest,
  buildMusicRequest,
  buildSpeechRequest,
  buildVideoRequest,
  MediaConfigurationError,
  resolveMediaProvider,
  validateGenerationInput,
} from '@/lib/media-generation/requests';
import { transcribe } from '@/lib/media-generation/transcribe';

const config = {
  provider: 'test',
  apiKey: 'sk-test',
  baseUrl: 'https://media.test/v1',
  imageModel: 'img-1',
  audioModel: 'tts-1',
  videoEndpoint: 'https://media.test/videos',
  videoStatusEndpoint: 'https://media.test/videos/{id}',
  videoModel: 'vid-1',
  musicEndpoint: 'https://media.test/music',
  musicStatusEndpoint: 'https://media.test/music/{id}',
  musicModel: 'mus-1',
};

describe('resolveMediaProvider', () => {
  it('returns no config and lists the missing variable when no key is set', () => {
    const { config: resolved, missing } = resolveMediaProvider({});
    expect(resolved).toBeNull();
    expect(missing.join(' ')).toContain('MEDIA_API_KEY');
  });

  it('does not require a key when only a video endpoint is configured', () => {
    const { config: resolved, missing } = resolveMediaProvider({
      MEDIA_VIDEO_ENDPOINT: 'https://media.test/videos',
    });
    expect(resolved).toBeNull();
    expect(missing.join(' ')).toContain('MEDIA_API_KEY for image/audio generation');
  });

  it('accepts OPENAI_API_KEY as a fallback and trims trailing slashes', () => {
    const { config: resolved } = resolveMediaProvider({
      OPENAI_API_KEY: 'sk-openai',
      OPENAI_BASE_URL: 'https://proxy.test/v1///',
    });
    expect(resolved?.apiKey).toBe('sk-openai');
    expect(resolved?.baseUrl).toBe('https://proxy.test/v1');
    expect(resolved?.imageModel).toBe('gpt-image-1');
  });

  it('surfaces the music and video endpoints from the environment', () => {
    const { config: resolved } = resolveMediaProvider({
      MEDIA_API_KEY: 'sk',
      MEDIA_MUSIC_ENDPOINT: 'https://music.test/jobs',
      MEDIA_MUSIC_STATUS_ENDPOINT: 'https://music.test/jobs/{id}',
      MEDIA_MUSIC_MODEL: 'm1',
    });
    expect(resolved?.musicEndpoint).toBe('https://music.test/jobs');
    expect(resolved?.musicStatusEndpoint).toBe('https://music.test/jobs/{id}');
    expect(resolved?.musicModel).toBe('m1');
  });
});

describe('request builders', () => {
  it('builds an images request with auth and a bounded n', () => {
    const request = buildImageRequest(config, { prompt: 'a cat', count: 9, model: 'img-1' });
    expect(request.url).toBe('https://media.test/v1/images/generations');
    expect(request.headers.Authorization).toBe('Bearer sk-test');
    expect((request.body as { n: number }).n).toBe(4);
    expect((request.body as { size: string }).size).toBe('1024x1024');
  });

  it('builds a speech request with format and instructions', () => {
    const request = buildSpeechRequest(config, {
      text: 'hello',
      voice: 'nova',
      format: 'wav',
      instructions: 'Speak warmly.',
    });
    const body = request.body as Record<string, unknown>;
    expect(request.url).toBe('https://media.test/v1/audio/speech');
    expect(body.voice).toBe('nova');
    expect(body.response_format).toBe('wav');
    expect(body.instructions).toBe('Speak warmly.');
  });

  it('rejects video generation without an endpoint', () => {
    expect(() => buildVideoRequest({ ...config, videoEndpoint: null }, { prompt: 'x' })).toThrow(
      MediaConfigurationError,
    );
  });

  it('rejects music generation without an endpoint', () => {
    expect(() => buildMusicRequest({ ...config, musicEndpoint: null }, { prompt: 'x' })).toThrow(
      /MEDIA_MUSIC_ENDPOINT/,
    );
  });

  it('folds genre and mood into the music prompt', () => {
    const request = buildMusicRequest(config, { prompt: 'calm bed', genre: 'jazz', mood: 'warm' });
    expect((request.body as { prompt: string }).prompt).toBe('calm bed. genre: jazz. mood: warm');
  });

  it('clamps video duration to 1–60 seconds', () => {
    expect((buildVideoRequest(config, { prompt: 'x', durationSeconds: 600 }).body as { duration_seconds: number }).duration_seconds).toBe(60);
    expect((buildVideoRequest(config, { prompt: 'x', durationSeconds: 0 }).body as { duration_seconds: number }).duration_seconds).toBe(1);
  });
});

describe('transcribe provider execution', () => {
  it('fails closed instead of making a direct provider request', async () => {
    await expect(
      transcribe(config, { buffer: Buffer.from('audio'), filename: 'audio.mp3' }),
    ).rejects.toThrow(/Direct transcription provider calls are disabled/);
  });
});

describe('validateGenerationInput', () => {
  it('rejects an unknown kind', () => {
    expect(() => validateGenerationInput({ kind: 'gif' as never, prompt: 'abc' })).toThrow(/kind must/);
  });

  it('rejects prompts shorter than 3 characters and longer than 4000', () => {
    expect(() => validateGenerationInput({ kind: 'image', prompt: ' ab ' })).toThrow(/at least 3/);
    expect(() => validateGenerationInput({ kind: 'image', prompt: 'a'.repeat(4001) })).toThrow(/at most 4000/);
  });

  it('rejects a count outside 1–4 and a bad format', () => {
    expect(() => validateGenerationInput({ kind: 'image', prompt: 'abc', count: 0 })).toThrow(/count/);
    expect(() =>
      validateGenerationInput({ kind: 'audio', prompt: 'abc', format: 'flac' as never }),
    ).toThrow(/format/);
  });

  it('trims the prompt and preserves music/voice metadata', () => {
    const input = validateGenerationInput({
      kind: 'music',
      prompt: '  a calm bed  ',
      genre: 'jazz',
      mood: 'warm',
      consent: true,
    });
    expect(input.prompt).toBe('a calm bed');
    expect(input.genre).toBe('jazz');
    expect(input.mood).toBe('warm');
    expect(input.consent).toBe(true);
  });

  it('accepts all four generation kinds', () => {
    for (const kind of ['image', 'audio', 'video', 'music'] as const) {
      expect(validateGenerationInput({ kind, prompt: 'valid prompt' }).kind).toBe(kind);
    }
  });
});
