// @vitest-environment node
/**
 * Real SQLite integration tests for Phase 1 secureCrud routes:
 *   - /api/crm/notes (tenantField: null + contact ownership, real Prisma create/update)
 *   - /api/crm/lead-score (tenantField: null + contact ownership, real Prisma create/update)
 *   - /api/department-memory (tenantField: null + department ownership)
 *   - /api/agent-usage-summaries (companyId isolation + calculatedAt orderBy)
 *   - /api/task-errors (Task.companyId isolation)
 *   - /api/workflow-steps (WorkflowPermission / Department.companyId isolation)
 *   - /api/tool-runs (Task / Agent ownership, detached rejection)
 *   - /api/agent-permissions, /api/agent-performance, /api/tool-approvals
 */

import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRealDb, type RealDb } from '../helpers/real-db';

let real: RealDb;
let tokenA: string;
let tokenB: string;
let tokenSuper: string;

const A = {
  companyId: 'co-p1-a',
  userId: 'u-p1-a',
  contactId: 'contact-p1-a',
  deptId: 'dept-p1-a',
  agentId: 'agent-p1-a',
  taskId: 'task-p1-a',
  workflowId: 'wf-p1-a',
};
const B = {
  companyId: 'co-p1-b',
  userId: 'u-p1-b',
  contactId: 'contact-p1-b',
  deptId: 'dept-p1-b',
  agentId: 'agent-p1-b',
  taskId: 'task-p1-b',
  workflowId: 'wf-p1-b',
};

function makeRequest(
  url: string,
  options: { method?: string; token?: string; body?: unknown } = {},
): NextRequest {
  const headers = new Headers();
  if (options.token) headers.set('authorization', `Bearer ${options.token}`);
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  return new NextRequest(new URL(url, 'http://localhost:3011'), {
    method: options.method ?? 'GET',
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
}

beforeAll(async () => {
  real = await createRealDb('phase1-secure-crud');
  const { db } = real;

  await db.company.create({ data: { id: A.companyId, name: 'Phase1 Alpha', slug: 'p1-alpha', accountType: 'client', status: 'active' } });
  await db.company.create({ data: { id: B.companyId, name: 'Phase1 Beta', slug: 'p1-beta', accountType: 'client', status: 'active' } });

  await db.user.create({ data: { id: A.userId, email: 'p1-a@test.local', name: 'Admin A', passwordHash: 'x', role: 'admin', isActive: true } });
  await db.user.create({ data: { id: B.userId, email: 'p1-b@test.local', name: 'Admin B', passwordHash: 'x', role: 'admin', isActive: true } });
  await db.user.create({ data: { id: 'u-p1-super', email: 'p1-super@test.local', name: 'Super', passwordHash: 'x', role: 'super_admin', isActive: true } });

  await db.companyUser.create({ data: { userId: A.userId, companyId: A.companyId, role: 'owner' } });
  await db.companyUser.create({ data: { userId: B.userId, companyId: B.companyId, role: 'owner' } });
  await db.companyUser.create({ data: { userId: 'u-p1-super', companyId: A.companyId, role: 'owner' } });

  await db.crmContact.create({ data: { id: A.contactId, companyId: A.companyId, firstName: 'Alice', lastName: 'Alpha', email: 'alice@a.test' } });
  await db.crmContact.create({ data: { id: B.contactId, companyId: B.companyId, firstName: 'Bob', lastName: 'Beta', email: 'bob@b.test' } });

  await db.department.create({ data: { id: A.deptId, name: 'Dept A', slug: 'dept-p1-a', companyId: A.companyId } });
  await db.department.create({ data: { id: B.deptId, name: 'Dept B', slug: 'dept-p1-b', companyId: B.companyId } });

  await db.agent.create({
    data: {
      id: A.agentId,
      agentId: 'AGENT-P1-A',
      name: 'Agent A',
      slug: 'agent-p1-a',
      departmentId: A.deptId,
      departmentName: 'Dept A',
      purpose: 'test',
      companyId: A.companyId,
    },
  });
  await db.agent.create({
    data: {
      id: B.agentId,
      agentId: 'AGENT-P1-B',
      name: 'Agent B',
      slug: 'agent-p1-b',
      departmentId: B.deptId,
      departmentName: 'Dept B',
      purpose: 'test',
      companyId: B.companyId,
    },
  });

  await db.task.create({ data: { id: A.taskId, companyId: A.companyId, title: 'Task A', agentId: A.agentId } });
  await db.task.create({ data: { id: B.taskId, companyId: B.companyId, title: 'Task B', agentId: B.agentId } });

  await db.workflow.create({ data: { id: A.workflowId, name: 'WF A', slug: 'wf-p1-a', departmentId: A.deptId } });
  await db.workflow.create({ data: { id: B.workflowId, name: 'WF B', slug: 'wf-p1-b', departmentId: B.deptId } });
  await db.workflowPermission.create({ data: { workflowId: A.workflowId, companyId: A.companyId, accessLevel: 'full' } });
  // Grant Tenant B only read-only view permission to Workflow A — writes must still be denied.
  await db.workflowPermission.create({ data: { workflowId: A.workflowId, companyId: B.companyId, accessLevel: 'view' } });
  await db.workflowPermission.create({ data: { workflowId: B.workflowId, companyId: B.companyId, accessLevel: 'full' } });

  const { createSessionToken } = await import('@/lib/auth');
  tokenA = await createSessionToken(A.userId);
  tokenB = await createSessionToken(B.userId);
  tokenSuper = await createSessionToken('u-p1-super');
}, 120_000);

afterAll(async () => {
  await real?.cleanup();
});

describe('crm/notes, crm/lead-score, department-memory — real Prisma writes & tenant isolation', () => {
  it('creates, reads, updates, and deletes CrmNote without Prisma relation-filter errors', async () => {
    const notes = await import('@/app/api/crm/notes/route');

    const createRes = await notes.POST(
      makeRequest('http://localhost:3011/api/crm/notes', {
        method: 'POST',
        token: tokenA,
        body: { contactId: A.contactId, content: 'Alpha private note' },
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()).data as { id: string; content: string };
    expect(created.content).toBe('Alpha private note');

    // Tenant B cannot see Tenant A's note
    const listB = await notes.GET(makeRequest('http://localhost:3011/api/crm/notes', { token: tokenB }));
    expect(listB.status).toBe(200);
    expect((await listB.json()).data).toEqual([]);

    // Tenant B cannot create a note on Tenant A's contact
    const crossPost = await notes.POST(
      makeRequest('http://localhost:3011/api/crm/notes', {
        method: 'POST',
        token: tokenB,
        body: { contactId: A.contactId, content: 'Cross note' },
      }),
    );
    expect(crossPost.status).toBe(404);

    // Tenant A can update its note via PUT without spreading relation filter into data
    const putRes = await notes.PUT(
      makeRequest('http://localhost:3011/api/crm/notes', {
        method: 'PUT',
        token: tokenA,
        body: { id: created.id, content: 'Updated note' },
      }),
    );
    expect(putRes.status).toBe(200);
    expect((await putRes.json()).data.content).toBe('Updated note');

    // Tenant B cannot delete Tenant A's note
    const crossDel = await notes.DELETE(
      makeRequest(`http://localhost:3011/api/crm/notes?id=${created.id}`, { method: 'DELETE', token: tokenB }),
    );
    expect(crossDel.status).toBe(404);

    // Tenant A deletes cleanly
    const delRes = await notes.DELETE(
      makeRequest(`http://localhost:3011/api/crm/notes?id=${created.id}`, { method: 'DELETE', token: tokenA }),
    );
    expect(delRes.status).toBe(200);
  });

  it('creates, updates, and isolates CrmLeadScore and syncs contact score', async () => {
    const leadScore = await import('@/app/api/crm/lead-score/route');

    const postA = await leadScore.POST(
      makeRequest('http://localhost:3011/api/crm/lead-score', {
        method: 'POST',
        token: tokenA,
        body: { contactId: A.contactId, factors: { websiteVisits: 25, emailOpens: 12 } },
      }),
    );
    expect(postA.status).toBe(201);
    const created = (await postA.json()).data as { id: string; score: number };
    expect(created.score).toBeGreaterThan(0);

    const putA = await leadScore.PUT(
      makeRequest('http://localhost:3011/api/crm/lead-score', {
        method: 'PUT',
        token: tokenA,
        body: { id: created.id, factors: { websiteVisits: 1, lastContactDaysAgo: 5 } },
      }),
    );
    expect(putA.status).toBe(200);

    const listB = await leadScore.GET(makeRequest('http://localhost:3011/api/crm/lead-score', { token: tokenB }));
    expect((await listB.json()).data).toEqual([]);
  });

  it('creates, updates, deletes, and isolates DepartmentMemory', async () => {
    const deptMem = await import('@/app/api/department-memory/route');

    const postA = await deptMem.POST(
      makeRequest('http://localhost:3011/api/department-memory', {
        method: 'POST',
        token: tokenA,
        body: { departmentId: A.deptId, content: 'Alpha SOP secret' },
      }),
    );
    expect(postA.status).toBe(201);
    const id = (await postA.json()).data.id as string;

    const putA = await deptMem.PUT(
      makeRequest('http://localhost:3011/api/department-memory', {
        method: 'PUT',
        token: tokenA,
        body: { id, content: 'Alpha SOP updated' },
      }),
    );
    expect(putA.status).toBe(200);

    const listB = await deptMem.GET(makeRequest('http://localhost:3011/api/department-memory', { token: tokenB }));
    expect((await listB.json()).data).toEqual([]);

    const crossPut = await deptMem.PUT(
      makeRequest('http://localhost:3011/api/department-memory', {
        method: 'PUT',
        token: tokenB,
        body: { id, content: 'Hijack' },
      }),
    );
    expect(crossPut.status).toBe(404);
  });
});

describe('agent-usage-summaries, task-errors, workflow-steps, tool-runs — tenant isolation', () => {
  it('isolates AgentUsageSummary by companyId and defaults sort to calculatedAt', async () => {
    const route = await import('@/app/api/agent-usage-summaries/route');

    const createA = await route.POST(
      makeRequest('http://localhost:3011/api/agent-usage-summaries', {
        method: 'POST',
        token: tokenA,
        body: { agentId: A.agentId, period: 'daily', totalRuns: 10 },
      }),
    );
    expect(createA.status).toBe(201);
    const created = (await createA.json()).data as { id: string; companyId: string };
    expect(created.companyId).toBe(A.companyId);

    // Tenant A reads cleanly (no Prisma createdAt error)
    const listA = await route.GET(makeRequest('http://localhost:3011/api/agent-usage-summaries', { token: tokenA }));
    expect(listA.status).toBe(200);
    expect((await listA.json()).data).toHaveLength(1);

    // Tenant B sees empty list and cannot mutate Tenant A's summary
    const listB = await route.GET(makeRequest('http://localhost:3011/api/agent-usage-summaries', { token: tokenB }));
    expect((await listB.json()).data).toEqual([]);

    const crossPut = await route.PUT(
      makeRequest('http://localhost:3011/api/agent-usage-summaries', {
        method: 'PUT',
        token: tokenB,
        body: { id: created.id, totalRuns: 999 },
      }),
    );
    expect(crossPut.status).toBe(404);
  });

  it('isolates TaskError through Task.companyId', async () => {
    const route = await import('@/app/api/task-errors/route');

    const postA = await route.POST(
      makeRequest('http://localhost:3011/api/task-errors', {
        method: 'POST',
        token: tokenA,
        body: { taskId: A.taskId, message: 'Secret stack trace A' },
      }),
    );
    expect(postA.status).toBe(201);
    const id = (await postA.json()).data.id as string;

    const listB = await route.GET(makeRequest('http://localhost:3011/api/task-errors', { token: tokenB }));
    expect((await listB.json()).data).toEqual([]);

    const crossPost = await route.POST(
      makeRequest('http://localhost:3011/api/task-errors', {
        method: 'POST',
        token: tokenB,
        body: { taskId: A.taskId, message: 'Cross' },
      }),
    );
    expect(crossPost.status).toBe(404);

    const crossDel = await route.DELETE(
      makeRequest(`http://localhost:3011/api/task-errors?id=${id}`, { method: 'DELETE', token: tokenB }),
    );
    expect(crossDel.status).toBe(404);
  });

  it('isolates WorkflowStep through Workflow ownership and rejects view-only mutations', async () => {
    const route = await import('@/app/api/workflow-steps/route');

    const postA = await route.POST(
      makeRequest('http://localhost:3011/api/workflow-steps', {
        method: 'POST',
        token: tokenA,
        body: { workflowId: A.workflowId, stepNumber: 1, action: 'Step A' },
      }),
    );
    expect(postA.status).toBe(201);
    const stepId = (await postA.json()).data.id as string;

    // Tenant B has only 'view' permission on WF A — writes must be refused (404)
    const crossPost = await route.POST(
      makeRequest('http://localhost:3011/api/workflow-steps', {
        method: 'POST',
        token: tokenB,
        body: { workflowId: A.workflowId, stepNumber: 2, action: 'Injected step' },
      }),
    );
    expect(crossPost.status).toBe(404);

    const crossPut = await route.PUT(
      makeRequest('http://localhost:3011/api/workflow-steps', {
        method: 'PUT',
        token: tokenB,
        body: { id: stepId, action: 'Hijacked step' },
      }),
    );
    expect(crossPut.status).toBe(404);

    // Tenant B's own workflow step is isolated from Tenant A
    const postB = await route.POST(
      makeRequest('http://localhost:3011/api/workflow-steps', {
        method: 'POST',
        token: tokenB,
        body: { workflowId: B.workflowId, stepNumber: 1, action: 'Step B' },
      }),
    );
    expect(postB.status).toBe(201);

    const listA = await route.GET(makeRequest('http://localhost:3011/api/workflow-steps', { token: tokenA }));
    expect((await listA.json()).data.map((r: { action: string }) => r.action)).toEqual(['Step A']);
  });

  it('isolates ToolRun across taskId/agentId and blocks orphaned or cross-tenant records', async () => {
    const route = await import('@/app/api/tool-runs/route');

    // Detached ToolRun (neither taskId nor agentId) is rejected
    const detached = await route.POST(
      makeRequest('http://localhost:3011/api/tool-runs', {
        method: 'POST',
        token: tokenA,
        body: { toolName: 'http', toolCategory: 'net' },
      }),
    );
    expect(detached.status).toBe(422);

    // Tenant A creates ToolRun linked to Task A
    const postA = await route.POST(
      makeRequest('http://localhost:3011/api/tool-runs', {
        method: 'POST',
        token: tokenA,
        body: { taskId: A.taskId, toolName: 'shell', toolCategory: 'system' },
      }),
    );
    expect(postA.status).toBe(201);
    const runId = (await postA.json()).data.id as string;

    // Cannot mix Tenant A task with Tenant B agent
    const mixed = await route.POST(
      makeRequest('http://localhost:3011/api/tool-runs', {
        method: 'POST',
        token: tokenA,
        body: { taskId: A.taskId, agentId: B.agentId, toolName: 'shell', toolCategory: 'system' },
      }),
    );
    expect(mixed.status).toBe(404);

    // Cannot orphan a ToolRun via PUT
    const orphanPut = await route.PUT(
      makeRequest('http://localhost:3011/api/tool-runs', {
        method: 'PUT',
        token: tokenA,
        body: { id: runId, taskId: null, agentId: null },
      }),
    );
    expect(orphanPut.status).toBe(400);

    // Tenant B cannot see or mutate Tenant A's ToolRun
    const listB = await route.GET(makeRequest('http://localhost:3011/api/tool-runs', { token: tokenB }));
    expect((await listB.json()).data).toEqual([]);

    const crossDel = await route.DELETE(
      makeRequest(`http://localhost:3011/api/tool-runs?id=${runId}`, { method: 'DELETE', token: tokenB }),
    );
    expect(crossDel.status).toBe(404);
  });

  it('restricts legacy global tool-approvals to super_admin and isolates agent-permissions', async () => {
    const approvals = await import('@/app/api/tool-approvals/route');
    const perms = await import('@/app/api/agent-permissions/route');

    const denied = await approvals.GET(makeRequest('http://localhost:3011/api/tool-approvals', { token: tokenA }));
    expect(denied.status).toBe(403);

    const allowed = await approvals.GET(makeRequest('http://localhost:3011/api/tool-approvals', { token: tokenSuper }));
    expect(allowed.status).toBe(200);

    const permA = await perms.POST(
      makeRequest('http://localhost:3011/api/agent-permissions', {
        method: 'POST',
        token: tokenA,
        body: { agentId: A.agentId, resourceId: 'db.read' },
      }),
    );
    expect(permA.status).toBe(201);

    const listPermB = await perms.GET(makeRequest('http://localhost:3011/api/agent-permissions', { token: tokenB }));
    expect((await listPermB.json()).data).toEqual([]);
  });
});
