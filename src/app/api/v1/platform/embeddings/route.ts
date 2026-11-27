/**
 * POST /api/v1/platform/embeddings
 *
 * Real embeddings from a local embedding model (Ollama `nomic-embed-text`, or
 * the built-in runtime). Same fallback chain as chat: if the first embedding
 * deployment fails with a retryable class, the next is tried.
 *
 * The dimension is reported so a caller can size its vector store, and
 * `normalized` says whether cosine similarity reduces to a dot product.
 */

import { z } from 'zod';
import { platformRoute, json, PlatformError } from '@/lib/platform/http';
import { embedWithProvider } from '@/lib/platform/providers';
import { selectCandidates } from '@/lib/platform/model-registry';
import { recordOutcome } from '@/lib/platform/routing-state';
import { classifyProviderError } from '@/lib/platform/error-classifier';

const bodySchema = z.object({
  input: z.union([z.string().min(1).max(100_000), z.array(z.string().min(1).max(100_000)).min(1).max(128)]),
  projectId: z.string().max(64).optional(),
  model: z.string().max(120).optional(),
});

export const POST = platformRoute(
  { scope: 'ai:embed', body: bodySchema, rateLimit: { limit: 240, windowMs: 60_000 } },
  async ({ body, requestId }) => {
    const inputs = Array.isArray(body.input) ? body.input : [body.input];
    const candidates = await selectCandidates({ requires: ['embedding'] });
    const ordered = body.model
      ? [...candidates].sort((a, b) => (a.id === body.model || a.model === body.model ? -1 : 0) - (b.id === body.model || b.model === body.model ? -1 : 0))
      : candidates;

    const failures: Array<{ deployment: string; errorClass: string }> = [];
    for (const deployment of ordered) {
      try {
        const vectors = await embedWithProvider(deployment, inputs);
        await recordOutcome(deployment.provider, deployment.model, { ok: true });
        if (!vectors.length || !vectors[0]?.length) {
          throw Object.assign(new Error('empty embedding'), { statusCode: 502 });
        }
        return json({
          embeddings: vectors,
          model: deployment.model,
          provider: deployment.provider,
          dimensions: vectors[0].length,
          // The hashed BOW embedding and nomic-embed-text are both L2-normalised.
          normalized: true,
          usage: { promptTokens: inputs.reduce((sum, t) => sum + Math.ceil(t.length / 4), 0) },
          attempts: failures,
          requestId,
        }, requestId);
      } catch (error) {
        const classified = classifyProviderError(error, deployment.provider);
        failures.push({ deployment: deployment.id, errorClass: classified.class });
        await recordOutcome(deployment.provider, deployment.model, {
          ok: false, errorClass: classified.class, error: classified.message,
        });
        if (!classified.fallbackEligible) break;
      }
    }

    throw new PlatformError(
      503, 'unavailable',
      'No embedding model is available',
      ordered.length === 0
        ? 'No deployment declares the "embedding" capability. Run `ollama pull nomic-embed-text` or start the built-in local runtime.'
        : `Tried ${failures.map((f) => f.deployment).join(', ')} — all failed.`,
    );
  },
);
