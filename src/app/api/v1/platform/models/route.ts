/**
 * GET /api/v1/platform/models
 *
 * Everything the model picker needs, including the honest part: models whose
 * backend is not reachable are returned with `selectable: false` and a reason,
 * so the UI can show "needs a GPU" or "needs a 32 GB host" instead of a button
 * that fails.
 *
 * Query: `?task=code&capability=vision&only=selectable`
 */

import { z } from 'zod';
import { platformRoute, json } from '@/lib/platform/http';
import { describeAvailability, type TaskType } from '@/lib/platform/model-registry';

const querySchema = z.object({
  task: z.enum(['chat', 'code', 'vision', 'reasoning', 'embedding', 'summarise', 'translation']).optional(),
  capability: z.string().max(40).optional(),
  only: z.enum(['all', 'selectable']).default('all'),
});

const TASK_REQUIREMENTS: Record<TaskType, string[]> = {
  chat: ['chat'],
  code: ['code'],
  vision: ['vision'],
  reasoning: ['reasoning'],
  embedding: ['embedding'],
  summarise: ['chat'],
  translation: ['chat'],
};

export const GET = platformRoute({ scope: 'models:read', query: querySchema }, async ({ query, requestId }) => {
  const task = query.task as TaskType | undefined;
  const required = task ? TASK_REQUIREMENTS[task] : [];
  if (query.capability) required.push(query.capability);

  const all = await describeAvailability();
  const filtered = all.filter((deployment) =>
    required.every((capability) => deployment.capabilities.includes(capability)),
  );
  const visible = query.only === 'selectable' ? filtered.filter((d) => d.selectable) : filtered;

  return json({
    models: visible.map((deployment) => ({
      id: deployment.id,
      model: deployment.model,
      provider: deployment.provider,
      providerKind: deployment.providerKind,
      family: deployment.family,
      displayName: deployment.displayName,
      hostingType: deployment.hostingType,
      capabilities: deployment.capabilities,
      contextLength: deployment.contextLength,
      approxSizeGb: deployment.approxSizeGb,
      priority: deployment.priority,
      selectable: deployment.selectable,
      reachable: deployment.reachable,
      ...(deployment.selectable ? {} : { blockedReason: deployment.blockedReason }),
      ...(deployment.notes ? { notes: deployment.notes } : {}),
    })),
    counts: {
      total: all.length,
      selectable: all.filter((d) => d.selectable).length,
      byHostingType: all.reduce<Record<string, number>>((acc, d) => {
        acc[d.hostingType] = (acc[d.hostingType] ?? 0) + 1;
        return acc;
      }, {}),
    },
    tasks: Object.keys(TASK_REQUIREMENTS),
  }, requestId);
});
