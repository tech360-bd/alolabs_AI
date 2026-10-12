/**
 * ALO Labs AgentOS — Project System
 *
 * A Project groups an objective with its runs, tasks, artifacts and memory.
 * Projects are resumable: runs are durable records, so a project can be
 * paused and continued, and every deliverable stays linked.
 */

import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { createRun, listRuns } from '@/lib/runs';
import { listArtifacts, type ArtifactRecord } from '@/lib/artifacts';

export interface CreateProjectInput {
  name: string;
  objective?: string;
  description?: string;
  companyId?: string;
  ownerId?: string;
  settings?: Record<string, unknown>;
}

export interface UpdateProjectInput {
  name?: string;
  objective?: string;
  description?: string | null;
  status?: string;
  settings?: Record<string, unknown>;
}

export async function createProject(input: CreateProjectInput) {
  return db.project.create({
    data: {
      id: randomUUID(),
      name: input.name,
      objective: input.objective ?? '',
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.companyId ? { companyId: input.companyId } : {}),
      ...(input.ownerId ? { ownerId: input.ownerId } : {}),
      settings: JSON.stringify(input.settings ?? {}),
    },
  });
}

export async function getProject(id: string) {
  return db.project.findUnique({ where: { id } });
}

export async function updateProject(id: string, input: UpdateProjectInput) {
  const existing = await db.project.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return null;
  return db.project.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.objective !== undefined ? { objective: input.objective } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.settings !== undefined ? { settings: JSON.stringify(input.settings) } : {}),
    },
  });
}

export async function listProjects(filter: {
  companyId?: string;
  ownerId?: string;
  status?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const where: Record<string, unknown> = {};
  if (filter.companyId) where.companyId = filter.companyId;
  if (filter.ownerId) where.ownerId = filter.ownerId;
  if (filter.status) where.status = filter.status;
  const [projects, total] = await Promise.all([
    db.project.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(filter.limit ?? 50, 200),
      skip: filter.offset ?? 0,
    }),
    db.project.count({ where }),
  ]);
  return { projects, total };
}

export async function deleteProject(id: string): Promise<boolean> {
  const existing = await db.project.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return false;
  await db.project.delete({ where: { id } });
  return true;
}

/** Start a run inside a project. */
export async function createProjectRun(projectId: string, objective: string, userId?: string) {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true, companyId: true, status: true } });
  if (!project) throw new Error(`Project ${projectId} not found`);
  if (project.status === 'archived') throw new Error('Project is archived');
  return createRun({
    objective,
    projectId,
    ...(project.companyId ? { companyId: project.companyId } : {}),
    ...(userId ? { userId } : {}),
  });
}

export interface ProjectDetail {
  project: Awaited<ReturnType<typeof getProject>>;
  runs: Awaited<ReturnType<typeof listRuns>>['runs'];
  artifacts: ArtifactRecord[];
  totals: { runs: number; artifacts: number; completedRuns: number; failedRuns: number };
}

export async function getProjectDetail(projectId: string): Promise<ProjectDetail | null> {
  const project = await getProject(projectId);
  if (!project) return null;
  const { runs } = await listRuns({ projectId, limit: 100 });
  const { artifacts } = await listArtifacts({ projectId, limit: 100 });
  return {
    project,
    runs,
    artifacts,
    totals: {
      runs: runs.length,
      artifacts: artifacts.length,
      completedRuns: runs.filter((r) => r.status === 'completed').length,
      failedRuns: runs.filter((r) => r.status === 'failed').length,
    },
  };
}
