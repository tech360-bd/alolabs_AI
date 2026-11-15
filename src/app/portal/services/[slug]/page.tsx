'use client'

/**
 * /portal/services/:slug — one service in full, with the request form:
 * the client describes what they need and accepts the service terms.
 */

import * as React from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { BRAND } from '@/lib/brand/tokens'
import { Check, ChevronLeft } from 'lucide-react'
import {
  ErrorBanner, LoadingRows, Pill, PortalPageHero, SectionCard, Spinner, usePortalData, usePortalFetch,
} from '@/components/portal/portal-primitives'
import { priceLabel, type ServiceView } from '@/components/portal/service-view'

export default function PortalServiceDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const { portalFetch } = usePortalFetch()
  const { data, loading, error, reload } = usePortalData<{ service: ServiceView }>(slug ? `/services/${encodeURIComponent(slug)}` : null)
  const [title, setTitle] = React.useState('')
  const [requirements, setRequirements] = React.useState('')
  const [accepted, setAccepted] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState('')
  const service = data?.service

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!service) return
    setSubmitting(true)
    setFormError('')
    try {
      const result = await portalFetch<{ project: { id: string } }>('/projects', {
        method: 'POST',
        body: JSON.stringify({ serviceSlug: service.slug, title, requirements, acceptTerms: accepted }),
      })
      router.push(`/portal/projects/${result.project.id}`)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong.')
      setSubmitting(false)
    }
  }

  return (
    <>
      <Link href="/portal/services" className="mb-4 inline-flex items-center gap-1 text-[13px] font-medium" style={{ color: BRAND.blue }}>
        <ChevronLeft className="size-4" /> All services
      </Link>
      {loading ? <LoadingRows rows={3} /> : error ? <ErrorBanner message={error} onRetry={reload} /> : service ? (
        <>
          <PortalPageHero eyebrow={service.category} title={service.name} lead={service.summary} />
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <SectionCard title="About this service">
                <p className="text-[14px] leading-relaxed" style={{ color: BRAND.ink }}>{service.description}</p>
              </SectionCard>
              <div className="grid gap-6 md:grid-cols-2">
                <SectionCard title="Business benefits">
                  <ul className="space-y-2">
                    {service.benefits.map((b) => (
                      <li key={b} className="flex gap-2 text-[13px]" style={{ color: BRAND.ink }}><Check className="mt-0.5 size-4 shrink-0" style={{ color: BRAND.orange }} />{b}</li>
                    ))}
                  </ul>
                </SectionCard>
                <SectionCard title="What you receive">
                  <ul className="space-y-2">
                    {service.deliverables.map((d) => (
                      <li key={d} className="flex gap-2 text-[13px]" style={{ color: BRAND.ink }}><Check className="mt-0.5 size-4 shrink-0" style={{ color: BRAND.blue }} />{d}</li>
                    ))}
                  </ul>
                </SectionCard>
              </div>
              <SectionCard title="Scope">
                <p className="text-[13px] leading-relaxed" style={{ color: BRAND.ink }}>{service.scope}</p>
              </SectionCard>
              <SectionCard title="Terms and conditions">
                <p className="text-[13px] leading-relaxed" style={{ color: BRAND.gray }}>{service.terms}</p>
              </SectionCard>
            </div>

            <div className="space-y-6">
              <SectionCard title="Pricing and delivery">
                <p className="text-[20px] font-bold" style={{ color: BRAND.blue }}>{priceLabel(service.pricing)}</p>
                {service.pricing.type !== 'fixed' ? (
                  <p className="mt-1 text-[12px]" style={{ color: BRAND.gray }}>You receive a written quotation to approve before any work begins.</p>
                ) : null}
                <div className="mt-4"><Pill tone="gray">Estimated delivery</Pill></div>
                <p className="mt-2 text-[13px]" style={{ color: BRAND.ink }}>{service.deliveryTimeframe}</p>
              </SectionCard>

              <SectionCard title="Request this service" description="Tell us what you need. We will review it and reply with next steps.">
                <form onSubmit={submit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="title">Project name</Label>
                    <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required minLength={3} placeholder="e.g. Monthly sales reporting" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="requirements">Your requirements</Label>
                    <Textarea id="requirements" value={requirements} onChange={(e) => setRequirements(e.target.value)} rows={7} required minLength={10} maxLength={10000} placeholder="What do you need, by when, and what does a good result look like?" />
                    <p className="text-[11px]" style={{ color: BRAND.gray }}>You can upload supporting documents after submitting.</p>
                  </div>
                  <label className="flex items-start gap-2 text-[13px]" style={{ color: BRAND.ink }}>
                    <Checkbox checked={accepted} onCheckedChange={(v) => setAccepted(v === true)} className="mt-0.5" />
                    <span>I have read and accept the terms and conditions for this service.</span>
                  </label>
                  {formError ? <p role="alert" className="text-[13px]" style={{ color: '#b91c1c' }}>{formError}</p> : null}
                  <Button type="submit" disabled={submitting || !accepted} className="w-full gap-2" style={{ background: BRAND.orange, color: '#FFFFFF' }}>
                    {submitting ? <Spinner /> : null}
                    {service.pricing.type === 'fixed' ? 'Request service' : 'Request a quotation'}
                  </Button>
                </form>
              </SectionCard>
            </div>
          </div>
        </>
      ) : null}
    </>
  )
}
