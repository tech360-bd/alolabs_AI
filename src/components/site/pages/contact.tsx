'use client'

/**
 * /site/contact — talk to the team: the enquiry form (captured as a CRM lead),
 * the letterhead contact strip, the offices and the questions people ask first.
 */

import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { BRAND, BRAND_FONTS, COMPANY } from '@/lib/brand/tokens'
import { ArrowRight, Building2, Globe, Mail, MapPin, MessageSquare, Phone } from 'lucide-react'
import { CtaBand, ContactForm, FaqList, PageHero, Section, type FaqItem } from '@/components/site/chrome'

const FAQS: FaqItem[] = [
  {
    q: 'How fast do you reply?',
    a: 'Within one business day. Enquiries go straight into our CRM as leads with your message attached — nothing sits in a shared inbox.',
  },
  {
    q: 'What should I include in the first message?',
    a: 'Your departments, the workflows that eat the most hours, and the tools you already use. That is enough for us to propose a first deployment scope.',
  },
  {
    q: 'Do you work with partners and resellers?',
    a: 'Yes — implementation partners, consultancies and technology vendors. Mention it in the topic selector and we will route you to the partnership lead.',
  },
  {
    q: 'Press and media requests?',
    a: 'Use the Press & media topic, or take the boilerplate, logos and fact sheet directly from the marketing kit page.',
  },
]

function ContactTile({
  icon: Icon,
  label,
  lines,
  href,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  label: string
  lines: string[]
  href?: string
}) {
  const inner = (
    <div className="flex h-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ background: BRAND.blue }}>
        <Icon className="size-4.5" style={{ color: '#FFFFFF' }} />
      </span>
      <div className="min-w-0">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: BRAND.blue }}>
          {label}
        </p>
        {lines.map((line) => (
          <p key={line} className="mt-1 text-[11px] leading-snug" style={{ color: BRAND.ink }}>
            {line}
          </p>
        ))}
      </div>
    </div>
  )
  return href ? (
    <a href={href} className="block transition-transform hover:-translate-y-0.5">
      {inner}
    </a>
  ) : (
    inner
  )
}

export function ContactPage() {
  return (
    <>
      <PageHero
        crumbs={[{ href: '/site/contact', label: 'Contact' }]}
        eyebrow="Contact"
        title={<>Talk to the team behind AgentOS.</>}
        lead="Tell us which department hurts most. We reply within one business day — with a real person, a proposed scope and no newsletter spam."
      />

      <Section
        eyebrow="Send a message"
        title="One form, straight into the CRM."
        lead="Your enquiry is captured as a lead in our own AgentOS CRM — the same product we ship — and routed to the right person."
      >
        <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-8">
            <ContactForm />
          </div>
          <div className="space-y-4">
            <ContactTile icon={Mail} label="Email" lines={[COMPANY.email, 'Replies within one business day']} href={COMPANY.emailHref} />
            <ContactTile icon={Phone} label="Phone" lines={[COMPANY.phone, 'Mon–Fri, business hours CT']} href={COMPANY.phoneHref} />
            <ContactTile icon={MessageSquare} label="Live chat" lines={['In the command centre', 'for customers on any plan']} href="/" />
            <ContactTile icon={Globe} label="Website" lines={[COMPANY.website, ...COMPANY.domains.map((d) => d.value)]} href={COMPANY.websiteHref} />
          </div>
        </div>
      </Section>

      <Section
        id="offices"
        eyebrow="Offices"
        title="Close to your work, wherever it runs."
        lead="Head office in Missouri, delivery teams across time zones — one contact for every engagement."
        ground="canvas"
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex items-center gap-2">
              <Building2 className="size-4" style={{ color: BRAND.orange }} />
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: BRAND.orange }}>
                HQ
              </p>
            </div>
            <h3 className="mt-3 text-[17px] font-semibold" style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
              Harrisonville
            </h3>
            <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: BRAND.gray }}>
              {COMPANY.legalName} · {COMPANY.entity}
              <br />
              {COMPANY.addressOneLine}
            </p>
            <p className="mt-3 font-mono text-[11px]" style={{ color: BRAND.ink }}>
              {COMPANY.phone}
              <br />
              {COMPANY.email}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex items-center gap-2">
              <MapPin className="size-4" style={{ color: BRAND.orange }} />
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: BRAND.orange }}>
                Delivery
              </p>
            </div>
            <h3 className="mt-3 text-[17px] font-semibold" style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
              Global bench
            </h3>
            <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: BRAND.gray }}>
              Engineering and solutions teams working across North America, Europe and South Asia — aligned to your
              working day for standups, handovers and incident cover.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex items-center gap-2">
              <Globe className="size-4" style={{ color: BRAND.orange }} />
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: BRAND.orange }}>
                Online
              </p>
            </div>
            <h3 className="mt-3 text-[17px] font-semibold" style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
              Four branded domains
            </h3>
            <ul className="mt-2 space-y-1.5">
              {COMPANY.domains.map((d) => (
                <li key={d.value} className="flex items-center justify-between gap-3">
                  <span className="text-[11px]" style={{ color: BRAND.gray }}>
                    {d.label}
                  </span>
                  <span className="font-mono text-[11px] font-semibold" style={{ color: BRAND.blue }}>
                    {d.value}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section id="faq" eyebrow="FAQ" title="Before you write." ground="white">
        <FaqList items={FAQS} />
        <div className="mt-8 flex flex-wrap gap-3">
          <Button size="lg" className="gap-2" style={{ background: BRAND.orange }} asChild>
            <a href={COMPANY.emailHref}>
              <Mail className="size-4" /> {COMPANY.email}
            </a>
          </Button>
          <Button size="lg" variant="outline" className="gap-2" asChild>
            <Link href="/site/press">
              Marketing kit for press <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </Section>

      <CtaBand
        title="Prefer to see the product first?"
        lead="Open the command centre and run a command yourself — then talk to us with questions that matter."
      />
    </>
  )
}
