import { SiteFooter } from '@/components/site/chrome'
import { SiteHeader } from '@/components/site/site-header'
import type { Metadata, Viewport } from 'next'
import { BRAND, publicBrandStyle, publicSiteIcons } from '@/lib/brand/public'
import '../public-design.css'

/**
 * Shared chrome for every /site page: one header, one footer, one publication.
 * Access control for internal reference pages is enforced upstream in
 * src/proxy.ts — this layout only adds consistent navigation.
 */
export const metadata: Metadata = { icons: publicSiteIcons }
export const viewport: Viewport = { themeColor: BRAND.blue }

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="public-site" style={publicBrandStyle}>
      <SiteHeader />
      <main id="site-main">{children}</main>
      <SiteFooter />
    </div>
  )
}
