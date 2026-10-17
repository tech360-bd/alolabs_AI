/**
 * Media generation — real provider calls for image, speech, music and video.
 *
 * The Media Studio panel previously rendered an empty state because no
 * generation backend existed. This module talks to an OpenAI-compatible media
 * API (images + speech) and to configurable video/music job endpoints, persists
 * every job, and stores produced bytes through the storage provider so the
 * Media Library can serve them.
 *
 * Failure policy: without configuration every call throws
 * `Configuration required: ...` and the route returns 503. No placeholder
 * images, silent successes or fake job ids are ever produced.
 */

import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { getStorage } from '@/lib/storage';
import {
  buildImageRequest,
  buildMusicRequest,
  buildSpeechRequest,
  buildVideoRequest,
  MediaConfigurationError,
  resolveMediaProvider,
  type GenerationInput,
  type MediaKind,
} from './requests';

export * from './requests';

export interface MediaAsset {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  size: number;
  kind: MediaKind;
  external: boolean;
}

export interface MediaJob {
  id: string;
  kind: MediaKind;
  prompt: string;
  model: string | null;
  status: JobStatus;
  provider: string;
  providerJobId: string | null;
  assets: MediaAsset[];
  error: string | null;
  /** Prompt-side options echoed back for the studio tables (genre/mood/style/voiceStyle/consent). */
  metadata: Record<string, string | boolean>;
  companyId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

// ─── Job persistence ───────────────────────────────────────────────────────

const JOB_PREFIX = 'media:job:';

async function saveJob(job: MediaJob): Promise<void> {
  const value = JSON.stringify(job);
  await db.settings.upsert({
    where: { key: `${JOB_PREFIX}${job.id}` },
    update: { value, type: 'json' },
    create: { id: randomUUID(), key: `${JOB_PREFIX}${job.id}`, value, type: 'json' },
  });
}

export async function getJob(id: string): Promise<MediaJob | null> {
  const row = await db.settings.findUnique({ where: { key: `${JOB_PREFIX}${id}` } });
  if (!row) return null;
  try {
    return JSON.parse(row.value) as MediaJob;
  } catch {
    return null;
  }
}

export async function listJobs(companyId: string, limit = 20, kind?: MediaKind): Promise<MediaJob[]> {
  const rows = await db.settings.findMany({
    where: { key: { startsWith: JOB_PREFIX } },
    orderBy: { createdAt: 'desc' },
    take: limit * 2,
  });
  const jobs: MediaJob[] = [];
  for (const row of rows) {
    try {
      const job = JSON.parse(row.value) as MediaJob;
      if (job.companyId === companyId && (!kind || job.kind === kind)) jobs.push(job);
    } catch {
      // skip malformed job records
    }
  }
  return jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

/** Map a stored job to the row shape the studio tables render. */
export function jobToRow(job: MediaJob) {
  return {
    id: job.id,
    title: job.prompt.slice(0, 120),
    prompt: job.prompt,
    name: job.assets[0]?.name ?? null,
    url: job.assets[0]?.url ?? null,
    status: job.status,
    model: job.model,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    ...job.metadata,
  };
}

// ─── Asset persistence ─────────────────────────────────────────────────────

type MediaFileRecord = {
  id: string;
  name: string;
  url: string;
  size: number;
  type: MediaKind | 'document';
  mimeType: string;
  folder: string;
  tags: string[];
  thumbnailUrl: string | null;
  uploadedBy: string;
  companyId?: string;
  createdAt: string;
  updatedAt: string;
};

async function registerMediaFile(record: MediaFileRecord): Promise<void> {
  await db.settings.create({
    data: { id: randomUUID(), key: `media:file:${record.id}`, value: JSON.stringify(record), type: 'json' },
  });
}

async function storeBytes(
  buffer: Buffer,
  name: string,
  mimeType: string,
  kind: MediaKind,
  companyId: string,
  userId: string,
): Promise<MediaAsset> {
  const storage = getStorage();
  // Storage folder names are single path segments (the provider strips slashes),
  // so use `generated-<kind>` and record the same value.
  const folder = `generated-${kind}`;
  const uploaded = await storage.upload(buffer, name, {
    folder,
    companyId,
    uploadedBy: userId,
    mimeType,
  });
  const now = new Date().toISOString();
  await registerMediaFile({
    id: uploaded.id,
    name: uploaded.originalName,
    url: uploaded.url,
    size: uploaded.size,
    type: kind,
    mimeType: uploaded.mimeType,
    folder,
    tags: ['generated'],
    thumbnailUrl: null,
    uploadedBy: userId,
    companyId,
    createdAt: now,
    updatedAt: now,
  });
  return {
    id: uploaded.id,
    name: uploaded.originalName,
    url: uploaded.url,
    mimeType: uploaded.mimeType,
    size: uploaded.size,
    kind,
    external: false,
  };
}

async function registerRemote(url: string, kind: MediaKind): Promise<MediaAsset> {
  const name = url.split('/').pop()?.split('?')[0] || `${kind}-${Date.now()}`;
  const mimeType =
    kind === 'video' ? 'video/mp4' : kind === 'audio' || kind === 'music' ? 'audio/mpeg' : 'image/png';
  const id = `external-${randomUUID()}`;
  await registerMediaFile({
    id,
    name,
    url,
    size: 0,
    type: kind,
    mimeType,
    folder: `generated/${kind}`,
    tags: ['generated', 'external'],
    thumbnailUrl: null,
    uploadedBy: 'system',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return { id, name, url, mimeType, size: 0, kind, external: true };
}

// ─── Provider calls ────────────────────────────────────────────────────────

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<Response> {
  return fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
}

async function readError(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } | string };
    if (typeof parsed.error === 'string') return parsed.error;
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    // fall through to raw text
  }
  return text.slice(0, 300) || `HTTP ${response.status}`;
}

export interface GenerationContext {
  companyId: string;
  userId: string;
}

export async function generate(
  input: GenerationInput,
  context: GenerationContext,
  env: Record<string, string | undefined> = process.env,
): Promise<MediaJob> {
  const { config } = resolveMediaProvider(env);
  if (!config) {
    throw new MediaConfigurationError(
      'set MEDIA_API_KEY (or OPENAI_API_KEY) to enable image and speech generation',
    );
  }

  const now = new Date().toISOString();
  const job: MediaJob = {
    id: randomUUID(),
    kind: input.kind,
    prompt: input.prompt,
    model:
      input.model ??
      (input.kind === 'image'
        ? config.imageModel
        : input.kind === 'audio'
          ? config.audioModel
          : input.kind === 'music'
            ? config.musicModel
            : config.videoModel),
    status: 'processing',
    provider: config.provider,
    providerJobId: null,
    assets: [],
    error: null,
    metadata: {
      ...(input.genre ? { genre: input.genre } : {}),
      ...(input.mood ? { mood: input.mood } : {}),
      ...(input.tempo ? { tempo: String(input.tempo) } : {}),
      ...(input.instrumental !== undefined ? { instrumental: input.instrumental } : {}),
      ...(input.style ? { style: input.style } : {}),
      ...(input.voiceStyle ? { voiceStyle: input.voiceStyle } : {}),
      ...(input.consent !== undefined ? { consent: input.consent } : {}),
    },
    companyId: context.companyId,
    userId: context.userId,
    createdAt: now,
    updatedAt: now,
  };
  await saveJob(job);

  try {
    if (input.kind === 'image') {
      const request = buildImageRequest(config, {
        prompt: input.prompt,
        count: input.count ?? 1,
        model: input.model ?? config.imageModel,
        ...(input.size ? { size: input.size } : {}),
      });
      const response = await postJson(request.url, request.headers, request.body);
      if (!response.ok) throw new Error(`Image provider error: ${await readError(response)}`);

      const payload = (await response.json()) as {
        data?: Array<{ b64_json?: string; url?: string }>;
      };
      const items = Array.isArray(payload.data) ? payload.data : [];
      if (items.length === 0) throw new Error('Image provider returned no images');

      for (const [index, item] of items.entries()) {
        if (item.b64_json) {
          const buffer = Buffer.from(item.b64_json, 'base64');
          job.assets.push(
            await storeBytes(buffer, `generated-${job.id.slice(0, 8)}-${index + 1}.png`, 'image/png', 'image', context.companyId, context.userId),
          );
        } else if (item.url) {
          job.assets.push(await registerRemote(item.url, 'image'));
        }
      }
      job.status = 'completed';
    } else if (input.kind === 'audio') {
      const request = buildSpeechRequest(config, {
        text: input.prompt,
        ...(input.voice ? { voice: input.voice } : {}),
        ...(input.model ? { model: input.model } : {}),
        ...(input.format ? { format: input.format } : {}),
        ...(input.instructions ? { instructions: input.instructions } : {}),
      });
      const response = await postJson(request.url, request.headers, request.body);
      if (!response.ok) throw new Error(`Speech provider error: ${await readError(response)}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length === 0) throw new Error('Speech provider returned an empty body');
      const format = input.format ?? 'mp3';
      job.assets.push(
        await storeBytes(buffer, `generated-${job.id.slice(0, 8)}.${format}`, format === 'mp3' ? 'audio/mpeg' : `audio/${format}`, 'audio', context.companyId, context.userId),
      );
      job.status = 'completed';
    } else if (input.kind === 'music') {
      const request = buildMusicRequest(config, {
        prompt: input.prompt,
        ...(input.genre ? { genre: input.genre } : {}),
        ...(input.mood ? { mood: input.mood } : {}),
        ...(input.tempo ? { tempo: input.tempo } : {}),
        ...(input.instrumental !== undefined ? { instrumental: input.instrumental } : {}),
        ...(input.lyrics ? { lyrics: input.lyrics } : {}),
        ...(input.model ? { model: input.model } : {}),
      });
      const response = await postJson(request.url, request.headers, request.body);
      if (!response.ok) throw new Error(`Music provider error: ${await readError(response)}`);
      const payload = (await response.json()) as {
        id?: string;
        status?: string;
        output?: string | string[];
        url?: string;
      };
      const outputUrl = Array.isArray(payload.output) ? payload.output[0] : payload.output ?? payload.url;
      if (outputUrl) {
        job.assets.push(await registerRemote(outputUrl, 'music'));
        job.status = 'completed';
      } else if (payload.id) {
        job.providerJobId = payload.id;
        job.status = 'processing';
      } else {
        throw new Error('Music provider response contained neither an output URL nor a job id');
      }
    } else {
      const request = buildVideoRequest(config, {
        prompt: input.prompt,
        ...(input.durationSeconds ? { durationSeconds: input.durationSeconds } : {}),
        ...(input.model ? { model: input.model } : {}),
      });
      const response = await postJson(request.url, request.headers, request.body);
      if (!response.ok) throw new Error(`Video provider error: ${await readError(response)}`);
      const payload = (await response.json()) as {
        id?: string;
        status?: string;
        output?: string | string[];
        url?: string;
      };
      const outputUrl = Array.isArray(payload.output) ? payload.output[0] : payload.output ?? payload.url;
      if (outputUrl) {
        job.assets.push(await registerRemote(outputUrl, 'video'));
        job.status = 'completed';
      } else if (payload.id) {
        // Asynchronous provider: the job stays processing until refreshJob runs.
        job.providerJobId = payload.id;
        job.status = 'processing';
      } else {
        throw new Error('Video provider response contained neither an output URL nor a job id');
      }
    }
  } catch (error) {
    job.status = 'failed';
    job.error = error instanceof Error ? error.message : String(error);
  }

  job.updatedAt = new Date().toISOString();
  await saveJob(job);
  return job;
}

/** Poll an asynchronous video job and update the stored record. */
export async function refreshJob(
  job: MediaJob,
  env: Record<string, string | undefined> = process.env,
): Promise<MediaJob> {
  if ((job.kind !== 'video' && job.kind !== 'music') || job.status !== 'processing' || !job.providerJobId) {
    return job;
  }
  const { config } = resolveMediaProvider(env);
  const statusEndpoint =
    job.kind === 'music' ? config?.musicStatusEndpoint : config?.videoStatusEndpoint;
  if (!config || !statusEndpoint) return job;

  const url = statusEndpoint
    .replace('{id}', encodeURIComponent(job.providerJobId))
    .replace('{jobId}', encodeURIComponent(job.providerJobId));

  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${config.apiKey}` } });
    if (!response.ok) throw new Error(`Video status error: ${await readError(response)}`);
    const payload = (await response.json()) as {
      status?: string;
      output?: string | string[];
      error?: string;
    };
    const status = (payload.status ?? '').toLowerCase();
    if (['failed', 'error', 'canceled', 'cancelled'].includes(status)) {
      job.status = 'failed';
      job.error = payload.error ?? `Provider reported status "${payload.status}"`;
    } else if (['succeeded', 'completed', 'success'].includes(status)) {
      const output = Array.isArray(payload.output) ? payload.output[0] : payload.output;
      if (!output) throw new Error('Completed video job has no output URL');
      job.assets.push(await registerRemote(output, job.kind === 'music' ? 'music' : 'video'));
      job.status = 'completed';
    }
  } catch (error) {
    job.status = 'failed';
    job.error = error instanceof Error ? error.message : String(error);
  }
  job.updatedAt = new Date().toISOString();
  await saveJob(job);
  return job;
}
