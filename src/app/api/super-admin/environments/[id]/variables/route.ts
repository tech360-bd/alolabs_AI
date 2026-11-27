import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/api-auth';
import { authFailure } from '@/lib/api/route-errors';
import { isUsableTenantId } from '@/lib/tenancy/policy';
import { writeAuditEvent } from '@/lib/audit-events';
import {
  deleteVariable,
  EnvironmentError,
  listVariables,
  upsertVariable,
  type Actor,
} from '@/lib/environments/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * /api/super-admin/environments/[id]/variables
 *
 * Secrets are write-only from the client's perspective: `PUT` accepts a value and
 * the response contains a mask. Nothing in this route can return a stored secret,
 * which is why the credential never exists in a browser, a log or an audit payload.
 */

const UpsertSchema = z
  .object({
    key: z.string().trim().min(1).max(64),
    value: z.string().min(1).max(8_192),
    secret: z.boolean(),
    description: z.string().max(500).optional(),
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
    return NextResponse.json({ variables: await listVariables(resolved.actor, id) });
  } catch (error) {
    return handle(error);
  }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const resolved = await actorOrResponse();
    if ('response' in resolved) return resolved.response;
    const { id } = await context.params;

    const parsed = UpsertSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid variable', issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) },
        { status: 400 },
      );
    }

    const saved = await upsertVariable(resolved.actor, id, parsed.data);

    // The audit records the key and whether it was secret — never the value.
    await writeAuditEvent({
      actorUserId: resolved.actor.userId,
      companyId: resolved.actor.companyId,
      action: parsed.data.secret ? 'environment.secret_set' : 'environment.variable_set',
      resource: 'ProjectEnvironment',
      resourceId: id,
      details: { key: parsed.data.key, secret: parsed.data.secret },
    }).catch(() => undefined);

    return NextResponse.json({ variable: saved });
  } catch (error) {
    return handle(error);
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const resolved = await actorOrResponse();
    if ('response' in resolved) return resolved.response;
    const { id } = await context.params;
    const key = request.nextUrl.searchParams.get('key');
    if (!key) return NextResponse.json({ error: 'A key query parameter is required' }, { status: 400 });

    const result = await deleteVariable(resolved.actor, id, key);
    await writeAuditEvent({
      actorUserId: resolved.actor.userId,
      companyId: resolved.actor.companyId,
      action: 'environment.variable_deleted',
      resource: 'ProjectEnvironment',
      resourceId: id,
      details: { key },
    }).catch(() => undefined);
    return NextResponse.json(result);
  } catch (error) {
    return handle(error);
  }
}
