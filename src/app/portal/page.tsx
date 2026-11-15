'use client'

/**
 * /portal — the client's dashboard: what they have bought, what is in
 * progress, what is waiting on them, what has been delivered, what is owed and
 * any open support requests. Everything here is read from /api/portal/dashboard.
 */

import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { BRAND } from '@/lib/brand/tokens'
import { ArrowRight } from 'lucide-react'
import {
  EmptyState, ErrorBanner, LoadingRows, PortalPageHero, ProgressBar, SectionCard, StatCard, StatusPill,
  fmtDate, fmtDay, fmtMoney, usePortalData, usePortalUser,
} from '@/components/portal/portal-primitives'

interface Project { id: string; reference: string; title: string; serviceName: string; status: string; statusLabel: string; stageLabel: string; progress: number; pendingAction: string | null }
interface Dashboard {
  account: { company: { name: string }; accountManager: { name: string; title: string | null; email: string | null; phone: string | null } | null }
  summary: { activeProjects: number; completedProjects: number; pendingActions: number; openTickets: number; outstandingBalance: number; unreadNotifications: number; currency: string }
  services: string[]
  activeProjects: Project[]
  pendingActions: { type: string; title: string; description: string; link: string }[]
  recentDeliverables: { id: string; title: string; projectTitle?: string; status: string; deliveredAt: string | null; projectId: string }[]
  invoices: { id: string; number: string; total: number; balanceDue: number; status: string; dueDate: string | null; currency: string }[]
  tickets: { id: string; reference: string; subject: string; status: string; updatedAt: string | null }[]
  notifications: { id: string; title: string; message: string; link: string | null; read: boolean; createdAt: string | null }[]
}

function Row({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3 hover:bg-slate-50"
      style={{ borderColor: BRAND.grayLine }}
    >
      {children}
    </Link>
  )
}

export default function PortalDashboardPage() {
  const user = usePortalUser()
  const { data, loading, error, reload } = usePortalData<Dashboard>('/dashboard')
  const firstName = (user.name || '').split(' ')[0]

  return (
    <>
      <PortalPageHero
        eyebrow={user.companyName || 'Client portal'}
        title={firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
        lead="Your services, projects, deliverables, invoices and support with ALO Labs — all in one place."
        actions={
          <>
            <Button asChild style={{ background: BRAND.orange, color: '#FFFFFF' }}>
              <Link href="/portal/services">Request a service <ArrowRight className="ml-1 size-4" /></Link>
            </Button>
            <Button asChild variant="outline"><Link href="/portal/support">Contact support</Link></Button>
          </>
        }
      />

      {loading ? <LoadingRows rows={4} /> : error ? <ErrorBanner message={error} onRetry={reload} /> : data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Active projects" value={data.summary.activeProjects} hint={`${data.summary.completedProjects} completed`} href="/portal/projects" />
            <StatCard label="Awaiting your action" value={data.summary.pendingActions} hint="Reviews, quotations, payments" />
            <StatCard label="Outstanding balance" value={fmtMoney(data.summary.outstandingBalance, data.summary.currency)} href="/portal/billing" />
            <StatCard label="Open support requests" value={data.summary.openTickets} href="/portal/support" />
          </div>

          {data.pendingActions.length > 0 ? (
            <SectionCard title="Waiting on you" description="Completing these keeps your work moving.">
              <div className="space-y-2">
                {data.pendingActions.map((a, i) => (
                  <Row key={`${a.type}-${i}`} href={a.link}>
                    <span>
                      <span className="block text-[13px] font-semibold" style={{ color: BRAND.ink }}>{a.title}</span>
                      <span className="block text-[12px]" style={{ color: BRAND.gray }}>{a.description}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: BRAND.orange }}>
                      Open <ArrowRight className="size-3.5" />
                    </span>
                  </Row>
                ))}
              </div>
            </SectionCard>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-3">
            <SectionCard
              className="lg:col-span-2"
              title="Active projects"
              description="Progress on the work we are delivering for you."
              action={<Button asChild variant="outline" size="sm"><Link href="/portal/projects">All projects</Link></Button>}
            >
              {data.activeProjects.length === 0 ? (
                <EmptyState
                  title="No active projects"
                  hint="Choose a service to start your first project with us."
                  action={<Button asChild size="sm"><Link href="/portal/services">Browse services</Link></Button>}
                />
              ) : (
                <div className="space-y-3">
                  {data.activeProjects.map((p) => (
                    <Link key={p.id} href={`/portal/projects/${p.id}`} className="block rounded-md border p-4 hover:bg-slate-50" style={{ borderColor: BRAND.grayLine }}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-[14px] font-semibold" style={{ color: BRAND.ink }}>{p.title}</p>
                          <p className="text-[12px]" style={{ color: BRAND.gray }}>{p.serviceName} · {p.reference}</p>
                        </div>
                        <StatusPill status={p.status} label={p.statusLabel} />
                      </div>
                      <div className="mt-3 flex items-center gap-3">
                        <ProgressBar value={p.progress} />
                        <span className="w-10 text-right text-[12px] font-semibold" style={{ color: BRAND.blue }}>{p.progress}%</span>
                      </div>
                      <p className="mt-2 text-[12px]" style={{ color: p.pendingAction ? BRAND.orange : BRAND.gray }}>
                        {p.pendingAction ?? p.stageLabel}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </SectionCard>

            <div className="space-y-6">
              <SectionCard title="Your account">
                <dl className="space-y-3 text-[13px]">
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.1em]" style={{ color: BRAND.gray }}>Organisation</dt>
                    <dd className="font-semibold" style={{ color: BRAND.ink }}>{data.account.company.name}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.1em]" style={{ color: BRAND.gray }}>Services with us</dt>
                    <dd style={{ color: BRAND.ink }}>{data.services.length ? data.services.join(', ') : 'None yet'}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.1em]" style={{ color: BRAND.gray }}>Account manager</dt>
                    {data.account.accountManager ? (
                      <dd style={{ color: BRAND.ink }}>
                        <span className="font-semibold">{data.account.accountManager.name}</span>
                        {data.account.accountManager.title ? <span className="block text-[12px]" style={{ color: BRAND.gray }}>{data.account.accountManager.title}</span> : null}
                        {data.account.accountManager.email ? <a className="block text-[12px] underline" style={{ color: BRAND.blue }} href={`mailto:${data.account.accountManager.email}`}>{data.account.accountManager.email}</a> : null}
                        {data.account.accountManager.phone ? <span className="block text-[12px]">{data.account.accountManager.phone}</span> : null}
                      </dd>
                    ) : (
                      <dd style={{ color: BRAND.gray }}>To be assigned — contact support in the meantime.</dd>
                    )}
                  </div>
                </dl>
              </SectionCard>

              <SectionCard title="Notifications" action={<Link href="/portal/notifications" className="text-[12px] font-semibold" style={{ color: BRAND.blue }}>View all</Link>}>
                {data.notifications.length === 0 ? (
                  <p className="text-[13px]" style={{ color: BRAND.gray }}>You are all caught up.</p>
                ) : (
                  <ul className="space-y-3">
                    {data.notifications.map((n) => (
                      <li key={n.id} className="text-[13px]">
                        <Link href={n.link ?? '/portal/notifications'} className="block hover:underline">
                          <span className="font-semibold" style={{ color: n.read ? BRAND.gray : BRAND.ink }}>{n.title}</span>
                          <span className="block text-[11px]" style={{ color: BRAND.gray }}>{fmtDate(n.createdAt)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <SectionCard title="Recent deliverables" action={<Link href="/portal/deliverables" className="text-[12px] font-semibold" style={{ color: BRAND.blue }}>View all</Link>}>
              {data.recentDeliverables.length === 0 ? (
                <p className="text-[13px]" style={{ color: BRAND.gray }}>Completed work will appear here.</p>
              ) : (
                <div className="space-y-2">
                  {data.recentDeliverables.map((d) => (
                    <Row key={d.id} href={`/portal/projects/${d.projectId}`}>
                      <span>
                        <span className="block text-[13px] font-semibold" style={{ color: BRAND.ink }}>{d.title}</span>
                        <span className="block text-[11px]" style={{ color: BRAND.gray }}>{d.projectTitle} · {fmtDay(d.deliveredAt)}</span>
                      </span>
                      <StatusPill status={d.status} />
                    </Row>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Invoices" action={<Link href="/portal/billing" className="text-[12px] font-semibold" style={{ color: BRAND.blue }}>Billing</Link>}>
              {data.invoices.length === 0 ? (
                <p className="text-[13px]" style={{ color: BRAND.gray }}>No invoices yet.</p>
              ) : (
                <div className="space-y-2">
                  {data.invoices.map((i) => (
                    <Row key={i.id} href="/portal/billing">
                      <span>
                        <span className="block text-[13px] font-semibold" style={{ color: BRAND.ink }}>{i.number}</span>
                        <span className="block text-[11px]" style={{ color: BRAND.gray }}>{fmtMoney(i.total, i.currency)} · due {fmtDay(i.dueDate)}</span>
                      </span>
                      <StatusPill status={i.status} />
                    </Row>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Support requests" action={<Link href="/portal/support" className="text-[12px] font-semibold" style={{ color: BRAND.blue }}>Support</Link>}>
              {data.tickets.length === 0 ? (
                <p className="text-[13px]" style={{ color: BRAND.gray }}>No open requests.</p>
              ) : (
                <div className="space-y-2">
                  {data.tickets.map((t) => (
                    <Row key={t.id} href={`/portal/support/${t.id}`}>
                      <span>
                        <span className="block text-[13px] font-semibold" style={{ color: BRAND.ink }}>{t.subject}</span>
                        <span className="block text-[11px]" style={{ color: BRAND.gray }}>{t.reference}</span>
                      </span>
                      <StatusPill status={t.status} />
                    </Row>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        </div>
      ) : null}
    </>
  )
}
