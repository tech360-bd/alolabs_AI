import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export async function GET() {
  try {
    await requireAuth();

    const agentCount = await db.agent.count();
    const departmentCount = await db.department.count();
    const workflowCount = await db.workflow.count();
    const taskCount = await db.task.count();
    const approvalCount = await db.approval.count();
    const commandCount = await db.command.count();
    const userCount = await db.user.count();
    const skillCount = await db.skill.count();

    return NextResponse.json({
      agents: { total: agentCount },
      workflows: { total: workflowCount },
      approvals: { total: approvalCount },
      users: { total: userCount },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Analytics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}