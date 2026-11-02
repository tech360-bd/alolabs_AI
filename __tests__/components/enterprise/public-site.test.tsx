import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MarketingSite } from '@/components/site/marketing-site'

class TestIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.IntersectionObserver = TestIntersectionObserver as unknown as typeof IntersectionObserver

afterEach(cleanup)
describe('public AgentOS site', () => {
  it('explains the product and provides working section and login links', () => {
    render(<MarketingSite />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Good ideas deserve')
    expect(screen.getByText('What is an AI agent?')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Open AgentOS/ })[0]).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: /See how it works/ })).toHaveAttribute('href', '#how-it-works')
  })
  it('opens and closes the mobile navigation', () => {
    render(<MarketingSite />)
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(screen.getByRole('navigation', { name: 'Mobile navigation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }))
    expect(screen.queryByRole('navigation', { name: 'Mobile navigation' })).not.toBeInTheDocument()
  })
})
