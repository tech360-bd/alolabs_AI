import React from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store/app'

const mocks = vi.hoisted(() => ({ fetchApi: vi.fn() }))
vi.mock('@/lib/api', () => ({ fetchApi: mocks.fetchApi }))
import EnterpriseOverview from '@/components/enterprise/panels/enterprise-overview'

const stats = {
  departments: 1, agents: 1, rules: 0, skills: 0, sops: 0, prompts: 0,
  knowledgeNodes: 0, collaborations: 0, engineRecords: 0, events: 0, dataLakeEntries: 0,
  db: { engineRecordsByType: {}, rag: { documents: 0 }, eventScope: {}, memoryRecords: 0, workflowRuns: 0, securityEvents: 0, companyUsers: 0 },
  execution: { runSuccessRate: null, runs24h: 0, completedRuns24h: 0, failedRuns24h: 0, averageAgentRunLatencyMs: null },
  topDepartments: [{ id: 'a', name: 'Tenant A secret department', agentCount: 1, sortOrder: 1 }],
}

describe('enterprise overview', () => {
  beforeEach(() => {
    mocks.fetchApi.mockReset()
    useAppStore.setState({ selectedCompany: 'a' })
  })
  afterEach(() => { cleanup(); useAppStore.setState({ selectedCompany: null }) })

  it('distinguishes failed requests from empty tenant records', async () => {
    mocks.fetchApi.mockRejectedValue(new Error('Failed to fetch'))
    render(<EnterpriseOverview />)
    expect(await screen.findByText('Tenant metrics are unavailable: Failed to fetch')).toBeInTheDocument()
    expect(screen.getByText('Department data is unavailable.')).toBeInTheDocument()
    expect(screen.queryByText('No tenant departments are recorded.')).not.toBeInTheDocument()
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0)
  })

  it('clears the old tenant synchronously on company change and reloads', async () => {
    mocks.fetchApi.mockImplementation((path: string) => {
      if (useAppStore.getState().selectedCompany === 'a') {
        return Promise.resolve(path.includes('/stats') ? stats : { events: [] })
      }
      return new Promise(() => {})
    })
    render(<EnterpriseOverview />)
    expect(await screen.findByText('Tenant A secret department')).toBeInTheDocument()
    act(() => useAppStore.getState().setSelectedCompany('b'))
    expect(screen.queryByText('Tenant A secret department')).not.toBeInTheDocument()
    await waitFor(() => expect(mocks.fetchApi).toHaveBeenCalledTimes(4))
  })
})
