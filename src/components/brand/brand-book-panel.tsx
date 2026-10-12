'use client'

/**
 * Brand Book panel — the brand guideline inside the enterprise shell.
 *
 * The shell already provides the page chrome, so the panel renders the brand
 * sections directly: lockups, colour, typography, the system flow, the mobile
 * command centre, the agent specification cards and the letterhead.
 */

import { BrandBook } from './brand-book'

export default function BrandBookPanel() {
  // BrandBook renders its own header and tab strip; inside the shell that reads
  // as a self-contained micro-site, which is how the guideline sheet behaves too.
  return (
    <div className="-m-4 lg:-m-6">
      <BrandBook />
    </div>
  )
}
