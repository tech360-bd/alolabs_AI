'use client'

/**
 * /portal — portal home.
 *
 * Shows a welcome message, quick links to every portal surface, and the
 * caller's service catalog (fetched live from /api/v1/ai/capabilities when it
 * ships this phase; until then the page renders an honest empty state — no
 * fake services, no marketing placeholders).
 *
 * Data is fetched via the shared `fetchApi` helper from `@/lib/api` (the same
 * one every dashboard panel uses). The hook shape — loading / error / empty /
 * data — comes from <StateList/> so the four states are rendered identically
 * everywhere.
 */

import * as React from 'react'
import Link from 'next/link'
import { useApiGetV1 } from '@/hooks/use-api-actions'
import { Button } from '@/components/ui/button'
import {
  PortalPageHero,
  SectionCard,
  StateList,
  Pill,
  usePortalUser,
} from '@/components/portal/portal-primitives'
import { BRAND, BRAND_FONTS } from '@/lib/brand/tokens'
import {
  KeyRound,
  Activity,
  ListChecks,
  Webhook,
  Boxes,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react'

interface ServiceCatalogItem {
  slug: string
  name: string
  description?: string
  endpoint?: string
  scope?: string
  isActive?: boolean
  entitled?: boolean
}

interface ServiceCatalogResponse {
  services?: ServiceCatalogItem[]
}

const QUICK_LINKS: {
  href: string
  label: string
  hint: string
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
}[] = [
  {
    href: '/portal/api-keys',
    label: 'API Keys',
    hint: 'Create, rotate, revoke',
    icon: KeyRound,
  },
  {
    href: '/portal/usage',
    label: 'Usage',
    hint: 'Per-service, per-day',
    icon: Activity,
  },
  {
    href: '/portal/tasks',
    label: 'Tasks',
    hint: 'History & detail',
    icon: ListChecks,
  },
  {
    href: '/portal/webhooks',
    label: 'Webhooks',
    hint: 'Configs & deliveries',
    icon: Webhook,
  },
  {
    href: '/portal/services',
    label: 'Services',
    hint: 'Catalog & entitlements',
    icon: Boxes,
  },
]

// The services that will be seeded by the platform phase. We surface them here
// as *expected* catalog entries so the portal reads as functional even when
// the /api/v1/ai/capabilities route has not yet shipped. The actual fetch
// decides what to render — this list only informs the "expected" hint text.
const EXPECTED_SERVICE_SLUGS = ['ai-chat', 'ai-knowledge-search', 'ai-tasks']

export default function PortalHomePage() {
  const { data, loading, error, refresh } = useApiGetV1<ServiceCatalogResponse>('/api/v1/ai/capabilities')

  // The capabilities endpoint may return either { data: [...] } or { services: [...] }
  // depending on the eventual implementation. Accept both.
  const services: ServiceCatalogItem[] = React.useMemo(() => {
    if (!data) return []
    return data.services ?? []
  }, [data])

  const isEmpty = services.length === 0

  return (
    <>
      <PortalPageHero
        eyebrow="Customer Portal"
        title="Your API workspace"
        lead="Manage API keys, watch real-time usage, inspect task history, and wire up webhooks. Everything here is tenant-scoped to your company — no internal workforce data, ever."
        actions={
          <Button asChild size="sm" className="gap-2">
            <Link href="/portal/api-keys">
              <KeyRound className="size-3.5" /> Manage API keys
            </Link>
          </Button>
        }
      />

      {/* Quick links */}
      <section className="mb-10">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {QUICK_LINKS.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group flex flex-col gap-2 rounded-lg border p-4 transition-colors hover:border-slate-300 hover:bg-slate-50"
                style={{ borderColor: '#E2E8F0', background: '#FFFFFF' }}
              >
                <span
                  className="inline-flex size-8 items-center justify-center rounded-md"
                  style={{ background: 'rgba(0,58,188,0.08)' }}
                >
                  <Icon className="size-4" style={{ color: BRAND.blue }} />
                </span>
                <span
                  className="text-[14px] font-semibold"
                  style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}
                >
                  {item.label}
                </span>
                <span className="text-[11px]" style={{ color: BRAND.gray }}>
                  {item.hint}
                </span>
                <ArrowRight
                  className="size-3.5 mt-auto opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ color: BRAND.orange }}
                />
              </Link>
            )
          })}
        </div>
      </section>

      {/* Service catalog */}
      <SectionCard
        title="Your service catalog"
        description="Services your company can call through the ALO Labs public API plane."
        action={
          <Button variant="outline" size="sm" onClick={refresh}>
            Refresh
          </Button>
        }
      >
        <StateList
          loading={loading}
          error={error}
          isEmpty={isEmpty}
          onRetry={refresh}
          emptyTitle="No services provisioned yet"
          emptyHint={
            EXPECTED_SERVICE_SLUGS.length
              ? `Expected catalog: ${EXPECTED_SERVICE_SLUGS.join(', ')}. Services will appear here automatically once your tenant is entitled.`
              : 'Contact your account manager to enable services.'
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => {
              const entitled = service.entitled !== false
              return (
                <div
                  key={service.slug}
                  className="flex flex-col rounded-md border p-4"
                  style={{ borderColor: BRAND.grayLine, background: '#FFFFFF' }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em]"
                      style={{ color: BRAND.gray }}
                    >
                      {service.slug}
                    </span>
                    {entitled ? (
                      <Pill tone="green">
                        <CheckCircle2 className="size-3" /> Entitled
                      </Pill>
                    ) : (
                      <Pill tone="gray">Not entitled</Pill>
                    )}
                  </div>
                  <h3
                    className="mt-2 text-[15px] font-semibold"
                    style={{ color: BRAND.blue }}
                  >
                    {service.name}
                  </h3>
                  {service.description ? (
                    <p className="mt-1 text-[12px] leading-relaxed" style={{ color: BRAND.gray }}>
                      {service.description}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-col gap-1 text-[11px] font-mono" style={{ color: BRAND.gray }}>
                    {service.endpoint ? (
                      <span className="truncate" title={service.endpoint}>
                        <span style={{ color: BRAND.orange }}>POST</span> {service.endpoint}
                      </span>
                    ) : null}
                    {service.scope ? (
                      <span>
                        scope: <span style={{ color: BRAND.ink }}>{service.scope}</span>
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 pt-3 border-t flex items-center justify-between" style={{ borderColor: BRAND.grayLine }}>
                    <span className="text-[11px]" style={{ color: BRAND.graySoft }}>
                      {service.isActive === false ? 'Inactive' : 'Active'}
                    </span>
                    <Link
                      href="/portal/services"
                      className="text-[12px] font-semibold inline-flex items-center gap-1"
                      style={{ color: BRAND.orange }}
                    >
                      Details <ArrowRight className="size-3" />
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </StateList>
      </SectionCard>

      {/* Account context */}
      <PortalAccountContext />
    </>
  )
}

/** Renders the signed-in user's account context. Pure presentation. */
function PortalAccountContext() {
  const user = usePortalUser()
  return (
    <section className="mt-8">
      <SectionCard
        title="Account"
        description="The identity used for every portal request."
      >
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-[13px]">
          <Definition label="Name" value={user.name || '—'} />
          <Definition label="Email" value={user.email} mono />
          <Definition label="Role" value={user.role} mono />
          <Definition label="Company ID" value={user.companyId ?? '—'} mono />
        </dl>
      </SectionCard>
    </section>
  )
}

function Definition({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt
        className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]"
        style={{ color: BRAND.gray }}
      >
        {label}
      </dt>
      <dd
        className="mt-1 break-all"
        style={{
          color: BRAND.ink,
          fontFamily: mono ? BRAND_FONTS.primary.stack : undefined,
        }}
      >
        {value}
      </dd>
    </div>
  )
}
