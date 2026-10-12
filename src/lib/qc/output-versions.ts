/**
 * Output versioning.
 *
 * Every generated or repaired output of a task is stored as an immutable
 * OutputVersion row (version 1 = initial generation, 2..n = repairs, or a
 * manual version supplied by a reviewer). QC results are attached to the
 * version they were computed for. Nothing is ever overwritten, so the
 * repair loop keeps full evidence of what changed and why.
 */
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';

export type OutputVersionReason = 'initial' | 'repair' | 'manual';

export interface OutputVersionRecord {
  id: string;
  taskId: string;
  runId: string | null;
  version: number;
  content: string;
  model: string | null;
  reason: string;
  qcPassed: boolean | null;
  qcScore: number | null;
  qcIssues: string;
  assessmentId: string | null;
  createdAt: Date;
}

/** Maximum stored size per version (characters). Larger outputs are truncated with a marker. */
export const MAX_OUTPUT_VERSION_CHARS = 200_000;

function clamp(content: string): string {
  if (content.length <= MAX_OUTPUT_VERSION_CHARS) return content;
  return `${content.slice(0, MAX_OUTPUT_VERSION_CHARS)}\n\n[truncated: ${content.length - MAX_OUTPUT_VERSION_CHARS} more characters]`;
}

/** Append a new version for a task (next version number, never reused). */
export async function recordOutputVersion(params: {
  taskId: string;
  runId?: string;
  content: string;
  model?: string;
  reason: OutputVersionReason;
}): Promise<OutputVersionRecord> {
  // Retry once on a unique-version race (two writers for the same task).
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const latest = await db.outputVersion.findFirst({
      where: { taskId: params.taskId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = (latest?.version ?? 0) + 1;
    try {
      const row = await db.outputVersion.create({
        data: {
          id: randomUUID(),
          taskId: params.taskId,
          runId: params.runId ?? null,
          version,
          content: clamp(params.content),
          model: params.model ?? null,
          reason: params.reason,
        },
      });
      return row as OutputVersionRecord;
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002' && attempt === 0) continue;
      throw error;
    }
  }
  throw new Error(`Could not allocate an output version for task ${params.taskId}`);
}

/** Attach a QC verdict to an existing version. */
export async function attachQcResult(versionId: string, qc: {
  passed: boolean;
  score: number;
  issues: string[];
  assessmentId?: string;
}): Promise<void> {
  await db.outputVersion.update({
    where: { id: versionId },
    data: {
      qcPassed: qc.passed,
      qcScore: qc.score,
      qcIssues: JSON.stringify(qc.issues.slice(0, 50)),
      assessmentId: qc.assessmentId ?? null,
    },
  });
}

export async function listOutputVersions(taskId: string): Promise<OutputVersionRecord[]> {
  const rows = await db.outputVersion.findMany({ where: { taskId }, orderBy: { version: 'asc' } });
  return rows as OutputVersionRecord[];
}

export async function getLatestOutputVersion(taskId: string): Promise<OutputVersionRecord | null> {
  const row = await db.outputVersion.findFirst({ where: { taskId }, orderBy: { version: 'desc' } });
  return (row as OutputVersionRecord | null) ?? null;
}
