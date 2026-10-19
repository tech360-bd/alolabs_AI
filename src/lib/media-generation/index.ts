"use strict";

/**
 * Media-generation request contracts and company-scoped job read models.
 *
 * Direct provider execution is deliberately disabled. Media operations are
 * deferred through the central AI policy until media capabilities have
 * verified pricing, quotas, tenant approvals, spend budgets, and audit support.
 */

import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { deferCompanyAIMedia } from '@/lib/multi-tenant-ai/service';
import type { GenerationInput, MediaKind } from './requests';

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
  metadata: Record<string, string | boolean>;
  companyId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

const JOB_PREFIX = 'media:job:';

function jobKey(companyId: string, id: string): string {
  return `${JOB_PREFIX}${companyId}:${id}`;
}

async function saveJob(job: MediaJob): Promise<void> {
  const value = JSON.stringify(job);
  await db.settings.upsert({
    where: { key: jobKey(job.companyId, job.id) },
    update: { value, type: 'json' },
    create: { id: randomUUID(), key: jobKey(job.companyId, job.id), value, type: 'json' },
  });
}

export async function getJob(id: string, companyId: string): Promise<MediaJob | null> {
  const row = await db.settings.findUnique({ where: { key: jobKey(companyId, id) } });
  if (!row) return null;
  try {
    const job = JSON.parse(row.value) as MediaJob;
    return job.companyId === companyId ? job : null;
  } catch {
    return null;
  }
}

export async function listJobs(companyId: string, limit = 20, kind?: MediaKind): Promise<MediaJob[]> {
  const rows = await db.settings.findMany({
    where: { key: { startsWith: `${JOB_PREFIX}${companyId}:` } },
    orderBy: { createdAt: 'desc' },
    take: Math.max(1, Math.min(100, limit)) * 2,
  });
  const jobs: MediaJob[] = [];
  for (const row of rows) {
    try {
      const job = JSON.parse(row.value) as MediaJob;
      if (job.companyId === companyId && (!kind || job.kind === kind)) jobs.push(job);
    } catch {
      // Ignore malformed or legacy records without trustworthy ownership.
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

export interface GenerationContext {
  companyId: string;
  userId: string;
  role: string;
}

/**
 * Fail closed. Environment keys are not a substitute for a centrally
 * authorized capability, verified billing model, or company budget.
 */
export async function generate(
  input: GenerationInput,
  context: GenerationContext,
  _env: Record<string, string | undefined> = process.env,
): Promise<MediaJob> {
  return deferCompanyAIMedia({
    actor: { companyId: context.companyId, userId: context.userId, role: context.role },
    kind: input.kind,
    ...(input.model ? { model: input.model } : {}),
    estimatedTokens: Math.max(1, Math.ceil(input.prompt.length / 4)),
  });
}

/** Mark a legacy remote job as failed without making an external polling call. */
export async function refreshJob(job: MediaJob): Promise<MediaJob> {
  if ((job.kind !== 'video' && job.kind !== 'music') || job.status !== 'processing' || !job.providerJobId) {
    return job;
  }
  job.status = 'failed';
  job.error = 'Provider polling is disabled until media capabilities are routed through the central company policy.';
  job.updatedAt = new Date().toISOString();
  await saveJob(job);
  return job;
}
