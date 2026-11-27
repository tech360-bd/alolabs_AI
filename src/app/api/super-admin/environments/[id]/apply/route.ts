import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/api-auth';
import { authFailure } from '@/lib/api/route-errors';
import { isUsableTenantId } from '@/lib/tenancy/policy';
import { writeAuditEvent } from '@/lib/audit-events';
import { notifyOperator } from '@/lib/notifications/operator';
import { EnvironmentError, requestApply, requireEnvironment, type Actor } from '@/lib/environments/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * /api/super-admin/environments/[id]/apply — request that a version be applied.
 *
 * The route creates a durable `EnvironmentApply` row in state `queued`. It cannot
 * report success: the host-side agent performs the change and reports back through
 * the ops ingest path. That distinction is the point — a saved database row has never
 * changed a running process.
 *
 * Production requires a second identity: the approver may not be the author.
 */

const ApplySchema = z
  .object({
    version: z.number().int().min(1).optional(),
    /** Required so a retried request cannot apply twice. */
    idempotencyKey: z.string().trim().min(8).max(128),
    approve: z.boolean().optional(),
  })
  .strict();

async function actorOrResponse(): Promise<{ actor: Actor } | { response: NextResponse }> {
  const user = await requireRole('super_admin');
  if (!isUsableTenantId(user.companyId)) {
    return { response: NextResponse.json({ error: 'This operator has no company.' }, { status: 400 }) };
  }
  return { actor: { userId: user.userId, companyId: user.companyId, role: user.role } };
}

function handle(error: unknown): NextResponse {
  if (error instanceof EnvironmentError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  return authFailure(error) ?? NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const resolved = await actorOrResponse();
    if ('response' in resolved) return resolved.response;
    const { id } = await context.params;
    const environment = await requireEnvironment(resolved.actor, id);

    const applies = await db.environmentApply.findMany({
      where: { environmentId: environment.id },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: {
        id: true,
        status: true,
        stage: true,
        detail: true,
        healthCheck: true,
        requestedBy: true,
        approvedBy: true,
        startedAt: true,
        finishedAt: true,
        createdAt: true,
        version: { select: { version: true, checksum: true } },
      },
    });

    return NextResponse.json({
      applies: applies.map((apply) => ({
        ...apply,
        startedAt: apply.startedAt?.toISOString() ?? null,
        finishedAt: apply.finishedAt?.toISOString() ?? null,
        createdAt: apply.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return handle(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const resolved = await actorOrResponse();
    if ('response' in resolved) return resolved.response;
    const { id } = await context.params;

    const parsed = ApplySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid apply request', issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) },
        { status: 400 },
      );
    }

    const environment = await requireEnvironment(resolved.actor, id);
    const result = await requestApply(resolved.actor, id, parsed.data);

    await writeAuditEvent({
      actorUserId: resolved.actor.userId,
      companyId: resolved.actor.companyId,
      action: result.replayed ? 'environment.apply_replayed' : 'environment.apply_requested',
      resource: 'EnvironmentApply',
      resourceId: result.applyId,
      details: { environment: environment.name, project: environment.projectSlug, versionId: result.versionId },
    }).catch(() => undefined);

    if (!result.replayed && environment.name === 'production') {
      await notifyOperator({
        companyId: resolved.actor.companyId,
        userId: resolved.actor.userId,
        type: 'approval.required',
        title: `Production configuration queued: ${environment.projectSlug}`,
        message: `Version ${parsed.data.version ?? 'latest'} is queued for application to production. The host agent performs it; this row is the instruction, not the result.`,
        link: '/dashboard?panel=environment-manager',
        evidence: { applyId: result.applyId, environment: environment.name },
      }).catch(() => undefined);
    }

    return NextResponse.json(result, { status: result.replayed ? 200 : 202 });
  } catch (error) {
    return handle(error);
  }
}
