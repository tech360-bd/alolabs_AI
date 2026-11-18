import { NextResponse } from 'next/server';
import { ProviderAdminError } from '@/lib/ai-router/provider-admin';

export function providerErrorResponse(error: unknown) {
  if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (error instanceof Error && error.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (error instanceof ProviderAdminError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  return null;
}
