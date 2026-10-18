// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const count = () => vi.fn().mockResolvedValue(0)
  return {
    auth: vi.fn(),
    db: {
      department: { findMany: vi.fn() },
      agent: { findMany: vi.fn() },
      knowledgeNode: { findMany: vi.fn() },
      constitutionalRule: { count: count() },
      enterpriseSOP: { count: count() },
      skill: { count: count() },
      promptTemplate: { count: count() },
      ragCollection: { count: count() },
      ragDocument: { count: count() },
      ragChunk: { count: count() },
      ragQuery: { count: count(), aggregate: vi.fn() },
      collaborationSession: { count: count() },
      agentMemory: { count: count() },
      companyMemory: { count: count() },
      workflowRun: { count: count() },
      engineRecord: { count: count(), groupBy: vi.fn() },
      securityEvent: { count: count() },
      dataLakeEntry: { count: count() },
      companyUser: { count: count() },
      agentOSRun: { count: count(), findMany: vi.fn() },
      agentRun: { count: count(), aggregate: vi.fn() },
      usageLog: { count: count() },
      runEvent: { count: count() },
    },
  }
})

vi.mock('@/lib/api-auth', () => ({ requireCompanyAuth: mocks.auth }))
vi.mock('@/lib/db', () => ({ db: mocks.db }))

import { GET } from '@/app/api/enterprise/stats/route'

const companyId = 'company-current'

describe('GET /api/enterprise/stats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({ companyId })
    mocks.db.department.findMany.mockResolvedValue([
      { id: 'dept-current', name: 'Tenant Operations', slug: 'operations', status: 'active', sortOrder: 1 },
    ])
    mocks.db.agent.findMany.mockResolvedValue([
      { id: 'agent-current', agentId: 'AGENT-0001', status: 'active', departmentId: 'dept-current' },
    ])
    mocks.db.knowledgeNode.findMany.mockResolvedValue([
      { id: 'dept-node', departmentId: 'dept-current', metadata: '{}' },
      { id: 'company-node', departmentId: null, metadata: JSON.stringify({ companyId }) },
      { id: 'public-node', departmentId: null, metadata: JSON.stringify({ visibility: 'public' }) },
      { id: 'explicit-public-flag', departmentId: null, metadata: JSON.stringify({ isPublic: true }) },
      { id: 'foreign-public', departmentId: null, metadata: JSON.stringify({ companyId: 'company-other', visibility: 'public' }) },
      { id: 'legacy-node', departmentId: null, metadata: JSON.stringify({ verified: true }) },
    ])
    mocks.db.agentOSRun.findMany.mockResolvedValue([])
    mocks.db.engineRecord.groupBy.mockResolvedValue([])
    mocks.db.ragQuery.aggregate.mockResolvedValue({ _avg: { durationMs: null } })
    mocks.db.agentRun.aggregate.mockResolvedValue({ _avg: { latencyMs: null } })
    mocks.db.runEvent.count.mockResolvedValue(0)
  })

  it('uses company auth, excludes unowned/foreign knowledge and counts SOPs only in tenant departments', async () => {
    mocks.db.enterpriseSOP.count.mockResolvedValue(2)
    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.auth).toHaveBeenCalledOnce()
    expect(mocks.db.department.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId } }))
    expect(mocks.db.agent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { agentCompanyAccess: { some: { companyId } } },
    }))
    expect(mocks.db.enterpriseSOP.count).toHaveBeenCalledWith({
      where: { isActive: true, status: 'active', departmentId: { in: ['dept-current'] } },
    })
    expect(body.scope.companyId).toBe(companyId)
    expect(body.db.departments).toBe(1)
    expect(body.db.agents).toBe(1)
    expect(body.db.knowledgeNodes).toBe(4)
    expect(body.db.sops).toBe(2)
    expect(body.execution.runSuccessRate).toBeNull()
  })

  it('filters foreign-owned knowledge and queries explicit isPublic metadata candidates', async () => {
    const response = await GET()
    const body = await response.json()
    expect(body.db.knowledgeNodes).toBe(4)
    expect(mocks.db.knowledgeNode.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { departmentId: null, metadata: { contains: 'isPublic' } },
        ]),
      }),
      select: { id: true, departmentId: true, metadata: true },
    }))
  })
})
