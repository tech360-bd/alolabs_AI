import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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

  it('keeps existing home bookmarks and the technology and delivery reference', () => {
    const { container } = render(<HomeExperience />)
    for (const id of ['introduction', 'capabilities', 'solutions', 'process', 'work', 'technology', 'why']) {
      expect(container.querySelectorAll(`#${id}`)).toHaveLength(1)
    }
    const technology = container.querySelector<HTMLElement>('#technology')!
    expect(technology.querySelector('summary')).toHaveTextContent('Technology & delivery')
    expect(within(technology).getByText('Prisma & SQL')).toBeInTheDocument()
    expect(technology).toHaveTextContent('Automated tests and verification before handover')
  })

  it('uses the supplied website palette and the actual logo asset', () => {
    const { container } = render(<HomeExperience />)
    const surface = container.querySelector<HTMLElement>('.public-site')!
    expect(surface.style.getPropertyValue('--alo-orange')).toBe('#FF6A00')
    expect(surface.style.getPropertyValue('--alo-blue')).toBe('#003A8C')
    expect(surface.style.getPropertyValue('--alo-gradient-orange')).toContain('#FFB300')
    expect(surface.style.getPropertyValue('--alo-gradient-blue')).toContain('#0077FF')
    expect(screen.getAllByLabelText('ALO Labs home')[0].querySelector('img')).toHaveAttribute('src', '/studio/alo-symbol.webp')
  })

  it('browses the 3D exhibit in either direction and wraps to the mascot', () => {
    render(<HomeExperience />)
    const exhibit = within(screen.getByRole('figure', { name: 'Studio model collection' }))
    expect(exhibit.getByRole('img')).toHaveAttribute('src', '/studio/alo-companion.webp')
    fireEvent.click(exhibit.getByRole('button', { name: 'Previous studio model' }))
    expect(exhibit.getByText('System bridge')).toBeVisible()
    expect(exhibit.getByRole('img')).toHaveAttribute('src', '/studio/system-bridge.webp')
    fireEvent.click(exhibit.getByRole('button', { name: 'Next studio model' }))
    expect(exhibit.getByText('Studio companion')).toBeVisible()
    // The interactive WebGL network is an opt-in, not a first-paint requirement.
    expect(screen.getByRole('button', { name: 'Explore the 3D network' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('makes the company links available to keyboard users', () => {
    render(<HomeExperience />)
    const trigger = screen.getByRole('button', { name: 'Company' })
    fireEvent.click(trigger)
    const nav = within(screen.getByRole('navigation', { name: 'Main navigation' }))
    expect(nav.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '/site/contact')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })
})
