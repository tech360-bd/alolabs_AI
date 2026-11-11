import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { PortalShell, PortalUserProvider, type PortalUser } from '@/components/portal/portal-primitives'

/**
 * /portal/* — the customer-facing portal shell.
 *
 * Server-side gate:
 *   - The session is verified via `requireAuth` (throws → Next.js surfaces a
 *     500-equivalent error). Anonymous visitors never receive portal HTML.
 *   - Internal operators (`super_admin` / `admin` roles) are redirected to
 *     `/dashboard`. The portal is for *customers* only — `api_consumer`,
 *     `viewer`, `operator`, `manager`. Mixing the two surfaces is what made
 *     the old /dashboard leak internal workforce panels to API consumers.
 *
 * The portal shell renders ONLY the customer chrome: the official ALO Labs
 * mark, "Customer Portal" label, the user's email, and a logout link. It does
 * NOT mount any `src/components/panels/*` or `src/components/enterprise/panels/*`
 * — those are internal-workforce UI and have no place on a customer surface.
 */

export const metadata: Metadata = {
  title: 'Customer Portal — ALO Labs AgentOS',
  description: 'Manage your API keys, monitor usage, review task history, and configure webhooks.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/** Internal operator roles that should use /dashboard, not /portal. */
const INTERNAL_ROLES = new Set(['super_admin', 'admin'])

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  // Throws if not authenticated. The error bubbles to Next's error boundary,
  // which renders a 401-shaped response. (We don't redirect here because the
  // edge proxy already handles the unauthenticated-browser case.)
  const user = await requireAuth()

  // Internal operators never use the portal — send them to the workforce
  // dashboard where they belong.
  if (INTERNAL_ROLES.has(user.role)) {
    redirect('/dashboard')
  }

  // Resolve the company slug for the caller's tenant. Several legacy API
  // endpoints (webhooks) still key off `?company=<slug>` rather than the
  // session-resolved companyId, so we look it up here once on the server and
  // expose it via the portal user context. (The /api/api-keys surface, fixed
  // in P0-A, ignores this and resolves companyId from the session itself.)
  let companySlug: string | undefined
  if (user.companyId) {
    const company = await db.company.findUnique({
      where: { id: user.companyId },
      select: { slug: true },
    })
    companySlug = company?.slug ?? undefined
  }

  const portalUser: PortalUser = {
    userId: user.userId,
    email: user.email,
    name: user.name,
    role: user.role,
    ...(user.companyId ? { companyId: user.companyId } : {}),
    ...(companySlug ? { companySlug } : {}),
    ...(user.companyRole ? { companyRole: user.companyRole } : {}),
  }

  return (
    <PortalUserProvider user={portalUser}>
      <PortalShell>{children}</PortalShell>
    </PortalUserProvider>
  )
}
