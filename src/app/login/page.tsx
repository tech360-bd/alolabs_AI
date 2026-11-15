import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession, homeForAudience } from '@/lib/server-session'
import LoginPage from '@/components/pages/login'

/**
 * Sign-in page. Public.
 *
 * Redirects a signed-in user to their own home (client portal or internal
 * workspace) when a valid session cookie is already present. The `next` query parameter is
 * validated by the login component against a same-origin relative path.
 */

export const metadata: Metadata = {
  title: 'Sign in — ALO Labs',
  description: 'Sign in to your ALO Labs account.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function LoginRoute() {
  const session = await getServerSession()
  // Each kind of account has its own home: clients go to the service portal,
  // ALO Labs personnel to the internal workspace.
  if (session) redirect(homeForAudience(session.audience))
  return <LoginPage />
}
