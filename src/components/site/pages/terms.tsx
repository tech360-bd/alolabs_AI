'use client'

/**
 * /site/terms — the public terms of service.
 *
 * Covers the website, the client portal and project/service engagements at a
 * level that reflects how ALO Labs actually works. Items requiring the owner's
 * legal confirmation are flagged with OWNER APPROVAL comments — nothing legal
 * is invented here.
 */

import * as React from 'react'
import Link from 'next/link'
import { BRAND, COMPANY } from '@/lib/brand/public'
import { PageHero, Section } from '@/components/site/chrome'

interface Clause {
  heading: string
  body: string[]
}

const CLAUSES: Clause[] = [
  {
    heading: '1. About these terms',
    body: [
      // OWNER APPROVAL: confirm the contracting entity and governing law with
      // counsel before publication.
      `These terms govern your use of the ALO Labs website (alolabs.net), the client portal and the services we provide. "ALO Labs", "we" and "us" refers to the technology company headquartered at ${COMPANY.addressOneLine}. By using our website or engaging our services you agree to these terms.`,
    ],
  },
  {
    heading: '2. Engaging our services',
    body: [
      'Services are delivered against an agreed scope. Before billable work begins we provide a written scope — deliverables, assumptions, timeline and pricing — for your approval. Specific engagements may also be governed by a signed agreement or statement of work, which takes precedence over these terms where they conflict.',
    ],
  },
  {
    heading: '3. Client responsibilities',
    body: [
      'You agree to provide the information, access and timely decisions reasonably needed to deliver the work, and to ensure you have the rights to any materials you supply to us. Delays in client input may shift agreed timelines; we will always flag this early.',
    ],
  },
  {
    heading: '4. Fees and payment',
    body: [
      'Fees, billing milestones and payment terms are stated in the agreed scope or quotation. Invoices are payable as stated on the invoice. Where third-party costs are involved (for example hosting or licences), they are identified in the scope.',
      // OWNER APPROVAL: confirm standard payment terms and late-payment policy.
    ],
  },
  {
    heading: '5. Deliverables and ownership',
    body: [
      'Unless agreed otherwise in writing, deliverables produced specifically for your project — including code, designs and documentation — become yours on full payment of the related invoices. We retain ownership of pre-existing tools, frameworks and generic know-how, and grant you a licence to use them as part of the deliverables.',
    ],
  },
  {
    heading: '6. Acceptance and reviews',
    body: [
      'Deliverables are reviewed internally before they reach you. You have a reasonable opportunity to review deliverables against the agreed scope and request corrections of non-conformities. Anything outside the agreed scope is handled as a transparent change request.',
    ],
  },
  {
    heading: '7. Confidentiality and data',
    body: [
      'Each party keeps the other\'s confidential information private and uses it only for the engagement. Client data is isolated to the client account and handled as described in our Privacy Policy. We do not publish client names, work or results without permission.',
    ],
  },
  {
    heading: '8. AI-assisted work',
    body: [
      'Where our services use AI-assisted processing, the output is reviewed before delivery and responsibility for the delivered work remains ours. You retain ownership of your data; we do not use it to train shared models.',
    ],
  },
  {
    heading: '9. Warranties and liability',
    body: [
      // OWNER APPROVAL: liability caps and warranty disclaimers must be drafted
      // or confirmed by counsel for the operating jurisdictions.
      'We deliver services with reasonable skill and care. Except as expressly agreed in writing, services are provided without other warranties. Liability terms specific to an engagement are set out in the relevant agreement or scope.',
    ],
  },
  {
    heading: '10. Support and maintenance',
    body: [
      'Post-launch maintenance, enhancement and support are provided under the agreed engagement model. Where no support arrangement is in place, systems are handed over with documentation so they can be operated independently.',
    ],
  },
  {
    heading: '11. Termination',
    body: [
      'Either party may end an engagement as provided in the relevant scope or agreement. On termination, work completed to date is delivered and invoiced as agreed, and each party returns or deletes the other\'s confidential materials as required.',
    ],
  },
  {
    heading: '12. Changes and contact',
    body: [
      'We may update these terms; the current version is published on this page. Questions can be sent to ' + COMPANY.email + '.',
    ],
  },
]

export function TermsPage() {
  return (
    <>
      <PageHero
        crumbs={[{ href: '/site/terms', label: 'Terms of Service' }]}
        eyebrow="Legal"
        title={<>Terms of Service.</>}
        lead="The terms that govern working with ALO Labs — how engagements start, what you receive and what each side can expect. Written to match how we actually deliver."
      />
      <Section eyebrow="Working with ALO Labs" title="The details." narrow>
        <div className="space-y-8">
          {CLAUSES.map((clause) => (
            <article key={clause.heading}>
              <h2 className="text-[17px] font-semibold" style={{ color: BRAND.blue }}>
                {clause.heading}
              </h2>
              {clause.body.map((paragraph) => (
                <p key={paragraph.slice(0, 40)} className="mt-2.5 text-[13px] leading-relaxed" style={{ color: BRAND.gray }}>
                  {paragraph}
                </p>
              ))}
            </article>
          ))}
        </div>
        <p className="mt-10 text-[12px]" style={{ color: BRAND.graySoft }}>
          Last updated: 15 November 2026. Related: <Link href="/site/privacy" className="underline" style={{ color: BRAND.blue }}>Privacy Policy</Link>.
        </p>
      </Section>
    </>
  )
}
