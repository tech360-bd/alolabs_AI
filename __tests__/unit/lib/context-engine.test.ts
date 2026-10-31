import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  db: {
    agent: { findFirst: vi.fn() },
    constitutionalRule: { findMany: vi.fn() },
    skill: { findMany: vi.fn() },
    promptTemplate: { findMany: vi.fn() },
    enterpriseSOP: { findMany: vi.fn() },
    knowledgeNode: { findMany: vi.fn() },
    agentMemory: { findMany: vi.fn() },
    companyMemory: { findMany: vi.fn() },
    departmentMemory: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/db', () => ({ db: mocks.db }))

import { buildAgentContext, buildMinimalAgentSystemPrompt } from '@/lib/context-engine'

const currentCompany = 'company-current'

function agent(companyId = currentCompany) {
  return {
    id: 'agent-db-1',
    agentId: 'AGENT-0001',
    name: 'Education Admissions Analyst',
    role: 'analyst',
    type: 'education',
    departmentId: 'dept-education',
    departmentName: 'Education',
    purpose: 'Review admissions requirements and evidence.',
    systemInstructions: 'Use the admissions checklist. Cite source documents; do not infer visa eligibility.',
    allowedSkills: '[]',
    allowedTools: '[]',
    protectionRules: '[]',
    approvalRules: '[]',
    workflowSteps: '[]',
    department: {
      id: 'dept-education',
      slug: 'education',
      companyId,
      description: 'Support accurate and compliant education admissions.',
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.db.agent.findFirst.mockResolvedValue(agent())
  mocks.db.constitutionalRule.findMany.mockResolvedValue([])
  mocks.db.skill.findMany.mockResolvedValue([])
  mocks.db.promptTemplate.findMany.mockResolvedValue([])
  mocks.db.enterpriseSOP.findMany.mockResolvedValue([])
  mocks.db.knowledgeNode.findMany.mockResolvedValue([])
  mocks.db.agentMemory.findMany.mockResolvedValue([])
  mocks.db.companyMemory.findMany.mockResolvedValue([])
  mocks.db.departmentMemory.findMany.mockResolvedValue([])
})

describe('Agent context assembly', () => {
  it('keeps agent instructions in a minimal fallback without department context', () => {
    const prompt = buildMinimalAgentSystemPrompt({
      agentName: 'Shared Admissions Analyst',
      agentRole: 'analyst',
      systemInstructions: 'Use the admissions checklist and cite source documents.',
    });

    expect(prompt).toContain('Use the admissions checklist and cite source documents.');
    expect(prompt).toContain('Shared Admissions Analyst');
    expect(prompt).not.toContain('Owner-only department');
    expect(prompt).not.toContain('PRIVATE OWNER DEPARTMENT MISSION');
  });

  it('includes the configured agent system instructions in the assembled system prompt', async () => {
    const context = await buildAgentContext({
      agentId: 'AGENT-0001',
      companyId: currentCompany,
      task: 'Review the application requirements.',
    })

    expect(context.systemPrompt).toContain('# AGENT OPERATING INSTRUCTIONS')
    expect(context.systemPrompt).toContain('Use the admissions checklist.')
    expect(context.systemPrompt).toContain('do not infer visa eligibility')
    expect(context.systemPrompt).toContain('Education Admissions Analyst')
  })

  it('allows same-tenant department knowledge and explicitly scoped shared knowledge only', async () => {
    mocks.db.knowledgeNode.findMany.mockResolvedValue([
      { title: 'Tenant department SOP', type: 'process', content: 'Department-owned evidence.', confidence: 0.9, departmentId: 'dept-education', metadata: '{}' },
      { title: 'Explicit tenant node', type: 'rule', content: 'Tenant-owned evidence.', confidence: 0.8, departmentId: null, metadata: JSON.stringify({ companyId: currentCompany }) },
      { title: 'Public reference', type: 'document', content: 'Publicly shareable reference.', confidence: 0.7, departmentId: null, metadata: JSON.stringify({ visibility: 'public' }) },
      { title: 'Explicit public flag', type: 'document', content: 'Explicit public flag reference.', confidence: 0.7, departmentId: null, metadata: JSON.stringify({ isPublic: true }) },
      { title: 'Foreign owner with public flag', type: 'document', content: 'Foreign tenant private content.', confidence: 1, departmentId: null, metadata: JSON.stringify({ companyId: 'company-other', visibility: 'public' }) },
      { title: 'Unowned legacy node', type: 'document', content: 'No owner or public visibility.', confidence: 1, departmentId: null, metadata: JSON.stringify({ verified: true }) },
      { title: 'Other tenant node', type: 'document', content: 'Private other-tenant content.', confidence: 1, departmentId: null, metadata: JSON.stringify({ companyId: 'company-other' }) },
      { title: 'Foreign department node', type: 'document', content: 'Foreign department content.', confidence: 1, departmentId: 'dept-other', metadata: '{}' },
    ])

    const context = await buildAgentContext({
      agentId: 'AGENT-0001',
      companyId: currentCompany,
      task: 'Review the application requirements, tenant department SOP, explicit tenant node, and public reference.',
    })

    expect(context.systemPrompt).toContain('Tenant department SOP')
    expect(context.systemPrompt).toContain('Explicit tenant node')
    expect(context.systemPrompt).toContain('Public reference')
    expect(context.systemPrompt).toContain('Explicit public flag')
    expect(context.systemPrompt).not.toContain('Unowned legacy node')
    expect(context.systemPrompt).not.toContain('Foreign tenant private content')
    expect(context.systemPrompt).not.toContain('Private other-tenant content')
    expect(context.systemPrompt).not.toContain('Foreign department content')
  })


  it('injects assigned skill instructions and normalizes underscore slugs', async () => {
    mocks.db.agent.findFirst.mockResolvedValue({ ...agent(), allowedSkills: JSON.stringify(['mattpocock_code_review']) })
    mocks.db.skill.findMany.mockResolvedValue([
      { slug: 'mattpocock-code-review', name: 'Code Review', description: 'Review code changes', purpose: 'Review code', inputs: '[]', outputs: '[]', content: '' },
    ])
    const context = await buildAgentContext({ agentId: 'AGENT-0001', companyId: currentCompany, task: 'Review code changes' })
    expect(context.sources.skills).toBe(1)
    expect(context.systemPrompt).toContain('# RELEVANT SKILLS')
    expect(context.systemPrompt).toContain('Skill instructions (guidance only; no tool grants)')
    expect(context.systemPrompt).toContain('Two-axis review')
  })

  it('loads department SOPs only from the verified tenant department', async () => {
    mocks.db.enterpriseSOP.findMany.mockResolvedValue([
      { title: 'Application requirements SOP', category: 'admissions', description: 'Review the application requirements.', steps: '[\"Check source\"]', checklist: '[]', departmentId: 'dept-education' },
    ])

    const context = await buildAgentContext({
      agentId: 'AGENT-0001',
      companyId: currentCompany,
      task: 'Review the application requirements.',
    })

    expect(mocks.db.enterpriseSOP.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ isActive: true, status: 'active', departmentId: 'dept-education' }),
      take: 50,
    }))
    expect(context.systemPrompt).toContain('Application requirements SOP')
  })

  it('does not load or expose unowned SOPs or owner-department description for a shared agent', async () => {
    mocks.db.agent.findFirst.mockResolvedValue({
      ...agent('company-owner'),
      department: {
        ...agent('company-owner').department,
        description: 'PRIVATE OWNER DEPARTMENT MISSION',
      },
    })

    const context = await buildAgentContext({
      agentId: 'AGENT-0001',
      companyId: currentCompany,
      task: 'Review the application requirements.',
    })

    expect(mocks.db.enterpriseSOP.findMany).not.toHaveBeenCalled()
    expect(context.systemPrompt).toContain('Shared Agent (department hidden)')
    expect(context.systemPrompt).not.toContain('PRIVATE OWNER DEPARTMENT MISSION')
  })

  it("does not load the shared agent owner's department materials into another tenant context", async () => {
    mocks.db.agent.findFirst.mockResolvedValue(agent('company-owner'))

    await buildAgentContext({
      agentId: 'AGENT-0001',
      companyId: currentCompany,
      task: 'Review the application requirements.',
    })

    const knowledgeWhere = mocks.db.knowledgeNode.findMany.mock.calls[0][0].where
    expect(knowledgeWhere.AND[0].OR).not.toContainEqual({ companyId: null, departmentId: 'dept-education' })
    expect(mocks.db.enterpriseSOP.findMany).not.toHaveBeenCalled()
    const ruleWhere = mocks.db.constitutionalRule.findMany.mock.calls[0][0].where.AND[0].OR
    expect(ruleWhere).not.toContainEqual({ departmentId: 'dept-education' })
  })
})
