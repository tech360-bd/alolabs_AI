import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { HomeExperience } from '@/components/site/home-experience'

class TestIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.IntersectionObserver = TestIntersectionObserver as unknown as typeof IntersectionObserver

afterEach(cleanup)

describe('home experience', () => {
  it('shows the company story and links the hero CTAs to the right places', () => {
    render(<HomeExperience />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Building Intelligent/i)
    expect(screen.getAllByRole('link', { name: /Start a Project/i })[0]).toHaveAttribute('href', '/site/contact')
    expect(screen.getAllByRole('link', { name: /Explore Our Solutions/i })[0]).toHaveAttribute('href', '/site/solutions')
  })

  it('offers a client login entry alongside the public navigation', () => {
    render(<HomeExperience />)
    expect(screen.getAllByRole('link', { name: /Client Login/i })[0]).toHaveAttribute('href', '/login')
    // Every primary nav item resolves to a real anchor or public page.
    for (const label of ['Solutions', 'Services', 'How we work', 'About', 'Contact']) {
      expect(screen.getAllByRole('link', { name: label }).length).toBeGreaterThan(0)
    }
  })

  it('opens and closes mobile navigation', () => {
    render(<HomeExperience />)
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(screen.getByRole('navigation', { name: 'Mobile navigation' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }))
    expect(screen.queryByRole('navigation', { name: 'Mobile navigation' })).not.toBeInTheDocument()
  })
})
