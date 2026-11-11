'use client'

/**
 * /portal/services — the public service catalog with per-tenant entitlements.
 *
 * Calls GET /api/v1/ai/capabilities (the public service plane catalog that
 * ships this phase). Each card shows:
 *   - service slug + name
 *   - description
 *   - the required scope (e.g. "ai:chat")
 *   - the public endpoint (informational)
 *   - whether THIS tenant has an active entitlement (with quota used/limit)
 *
 * Honest empty state if the catalog has not been provisioned for the tenant.
 */

import * as React from 'react'
import { useApiGetV1 } from '@/hooks/use-api-actions'
import {
  PortalPageHero,
  SectionCard,
  StateList,
  Pill,
} from '@/components/portal/portal-primitives'
import { BRAND, BRAND_FONTS } from '@/lib/brand/tokens'
import {
  Boxes,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock,
  Gauge,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────

interface ServiceCapability {
  slug: string
  name: string
  description?: string
  category?: string
  endpoint?: string
  scope?: string
  isActive?: boolean
  entitlement?: {
    status: string // active | inactive | expired | suspended | revoked
    quotaLimit?: number
    quotaUsed?: number
    quotaPeriod?: string
    expiresAt?: string | null
    grantedAt?: string | null
  }
}

interface CapabilitiesResponse {
  services?: ServiceCapability[]
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function PortalServicesPage() {
  const { data, loading, error, refresh } = useApiGetV1<CapabilitiesResponse>('/api/v1/ai/capabilities')

  const services = React.useMemo(() => {
    if (!data) return []
    return data.services ?? []
  }, [data])

  const activeCount = React.useMemo(
    () => services.filter((s) => s.entitlement?.status === 'active').length,
    [services],
  )
  const catalogCount = services.length

  return (
    <>
      <PortalPageHero
        eyebrow="Services"
        title="Public service catalog"
        lead="The services your API keys can call through the ALO Labs public plane. Each card shows the required scope, the endpoint, and whether your tenant is currently entitled."
      />

      {/* Summary tiles */}
      <section className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryTile label="Catalog size" value={catalogCount.toString()} />
        <SummaryTile label="Active entitlements" value={activeCount.toString()} />
        <SummaryTile
          label="Coverage"
          value={catalogCount > 0 ? `${Math.round((activeCount / catalogCount) * 100)}%` : '—'}
        />
        <SummaryTile label="Status" value={error ? 'Error' : loading ? 'Loading' : 'OK'} />
      </section>

      <SectionCard
        title="Services"
        description="One card per service in the catalog. Sorted alphabetically."
        action={
          <button
            type="button"
            onClick={refresh}
            className="text-[12px] font-semibold inline-flex items-center gap-1"
            style={{ color: BRAND.orange }}
          >
            <ArrowRight className="size-3.5 rotate-45" /> Refresh
          </button>
        }
      >
        <StateList
          loading={loading}
          error={error}
          isEmpty={services.length === 0}
          onRetry={refresh}
          emptyTitle="Service catalog is empty"
          emptyHint="Services will appear here once the public service plane is provisioned. Contact your account manager if you expected a catalog."
        >
          <div className="grid gap-4 md:grid-cols-2">
            {services.map((service) => (
              <ServiceCard key={service.slug} service={service} />
            ))}
          </div>
        </StateList>
      </SectionCard>
    </>
  )
}

// ── Subcomponents ──────────────────────────────────────────────────────────

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-4" style={{ borderColor: '#E2E8F0', background: '#FFFFFF' }}>
      <p
        className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]"
        style={{ color: BRAND.gray }}
      >
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold" style={{ color: BRAND.blue }}>
        {value}
      </p>
    </div>
  )
}

function ServiceCard({ service }: { service: ServiceCapability }) {
  const entitlement = service.entitlement
  const isEntitled = entitlement?.status === 'active'
  const quotaPct =
    entitlement && typeof entitlement.quotaLimit === 'number' && entitlement.quotaLimit > 0
      ? Math.min(100, Math.round(((entitlement.quotaUsed ?? 0) / entitlement.quotaLimit) * 100))
      : 0

  return (
    <article
      className="flex flex-col rounded-lg border p-5"
      style={{ borderColor: BRAND.grayLine, background: '#FFFFFF' }}
    >
      {/* Header */}
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className="inline-flex size-9 items-center justify-center rounded-md"
            style={{ background: 'rgba(0,58,188,0.08)' }}
          >
            <Boxes className="size-4" style={{ color: BRAND.blue }} />
          </span>
          <div>
            <h3
              className="text-[15px] font-semibold"
              style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}
            >
              {service.name}
            </h3>
            <p className="font-mono text-[11px] mt-0.5" style={{ color: BRAND.graySoft }}>
              {service.slug}
              {service.category ? <span className="ml-2">· {service.category}</span> : null}
            </p>
          </div>
        </div>
        <EntitlementBadge status={entitlement?.status} />
      </header>

      {/* Description */}
      {service.description ? (
        <p className="mt-3 text-[13px] leading-relaxed" style={{ color: BRAND.gray }}>
          {service.description}
        </p>
      ) : (
        <p className="mt-3 text-[12px] italic" style={{ color: BRAND.graySoft }}>
          No description provided.
        </p>
      )}

      {/* Endpoint & scope */}
      <dl className="mt-4 grid grid-cols-1 gap-2 text-[12px]">
        {service.endpoint ? (
          <div className="flex items-start gap-2">
            <dt
              className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] w-16 shrink-0 mt-0.5"
              style={{ color: BRAND.gray }}
            >
              Endpoint
            </dt>
            <dd className="font-mono break-all" style={{ color: BRAND.ink }}>
              <span style={{ color: BRAND.orange }}>POST</span> {service.endpoint}
            </dd>
          </div>
        ) : null}
        {service.scope ? (
          <div className="flex items-start gap-2">
            <dt
              className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] w-16 shrink-0 mt-0.5"
              style={{ color: BRAND.gray }}
            >
              Scope
            </dt>
            <dd>
              <Pill tone="blue">{service.scope}</Pill>
            </dd>
          </div>
        ) : null}
      </dl>

      {/* Entitlement / quota */}
      {isEntitled && entitlement ? (
        <div className="mt-4 pt-4 border-t" style={{ borderColor: BRAND.grayLine }}>
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-mono uppercase tracking-[0.12em]" style={{ color: BRAND.gray }}>
              Quota
            </span>
            <span className="font-mono" style={{ color: BRAND.ink }}>
              {(entitlement.quotaUsed ?? 0).toLocaleString()} / {(entitlement.quotaLimit ?? 0).toLocaleString()}
              {entitlement.quotaPeriod ? ` · ${entitlement.quotaPeriod}` : ''}
            </span>
          </div>
          <div
            className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: '#F1F5F9' }}
            aria-label={`${quotaPct}% of quota used`}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${quotaPct}%`,
                background: quotaPct >= 90 ? BRAND.orange : BRAND.blue,
              }}
            />
          </div>
          <div className="mt-2 flex items-center gap-3 text-[11px]" style={{ color: BRAND.graySoft }}>
            <span className="inline-flex items-center gap-1">
              <Gauge className="size-3" /> {quotaPct}% used
            </span>
            {entitlement.expiresAt ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" /> expires {new Date(entitlement.expiresAt).toLocaleDateString()}
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-4 pt-4 border-t flex items-center justify-between" style={{ borderColor: BRAND.grayLine }}>
          <span className="text-[12px]" style={{ color: BRAND.graySoft }}>
            {entitlement
              ? `Entitlement status: ${entitlement.status}`
              : 'No entitlement for this service.'}
          </span>
          <span className="text-[11px] font-mono uppercase tracking-[0.12em]" style={{ color: BRAND.graySoft }}>
            Contact your account manager
          </span>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-4 pt-3 border-t flex items-center justify-between" style={{ borderColor: BRAND.grayLine }}>
        <span className="text-[11px]" style={{ color: BRAND.graySoft }}>
          {service.isActive === false ? 'Inactive in catalog' : 'Catalog entry active'}
        </span>
      </footer>
    </article>
  )
}

function EntitlementBadge({ status }: { status?: string }) {
  if (!status) {
    return (
      <Pill tone="gray">
        <XCircle className="size-3" /> Not entitled
      </Pill>
    )
  }
  switch (status) {
    case 'active':
      return (
        <Pill tone="green">
          <CheckCircle2 className="size-3" /> Active
        </Pill>
      )
    case 'expired':
      return (
        <Pill tone="orange">
          <Clock className="size-3" /> Expired
        </Pill>
      )
    case 'suspended':
    case 'revoked':
      return (
        <Pill tone="red">
          <XCircle className="size-3" /> {status}
        </Pill>
      )
    default:
      return <Pill tone="gray">{status}</Pill>
  }
}
