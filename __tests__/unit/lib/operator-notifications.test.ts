// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = { rows: [] as Array<Record<string, unknown>> };

vi.mock('@/lib/db', () => ({
  db: {
    notification: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const metadata = (where.metadata as { contains: string } | undefined)?.contains ?? '';
        const key = metadata.replace('"dedupeKey":"', '').replace('"', '');
        return (
          store.rows.find(
            (row) =>
              row.companyId === where.companyId &&
              row.type === where.type &&
              String(row.metadata).includes(key),
          ) ?? null
        );
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `notif-${store.rows.length + 1}`, read: false, createdAt: new Date(), ...data };
        store.rows.push(row);
        return { id: row.id };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = store.rows.find((entry) => entry.id === where.id);
        if (row) Object.assign(row, data);
        return row;
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        store.rows.filter(
          (row) =>
            row.companyId === where.companyId &&
            (!where.metadata || String(row.metadata).includes('lastError')),
        ),
      ),
    },
  },
}));

import { listOperatorNotifications, notifyOperator, retryFailedDeliveries } from '@/lib/notifications/operator';

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  store.rows.length = 0;
  vi.unstubAllGlobals();
  delete process.env.OPERATOR_WEBHOOK_URL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPERATOR_WEBHOOK_URL;
});

describe('notifyOperator', () => {
  it('writes a notification linked to the run', async () => {
    const result = await notifyOperator({
      companyId: COMPANY_ID,
      type: 'run.failed',
      title: 'Run failed',
      message: 'The build step exited 1.',
      runId: 'run-42',
    });

    expect(result.created).toBe(true);
    expect(store.rows).toHaveLength(1);
    const metadata = JSON.parse(String(store.rows[0].metadata));
    expect(metadata.runId).toBe('run-42');
    expect(store.rows[0].priority).toBe('warning');
  });

  it('suppresses the same event for the same run', async () => {
    const input = {
      companyId: COMPANY_ID,
      type: 'run.completed' as const,
      title: 'Run completed',
      message: 'All steps passed.',
      runId: 'run-7',
    };

    const first = await notifyOperator(input);
    const second = await notifyOperator(input);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.reason).toMatch(/duplicate/);
    expect(store.rows).toHaveLength(1);
  });

  it('treats different runs as different events', async () => {
    await notifyOperator({ companyId: COMPANY_ID, type: 'run.failed', title: 'a', message: 'a', runId: 'run-1' });
    await notifyOperator({ companyId: COMPANY_ID, type: 'run.failed', title: 'b', message: 'b', runId: 'run-2' });
    expect(store.rows).toHaveLength(2);
  });

  it('refuses to write a notification with no tenant', async () => {
    const result = await notifyOperator({ companyId: '', type: 'security.issue', title: 'x', message: 'y' });
    expect(result.created).toBe(false);
    expect(result.reason).toBe('no tenant');
    expect(store.rows).toHaveLength(0);
  });

  it('still records the notification when the webhook fails', async () => {
    process.env.OPERATOR_WEBHOOK_URL = 'https://hooks.example.invalid/operator';
    const fetchMock = vi.fn(async () => {
      throw new Error('connect ECONNREFUSED');
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await notifyOperator({
      companyId: COMPANY_ID,
      type: 'deployment.failed',
      title: 'Deploy failed',
      message: 'Health check never passed.',
      runId: 'run-9',
    });

    expect(result.created).toBe(true);
    expect(result.delivery).toBe('failed');
    const metadata = JSON.parse(String(store.rows[0].metadata));
    expect(metadata.delivery.lastError).toMatch(/ECONNREFUSED/);
  });

  it('marks delivery as done when the webhook accepts', async () => {
    process.env.OPERATOR_WEBHOOK_URL = 'https://hooks.example.invalid/operator';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ok', { status: 200 })));

    const result = await notifyOperator({
      companyId: COMPANY_ID,
      type: 'approval.required',
      title: 'Approval needed',
      message: 'Deploy waits for you.',
      approvalId: 'appr-1',
    });

    expect(result.delivery).toBe('delivered');
    expect(JSON.parse(String(store.rows[0].metadata)).delivery.deliveredAt).toBeTruthy();
  });
});

describe('retryFailedDeliveries', () => {
  it('retries only failed deliveries and reports the outcome', async () => {
    store.rows.push({
      id: 'notif-x',
      companyId: COMPANY_ID,
      type: 'run.failed',
      title: 'Run failed',
      message: 'boom',
      metadata: JSON.stringify({ runId: 'run-3', delivery: { attempts: 1, lastError: 'timeout' } }),
      createdAt: new Date(),
      read: false,
    });
    store.rows.push({
      id: 'notif-y',
      companyId: COMPANY_ID,
      type: 'run.completed',
      title: 'Run completed',
      message: 'fine',
      metadata: JSON.stringify({ delivery: { attempts: 1, deliveredAt: '2026-01-01T00:00:00Z' } }),
      createdAt: new Date(),
      read: false,
    });
    process.env.OPERATOR_WEBHOOK_URL = 'https://hooks.example.invalid/operator';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ok', { status: 200 })));

    const result = await retryFailedDeliveries(COMPANY_ID);
    expect(result.retried).toBe(1);
    expect(result.delivered).toBe(1);
  });
});

describe('listOperatorNotifications', () => {
  it('is tenant-scoped', async () => {
    await notifyOperator({ companyId: COMPANY_ID, type: 'run.completed', title: 'mine', message: 'x', runId: 'r1' });
    await notifyOperator({
      companyId: '22222222-2222-4222-8222-222222222222',
      type: 'run.completed',
      title: 'theirs',
      message: 'y',
      runId: 'r2',
    });

    const mine = await listOperatorNotifications(COMPANY_ID);
    expect(mine).toHaveLength(1);
    expect(mine[0].title).toBe('mine');
  });
});
