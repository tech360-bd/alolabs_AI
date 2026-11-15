'use client'

/** /portal/notifications — updates about the client's projects, billing and support. */

import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { BRAND } from '@/lib/brand/tokens'
import { PortalPageHero, StateList, fmtDate, usePortalData, usePortalFetch } from '@/components/portal/portal-primitives'

interface Notification { id: string; title: string; message: string; link: string | null; read: boolean; createdAt: string | null }

export default function PortalNotificationsPage() {
  const { data, loading, error, reload } = usePortalData<{ notifications: Notification[]; unread: number }>('/notifications')
  const { portalFetch } = usePortalFetch()
  const items = data?.notifications ?? []

  const markAll = async () => {
    await portalFetch('/notifications', { method: 'POST', body: '{}' }).catch(() => undefined)
    reload()
  }

  return (
    <>
      <PortalPageHero
        eyebrow="Notifications"
        title="Updates"
        lead="Progress on your projects, new deliverables, quotations, invoices and replies from our team."
        actions={data && data.unread > 0 ? <Button variant="outline" onClick={() => void markAll()}>Mark all as read</Button> : undefined}
      />
      <StateList loading={loading} error={error} isEmpty={items.length === 0} onRetry={reload} emptyTitle="No notifications yet" emptyHint="We will let you know here when something needs your attention.">
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.id}>
              <Link href={n.link ?? '/portal'} className="block rounded-md border px-4 py-3 hover:bg-slate-50"
                style={{ borderColor: BRAND.grayLine, background: '#FFFFFF', borderLeft: `3px solid ${n.read ? BRAND.grayLine : BRAND.orange}` }}>
                <span className="block text-[13px] font-semibold" style={{ color: BRAND.ink }}>{n.title}</span>
                <span className="block text-[13px]" style={{ color: BRAND.gray }}>{n.message}</span>
                <span className="mt-1 block text-[11px]" style={{ color: BRAND.gray }}>{fmtDate(n.createdAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </StateList>
    </>
  )
}
