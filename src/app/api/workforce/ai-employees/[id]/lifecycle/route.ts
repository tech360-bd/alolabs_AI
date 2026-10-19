import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCompanyAdmin } from '@/lib/api-auth';
import { AIEmployeeLifecycleError, transitionAIEmployeeStatus } from '@/lib/workforce';

const TransitionSchema = z.object({
  status: z.enum(['tested', 'active', 'suspended', 'retired']),
  reason: z.string().trim().min(3).max(200),
  verificationExecutionId: z.string().min(1).max(191).optional(),
}).strict();

function errorResponse(error: unknown) {
  if (error instanceof AIEmployeeLifecycleError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : 'Internal server error';
  const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
  return NextResponse.json({ error: message }, { status });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompanyAdmin();
    const parsed = TransitionSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const { id } = await context.params;
    const data = await transitionAIEmployeeStatus({
      companyId: user.companyId,
      employeeId: id,
      actor: { userId: user.userId, role: user.role, companyRole: user.companyRole },
      ...parsed.data,
    });
    return NextResponse.json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
