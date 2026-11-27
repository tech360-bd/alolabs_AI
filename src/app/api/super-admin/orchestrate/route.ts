import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/api-auth';
import { authFailure } from '@/lib/api/route-errors';
import { checkEndpointLimit } from '@/lib/security/rate-limiter';
import { writeAuditEvent } from '@/lib/audit-events';
import { isUsableTenantId, SYSTEM_SCOPE, resolveSystemScopes } from '@/lib/tenancy/policy';
import { createOrchestratedRun } from '@/lib/orchestration/service';
import { discoverAgents } from '@/lib/orchestration/registry';
import { RISK_META, classifyInstruction } from '@/lib/super-admin/operator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * /api/super-admin/orchestrate — multi-agent fan-out.
 *
 * `POST` creates a parent run and queues `agentos.orchestrate`; the worker splits
 * the objective into subtasks, assigns them to discovered agents, runs them with
 * bounded concurrency and reconciles the outputs into the parent's verdict.
 *
 * Nothing here reports that agents ran: the response contains the parent run id and
 * the plan, and the outcome is only visible in the parent's events and status.
 *
 * `GET` returns the agent registry for the caller's company — including agents that
 * are registered but unavailable, because a missing capability is information.
 */

const BodySchema = z
  .object({
    instruction: z.string().trim().min(1).max(20_000),
    companyId: z.string().trim().max(191).optional(),
    projectId: z.string().trim().max(191).optional(),
    reason: z.string().trim().min(8).max(500).optional(),
    previewOnly: z.boolean().optional(),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole('super_admin');

    const limit = await checkEndpointLimit('super-admin-orchestrate', user.userId);
    if (!limit.allowed) {
      return NextResponse.json({ error: 'Too many orchestration requests. Wait before trying again.' }, { status: 429 });
    }

    const parsed = BodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid orchestration request', issues: parsed.error.issues.map((issue) => issue.message) },
        { status: 400 },
      );
    }
    const input = parsed.data;

    const ownCompanyId = isUsableTenantId(user.companyId) ? user.companyId : null;
    const requested = input.companyId ?? null;
    const targetCompanyId = requested && requested !== ownCompanyId ? requested : ownCompanyId;
    if (!targetCompanyId) {
      return NextResponse.json({ error: 'No company is resolved for this operator.' }, { status: 400 });
    }

    if (ownCompanyId && targetCompanyId !== ownCompanyId) {
      const scopes = resolveSystemScopes({ id: user.userId, email: user.email ?? '', role: user.role });
      if (!scopes.includes(SYSTEM_SCOPE)) {
        return NextResponse.json(
          { error: 'Orchestrating for another company requires the system:cross-tenant scope (ALO_SYSTEM_OPERATORS).' },
          { status: 403 },
        );
      }
      if (!input.reason) {
        return NextResponse.json({ error: 'Cross-company orchestration requires a written reason.' }, { status: 400 });
      }
    }

    if (input.previewOnly) {
      const instructionPlan = classifyInstruction(input.instruction);
      const agents = await discoverAgents(targetCompanyId);
      const { buildOrchestrationPlan } = await import('@/lib/orchestration/plan');
      const plan = buildOrchestrationPlan(input.instruction, instructionPlan, agents, targetCompanyId);
      return NextResponse.json({
        success: true,
        preview: true,
        intent: { id: instructionPlan.intent.id, label: instructionPlan.intent.label },
        risk: RISK_META[instructionPlan.risk],
        concurrency: plan.concurrency,
        notes: plan.notes,
        subtasks: plan.assignments.map((assignment) => ({
          id: assignment.subtask.id,
          title: assignment.subtask.title,
          scope: assignment.subtask.scope,
          dependsOn: assignment.subtask.dependsOn,
          agent: assignment.agent ? { id: assignment.agent.id, name: assignment.agent.name } : null,
          ...(assignment.reason ? { reason: assignment.reason } : {}),
        })),
      });
    }

    const { parentRunId, plan } = await createOrchestratedRun({
      objective: input.instruction,
      companyId: targetCompanyId,
      userId: user.userId,
      ...(input.projectId ? { projectId: input.projectId } : {}),
    });

    await writeAuditEvent({
      action: 'super_admin.orchestration.queued',
      resource: 'run',
      resourceId: parentRunId,
      companyId: targetCompanyId,
      actorUserId: user.userId,
      details: {
        subtasks: plan.assignments.length,
        assigned: plan.assignments.filter((assignment) => assignment.agent).length,
        concurrency: plan.concurrency,
      },
    });

    return NextResponse.json({
      success: true,
      parentRunId,
      streamUrl: `/api/runs/${parentRunId}/events`,
      concurrency: plan.concurrency,
      notes: plan.notes,
      subtasks: plan.assignments.map((assignment) => ({
        id: assignment.subtask.id,
        title: assignment.subtask.title,
        agent: assignment.agent ? { id: assignment.agent.id, name: assignment.agent.name } : null,
        ...(assignment.reason ? { reason: assignment.reason } : {}),
      })),
    });
  } catch (error) {
    const failure = authFailure(error);
    if (failure) return failure;
    console.error('[super-admin/orchestrate] failed:', error);
    return NextResponse.json({ error: 'The orchestration could not be queued.' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const user = await requireRole('super_admin');
    const agents = await discoverAgents(isUsableTenantId(user.companyId) ? user.companyId : undefined);
    return NextResponse.json({
      success: true,
      agents: agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        kind: agent.kind,
        capabilities: agent.capabilities,
        tools: agent.tools,
        health: agent.health,
        maxConcurrency: agent.maxConcurrency,
        tenantScope: agent.tenantScope,
        version: agent.version ?? null,
        resourceBudget: agent.resourceBudget,
      })),
      available: agents.filter((agent) => agent.health === 'available').length,
      unavailable: agents.filter((agent) => agent.health !== 'available').length,
    });
  } catch (error) {
    const failure = authFailure(error);
    if (failure) return failure;
    return NextResponse.json({ error: 'Agent registry unavailable.' }, { status: 500 });
  }
}
