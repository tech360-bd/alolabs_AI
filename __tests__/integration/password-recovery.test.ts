// @vitest-environment node
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createRealDb, type RealDb } from '../helpers/real-db';

const mailbox = vi.hoisted(() => ({ text: '' }));
vi.mock('@/lib/email/smtp', () => ({ SMTPEmailService: class {
  async send(message: { text: string }) { mailbox.text = message.text; return { success: true }; }
} }));
let fixture: RealDb;
const email = 'recovery@example.test';
beforeAll(async () => {
  fixture = await createRealDb('password-recovery');
  vi.stubEnv('SMTP_HOST', 'fixture.invalid'); vi.stubEnv('SMTP_USER', 'mail@example.test'); vi.stubEnv('SMTP_PASS', 'fixture');
});
afterAll(async () => { vi.unstubAllEnvs(); await fixture?.cleanup(); });
it('delivers only to the mailbox, rotates the credential atomically and invalidates existing sessions', async () => {
  const { createSessionToken, verifySessionToken, verifyPassword } = await import('@/lib/auth');
  const { POST } = await import('@/app/api/auth/password-reset/route');
  const user = await fixture.db.user.create({ data: { email, name: 'Recovery', role: 'admin', passwordHash: 'unused' } });
  const prior = await createSessionToken(user.id);
  const post = (fields: object) => POST(new NextRequest('https://example.test/api/auth/password-reset', { method: 'POST', body: JSON.stringify({ email, ...fields }) }));
  const start = await post({});
  expect(start.status).toBe(200);
  expect(await start.json()).not.toHaveProperty('data');
  const token = mailbox.text.match(/\b[a-f0-9]{64}\b/)?.[0];
  expect(token).toBeTruthy();
  const record = await fixture.db.settings.findFirstOrThrow({ where: { key: { startsWith: 'recovery:v2:' } } });
  expect(record.value).not.toBe(token);
  const updates = await Promise.all(['first-new-password', 'second-new-password'].map(newPassword => post({token, newPassword})));
  expect(updates.map(r => r.status).sort()).toEqual([200, 400]);
  const winner = updates[0].ok ? 'first-new-password' : 'second-new-password';
  expect(await verifyPassword(winner, (await fixture.db.user.findUniqueOrThrow({ where: {id:user.id} })).passwordHash)).toBe(true);
  expect(await verifySessionToken(prior)).toBeNull();
});
