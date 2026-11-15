'use client'

/** /portal/deliverables — all completed work, with download links and approval history. */

import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { BRAND } from '@/lib/brand/tokens'
import { Download, ExternalLink } from 'lucide-react'
import {
  ErrorBanner, PortalPageHero, StateList, StatusPill, fmtDate, usePortalData, usePortalFetch,
} from '@/components/portal/portal-primitives'

interface Deliverable {
  id: string; projectId: string; projectTitle?: string; title: string; description: string | null; type: string
  version: number; isFinal: boolean; status: string; deliveredAt: string | null; reviewedAt: string | null
  downloadPath: string | null; externalUrl: string | null
}

const TYPE_LABELS: Record<string, string> = {
  document: 'Document', report: 'Report', software_release: 'Software release', project_file: 'Project file',
}

export default function PortalDeliverablesPage() {
  const { data, loading, error, reload } = usePortalData<{ deliverables: Deliverable[] }>('/deliverables')
  const { portalDownload } = usePortalFetch()
  const [busy, setBusy] = React.useState('')
  const [downloadError, setDownloadError] = React.useState('')
  const [showOld, setShowOld] = React.useState(false)
  const all = data?.deliverables ?? []
  const items = showOld ? all : all.filter((d) => d.status !== 'superseded')

  const download = async (d: Deliverable) => {
    if (!d.downloadPath) return
    setBusy(d.id)
    setDownloadError('')
    try {
      await portalDownload(d.downloadPath, d.title)
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Download failed.')
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      <PortalPageHero
        eyebrow="Deliverables"
        title="Your completed work"
        lead="Documents, reports, software releases and project files delivered to you, with their delivery and approval history."
      />
      {downloadError ? <div className="mb-4"><ErrorBanner message={downloadError} /></div> : null}
      {all.some((d) => d.status === 'superseded') ? (
        <label className="mb-4 flex items-center gap-2 text-[13px]" style={{ color: BRAND.gray }}>
          <input type="checkbox" checked={showOld} onChange={(e) => setShowOld(e.target.checked)} /> Show earlier versions
        </label>
      ) : null}
      <StateList loading={loading} error={error} isEmpty={items.length === 0} onRetry={reload} emptyTitle="Nothing has been delivered yet" emptyHint="Work appears here as soon as it is ready for your review.">
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: BRAND.grayLine, background: '#FFFFFF' }}>
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b text-[11px] uppercase tracking-[0.08em]" style={{ borderColor: BRAND.grayLine, color: BRAND.gray }}>
                <th className="px-4 py-3 font-semibold">Deliverable</th>
                <th className="px-4 py-3 font-semibold">Project</th>
                <th className="px-4 py-3 font-semibold">Delivered</th>
                <th className="px-4 py-3 font-semibold">Reviewed</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id} className="border-b last:border-0" style={{ borderColor: BRAND.grayLine }}>
                  <td className="px-4 py-3">
                    <span className="font-semibold" style={{ color: BRAND.ink }}>{d.title}</span>
                    <span className="block text-[11px]" style={{ color: BRAND.gray }}>{TYPE_LABELS[d.type] ?? 'Document'} · version {d.version}{d.isFinal ? ' · final' : ''}</span>
                  </td>
                  <td className="px-4 py-3"><Link href={`/portal/projects/${d.projectId}`} className="underline" style={{ color: BRAND.blue }}>{d.projectTitle || 'View project'}</Link></td>
                  <td className="px-4 py-3" style={{ color: BRAND.gray }}>{fmtDate(d.deliveredAt)}</td>
                  <td className="px-4 py-3" style={{ color: BRAND.gray }}>{fmtDate(d.reviewedAt)}</td>
                  <td className="px-4 py-3"><StatusPill status={d.status} /></td>
                  <td className="px-4 py-3 text-right">
                    {d.downloadPath ? (
                      <Button variant="outline" size="sm" className="gap-2" disabled={busy === d.id} onClick={() => void download(d)}>
                        <Download className="size-3.5" /> Download
                      </Button>
                    ) : d.externalUrl ? (
                      <Button asChild variant="outline" size="sm" className="gap-2">
                        <a href={d.externalUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-3.5" /> Open</a>
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </StateList>
    </>
  )
}
