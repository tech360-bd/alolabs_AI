import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/api-auth';
import { authFailure } from '@/lib/api/route-errors';
import { isUsableTenantId } from '@/lib/tenancy/policy';
import { createEnvironment, EnvironmentError, listEnvironments, type Actor } from '@/lib/environments/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * /api/super-admin/environments — the Environment Manager.
 *
 * A super administrator sees only the environments of their own company. There is no
 * cross-tenant listing on this route: an operator who needs another company's
 * configuration uses the audited `ALO_SYSTEM_OPERATORS` path explicitly, not a query
 * parameter that quietly widens every read.
 */

const CreateSchema = z
  .object({
    projectSlug: z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9-]*$/),
    name: z.enum(['development', 'staging', 'production']),
    status: z.enum(['active', 'locked']).optional(),
  })
  .strict();

async function actorOrResponse(): Promise<{ actor: Actor } | { response: NextResponse }> {
  const user = await requireRole('super_admin');
  if (!isUsableTenantId(user.companyId)) {
    return {
      response: NextResponse.json(
        { error: 'This operator has no company. Environment configuration is tenant-owned.' },
        { status: 400 },
      ),
    };
  }
  return { actor: { userId: user.userId, companyId: user.companyId, role: user.role } };
}

export async function GET(request: NextRequest) {
  try {
    const resolved = await actorOrResponse();
    if ('response' in resolved) return resolved.response;
    const projectSlug = request.nextUrl.searchParams.get('project') ?? undefined;
    const environments = await listEnvironments(resolved.actor, projectSlug);
    return NextResponse.json({ environments });
  } catch (error) {
    return authFailure(error) ?? NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const resolved = await actorOrResponse();
    if ('response' in resolved) return resolved.response;

    const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid environment', issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) },
        { status: 400 },
      );
    }

    const environment = await createEnvironment(resolved.actor, parsed.data);
    return NextResponse.json({ environment }, { status: 201 });
  } catch (error) {
    if (error instanceof EnvironmentError) return NextResponse.json({ error: error.message }, { status: error.status });
    return authFailure(error) ?? NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
}
