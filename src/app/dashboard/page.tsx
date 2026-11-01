import type { Metadata } from 'next'
import { requireServerSession } from '@/lib/server-session'
import DashboardShell from '@/components/dashboard/dashboard-shell'

/**
 * The dashboard. Private.
 *
 * The session is verified against the database here, on the server, before any
 * dashboard HTML is produced. An anonymous visitor is redirected to `/login`
 * and never receives the application shell. This is the primary gate; the
 * matching edge check in `src/proxy.ts` and the client-side check in
 * `DashboardShell` are defence in depth.
 */

export const metadata: Metadata = {
  title: 'Dashboard — ALO Labs AgentOS',
  description: 'Private workspace: AI agents, departments, workflows and operations.',
  robots: { index: false, follow: false },
}

// Never cache a private page: it must be re-validated on every request.
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const { user } = await requireServerSession('/dashboard')
  return <DashboardShell initialUser={user} />
}
