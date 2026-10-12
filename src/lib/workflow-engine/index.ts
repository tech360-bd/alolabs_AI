/**
 * ALO LABS AgentOS — Workflow Engine
 *
 * Executes persisted Workflows (Workflow + WorkflowStep rows) end-to-end:
 *
 *   Workflow definition (steps, agents, skills, config)
 *     → WorkflowRun + AgentOSRun (durable records)
 *     → steps become plan steps (template substitution from prior outputs)
 *     → Master Orchestrator pipeline (route → execute → QC → repair)
 *     → aggregated output → artifact → WorkflowRun completed
 *
 * Workflow state is persisted at every transition, so a server restart does
 * not destroy a running workflow — the run record + queue job survive, and
 * stale queue items are re-queued on boot (see src/instrumentation.ts).
 */

import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { enqueue } from '@/lib/job-queue';
import { RUN_QUEUE, executeRun, recordRunEvent } from '@/lib/runs';
import type { PlanResult, PlanStep } from '@/lib/runs/planner';

export interface WorkflowRunInput {
  input: Record<string, unknown>;
  companyId?: string;
  userId?: string;
  projectId?: string;
  priority?: string;
  /** Execute inline (sync) instead of via the queue — used by tests. */
  executeInline?: boolean;
}

export interface WorkflowRunResult {
  workflowRunId: string;
  runId: string;
  status: string;
}

interface WorkflowStepRow {
  id: string;
  stepNumber: number;
  agentId: string | null;
  skillId: string | null;
  action: string;
  config: string;
}

/** Substitute {{variable}} templates in a string from a context object. */
export function substituteTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, path: string) => {
    const value = path.split('.').reduce<unknown>((acc, key) => {
      if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
      return undefined;
    }, context);
    if (value === undefined || value === null) return match;
    return typeof value === 'string' ? value : JSON.stringify(value);
  });
}

function stepConfig(step: WorkflowStepRow): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(step.config || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Start a workflow run. Creates the durable records and enqueues execution
 * (or executes inline when `executeInline` is set).
 */
export async function runWorkflow(
  workflowId: string,
  options: WorkflowRunInput,
): Promise<WorkflowRunResult> {
  const workflow = await db.workflow.findUnique({
    where: { id: workflowId },
    include: { workflowSteps: { orderBy: { stepNumber: 'asc' } } },
  });
  if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
  if (workflow.status !== 'active') throw new Error(`Workflow ${workflow.name} is not active`);

  const steps = workflow.workflowSteps as unknown as WorkflowStepRow[];

  // Durable run records
  const workflowRun = await db.workflowRun.create({
    data: {
      id: randomUUID(),
      workflowId: workflow.id,
      workflowName: workflow.name,
      status: 'running',
      input: JSON.stringify(options.input ?? {}),
      ...(options.companyId ? { companyId: options.companyId } : {}),
    },
  });

  const run = await db.agentOSRun.create({
    data: {
      id: randomUUID(),
      objective: `Workflow "${workflow.name}": ${workflow.description ?? workflow.name}`,
      status: 'queued',
      plan: '[]',
      workflowId: workflow.id,
      ...(options.projectId ? { projectId: options.projectId } : {}),
      ...(options.companyId ? { companyId: options.companyId } : {}),
      ...(options.userId ? { userId: options.userId } : {}),
      ...(options.priority ? { priority: options.priority } : {}),
    },
  });

  // Container task for the workflow run. The pipeline creates one real
  // Task + TaskStep per plan step (with agent, input, output, QC) — those
  // are the source of truth; this container links them to the workflow.
  const task = await db.task.create({
    data: {
      id: randomUUID(),
      title: `Workflow: ${workflow.name}`,
      description: workflow.description ?? '',
      status: 'pending',
      priority: options.priority ?? 'medium',
      workflowId: workflow.id,
      ...(options.userId ? { userId: options.userId } : {}),
    },
  });

  // Build the plan from the workflow steps. Templates are resolved at
  // execution time from prior outputs (the pipeline passes them as context),
  // so the plan carries the raw instruction + per-step config.
  const planSteps: PlanStep[] = steps.map((step) => {
    const config = stepConfig(step);
    const instruction = typeof config.instruction === 'string'
      ? (config.instruction as string)
      : typeof config.prompt === 'string'
        ? (config.prompt as string)
        : step.action;
    return {
      id: randomUUID(),
      title: `${step.action}`.slice(0, 200),
      description: substituteTemplate(instruction, options.input ?? {}),
      agentHint: typeof config.agentHint === 'string' ? (config.agentHint as string) : (step.agentId ?? undefined),
      skills: Array.isArray(config.skills) ? (config.skills as string[]) : step.skillId ? [step.skillId] : [],
      tools: Array.isArray(config.tools) ? (config.tools as string[]) : [],
      dependsOn: [],
    };
  });
  // Workflow steps are sequential by stepNumber: chain them so a failed
  // step skips its dependents (honest dependency semantics).
  for (let i = 1; i < planSteps.length; i += 1) {
    planSteps[i].dependsOn = [planSteps[i - 1].id];
  }

  const plan: PlanResult = {
    steps: planSteps,
    strategy: 'llm',
    reasoning: `Workflow "${workflow.name}" with ${steps.length} step(s) from persisted definition.`,
  };

  // Persist workflow linkage on the task steps output mapping
  await db.agentOSRun.update({ where: { id: run.id }, data: { plan: JSON.stringify(plan) } });
  await recordRunEvent({
    runId: run.id,
    type: 'plan.created',
    source: 'workflow-engine',
    data: { workflowRunId: workflowRun.id, workflowId: workflow.id, stepCount: steps.length },
  });

  if (options.executeInline) {
    void executeWorkflowRun(run.id, workflowRun.id, plan, task.id).catch(() => {});
  } else {
    await enqueue(RUN_QUEUE, 'agentos.workflow', { runId: run.id, workflowRunId: workflowRun.id, taskId: task.id }, { priority: 10, maxRetries: 2, idempotencyKey: `workflow-run:${workflowRun.id}`, jobId: run.id });
  }

  return { workflowRunId: workflowRun.id, runId: run.id, status: 'queued' };
}

/**
 * Execute a workflow run through the master orchestrator pipeline, then
 * finalize the WorkflowRun record with the aggregated output.
 */
export async function executeWorkflowRun(
  runId: string,
  workflowRunId: string,
  plan?: PlanResult,
  taskId?: string,
): Promise<void> {
  const startedAt = Date.now();
  try {
    // Load the persisted plan when the caller doesn't supply one (the
    // queue worker path relies on this).
    let effectivePlan = plan;
    if (!effectivePlan) {
      const runRecord = await db.agentOSRun.findUnique({ where: { id: runId }, select: { plan: true } });
      try {
        const parsed = JSON.parse(runRecord?.plan ?? '{}') as Partial<PlanResult>;
        effectivePlan = {
          steps: Array.isArray(parsed.steps) ? parsed.steps : [],
          strategy: parsed.strategy ?? 'heuristic',
          reasoning: parsed.reasoning ?? '',
        };
      } catch {
        effectivePlan = { steps: [], strategy: 'heuristic', reasoning: '' };
      }
    }

    await executeRun(runId, { plan: effectivePlan });

    const run = await db.agentOSRun.findUnique({ where: { id: runId } });
    if (!run) throw new Error(`Run ${runId} not found after execution`);

    // Aggregate the pipeline-executed tasks (linked to this workflow) into
    // the workflow output. The pipeline's Task/TaskStep records are the
    // source of truth — they carry agent, model, tokens, QC and artifacts.
    const executedTasks = await db.task.findMany({
      where: {
        ...(run.workflowId ? { workflowId: run.workflowId } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    const stepOutputs: Array<{
      taskId: string;
      title: string;
      status: string;
      output: string | null;
      error: string | null;
    }> = [];
    for (const t of executedTasks) {
      const taskSteps = await db.taskStep.findMany({
        where: { taskId: t.id },
        orderBy: { stepNumber: 'asc' },
      });
      for (const s of taskSteps) {
        stepOutputs.push({
          taskId: t.id,
          title: t.title,
          status: s.status,
          output: s.output?.slice(0, 2000) ?? null,
          error: s.error ?? null,
        });
      }
    }
    const output = JSON.stringify({
      runId,
      status: run.status,
      summary: run.summary,
      steps: stepOutputs,
    });

    await db.workflowRun.update({
      where: { id: workflowRunId },
      data: {
        status: run.status === 'completed' ? 'completed' : run.status === 'failed' ? 'failed' : 'cancelled',
        output: output.slice(0, 60000),
        durationMs: Date.now() - startedAt,
        completedAt: new Date(),
      },
    });
    // Finalize the container task (if known) to reflect the run outcome.
    if (taskId) {
      await db.task.update({
        where: { id: taskId },
        data: { status: run.status === 'completed' ? 'completed' : 'failed', completedAt: new Date() },
      }).catch(() => {});
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.workflowRun.update({
      where: { id: workflowRunId },
      data: { status: 'failed', output: message.slice(0, 60000), durationMs: Date.now() - startedAt, completedAt: new Date() },
    }).catch(() => {});
    await db.agentOSRun.update({
      where: { id: runId },
      data: { status: 'failed', error: message, completedAt: new Date() },
    }).catch(() => {});
  }
}

/** Get a workflow run (with its AgentOS run) by id. */
export async function getWorkflowRun(workflowRunId: string) {
  const workflowRun = await db.workflowRun.findUnique({
    where: { id: workflowRunId },
    include: { workflow: { select: { name: true, slug: true } } },
  });
  if (!workflowRun) return null;
  const run = await db.agentOSRun.findFirst({
    where: { workflowId: workflowRun.workflowId, createdAt: { gte: workflowRun.createdAt } },
    orderBy: { createdAt: 'desc' },
  });
  return { workflowRun, run };
}
