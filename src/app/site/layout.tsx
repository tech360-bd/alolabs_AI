import { SiteFooter } from '@/components/site/chrome'
import { SiteHeader } from '@/components/site/site-header'
import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { isSelfChromePage } from '@/lib/access/surfaces'
import { BRAND, publicBrandStyle, publicSiteIcons } from '@/lib/brand/public'
import '../public-design.css'
// The dark marketing stylesheet. Loaded here so the pages that use its
// class-based components (.ag-svc-card, .ag-split, .ag-glass) are styled
// wherever they are mounted — without this the services index had no layout.
import '../agentos-3d.css'

/**
 * Shared chrome for every /site page: one header, one footer, one publication.
 * Access control for internal reference pages is enforced upstream in
 * src/proxy.ts — this layout only adds consistent navigation.
 *
 * A few public pages opt out of the shared chrome because they carry their own
 * dark header and footer (see SELF_CHROMED_PAGES). Rendering both produced two
 * stacked navigation bars on the services index, so those pages get the
 * stylesheet and the metadata but not the light header/footer.
 *
 * The path is read from the request header the proxy stamps for every request,
 * which keeps this layout a server component and avoids shipping the current
 * pathname to the client.
 */
export const metadata: Metadata = { icons: publicSiteIcons }
export const viewport: Viewport = { themeColor: BRAND.blue }

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers()
  // x-alo-request-path is set by src/proxy.ts on every request. fallback to the
  // referer-independent default of "show the chrome" if it is absent.
  const pathname = requestHeaders.get('x-alo-request-path') ?? ''
  const selfChromed = pathname.length > 0 && isSelfChromePage(pathname)

  if (selfChromed) {
    return (
      <div className="public-site" style={publicBrandStyle}>
        <main id="site-main">{children}</main>
      </div>
    )
  }

  return (
    <div className="public-site" style={publicBrandStyle}>
      <SiteHeader />
      <main id="site-main">{children}</main>
      <SiteFooter />
    </div>
  )
}
