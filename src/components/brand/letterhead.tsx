/**
 * Letterhead — the branded A4 pad.
 *
 * Frame, masthead and contact strip follow the supplied letterhead artwork: an
 * orange outer rule, the blue top/bottom bands with their diagonal cuts, the
 * horizontal lockup top-left, and the four-item contact bar sitting on blue
 * across the foot of the page. Content is passed as children, so every document
 * (invoice, statement, letter) inherits the same surface.
 *
 * The sheet is authored at A4 at 96 dpi (794 × 1123) and scales for screen
 * preview via CSS; print uses the `@page` rule in globals.css.
 */

import * as React from 'react'
import { MapPin, Phone, Globe, Mail } from 'lucide-react'
import { AloLabsLogo } from './alo-logo'
import { BRAND, COMPANY, LETTERHEAD } from '@/lib/brand/tokens'
import { cn } from '@/lib/utils'

export interface LetterheadProps {
  children: React.ReactNode
  className?: string
  /** Hide the contact strip (statement previews, internal drafts). */
  hideContact?: boolean
  /** Print the sheet at true A4 when the page is sent to a printer. */
  printSheet?: boolean
}

export function Letterhead({ children, className, hideContact, printSheet = true }: LetterheadProps) {
  return (
    <div
      className={cn('alo-sheet relative mx-auto bg-white text-[#1E293B]', printSheet && 'alo-print-sheet', className)}
      style={{
        width: '794px',
        minHeight: '1123px',
        aspectRatio: `${LETTERHEAD.widthMm} / ${LETTERHEAD.heightMm}`,
        boxShadow: '0 18px 45px -30px rgba(0,28,107,0.55)',
        borderRadius: '14px',
        overflow: 'hidden',
      }}
    >
      <Frame />
      <div className="relative z-10 flex h-full flex-col px-[74px] pb-[132px] pt-[52px]">
        <header className="flex items-start justify-between">
          <AloLabsLogo size={62} tagline />
          <DocumentTag />
        </header>
        <div className="mt-6 flex-1">{children}</div>
      </div>
      {hideContact ? null : <ContactStrip />}
    </div>
  )
}

/**
 * The pad's printed frame: orange outer rule, blue bands top and bottom with
 * the diagonal cuts from the artwork, and a hairline grey keyline inside.
 */
function Frame() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 794 1123"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {/* page edge */}
      <rect x="5" y="5" width="784" height="1113" rx="12" fill="none" stroke={BRAND.orange} strokeWidth="9" />
      {/* inner keyline */}
      <rect x="30" y="30" width="734" height="1063" rx="8" fill="none" stroke={BRAND.grayLine} strokeWidth="1" />

      {/* top band: blue, cut on the right, with the orange wedge beside the cut */}
      <path d="M34 20 H560 L520 52 H34 Z" fill={BRAND.blue} />
      <path d="M560 20 H660 L620 52 H520 Z" fill={BRAND.orange} />
      {/* bottom band: blue, cut on the left */}
      <path d="M20 1071 H760 V1103 H60 L20 1071 Z" fill={BRAND.blue} />
      <path d="M20 1071 H120 L60 1103 H20 Z" fill={BRAND.orange} />
    </svg>
  )
}

/** Small mono label in the masthead — “REF · DATE” style document tag. */
function DocumentTag() {
  return (
    <div className="pt-3 text-right">
      <p className="font-mono text-[9px] font-medium uppercase tracking-[0.2em]" style={{ color: BRAND.gray }}>
        {COMPANY.legalName} · {COMPANY.product}
      </p>
      <p className="mt-1 text-[11px] font-semibold" style={{ color: BRAND.blue }}>
        {COMPANY.domains[0].value}
      </p>
    </div>
  )
}

/** The four-item contact bar printed across the foot of the sheet. */
export function ContactStrip() {
  const items = [
    { icon: MapPin, label: 'Address', value: [COMPANY.entity, ...COMPANY.address] },
    { icon: Phone, label: 'Phone', value: [COMPANY.phone] },
    { icon: Globe, label: 'Website', value: [COMPANY.website] },
    { icon: Mail, label: 'Email', value: [COMPANY.email] },
  ]
  return (
    <div
      className="absolute inset-x-0 bottom-0 z-20 grid grid-cols-4 gap-3 px-[54px] pb-[46px] pt-[26px]"
      style={{ background: BRAND.blue, borderRadius: '0 0 8px 8px' }}
    >
      {items.map((item, i) => (
        <div key={item.label} className="flex items-start gap-2.5">
          <span
            className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-white"
            aria-hidden="true"
          >
            <item.icon className="size-4" style={{ color: BRAND.orange }} strokeWidth={2.4} />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-white">{item.label}</p>
            {item.value.map((line) => (
              <p key={line} className="mt-0.5 text-[10px] leading-snug text-white/90">
                {line}
              </p>
            ))}
          </div>
          {i < items.length - 1 ? (
            <span className="ml-1 mt-1 hidden h-9 w-px bg-white/25 sm:block" aria-hidden="true" />
          ) : null}
        </div>
      ))}
    </div>
  )
}
