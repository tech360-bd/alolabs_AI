'use client'

/** /portal/projects — every project the client has with ALO Labs. */

import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { BRAND } from '@/lib/brand/tokens'
import { PortalPageHero, ProgressBar, StateList, StatusPill, fmtDay, usePortalData } from '@/components/portal/portal-primitives'

interface Project {
  id: string; reference: string; title: string; serviceName: string; status: string; statusLabel: string
  stageLabel: string; progress: number; pendingAction: string | null; targetDate: string | null; createdAt: string | null
}

const FILTERS = [
  { key: 'open', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'all', label: 'All' },
] as const

export default function PortalProjectsPage() {
  const { data, loading, error, reload } = usePortalData<{ projects: Project[] }>('/projects')
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]['key']>('open')
  const all = data?.projects ?? []
  const projects = all.filter((p) =>
    filter === 'all' ? true : filter === 'completed' ? p.status === 'completed' : !['completed', 'cancelled'].includes(p.status),
  )

  return (
    <>
      <PortalPageHero
        eyebrow="Projects"
        title="Your projects"
        lead="Follow progress, share documents, talk to your service team and review delivered work."
        actions={<Button asChild style={{ background: BRAND.orange, color: '#FFFFFF' }}><Link href="/portal/services">Start a new project</Link></Button>}
      />
      <div className="mb-4 flex gap-1" role="tablist" aria-label="Filter projects">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className="rounded-md px-3 py-1.5 text-[13px] font-medium"
            style={filter === f.key ? { background: BRAND.tint, color: BRAND.blue } : { color: BRAND.gray }}
          >
            {f.label}
          </button>
        ))}
      </div>
      <StateList
        loading={loading}
        error={error}
        isEmpty={projects.length === 0}
        onRetry={reload}
        emptyTitle={all.length === 0 ? 'You have no projects yet' : 'Nothing in this view'}
        emptyHint={all.length === 0 ? 'Choose a service and send us your requirements to get started.' : undefined}
        emptyAction={all.length === 0 ? <Button asChild size="sm"><Link href="/portal/services">Browse services</Link></Button> : undefined}
      >
        <div className="space-y-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/portal/projects/${p.id}`} className="block rounded-lg border p-5 hover:bg-slate-50" style={{ borderColor: BRAND.grayLine, background: '#FFFFFF' }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[15px] font-semibold" style={{ color: BRAND.blue }}>{p.title}</p>
                  <p className="mt-0.5 text-[12px]" style={{ color: BRAND.gray }}>
                    {p.serviceName} · {p.reference} · started {fmtDay(p.createdAt)}{p.targetDate ? ` · target ${fmtDay(p.targetDate)}` : ''}
                  </p>
                </div>
                <StatusPill status={p.status} label={p.statusLabel} />
              </div>
              <div className="mt-4 flex items-center gap-3">
                <ProgressBar value={p.progress} />
                <span className="w-10 text-right text-[12px] font-semibold" style={{ color: BRAND.blue }}>{p.progress}%</span>
              </div>
              {p.pendingAction ? <p className="mt-2 text-[12px] font-medium" style={{ color: BRAND.orange }}>{p.pendingAction}</p> : null}
            </Link>
          ))}
        </div>
      </StateList>
    </>
  )
}
