/**
 * InfiniteTalk connector — MeiGen-AI/InfiniteTalk (Apache-2.0).
 *
 * License note: Apache-2.0 (permissive). InfiniteTalk is unlimited-length,
 * audio-driven talking-video generation (image-to-video + video-to-video,
 * Wan + Kokoro). It is a GPU service (Python/Gradio). This adapter submits
 * jobs to a separately hosted InfiniteTalk instance.
 * See docs/FREE_SYSTEMS_INTEGRATION.md.
 *
 * API surface used (Gradio-style):
 *  - POST {base}/gradio_api/call/generate
 *  - GET  {base}/gradio_api/call/generate/{eventId}
 */
import {
  type ConnectorContext,
  type ExternalSystemAdapter,
  IntegrationError,
  guardedFetch,
  joinUrl,
  runConnectorOp,
} from '../../types';

export interface InfiniteTalkJob {
  eventId: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  videoUrl?: string;
}

export const infiniteTalkAdapter: ExternalSystemAdapter = {
  id: 'media.infinite-talk',
  category: 'media',
  licenseClass: 'permissive',
  strategy: 'API_INTEGRATE',
  description: 'InfiniteTalk (Apache-2.0) — unlimited-length audio-driven talking-video generation (GPU)',
  upstreamRepo: 'MeiGen-AI/InfiniteTalk',

  async testConnection(ctx) {
    return runConnectorOp(this, ctx, 'testConnection', async () => {
      const res = await guardedFetch('media.infinite-talk', joinUrl(ctx.credential.baseUrl, 'gradio_api/call/generate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [] }),
        timeoutMs: 10_000,
      });
      // Any non-5xx means the Gradio endpoint exists; 422 (validation) is healthy.
      if (res.status >= 500) {
        throw new IntegrationError('media.infinite-talk', 'InfiniteTalk health probe failed', res.status);
      }
      return { reachable: true, status: res.status };
    });
  },
};
