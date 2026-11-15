import { InternalError, WORKFORCE_ROLES, internalRoute, readJsonBody } from '@/lib/internal/auth';
import { isDeliverableType, publishExecutionOutput, reviewExecution, syncExecution } from '@/lib/client-services/fulfilment';

/** GET /api/internal/client-executions/:id — current state of one execution and its run. */
export const GET = internalRoute<{ id: string }>(WORKFORCE_ROLES, async (_ctx, { id }) => {
  const { execution, run } = await syncExecution(id);
  return { execution, run };
});

/**
 * POST /api/internal/client-executions/:id
 *   { action: 'review', decision: 'approve' | 'reject', notes? }
 *   { action: 'publish', title, description?, type?, isFinal?, content? }
 *
 * Publishing requires an approved review and passes the client-safe check.
 */
export const POST = internalRoute<{ id: string }>(WORKFORCE_ROLES, async (ctx, { id }) => {
  const body = await readJsonBody(ctx.request);
  if (body.action === 'review') {
    if (body.decision !== 'approve' && body.decision !== 'reject') throw new InternalError(400, 'decision must be "approve" or "reject".');
    const execution = await reviewExecution({
      executionId: id,
      reviewerUserId: ctx.userId,
      decision: body.decision,
      notes: typeof body.notes === 'string' ? body.notes : undefined,
    });
    return { execution };
  }
  if (body.action === 'publish') {
    if (typeof body.title !== 'string') throw new InternalError(400, 'title is required.');
    const deliverable = await publishExecutionOutput({
      executionId: id,
      staffUserId: ctx.userId,
      title: body.title,
      description: typeof body.description === 'string' ? body.description : undefined,
      type: isDeliverableType(body.type) ? body.type : undefined,
      isFinal: body.isFinal === true,
      content: typeof body.content === 'string' ? body.content : undefined,
    });
    return { deliverable };
  }
  throw new InternalError(400, 'Unknown action.');
});
