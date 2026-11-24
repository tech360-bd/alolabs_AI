import type { Metadata, Viewport } from 'next'
import { AgentosLanding } from '@/components/agentos/agentos-landing'
import { BRAND, publicSiteIcons } from '@/lib/brand/public'
import './public-design.css'
import './agentos-3d.css'

/**
 * The public website — the AgentOS landing page. This is what a first-time
 * visitor sees at https://alolabs.net: a 3D product surface built on the
 * supplied brand artwork (orange #FC5400 / blue #00309C, sampled from the logo
 * rather than chosen by hand).
 *
 * The previous marketing site is preserved and still mounted at `/site`
 * (`HomeExperience`), and is also reachable from the internal brand panel, so
 * nothing was deleted when this route changed.
 *
 * The authenticated application lives at `/dashboard` and is not reachable
 * without a session.
 *
 * Previously this route mounted the dashboard shell directly, which is why the
 * private application was visible to anonymous visitors. The dashboard was also
 * the *only* thing at `/`, so the public marketing site that already existed at
 * `/site` was effectively unreachable from the root domain.
 */

export const viewport: Viewport = { themeColor: BRAND.blue }

export const metadata: Metadata = {
  icons: publicSiteIcons,
  title: 'ALO Labs — Global AI & Software Technology Company',
  description:
    'ALO Labs designs and builds software, AI-powered solutions and connected digital platforms that help businesses work smarter, scale confidently and create better experiences.',
  alternates: {
    canonical: 'https://www.alolabs.net/',
  },
  openGraph: {
    title: 'ALO Labs — Global AI & Software Technology Company',
    description:
      'Software, AI-powered solutions and connected digital platforms — designed and built for businesses that take technology seriously.',
    siteName: 'ALO Labs',
    url: 'https://www.alolabs.net/',
    images: ['/studio/icon-512.png'],
  },
}

export default function HomePage() {
  return <AgentosLanding />
}
