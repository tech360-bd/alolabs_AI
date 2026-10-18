import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  db: {
    department: { findFirst: vi.fn() },
    agent: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/db', () => ({ db: mocks.db }))
vi.mock('@/lib/agent-runtime/pipeline', () => ({ retrieveRelevantKnowledge: vi.fn() }))

import { getTool, listToolDefinitions, toolSchemasFor } from '@/lib/tools/registry'
import { getDepartmentRegistry } from '@/lib/department-registry'
import { buildWorkforcePlan } from '@/lib/workforce/plan'

const companyId = 'company-current'
const directory = getTool('department_directory')!

beforeEach(() => {
  vi.clearAllMocks()
})

describe('workforce runtime tool bindings', () => {
  it('provisions only names registered and advertised by the existing runtime tool registry', () => {
    const plan = buildWorkforcePlan(getDepartmentRegistry().getAllDepartments())
    const registeredNames = new Set(listToolDefinitions().map((tool) => tool.name))

    for (const agent of plan.agents) {
      for (const toolName of agent.allowedTools) expect(registeredNames.has(toolName)).toBe(true)
      expect(toolSchemasFor(agent.allowedTools).map((schema) => schema.function.name)).toEqual(agent.allowedTools)
    }
  })

  it('does not reveal agents from a foreign requested department', async () => {
    mocks.db.department.findFirst.mockResolvedValue(null)

    const result = await directory.handler({ department: 'partner-ops' }, {
      companyId,
      departmentId: 'foreign-department-id',
    }) as { count: number; agents: unknown[] }

    expect(mocks.db.department.findFirst).toHaveBeenCalledWith({
      where: {
        companyId,
        OR: [{ slug: 'partner-ops' }, { name: 'partner-ops' }],
      },
      select: { id: true },
    })
    expect(mocks.db.agent.findMany).not.toHaveBeenCalled()
    expect(result).toEqual({ count: 0, agents: [] })
  })

  it('fails closed when a shared caller has no department owned by the selected tenant', async () => {
    mocks.db.department.findFirst.mockResolvedValue(null)

    const result = await directory.handler({}, {
      companyId,
      departmentId: 'owner-department-id',
    }) as { count: number; agents: unknown[] }

    expect(mocks.db.department.findFirst).toHaveBeenCalledWith({
      where: { id: 'owner-department-id', companyId },
      select: { id: true },
    })
    expect(mocks.db.agent.findMany).not.toHaveBeenCalled()
    expect(result.agents).toEqual([])
  })

  it('lists only active agents with explicit access in the matched tenant department', async () => {
    mocks.db.department.findFirst.mockResolvedValue({ id: 'dept-current' })
    mocks.db.agent.findMany.mockResolvedValue([
      { agentId: 'AGENT-0001', name: 'Tenant Agent', role: 'specialist', type: 'specialized', departmentName: 'Operations' },
    ])

    const result = await directory.handler({ department: 'operations', limit: 10 }, { companyId }) as {
      count: number
      agents: Array<{ agentId: string }>
    }

    expect(mocks.db.agent.findMany).toHaveBeenCalledWith({
      where: {
        status: 'active',
        departmentId: 'dept-current',
        agentCompanyAccess: { some: { companyId } },
      },
      take: 10,
      select: { agentId: true, name: true, role: true, type: true, departmentName: true },
      orderBy: { agentId: 'asc' },
    })
    expect(result.count).toBe(1)
    expect(result.agents[0].agentId).toBe('AGENT-0001')
  })
})
