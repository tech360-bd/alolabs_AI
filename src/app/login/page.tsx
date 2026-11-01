import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/server-session'
import LoginPage from '@/components/pages/login'

/**
 * Sign-in page. Public.
 *
 * Redirects to the dashboard when a valid session cookie is already present, so
 * a signed-in user never sees the form again. The `next` query parameter is
 * validated by the login component against a same-origin relative path.
 */

export const metadata: Metadata = {
  title: 'Sign in — ALO Labs AgentOS',
  description: 'Sign in to the ALO Labs AgentOS workspace.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function LoginRoute() {
  const session = await getServerSession()
  if (session) redirect('/dashboard')
  return <LoginPage />
}
