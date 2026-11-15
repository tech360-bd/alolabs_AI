import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { requireClientServerSession } from '@/lib/server-session'
import { PortalShell, PortalUserProvider, type PortalUser } from '@/components/portal/portal-primitives'

/**
 * /portal/* — the client portal.
 *
 * Server-side gate, evaluated before any portal HTML is produced:
 *   - `requireClientServerSession` verifies the session cookie against the
 *     database and requires a CLIENT session. An anonymous visitor is sent to
 *     `/login`; ALO Labs personnel are sent to their own workspace.
 *   - The client's company is resolved from their own membership — never from
 *     the URL — and only its display name is handed to the browser.
 *
 * The portal is about services, projects, deliverables, billing and support.
 * It imports nothing from the internal workspace UI and reads nothing but
 * `/api/portal/**`.
 */

export const metadata: Metadata = {
  title: 'Client Portal — ALO Labs',
  description: 'Your services, projects, deliverables, billing and support with ALO Labs.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await requireClientServerSession('/portal')

  const membership = await db.companyUser.findFirst({
    where: { userId: session.user.id, company: { accountType: 'client' } },
    select: { company: { select: { name: true } } },
  })

  const portalUser: PortalUser = {
    name: session.user.name,
    email: session.user.email,
    companyName: membership?.company.name ?? '',
  }

  return (
    <PortalUserProvider user={portalUser} token={session.token}>
      <PortalShell>{children}</PortalShell>
    </PortalUserProvider>
  )
}
