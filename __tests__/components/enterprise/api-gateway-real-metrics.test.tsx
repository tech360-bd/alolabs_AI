import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api', () => ({ fetchApi: vi.fn().mockRejectedValue(new Error('Failed to fetch')) }))
import ApiGateway from '@/components/enterprise/panels/api-gateway'

afterEach(cleanup)
describe('API gateway metrics', () => {
  it('reports failed telemetry without displaying invented uptime and request counts', async () => {
    render(<ApiGateway />)
    expect(await screen.findByText(/Failed to fetch/)).toBeInTheDocument()
    expect(screen.getByText(/not measured here/)).toBeInTheDocument()
    expect(screen.queryByText('99.9%')).not.toBeInTheDocument()
    expect(screen.queryByText('1.2M')).not.toBeInTheDocument()
  })
})
