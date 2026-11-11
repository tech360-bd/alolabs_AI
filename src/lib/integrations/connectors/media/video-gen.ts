/**
 * Self-hosted video generation connector (Wan2.2 primary).
 *
 * License note: Wan-Video/Wan2.2 is Apache-2.0 for BOTH code and weights —
 * the cleanest large video model, hence the primary target. CogVideoX
 * (Apache-2.0 code) and LTX-Video (verify weights per checkpoint) can mount
 * behind the SAME job API. HunyuanVideo must NOT be used (custom license,
 * EU/UK/KR exclusion) — see docs/ECOSYSTEM_REVERSE_MAP.md.
 *
 * The adapter targets a job-based inference worker (e.g. diffusers/ComfyUI
 * service exposing POST /v1/video/jobs + GET /v1/video/jobs/{id}).
 */
import {
  type ConnectorContext,
  type ExternalSystemAdapter,
  IntegrationError,
  guardedFetch,
  joinUrl,
  requireApiKey,
  runConnectorOp,
} from '../../types';

export type VideoJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface VideoJob {
  jobId: string;
  status: VideoJobStatus;
  videoUrl?: string;
  error?: string;
}

async function mediaFetch(ctx: ConnectorContext, path: string, init: RequestInit = {}, timeoutMs?: number): Promise<Response> {
  const apiKey = requireApiKey(ctx, 'media.video');
  const res = await guardedFetch('media.video', joinUrl(ctx.credential.baseUrl, path), {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    timeoutMs: timeoutMs ?? ctx.timeoutMs,
  });
  if (!res.ok) {
    throw new IntegrationError('media.video', `video job API ${init.method ?? 'GET'} ${path} failed`, res.status);
  }
  return res;
}

export const videoGenAdapter: ExternalSystemAdapter = {
  id: 'media.video',
  category: 'media',
  licenseClass: 'permissive',
  strategy: 'API_INTEGRATE',
  description: 'Self-hosted video generation worker (Wan2.2 Apache-2.0 code+weights primary; CogVideoX/LTX optional)',
  upstreamRepo: 'Wan-Video/Wan2.2',

  async testConnection(ctx) {
    return runConnectorOp(this, ctx, 'testConnection', async () => {
      const res = await mediaFetch(ctx, 'v1/video/jobs?limit=1', {}, 10_000);
      return { reachable: true, status: res.status };
    });
  },
};

export async function submitVideoJob(
  ctx: ConnectorContext,
  input: {
    prompt: string;
    mode: 'text-to-video' | 'image-to-video';
    imageUrl?: string;
    model?: 'wan2.2-5b' | 'wan2.2-a14b' | 'cogvideox-5b' | 'ltx-video';
    durationSeconds?: number;
    aspectRatio?: '16:9' | '9:16' | '1:1';
  },
): Promise<Awaited<ReturnType<typeof runConnectorOp<VideoJob>>>> {
  return runConnectorOp(videoGenAdapter, ctx, 'submitJob', async () => {
    if (!input.prompt) throw new IntegrationError('media.video', 'prompt is required');
    if (input.mode === 'image-to-video' && !input.imageUrl) {
      throw new IntegrationError('media.video', 'imageUrl is required for image-to-video');
    }
    if (input.model?.startsWith('hunyuan')) {
      throw new IntegrationError(
        'media.video',
        'model must be one of wan2.2/cogvideox/ltx-video (HunyuanVideo is license-blocked)',
      );
    }
    const res = await mediaFetch(ctx, 'v1/video/jobs', {
      method: 'POST',
      body: JSON.stringify({
        model: input.model ?? 'wan2.2-5b',
        mode: input.mode,
        prompt: input.prompt,
        image_url: input.imageUrl,
        duration_seconds: Math.min(Math.max(input.durationSeconds ?? 5, 1), 20),
        aspect_ratio: input.aspectRatio ?? '16:9',
      }),
    });
    const body: unknown = await res.json();
    const d = (body ?? {}) as Record<string, unknown>;
    const jobId = String(d['job_id'] ?? d['id'] ?? '');
    if (!jobId) throw new IntegrationError('media.video', 'worker returned no job id');
    return {
      jobId,
      status: 'queued' as const,
    };
  });
}

export async function getVideoJob(
  ctx: ConnectorContext,
  jobId: string,
): Promise<Awaited<ReturnType<typeof runConnectorOp<VideoJob>>>> {
  return runConnectorOp(videoGenAdapter, ctx, 'getJob', async () => {
    if (!jobId) throw new IntegrationError('media.video', 'jobId is required');
    const res = await mediaFetch(ctx, `v1/video/jobs/${encodeURIComponent(jobId)}`);
    const body: unknown = await res.json();
    const d = (body ?? {}) as Record<string, unknown>;
    const statusRaw = String(d['status'] ?? 'queued');
    const status: VideoJobStatus = ['queued', 'running', 'succeeded', 'failed'].includes(statusRaw)
      ? (statusRaw as VideoJobStatus)
      : 'queued';
    return {
      jobId,
      status,
      videoUrl: typeof d['video_url'] === 'string' ? (d['video_url'] as string) : undefined,
      error: typeof d['error'] === 'string' ? (d['error'] as string) : undefined,
    };
  });
}
