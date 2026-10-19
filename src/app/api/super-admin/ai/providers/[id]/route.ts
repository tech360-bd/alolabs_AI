import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/api-auth';
import { ProviderAdminError, ProviderUpdateSchema, deleteProviderConfig, updateProviderConfig } from '@/lib/ai-router/provider-admin';

export const dynamic = 'force-dynamic';

function errorResponse(error: unknown) {
  if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (error instanceof Error && error.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (error instanceof ProviderAdminError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  return null;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole('super_admin');
    const { id } = await params;
    const parsed = ProviderUpdateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const config = await updateProviderConfig({ userId: actor.userId, role: actor.role, companyId: actor.companyId ?? '' }, id, parsed.data);
    return NextResponse.json({ config });
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    console.error('[SuperAdmin Providers] PATCH failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole('super_admin');
    const { id } = await params;
    if (!z.string().min(1).safeParse(id).success) return NextResponse.json({ error: 'Invalid provider id' }, { status: 400 });
    await deleteProviderConfig({ userId: actor.userId, role: actor.role, companyId: actor.companyId ?? '' }, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    console.error('[SuperAdmin Providers] DELETE failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
