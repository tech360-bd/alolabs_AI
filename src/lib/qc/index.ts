/**
 * ALO Labs AgentOS — Quality Control & Repair Loop
 *
 * GENERATE → VALIDATE → (PASS → DONE | FAIL → DIAGNOSE → REPAIR → RETRY) →
 * max retries exhausted → HUMAN REVIEW REQUIRED (Approval).
 *
 * The QC gate is a real, persisted checkpoint:
 *  - writes a QualityAssessment record for every evaluation
 *  - on failure, asks the model to repair its own output (bounded attempts)
 *  - escalates to a human Approval when retries are exhausted
 *  - never loops endlessly
 */

import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { getRouter } from '@/lib/ai-router';
import { validateExecution, type ValidationResult } from '@/lib/agent-runtime/pipeline';
import type { AIRequest } from '@/lib/ai-router/types';

export const MAX_REPAIR_ATTEMPTS = 2;
export const QC_PASS_SCORE = 0.6;

export interface QCGateResult {
  passed: boolean;
  score: number;
  checks: ValidationResult['checks'];
  issues: string[];
  assessmentId: string;
}

export interface RepairResult {
  repaired: string;
  model: string;
  attempt: number;
}

/** True when an error means "no AI provider is configured" (honest failure). */
export function isConfigurationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('api key') ||
    message.includes('no providers are available') ||
    message.includes('not configured') ||
    message.includes('provider was removed') ||
    message.includes('all providers failed')
  );
}

export function configurationRequiredMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Configuration required: no AI provider is configured or reachable. ${message}`;
}

/**
 * Run the QC gate on an agent output. Persists a QualityAssessment record.
 */
export async function runQualityGate(params: {
  output: string;
  taskInput: string;
  agentRole?: string;
  agentDbId?: string;
  agentId?: string;
  skillId?: string;
  workflowId?: string;
  runId?: string;
  taskDbId?: string;
}): Promise<QCGateResult> {
  const validation = validateExecution(params.output, params.taskInput, params.agentRole ?? '');
  const issues = validation.checks.filter((c) => !c.passed).map((c) => `${c.name}: ${c.detail}`);

  const assessment = await db.qualityAssessment.create({
    data: {
      id: randomUUID(),
      score: validation.score,
      assessor: 'system',
      level: validation.passed ? 'senior' : 'draft',
      criteria: JSON.stringify(
        Object.fromEntries(validation.checks.map((c) => [c.name, c.passed ? 1 : 0])),
      ),
      notes: JSON.stringify({
        checks: validation.checks,
        issues,
        ...(params.runId ? { runId: params.runId } : {}),
        ...(params.taskDbId ? { taskId: params.taskDbId } : {}),
      }),
      ...(params.agentDbId ? { agentId: params.agentDbId } : {}),
      ...(params.skillId ? { skillId: params.skillId } : {}),
      ...(params.workflowId ? { workflowId: params.workflowId } : {}),
    },
  });

  return {
    passed: validation.passed,
    score: validation.score,
    checks: validation.checks,
    issues,
    assessmentId: assessment.id,
  };
}

/**
 * Ask the model to repair its own output given the failed QC checks.
 * Returns the repaired output. Throws on provider failure (caller decides).
 */
export async function repairOutput(params: {
  taskInput: string;
  output: string;
  issues: string[];
  systemPrompt?: string;
  model?: string;
  companyId?: string;
  agentId?: string;
  attempt: number;
  /** Observability: ties the routing decision to the run/task being repaired. */
  runId?: string;
  taskId?: string;
}): Promise<RepairResult> {
  const router = getRouter();
  const request: AIRequest = {
    model: params.model ?? 'balanced',
    messages: [
      {
        role: 'system',
        content: [
          params.systemPrompt ?? 'You are a precise specialist agent working inside ALO Labs AgentOS.',
          'A previous answer of yours failed automated quality control.',
          'Repair it: address every listed issue, keep what was correct, and return ONLY the corrected final answer.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `TASK: ${params.taskInput}`,
          '',
          'PREVIOUS ANSWER:',
          params.output.slice(0, 8000),
          '',
          `QUALITY CONTROL ISSUES (attempt ${params.attempt}):`,
          ...params.issues.map((issue) => `- ${issue}`),
          '',
          'Return the repaired answer now. Do not discuss the repair; just produce the corrected output.',
        ].join('\n'),
      },
    ],
    maxTokens: 4096,
    temperature: 0.3,
  };

  const response = await router.chat(request, params.companyId, params.agentId, {
    runId: params.runId,
    taskId: params.taskId,
    taskType: 'qc.repair',
  });
  return {
    repaired: response.content,
    model: response.model,
    attempt: params.attempt,
  };
}

/**
 * Escalate to a human: creates an Approval (human review), marks the run as
 * waiting_approval. This is the mandatory terminal state when automated
 * repair is exhausted — the system never loops endlessly.
 */
/** Default deadline for a human review before the waiting run is failed. */
export const APPROVAL_TTL_HOURS = Number(process.env.APPROVAL_TTL_HOURS ?? 72);

export async function requestHumanReview(params: {
  runId?: string;
  taskDbId?: string;
  stepId?: string;
  agentDbId?: string;
  title: string;
  reason: string;
  output?: string;
  issues?: string[];
  requestedBy?: string;
  companyId?: string;
  /** Override the review deadline (hours). */
  ttlHours?: number;
}): Promise<{ approvalId: string }> {
  const requestJson = {
    ...(params.runId ? { runId: params.runId } : {}),
    ...(params.taskDbId ? { taskId: params.taskDbId } : {}),
    ...(params.stepId ? { stepId: params.stepId } : {}),
    ...(params.agentDbId ? { agentDbId: params.agentDbId } : {}),
    reason: params.reason,
    issues: params.issues ?? [],
    outputPreview: params.output?.slice(0, 2000) ?? null,
  };
  const ttlHours = params.ttlHours && params.ttlHours > 0 ? params.ttlHours : APPROVAL_TTL_HOURS;

  // requestedBy is a FK to User; a stale/unknown user id must not prevent the
  // escalation itself (the run would otherwise fail instead of pausing).
  let requestedBy: string | undefined;
  if (params.requestedBy) {
    const user = await db.user.findUnique({ where: { id: params.requestedBy }, select: { id: true } }).catch(() => null);
    requestedBy = user?.id;
  }

  const approval = await db.approval.create({
    data: {
      id: randomUUID(),
      type: 'qc_review',
      title: params.title,
      description: params.reason,
      requestJson: JSON.stringify(requestJson),
      status: 'pending',
      riskLevel: 'high',
      expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
      ...(requestedBy ? { requestedBy } : {}),
      ...(params.companyId ? { companyId: params.companyId } : {}),
    },
  });

  if (params.runId) {
    await db.agentOSRun.update({
      where: { id: params.runId },
      data: { status: 'waiting_approval' },
    });
  }

  return { approvalId: approval.id };
}
