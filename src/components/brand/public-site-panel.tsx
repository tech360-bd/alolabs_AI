'use client'

/**
 * Public Site panel — the marketing website, previewed inside the shell.
 *
 * The live site is at `/site`; this panel renders the same component so an
 * operator can review the public pages without leaving the app.
 */

import Link from 'next/link'
import { MarketingSite } from '@/components/site/marketing-site'
import { Button } from '@/components/ui/button'
import { BRAND } from '@/lib/brand/tokens'
import { ExternalLink } from 'lucide-react'

export default function PublicSitePanel() {
  return (
    <div className="-m-4 lg:-m-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-white px-6 py-3">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: BRAND.gray }}>
          Preview · the public website lives at <span style={{ color: BRAND.blue }}>/site</span>
        </p>
        <Button size="sm" className="gap-1.5" style={{ background: BRAND.orange }} asChild>
          <Link href="/site" target="_blank">
            <ExternalLink className="size-3.5" /> Open /site
          </Link>
        </Button>
      </div>
      <MarketingSite />
    </div>
  )
}
