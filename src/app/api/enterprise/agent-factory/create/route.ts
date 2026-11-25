import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAuth } from '@/lib/api-auth';
import { getAgentFactory } from '@/lib/multi-agent-orchestrator';
import { validateAgentFactoryScope } from '@/lib/multi-agent-orchestrator/agent-factory-guard';
import { enforceGovernance, toActorRole } from '@/lib/governance';
import { writeAuditEvent } from '@/lib/audit-events';
import { db } from '@/lib/db';
import { z } from 'zod';

/**
 * Create a temporary, tenant-owned specialist agent.
 *
 * Hardened in the governance phase:
 *   - the caller must be an organisation owner/admin/manager (previously any
 *     authenticated session could mint an agent);
 *   - the agent is stamped with the caller's companyId (previously
 *     `companyId: null`, i.e. an agent owned by nobody);
 *   - requested tools and permission resources must exist in the tool registry,
 *     so a caller cannot invent a capability;
 *   - temporary agents expire (default 8 hours, max 24 hours);
 *   - emergency stop / read-only mode and the tenant boundary are enforced
 *     before anything is created, and creation is audited.
 */
const AgentFactorySchema = z.object({
  name: z.string().min(1, 'name is required').max(100),
  departmentId: z.string().min(1, 'departmentId is required'),
  role: z.string().min(1, 'role is required'),
  systemPrompt: z.string().min(1, 'systemPrompt is required'),
  skills: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  knowledge: z.array(z.string()).default([]),
  memoryProfile: z.enum(['none', 'short', 'standard', 'long']).default('standard'),
  modelPolicy: z.enum(['fast', 'balanced', 'reasoning', 'coding', 'vision']).default('balanced'),
  allowedProviders: z.array(z.string()).default([]),
  permissions: z.array(z.string()).default([]),
  budgetLimit: z.number().min(0).default(10),
  triggers: z.array(z.string()).optional(),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  evaluationPolicy: z.string().optional(),
  expirationMinutes: z.number().int().min(1).optional(),
});

function fail(error: string, status: number, details?: unknown) {
  return NextResponse.json(
    { success: false, error: { code: status === 400 ? 'VALIDATION_ERROR' : status === 403 ? 'FORBIDDEN' : 'ERROR', message: error, details } },
    { status },
  );
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();
    const body = await request.json();
    const parsed = AgentFactorySchema.safeParse(body);
    if (!parsed.success) {
      return fail('Validation failed', 400, parsed.error.issues);
    }
    const spec = parsed.data;

    const department = await db.department.findUnique({
      where: { id: spec.departmentId },
      select: { id: true, name: true, companyId: true },
    });
    if (!department) return fail('Department not found', 400);

    const scopeCheck = validateAgentFactoryScope({
      companyRole: user.companyRole,
      platformRole: user.role,
      callerCompanyId: user.companyId,
      departmentCompanyId: department.companyId,
      requestedTools: spec.tools,
      requestedSkills: spec.skills,
      requestedPermissions: spec.permissions,
      expirationMinutes: spec.expirationMinutes,
      budgetLimit: spec.budgetLimit,
    });
    if (!scopeCheck.ok) return fail(scopeCheck.errors.join(' '), 403, scopeCheck.errors);

    // Central governance gate: emergency stop, read-only mode, tenant boundary.
    const governance = await enforceGovernance({
      action: 'Create a temporary specialist agent',
      actionClass: 'write.project',
      resource: `agent-factory:${department.id}`,
      companyId: user.companyId,
      callerCompanyId: user.companyId,
      actor: {
        userId: user.userId,
        role: toActorRole(user.companyRole),
        companyId: user.companyId,
      },
      surface: user.role === 'super_admin' || user.role === 'admin' ? 'super_admin' : 'customer_workspace',
    });
    if (governance.outcome !== 'allow') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: governance.outcome === 'deny' ? 'GOVERNANCE_DENIED' : 'GOVERNANCE_APPROVAL_REQUIRED',
            message: governance.explanation,
            decision: {
              outcome: governance.outcome,
              riskLevel: governance.riskLevel,
              requiredApprovers: governance.requiredApprovers,
              policies: governance.violations.map((violation) => violation.policyId),
            },
          },
        },
        { status: 403 },
      );
    }

    const factory = getAgentFactory();
    const agent = await factory.createAgent(spec, { companyId: user.companyId });

    try {
      await writeAuditEvent({
        actorUserId: user.userId,
        companyId: user.companyId,
        action: 'agent.temporary.create',
        resource: 'agent',
        resourceId: agent.id,
        details: {
          agentId: agent.agentId,
          departmentId: department.id,
          tools: spec.tools,
          skills: spec.skills,
          permissions: spec.permissions,
          expiration: agent.expiresAt.toISOString(),
          governanceDecision: governance.decisionId,
        },
      });
    } catch (auditError) {
      // The agent exists now; do not report success without a record though.
      console.error('[agent-factory] failed to audit temporary agent creation:', auditError);
      return fail('Agent was created but the audit record could not be written; contact support.', 500);
    }

    return NextResponse.json({
      success: true,
      data: { ...agent, companyId: user.companyId, expiresAt: agent.expiresAt.toISOString() },
    });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return fail(error.message, error.message === 'Forbidden' ? 403 : 401);
    }
    console.error('Agent factory create error:', error);
    return fail('Internal server error', 500);
  }
}
