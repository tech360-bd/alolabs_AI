import { NextResponse } from 'next/server';
import { requireCompanyAdmin } from '@/lib/api-auth';
import { db } from '@/lib/db';

function parseDetails(value: string): unknown {
  try { return JSON.parse(value); } catch { return {}; }
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error';
  const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompanyAdmin();
    const { id } = await context.params;
    const identity = await db.aIEmployeeIdentity.findFirst({
      where: { id, companyId: user.companyId },
      select: { id: true, employeeKey: true },
    });
    if (!identity) return NextResponse.json({ error: 'AI employee identity not found for this company.' }, { status: 404 });
    const events = await db.auditEvent.findMany({
      where: {
        companyId: user.companyId,
        action: { startsWith: 'ai_employee.' },
        OR: [{ resourceId: identity.id }, { resourceId: identity.employeeKey }],
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, actorUserId: true, action: true, resource: true, details: true, createdAt: true },
    });
    return NextResponse.json({
      data: events.map((event) => ({ ...event, details: parseDetails(event.details) })),
      limit: 100,
      employeeKey: identity.employeeKey,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
