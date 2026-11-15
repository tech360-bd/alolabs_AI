import { SiteFooter, SiteHeader } from '@/components/site/chrome'

/**
 * Shared chrome for every /site page: one header, one footer, one publication.
 * Access control for internal reference pages is enforced upstream in
 * src/proxy.ts — this layout only adds consistent navigation.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </>
  )
}
