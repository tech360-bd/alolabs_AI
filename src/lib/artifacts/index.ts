/**
 * ALO Labs AgentOS — Artifact System
 *
 * Every completed task/run can produce artifacts (reports, documents, data,
 * code, media descriptors). Artifacts are:
 *  - content-addressed (sha256 checksum)
 *  - versioned (createArtifactVersion bumps the version and links history)
 *  - tenant-scoped (companyId) and linked to project/task/run/agent
 *  - downloadable with a correct MIME type
 *
 * Storage: artifact content lives in the Artifact row (DB). `storagePath` is
 * reserved for object-storage (MinIO/S3) backed artifacts — when set, the
 * content column holds a pointer description instead of the full payload.
 */

import { createHash, randomUUID } from 'node:crypto';
import { db } from '@/lib/db';

export type ArtifactType =
  | 'text' | 'markdown' | 'html' | 'json' | 'csv'
  | 'pdf' | 'docx' | 'xlsx' | 'pptx'
  | 'image' | 'video' | 'audio' | 'code' | 'report';

const MIME_BY_TYPE: Record<ArtifactType, string> = {
  text: 'text/plain',
  markdown: 'text/markdown',
  html: 'text/html',
  json: 'application/json',
  csv: 'text/csv',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  image: 'image/png',
  video: 'video/mp4',
  audio: 'audio/mpeg',
  code: 'text/plain',
  report: 'text/markdown',
};

export interface CreateArtifactInput {
  name: string;
  type: ArtifactType | string;
  content: string;
  projectId?: string;
  taskId?: string;
  runId?: string;
  agentId?: string;
  companyId?: string;
  createdBy?: string;
  mimeType?: string;
  storagePath?: string;
  metadata?: Record<string, unknown>;
}

export interface ArtifactRecord {
  id: string;
  name: string;
  type: string;
  content: string;
  storagePath: string | null;
  mimeType: string;
  size: number;
  checksum: string;
  version: number;
  metadata: string;
  projectId: string | null;
  taskId: string | null;
  runId: string | null;
  agentId: string | null;
  companyId: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function mimeFor(type: string, override?: string): string {
  if (override) return override;
  return MIME_BY_TYPE[type as ArtifactType] ?? 'application/octet-stream';
}

/** Create a new artifact (version 1). */
export async function createArtifact(input: CreateArtifactInput): Promise<ArtifactRecord> {
  const metadata = { ...(input.metadata ?? {}), artifactId: undefined };
  delete metadata.artifactId;
  const artifact = await db.artifact.create({
    data: {
      id: randomUUID(),
      name: input.name,
      type: input.type,
      content: input.content,
      mimeType: mimeFor(input.type, input.mimeType),
      size: Buffer.byteLength(input.content, 'utf8'),
      checksum: sha256(input.content),
      version: 1,
      metadata: JSON.stringify(metadata),
      storagePath: input.storagePath ?? null,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.taskId ? { taskId: input.taskId } : {}),
      ...(input.runId ? { runId: input.runId } : {}),
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.companyId ? { companyId: input.companyId } : {}),
      ...(input.createdBy ? { createdBy: input.createdBy } : {}),
    },
  });
  return artifact as ArtifactRecord;
}

/**
 * Create a new version of an existing artifact. A new row is stored with
 * version = previous + 1 and metadata linking back to the previous version,
 * so history is never lost.
 */
export async function createArtifactVersion(
  artifactId: string,
  content: string,
  options?: { name?: string; metadata?: Record<string, unknown> },
): Promise<ArtifactRecord> {
  const previous = await db.artifact.findUnique({ where: { id: artifactId } });
  if (!previous) throw new Error(`Artifact ${artifactId} not found`);

  const metadata = {
    ...(options?.metadata ?? {}),
    previousVersionId: previous.id,
    previousChecksum: previous.checksum,
  };

  const artifact = await db.artifact.create({
    data: {
      id: randomUUID(),
      name: options?.name ?? previous.name,
      type: previous.type,
      content,
      mimeType: previous.mimeType,
      size: Buffer.byteLength(content, 'utf8'),
      checksum: sha256(content),
      version: previous.version + 1,
      metadata: JSON.stringify(metadata),
      storagePath: previous.storagePath,
      ...(previous.projectId ? { projectId: previous.projectId } : {}),
      ...(previous.taskId ? { taskId: previous.taskId } : {}),
      ...(previous.runId ? { runId: previous.runId } : {}),
      ...(previous.agentId ? { agentId: previous.agentId } : {}),
      ...(previous.companyId ? { companyId: previous.companyId } : {}),
      ...(previous.createdBy ? { createdBy: previous.createdBy } : {}),
    },
  });
  return artifact as ArtifactRecord;
}

/** Get a single artifact. */
export async function getArtifact(id: string): Promise<ArtifactRecord | null> {
  const artifact = await db.artifact.findUnique({ where: { id } });
  return (artifact as ArtifactRecord | null) ?? null;
}

export interface ListArtifactsFilter {
  projectId?: string;
  taskId?: string;
  runId?: string;
  companyId?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

/** List artifacts, newest first. */
export async function listArtifacts(filter: ListArtifactsFilter = {}) {
  const where: Record<string, unknown> = {};
  if (filter.projectId) where.projectId = filter.projectId;
  if (filter.taskId) where.taskId = filter.taskId;
  if (filter.runId) where.runId = filter.runId;
  if (filter.companyId) where.companyId = filter.companyId;
  if (filter.type) where.type = filter.type;

  const [artifacts, total] = await Promise.all([
    db.artifact.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(filter.limit ?? 50, 200),
      skip: filter.offset ?? 0,
    }),
    db.artifact.count({ where }),
  ]);
  return { artifacts: artifacts as ArtifactRecord[], total };
}

/** Delete an artifact. */
export async function deleteArtifact(id: string): Promise<boolean> {
  const existing = await db.artifact.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return false;
  await db.artifact.delete({ where: { id } });
  return true;
}

/** Verify an artifact's checksum matches its content. */
export function verifyChecksum(artifact: ArtifactRecord): boolean {
  return sha256(artifact.content) === artifact.checksum;
}

// ─── Run report assembly ─────────────────────────────────────────────────────

export interface RunReportSection {
  title: string;
  body: string;
}

/**
 * Assemble a Markdown report artifact from a completed run:
 * objective, plan, per-task results (agent, model, tokens, QC), artifacts.
 */
export async function buildRunReportArtifact(params: {
  runId: string;
  objective: string;
  plan: Array<{ title?: string; description?: string; agentName?: string; status?: string }>;
  tasks: Array<{
    title: string;
    status: string;
    agentName?: string | null;
    model?: string | null;
    tokens?: number;
    output?: string | null;
    error?: string | null;
    qcScore?: number | null;
    qcPassed?: boolean | null;
  }>;
  summary?: string | null;
  companyId?: string;
  projectId?: string;
  userId?: string;
  generatedBy?: string;
}): Promise<ArtifactRecord> {
  const lines: string[] = [];
  lines.push(`# ALO Labs AgentOS — Run Report`);
  lines.push('');
  lines.push(`**Run ID:** \`${params.runId}\``);
  lines.push(`**Objective:** ${params.objective}`);
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Plan');
  lines.push('');
  if (params.plan.length === 0) {
    lines.push('_No plan was recorded for this run._');
  } else {
    params.plan.forEach((step, index) => {
      lines.push(`${index + 1}. **${step.title ?? 'Step'}** — ${step.description ?? ''}${step.agentName ? ` _(agent: ${step.agentName})_` : ''} _[${step.status ?? 'unknown'}]_`);
    });
  }
  lines.push('');
  lines.push('## Tasks');
  lines.push('');
  lines.push('| # | Task | Status | Agent | Model | Tokens | QC |');
  lines.push('|---|------|--------|-------|-------|--------|-----|');
  params.tasks.forEach((task, index) => {
    const qc = task.qcPassed === null || task.qcPassed === undefined
      ? '—'
      : task.qcPassed ? `PASS (${Math.round((task.qcScore ?? 0) * 100)}%)` : `FAIL (${Math.round((task.qcScore ?? 0) * 100)}%)`;
    lines.push(`| ${index + 1} | ${task.title.replace(/\|/g, '\\|')} | ${task.status} | ${task.agentName ?? '—'} | ${task.model ?? '—'} | ${task.tokens ?? 0} | ${qc} |`);
  });
  lines.push('');
  lines.push('## Results');
  lines.push('');
  params.tasks.forEach((task, index) => {
    lines.push(`### ${index + 1}. ${task.title}`);
    lines.push('');
    if (task.error) {
      lines.push(`**Error:** ${task.error}`);
      lines.push('');
    } else if (task.output) {
      const output = task.output.length > 4000 ? `${task.output.slice(0, 4000)}\n\n…(truncated)…` : task.output;
      lines.push(output);
      lines.push('');
    } else {
      lines.push('_No output recorded._');
      lines.push('');
    }
  });
  if (params.summary) {
    lines.push('## Summary');
    lines.push('');
    lines.push(params.summary);
    lines.push('');
  }
  lines.push('---');
  lines.push('*Generated by ALO Labs AgentOS. Every factual claim in agent outputs should be traceable to its source; verify before external use.*');

  return createArtifact({
    name: `run-report-${params.runId}.md`,
    type: 'report',
    content: lines.join('\n'),
    runId: params.runId,
    ...(params.projectId ? { projectId: params.projectId } : {}),
    ...(params.companyId ? { companyId: params.companyId } : {}),
    ...(params.userId ? { createdBy: params.userId } : {}),
    ...(params.generatedBy ? { agentId: params.generatedBy } : {}),
    metadata: {
      kind: 'run_report',
      taskCount: params.tasks.length,
      completedCount: params.tasks.filter((t) => t.status === 'completed').length,
      failedCount: params.tasks.filter((t) => t.status === 'failed').length,
    },
  });
}
