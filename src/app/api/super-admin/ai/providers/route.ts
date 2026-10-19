import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/api-auth';
import { db } from '@/lib/db';
import {
  ProviderAdminError,
  ProviderCreateSchema,
  createProviderConfig,
  listAllProviderConfigs,
} from '@/lib/ai-router/provider-admin';

export const dynamic = 'force-dynamic';

const CreateSchema = ProviderCreateSchema.extend({ companyId: z.string().min(1).optional() });

function adminError(error: unknown) {
  if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (error instanceof Error && error.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (error instanceof ProviderAdminError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  return null;
}

export async function GET() {
  try {
    const actor = await requireRole('super_admin');
    const configs = await listAllProviderConfigs({ userId: actor.userId, role: actor.role, companyId: actor.companyId ?? '' });
    return NextResponse.json({ configs });
  } catch (error) {
    const response = adminError(error);
    if (response) return response;
    console.error('[SuperAdmin Providers] GET failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireRole('super_admin');
    const parsed = CreateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const scope = parsed.data.scope ?? 'company';
    if (scope === 'company' && !parsed.data.companyId) {
      return NextResponse.json({ error: 'companyId is required for a company-scoped provider' }, { status: 400 });
    }
    if (scope === 'company') {
      const company = await db.company.findUnique({ where: { id: parsed.data.companyId }, select: { id: true } });
      if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }
    const { companyId, ...input } = parsed.data;
    const config = await createProviderConfig(
      { userId: actor.userId, role: actor.role, companyId: scope === 'company' ? companyId! : '' },
      input,
    );
    return NextResponse.json({ config }, { status: 201 });
  } catch (error) {
    const response = adminError(error);
    if (response) return response;
    console.error('[SuperAdmin Providers] POST failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
