import { NextResponse } from 'next/server';
import { requireCompanyAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';

/**
 * GET /api/stats — dashboard counters for the signed-in tenant.
 *
 * Counts are real Prisma queries. Rows with a NULL companyId are the seeded
 * global workforce catalogue and are shared by every tenant; they are counted
 * together with the tenant's own rows so the dashboard matches what the
 * workforce pages actually list.
 */
export async function GET() {
  try {
    const user = await requireCompanyAuth();
    const companyId = user.companyId;
    const sharedOrOwned = { OR: [{ companyId }, { companyId: null }] };

    const [agents, departments, tasks, commands, workflows, pendingApprovals] = await Promise.all([
      db.agent.count({ where: { status: { not: 'archived' }, ...sharedOrOwned } }),
      db.department.count({ where: sharedOrOwned }),
      db.task.count({
        where: {
          OR: [
            { agent: { companyId } },
            { userId: user.userId },
          ],
        },
      }),
      // User carries no company column in this schema (tenant scope lives in
      // the JWT), so commands are counted for the signed-in user.
      db.command.count({ where: { userId: user.userId } }),
      // Workflow rows carry no tenant column in the current schema; they are
      // the shared catalogue, so the total is the honest number to show.
      db.workflow.count({ where: { status: 'active' } }),
      db.approval.count({ where: { status: 'pending' } }).catch(() => 0),
    ]);

    return NextResponse.json({
      agents,
      tasks,
      departments,
      commands,
      workflows,
      pendingApprovals,
    });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    console.error('Stats error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
