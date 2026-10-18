import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  db: {
    agentOSRun: { findMany: vi.fn() },
    runEvent: { groupBy: vi.fn(), count: vi.fn(), findMany: vi.fn() },
  },
}))

vi.mock('@/lib/api-auth', () => ({ requireCompanyAuth: mocks.auth }))
vi.mock('@/lib/db', () => ({ db: mocks.db }))

import { GET } from '@/app/api/enterprise/activity/route'

const companyId = 'company-current'
const runId = 'run-current-1'

describe('GET /api/enterprise/activity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({ companyId })
    mocks.db.agentOSRun.findMany.mockResolvedValue([{ id: runId }])
    mocks.db.runEvent.groupBy.mockResolvedValue([
      { type: 'run.failed', _count: { _all: 1 } },
      { type: 'task.completed', _count: { _all: 2 } },
    ])
    mocks.db.runEvent.count.mockResolvedValueOnce(3).mockResolvedValueOnce(3)
    mocks.db.runEvent.findMany.mockResolvedValue([
      {
        id: 'event-1',
        runId,
        type: 'run.failed',
        source: 'agentos',
        createdAt: new Date('2026-10-18T12:00:00.000Z'),
        data: JSON.stringify({ error: 'Provider unavailable' }),
      },
    ])
  })

  it('resolves activity through the authenticated company\'s durable run IDs', async () => {
    const response = await GET(new NextRequest('http://localhost/api/enterprise/activity'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.db.agentOSRun.findMany).toHaveBeenCalledWith({
      where: { companyId },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
      take: 501,
    })
    expect(mocks.db.runEvent.groupBy).toHaveBeenCalledWith({
      by: ['type'],
      where: { runId: { in: [runId] } },
      _count: { _all: true },
    })
    expect(mocks.db.runEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { runId: { in: [runId] } },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 60,
    }))
    expect(body.stats).toMatchObject({
      total: 3,
      bySeverity: { critical: 1, info: 2 },
      byType: { 'run.failed': 1, 'task.completed': 2 },
      sampledRunCount: 1,
    })
    expect(body.events[0]).toMatchObject({
      id: 'event-1',
      runId,
      severity: 'critical',
      message: 'Provider unavailable',
    })
  })

  it('applies severity and pagination using the static event catalogue mapping', async () => {
    const response = await GET(new NextRequest(
      'http://localhost/api/enterprise/activity?severity=critical&type=run.failed&page=2&limit=5',
    ))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.db.runEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { runId: { in: [runId] }, type: { in: ['run.failed'] } },
      skip: 5,
      take: 5,
    }))
    expect(body.page).toBe(2)
    expect(body.limit).toBe(5)
    expect(body.total).toBe(3)
  })

  it('rejects unknown severity values before querying tenant activity', async () => {
    const response = await GET(new NextRequest(
      'http://localhost/api/enterprise/activity?severity=urgent',
    ))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('Invalid severity filter')
    expect(mocks.db.agentOSRun.findMany).not.toHaveBeenCalled()
    expect(mocks.db.runEvent.groupBy).not.toHaveBeenCalled()
  })

  it('returns an empty result without querying events when the company has no runs', async () => {
    mocks.db.agentOSRun.findMany.mockResolvedValue([])
    const response = await GET(new NextRequest('http://localhost/api/enterprise/activity'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.events).toEqual([])
    expect(body.scope).toMatchObject({ runCount: 0, truncated: false })
    expect(mocks.db.runEvent.count).not.toHaveBeenCalled()
    expect(mocks.db.runEvent.findMany).not.toHaveBeenCalled()
  })
})
