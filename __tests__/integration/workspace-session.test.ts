// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createRealDb, type RealDb } from '../helpers/real-db';
import type { SessionDb } from '../../mini-services/shared/internal-auth';
let fixture: RealDb;
beforeAll(async () => { fixture = await createRealDb('socket-session'); });
afterAll(async () => { await fixture?.cleanup(); });
it('a workspace socket accepts a real staff login session, refuses clients and respects revocation', async () => {
  const { createSessionToken, deleteSessionToken } = await import('@/lib/auth');
  const { verifyInternalSessionToken } = await import('../../mini-services/shared/internal-auth');
  const db = fixture.db, socketDb = db as unknown as SessionDb;
  for (const role of ['super_admin', 'client']) {
    const user = await db.user.create({ data: { name: role, email: `${role}@example.test`, passwordHash: 'unused', role } });
    const token = await createSessionToken(user.id);
    const identity = await verifyInternalSessionToken(socketDb, token);
    if (role === 'client') expect(identity).toBeNull();
    else expect(identity).toMatchObject({ userId: user.id, role });
    await deleteSessionToken(token);
    expect(await verifyInternalSessionToken(socketDb, token)).toBeNull();
  }
});
