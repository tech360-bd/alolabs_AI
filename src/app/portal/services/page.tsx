'use client'

/**
 * /portal/services — the services ALO Labs offers. Each card says what the
 * client receives and what it costs (or that it is quoted), and leads to the
 * full description and the request form.
 */

import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { BRAND } from '@/lib/brand/tokens'
import { ArrowRight, Check, Clock } from 'lucide-react'
import { Pill, PortalPageHero, StateList, usePortalData } from '@/components/portal/portal-primitives'
import { priceLabel, type ServiceView } from '@/components/portal/service-view'

export default function PortalServicesPage() {
  const { data, loading, error, reload } = usePortalData<{ services: ServiceView[] }>('/services')
  const services = data?.services ?? []

  return (
    <>
      <PortalPageHero
        eyebrow="Services"
        title="What we can do for you"
        lead="Choose a service to see what is included, then send us your requirements. We review every request and reply with a plan and a quotation."
      />
      <StateList loading={loading} error={error} isEmpty={services.length === 0} onRetry={reload} emptyTitle="No services are available right now" emptyHint="Please contact support and we will help you directly.">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <article key={s.id} className="flex flex-col rounded-lg border p-5" style={{ borderColor: BRAND.grayLine, background: '#FFFFFF' }}>
              <div><Pill>{s.category}</Pill></div>
              <h2 className="mt-3 text-[17px] font-semibold" style={{ color: BRAND.blue }}>{s.name}</h2>
              <p className="mt-2 text-[13px] leading-relaxed" style={{ color: BRAND.gray }}>{s.summary}</p>
              <ul className="mt-4 space-y-1.5">
                {s.benefits.slice(0, 3).map((b) => (
                  <li key={b} className="flex gap-2 text-[13px]" style={{ color: BRAND.ink }}>
                    <Check className="mt-0.5 size-4 shrink-0" style={{ color: BRAND.orange }} />{b}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-5">
                <p className="text-[15px] font-bold" style={{ color: BRAND.ink }}>{priceLabel(s.pricing)}</p>
                <p className="mt-1 flex items-center gap-1.5 text-[12px]" style={{ color: BRAND.gray }}>
                  <Clock className="size-3.5" />{s.deliveryTimeframe}
                </p>
                <Button asChild className="mt-4 w-full" style={{ background: BRAND.blue, color: '#FFFFFF' }}>
                  <Link href={`/portal/services/${s.slug}`}>View details <ArrowRight className="ml-1 size-4" /></Link>
                </Button>
              </div>
            </article>
          ))}
        </div>
      </StateList>
    </>
  )
}
