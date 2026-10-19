import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deferCompanyAIMedia: vi.fn(),
  settingsFindMany: vi.fn(),
  settingsFindUnique: vi.fn(),
  settingsUpsert: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    settings: {
      findMany: mocks.settingsFindMany,
      findUnique: mocks.settingsFindUnique,
      upsert: mocks.settingsUpsert,
    },
  },
}));

vi.mock('@/lib/multi-tenant-ai/service', () => ({
  deferCompanyAIMedia: mocks.deferCompanyAIMedia,
}));

import { generate, getJob, listJobs, type MediaJob } from '@/lib/media-generation';

function job(overrides: Partial<MediaJob> = {}): MediaJob {
  return {
    id: 'job-1',
    kind: 'image',
    prompt: 'a landscape',
    model: null,
    status: 'completed',
    provider: 'test',
    providerJobId: null,
    assets: [],
    error: null,
    metadata: {},
    companyId: 'company-a',
    userId: 'user-a',
    createdAt: '2026-10-19T00:00:00.000Z',
    updatedAt: '2026-10-19T00:00:00.000Z',
    ...overrides,
  };
}

describe('company-scoped media generation service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('routes media generation to the central deferral policy instead of a provider', async () => {
    mocks.deferCompanyAIMedia.mockRejectedValue(new Error('MEDIA_CAPABILITY_UNAVAILABLE'));
    const context = { companyId: 'company-a', userId: 'user-a', role: 'operator' };

    await expect(generate({ kind: 'image', prompt: 'A calm sea' }, context)).rejects.toThrow('MEDIA_CAPABILITY_UNAVAILABLE');
    expect(mocks.deferCompanyAIMedia).toHaveBeenCalledWith({
      actor: context,
      kind: 'image',
      estimatedTokens: 3,
    });
  });

  it('reads a job only under the requested company key and rejects mismatched ownership', async () => {
    mocks.settingsFindUnique.mockResolvedValue({
      value: JSON.stringify(job({ companyId: 'company-b' })),
    });

    await expect(getJob('job-1', 'company-a')).resolves.toBeNull();
    expect(mocks.settingsFindUnique).toHaveBeenCalledWith({
      where: { key: 'media:job:company-a:job-1' },
    });
  });

  it('filters job lists by company and queries the company-scoped key prefix', async () => {
    mocks.settingsFindMany.mockResolvedValue([
      { value: JSON.stringify(job({ id: 'a', companyId: 'company-a' })) },
      { value: JSON.stringify(job({ id: 'b', companyId: 'company-b' })) },
    ]);

    await expect(listJobs('company-a')).resolves.toMatchObject([{ id: 'a', companyId: 'company-a' }]);
    expect(mocks.settingsFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: { startsWith: 'media:job:company-a:' } },
    }));
  });
});
