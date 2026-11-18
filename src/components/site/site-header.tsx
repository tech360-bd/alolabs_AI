'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, ChevronDown, Menu, X } from 'lucide-react'

import { company, primary } from './navigation'

/** The unchanged symbol-only crop from the supplied master, not a redrawn A. */
export function SiteIdentity({ onHomeClick }: { onHomeClick?: () => void } = {}) {
  return (
    <Link href="/" className="studio-identity" onClick={onHomeClick} aria-label="ALO Labs home">
      <Image unoptimized src="/studio/alo-symbol.webp" width={36} height={41} alt="" />
      <span><strong>ALO Labs</strong><small>AI &amp; SOFTWARE</small></span>
    </Link>
  )
}

export function SiteHeader({ active }: { active?: string } = {}) {
  const pathname = usePathname()
  const path = active ?? pathname ?? '/'
  const [open, setOpen] = useState<'company' | 'mobile' | null>(null)
  const header = useRef<HTMLElement>(null)
  const companyButton = useRef<HTMLButtonElement>(null)
  const menuButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const dismiss = (event: PointerEvent) => {
      if (!header.current?.contains(event.target as Node)) setOpen(null)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(null)
      const trigger = open === 'mobile' ? menuButton : companyButton
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const links = (items: typeof primary) => items.map(item => (
    <Link key={item.href} href={item.href} aria-current={path === item.href ? 'page' : undefined} onClick={() => setOpen(null)}>{item.label}</Link>
  ))

  return (
    <header className="studio-header" ref={header} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(null)
    }}>
      <a className="studio-skip" href="#site-main">Skip to content</a>
      <div className="studio-shell studio-nav-row">
        <SiteIdentity onHomeClick={() => setOpen(null)} />
        <nav className="studio-nav" aria-label="Main navigation">
          {links(primary)}
          <div className="studio-dropdown">
            <button ref={companyButton} type="button" aria-expanded={open === 'company'} aria-controls="studio-company" onClick={() => setOpen(open === 'company' ? null : 'company')}>
              Company <ChevronDown size={13} aria-hidden="true" />
            </button>
            {open === 'company' && <div className="studio-submenu" id="studio-company">{links(company)}</div>}
          </div>
        </nav>
        <div className="studio-nav-end">
          <Link href="/login" className="studio-login">Client Login <ArrowUpRight size={15} aria-hidden="true" /></Link>
          <button ref={menuButton} type="button" className="studio-menu-toggle" aria-label={open === 'mobile' ? 'Close menu' : 'Open menu'} aria-expanded={open === 'mobile'} aria-controls="studio-mobile" onClick={() => setOpen(open === 'mobile' ? null : 'mobile')}>
            {open === 'mobile' ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </div>
      {open === 'mobile' && <nav className="studio-mobile" id="studio-mobile" aria-label="Mobile navigation">{links([...primary, ...company])}</nav>}
    </header>
  )
}
