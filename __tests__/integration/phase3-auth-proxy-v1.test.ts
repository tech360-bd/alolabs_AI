// @vitest-environment node
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createRealDb, type RealDb } from '../helpers/real-db';

describe('Phase 3 integration — multi-company platform keys, agents/execute scope, email tracking', () => {
  let real: RealDb;
  let companyAId = '';
  let companyBId = '';
  let multiUserId = '';
  let agentAId = '';
  let readOnlyKey = '';
  let executeKey = '';
  let viewerToken = '';
  let accountManagerToken = '';

  const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

  beforeAll(async () => {
    real = await createRealDb('phase3-auth-v1');
    process.env.EMAIL_TRACKING_SECRET = 'email-tracking-secret-32-chars-minimum!';

    const { createSessionToken, hashPassword } = await import('@/lib/auth');
    const pw = await hashPassword('correct horse battery staple');

    const companyA = await real.db.company.create({
      data: { name: 'Alpha Org', slug: 'alpha-org', status: 'active', accountType: 'internal' },
    });
    const companyB = await real.db.company.create({
      data: { name: 'Beta Org', slug: 'beta-org', status: 'active', accountType: 'internal' },
    });
    companyAId = companyA.id;
    companyBId = companyB.id;

    const multiUser = await real.db.user.create({
      data: { email: 'multi@test.local', name: 'Multi User', passwordHash: pw, role: 'admin', isActive: true },
    });
    multiUserId = multiUser.id;
    await real.db.companyUser.create({ data: { userId: multiUserId, companyId: companyAId, role: 'admin' } });
    await real.db.companyUser.create({ data: { userId: multiUserId, companyId: companyBId, role: 'admin' } });

    const viewer = await real.db.user.create({
      data: { email: 'viewer@test.local', name: 'Viewer', passwordHash: pw, role: 'viewer', isActive: true },
    });
    await real.db.companyUser.create({ data: { userId: viewer.id, companyId: companyAId, role: 'viewer' } });
    viewerToken = await createSessionToken(viewer.id);

    const acctMgr = await real.db.user.create({
      data: { email: 'acctmgr@test.local', name: 'AcctMgr', passwordHash: pw, role: 'account_manager', isActive: true },
    });
    await real.db.companyUser.create({ data: { userId: acctMgr.id, companyId: companyAId, role: 'member' } });
    accountManagerToken = await createSessionToken(acctMgr.id);

    const deptA = await real.db.department.create({
      data: { name: 'Ops A', slug: 'ops-a', companyId: companyAId },
    });
    const agentA = await real.db.agent.create({
      data: {
        agentId: 'AGENT-P3-A',
        name: 'Phase 3 Agent',
        slug: 'phase-3-agent',
        departmentId: deptA.id,
        departmentName: deptA.name,
        purpose: 'Test execution authorization',
        companyId: companyAId,
        status: 'active',
      },
    });
    agentAId = agentA.agentId;

    readOnlyKey = 'alo_test_readonly_key_12345678';
    executeKey = 'alo_test_execute_key_12345678';
    await real.db.companyApiKey.create({
      data: {
        name: 'Read Only Key',
        keyHash: sha256(readOnlyKey),
        keyPrefix: 'alo_test',
        keySuffix: '5678',
        scopes: JSON.stringify(['agents:read']),
        isActive: true,
        companyId: companyAId,
      },
    });
    await real.db.companyApiKey.create({
      data: {
        name: 'Execute Key',
        keyHash: sha256(executeKey),
        keyPrefix: 'alo_test',
        keySuffix: '5678',
        scopes: JSON.stringify(['agents:execute']),
        isActive: true,
        companyId: companyAId,
      },
    });
  });

  afterAll(async () => {
    await real.cleanup();
  });

  it('principalFromApiKey validates membership matching keyWorkspace.companyId for multi-company users', async () => {
    const { mintApiKey, resolvePrincipal } = await import('@/lib/platform/principal');

    // Workspace owned by Company B (the user's SECOND company, not first!)
    const wsB = await real.db.aiWorkspace.create({
      data: {
        name: 'Workspace B',
        slug: 'ws-b-multi',
        ownerId: multiUserId,
        companyId: companyBId,
        status: 'active',
      },
    });
    const mintedB = mintApiKey();
    await real.db.aiApiKey.create({
      data: {
        workspaceId: wsB.id,
        name: 'Multi Key B',
        keyHash: mintedB.keyHash,
        keyPrefix: mintedB.keyPrefix,
        keySuffix: mintedB.keySuffix,
        scopes: JSON.stringify(['ai:chat']),
        isActive: true,
        createdBy: multiUserId,
        rateLimit: 60,
      },
    });

    const principalB = await resolvePrincipal(
      new NextRequest('http://localhost/api/v1/platform/chat', {
        headers: { authorization: `Bearer ${mintedB.plaintext}` },
      }),
    );
    expect(principalB).not.toBeNull();
    expect(principalB!.companyId).toBe(companyBId);
    expect(principalB!.workspaceId).toBe(wsB.id);

    // Offboard from Company B while remaining in Company A -> key for Workspace B must fail closed!
    await real.db.companyUser.deleteMany({
      where: { userId: multiUserId, companyId: companyBId },
    });
    const revokedPrincipal = await resolvePrincipal(
      new NextRequest('http://localhost/api/v1/platform/chat', {
        headers: { 'x-api-key': mintedB.plaintext },
      }),
    );
    expect(revokedPrincipal).toBeNull();
  });

  it('POST /api/v1/agents/execute enforces agents:execute scope on API keys and role on human sessions', async () => {
    const executeMock = vi.fn().mockResolvedValue({ id: 'run-1', status: 'completed', result: { content: 'ok' } });
    vi.doMock('@/lib/agent-runtime', () => ({
      getExecutionEngine: () => ({ execute: executeMock }),
    }));
    const route = await import('@/app/api/v1/agents/execute/route');

    // API key with only agents:read must be rejected with 403
    const readOnlyRes = await route.POST(
      new NextRequest('http://localhost/api/v1/agents/execute', {
        method: 'POST',
        headers: { 'x-api-key': readOnlyKey, 'content-type': 'application/json' },
        body: JSON.stringify({ agentId: agentAId, task: 'hello' }),
      }),
    );
    expect(readOnlyRes.status).toBe(403);
    expect(executeMock).not.toHaveBeenCalled();

    // Non-internal viewer session must be rejected (401)
    const viewerRes = await route.POST(
      new NextRequest('http://localhost/api/v1/agents/execute', {
        method: 'POST',
        headers: { authorization: `Bearer ${viewerToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ agentId: agentAId, task: 'hello' }),
      }),
    );
    expect(viewerRes.status).toBe(401);

    // Internal role without execution privileges (account_manager) must be rejected with 403
    const acctMgrRes = await route.POST(
      new NextRequest('http://localhost/api/v1/agents/execute', {
        method: 'POST',
        headers: { authorization: `Bearer ${accountManagerToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ agentId: agentAId, task: 'hello' }),
      }),
    );
    expect(acctMgrRes.status).toBe(403);

    // API key with agents:execute (via Authorization: Bearer alo_...) succeeds
    const execRes = await route.POST(
      new NextRequest('http://localhost/api/v1/agents/execute', {
        method: 'POST',
        headers: { authorization: `Bearer ${executeKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ agentId: agentAId, task: 'run diagnostic' }),
      }),
    );
    expect(execRes.status).toBe(200);
    expect(executeMock).toHaveBeenCalledTimes(1);

    // DELETE requires agents:write (execute-only key rejected)
    const delDenied = await route.DELETE(
      new NextRequest('http://localhost/api/v1/agents/execute', {
        method: 'DELETE',
        headers: { 'x-api-key': executeKey, 'content-type': 'application/json' },
        body: JSON.stringify({ agentId: agentAId }),
      }),
    );
    expect(delDenied.status).toBe(403);

    vi.doUnmock('@/lib/agent-runtime');
  });

  it('email open tracking endpoint ignores invalid tokens and records valid HMAC opens', async () => {
    const { EmailTrackingService } = await import('@/lib/email/tracking');
    const route = await import('@/app/api/email/track/open/[token]/route');

    const msgId = 'msg-phase3-001';
    const invalidRes = await route.GET(
      new NextRequest(`http://localhost/api/email/track/open/not-a-valid-hmac.gif?m=${msgId}`),
      { params: Promise.resolve({ token: 'not-a-valid-hmac.gif' }) },
    );
    expect(invalidRes.status).toBe(200);
    expect(invalidRes.headers.get('content-type')).toBe('image/gif');
    expect(
      await real.db.auditLog.count({ where: { resource: `email:message:${msgId}`, action: 'email_open' } }),
    ).toBe(0);

    const svc = new EmailTrackingService();
    const validToken = svc.generateToken(msgId, 'open');
    const validRes = await route.GET(
      new NextRequest(`http://localhost/api/email/track/open/${validToken}.gif?m=${msgId}`),
      { params: Promise.resolve({ token: `${validToken}.gif` }) },
    );
    expect(validRes.status).toBe(200);
    expect(
      await real.db.auditLog.count({ where: { resource: `email:message:${msgId}`, action: 'email_open' } }),
    ).toBe(1);
  });
});
