import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/api-auth';
import { authFailure } from '@/lib/api/route-errors';
import { checkEndpointLimit } from '@/lib/security/rate-limiter';
import { isUsableTenantId, SYSTEM_SCOPE, resolveSystemScopes } from '@/lib/tenancy/policy';
import { dispatchOperatorInstruction, listOperatorRuns } from '@/lib/super-admin/dispatch';
import { classifyInstruction, getOperatorIntent, RISK_META, CAPABILITY_META } from '@/lib/super-admin/operator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * /api/super-admin/command — the Super Admin Command Center's operational entry
 * point.
 *
 * This is the route that makes the command center real: an instruction posted here
 * becomes a persisted `Command` row and a durable run in the Run Engine (or, for a
 * gated operation, a precise approval request naming the exact steps). The
 * advisory chat at `/api/super-chat` is left alone — it is honestly a planning
 * assistant, and it never claimed to execute anything.
 *
 * Authorisation: `super_admin` only. A run is always created for the caller's own
 * company; naming a *different* company additionally requires the
 * `system:cross-tenant` scope and a written reason (T-7), which the dispatcher
 * records in the audit log before any work happens.
 */

const AttachmentSchema = z.object({
  kind: z.enum(['image', 'video', 'file', 'url', 'repository']),
  name: z.string().trim().min(1).max(2_000),
  size: z.number().int().nonnegative().max(2_000_000_000).optional(),
  mimeType: z.string().trim().max(200).optional(),
});

const DispatchSchema = z
  .object({
    instruction: z.string().trim().min(1).max(20_000),
    /** Target company. Omitted = the caller's own company. */
    companyId: z.string().trim().max(191).optional(),
    /** Required when the instruction is cross-tenant, and whenever a reason exists. */
    reason: z.string().trim().min(8).max(500).optional(),
    projectId: z.string().trim().max(191).optional(),
    attachments: z.array(AttachmentSchema).max(20).optional(),
    /** `true` previews the plan without creating anything. Defaults to false. */
    previewOnly: z.boolean().optional(),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole('super_admin');

    const limit = await checkEndpointLimit('super-admin-command', user.userId);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many operator instructions. Wait before trying again.' },
        { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1_000))) } },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = DispatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid instruction', issues: parsed.error.issues.map((issue) => issue.message) },
        { status: 400 },
      );
    }
    const input = parsed.data;

    // Tenant resolution: own company by default, another company only with the
    // system scope. A super_admin without the scope cannot widen the target.
    const ownCompanyId = isUsableTenantId(user.companyId) ? user.companyId : null;
    const requestedCompanyId = input.companyId ?? null;
    const targetCompanyId = requestedCompanyId && requestedCompanyId !== ownCompanyId ? requestedCompanyId : ownCompanyId;

    if (!targetCompanyId) {
      return NextResponse.json(
        { error: 'No company is resolved for this operator, and no companyId was supplied.' },
        { status: 400 },
      );
    }

    const crossTenant = Boolean(ownCompanyId) && targetCompanyId !== ownCompanyId;
    if (crossTenant) {
      const scopes = resolveSystemScopes({ id: user.userId, email: user.email ?? '', role: user.role });
      if (!scopes.includes(SYSTEM_SCOPE)) {
        return NextResponse.json(
          {
            error:
              'Dispatching work for another company requires the system:cross-tenant scope ' +
              '(ALO_SYSTEM_OPERATORS). A super_admin role is not sufficient on its own.',
          },
          { status: 403 },
        );
      }
      if (!input.reason) {
        return NextResponse.json(
          { error: 'Cross-company dispatch requires a written reason (8+ characters).' },
          { status: 400 },
        );
      }
    }

    if (input.previewOnly) {
      const plan = classifyInstruction(input.instruction);
      return NextResponse.json({
        success: true,
        preview: true,
        plan,
        risk: RISK_META[plan.risk],
        capability: CAPABILITY_META[plan.intent.capability],
        intent: { id: plan.intent.id, label: plan.intent.label, summary: plan.intent.summary },
        attachments: input.attachments ?? [],
      });
    }

    const result = await dispatchOperatorInstruction({
      instruction: input.instruction,
      companyId: targetCompanyId,
      userId: user.userId,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.attachments ? { attachments: input.attachments } : {}),
      requestId: request.headers.get('x-request-id') ?? undefined,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined,
    });

    if (result.status === 'rejected') {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    const meta = {
      risk: RISK_META[result.plan.risk],
      capability: CAPABILITY_META[result.plan.intent.capability],
      intent: {
        id: result.plan.intent.id,
        label: result.plan.intent.label,
        summary: result.plan.intent.summary,
      },
      steps: result.plan.steps,
      evidence: result.plan.evidence,
      matched: result.plan.matched,
      confidence: result.plan.confidence,
    };

    if (result.status === 'approval_required') {
      return NextResponse.json(
        {
          success: true,
          status: 'approval_required',
          commandId: result.commandId,
          approvalId: result.approvalId,
          reason: result.reason,
          approvalUrl: '/dashboard?panel=approvals',
          ...meta,
        },
        { status: 202 },
      );
    }

    return NextResponse.json({
      success: true,
      status: 'dispatched',
      commandId: result.commandId,
      runId: result.runId,
      runStatus: result.runStatus,
      streamUrl: result.streamUrl,
      ...meta,
    });
  } catch (error) {
    // `authFailure` already returns a ready response (401/403) for an auth error.
    const failure = authFailure(error);
    if (failure) return failure;
    console.error('[super-admin/command] dispatch failed:', error);
    return NextResponse.json({ error: 'The instruction could not be dispatched.' }, { status: 500 });
  }
}

/** Recent runs for the operator's own company — the panel's "history" list. */
export async function GET() {
  try {
    const user = await requireRole('super_admin');
    if (!isUsableTenantId(user.companyId)) {
      return NextResponse.json({ success: true, runs: [], notice: 'This operator has no company scope; no runs are listed.' });
    }
    const runs = await listOperatorRuns(user.companyId);
    return NextResponse.json({
      success: true,
      companyId: user.companyId,
      runs,
      intents: ['inspect_repository', 'review_website', 'run_tests', 'inspect_agents', 'inspect_capacity'].map((id) =>
        getOperatorIntent(id as Parameters<typeof getOperatorIntent>[0]),
      ).map((intent) => ({
        id: intent.id,
        label: intent.label,
        summary: intent.summary,
        risk: intent.risk,
        capability: intent.capability,
        capabilityNote: intent.capabilityNote ?? null,
      })),
    });
  } catch (error) {
    const failure = authFailure(error);
    if (failure) return failure;
    console.error('[super-admin/command] history failed:', error);
    return NextResponse.json({ error: 'History unavailable.' }, { status: 500 });
  }
}
