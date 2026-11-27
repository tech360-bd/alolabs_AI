import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/api-auth';
import { authFailure } from '@/lib/api/route-errors';
import { isUsableTenantId } from '@/lib/tenancy/policy';
import { writeAuditEvent } from '@/lib/audit-events';
import {
  createVersion,
  EnvironmentError,
  listVersions,
  requireEnvironment,
  type Actor,
} from '@/lib/environments/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * /api/super-admin/environments/[id]/versions — immutable configuration snapshots.
 *
 * Publishing does not apply anything. A version is what *would* be applied, which is
 * why the response says `requiresApproval` for production instead of implying the
 * change is live.
 */

const PublishSchema = z
  .object({
    changeSummary: z.string().trim().max(500).optional(),
    rollbackOf: z.number().int().min(1).optional(),
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
    return NextResponse.json({ versions: await listVersions(resolved.actor, id) });
  } catch (error) {
    return handle(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const resolved = await actorOrResponse();
    if ('response' in resolved) return resolved.response;
    const { id } = await context.params;

    const parsed = PublishSchema.safeParse((await request.json().catch(() => ({}))) ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid publish request' }, { status: 400 });
    }

    const environment = await requireEnvironment(resolved.actor, id);
    const version = await createVersion(resolved.actor, id, {
      changeSummary: parsed.data.changeSummary ?? '',
      ...(parsed.data.rollbackOf ? { rollbackOf: parsed.data.rollbackOf } : {}),
    });

    await writeAuditEvent({
      actorUserId: resolved.actor.userId,
      companyId: resolved.actor.companyId,
      action: parsed.data.rollbackOf ? 'environment.version_rollback_created' : 'environment.version_created',
      resource: 'ProjectEnvironment',
      resourceId: id,
      details: { version: version.version, rollbackOf: parsed.data.rollbackOf ?? null, environment: environment.name },
    }).catch(() => undefined);

    return NextResponse.json({ version }, { status: 201 });
  } catch (error) {
    return handle(error);
  }
}
