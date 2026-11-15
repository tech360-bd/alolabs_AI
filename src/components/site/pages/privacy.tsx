'use client'

/**
 * /site/privacy — the public privacy policy.
 *
 * Written against the actual business and systems (public website, enquiry
 * form captured as CRM leads, authenticated client portal, tenant-isolated
 * services). Items that need the owner's legal confirmation are flagged with
 * OWNER APPROVAL comments — they are not invented here.
 */

import * as React from 'react'
import Link from 'next/link'
import { BRAND, COMPANY } from '@/lib/brand/tokens'
import { PageHero, Section } from '@/components/site/chrome'

interface Clause {
  heading: string
  body: string[]
}

const CLAUSES: Clause[] = [
  {
    heading: '1. Who we are',
    body: [
      // OWNER APPROVAL: confirm the exact legal entity name and registered
      // details before publication. The address below is the letterhead fact.
      `ALO Labs ("ALO Labs", "we", "us") is a technology company registered in Harrisonville, Missouri, United States. Our contact address is ${COMPANY.addressOneLine}, and you can reach us at ${COMPANY.email} or ${COMPANY.phone}.`,
      'This policy explains how we handle personal information across our public website (alolabs.net), our client portal and the services we deliver.',
    ],
  },
  {
    heading: '2. Information we collect',
    body: [
      'Information you give us: when you submit an enquiry through our website we collect your name, business email, company, phone number (optional), project details and any preferences you share, such as budget range and preferred contact method.',
      'Client account information: when you use the client portal we process your account details, service requests, projects, deliverables, invoices, support messages and related records needed to deliver the service.',
      'Technical information: like most websites we record standard technical data such as IP address, browser type and pages requested, used for security, abuse prevention and service reliability.',
    ],
  },
  {
    heading: '3. How we use information',
    body: [
      'We use personal information to respond to enquiries, deliver contracted services, operate and secure the client portal, process billing, provide support and meet our legal obligations.',
      'Enquiry details submitted through the website are stored in our internal customer records system so the right person on our team can follow up. We reply within one business day and we do not send marketing newsletters without consent.',
    ],
  },
  {
    heading: '4. Legal bases',
    body: [
      // OWNER APPROVAL: confirm the lawful-basis wording with counsel for each
      // operating jurisdiction (US + international clients).
      'We process information on the basis of: your consent (when you submit an enquiry or subscribe to communications), steps taken at your request before entering a contract, performance of a contract with you or your organisation, our legitimate interests in operating and securing our services, and compliance with legal obligations.',
    ],
  },
  {
    heading: '5. Client data and isolation',
    body: [
      'Data you provide as a client — projects, documents, deliverables, invoices and messages — is isolated to your account. Access controls check ownership on every request, and other clients cannot see your data.',
      'We do not use your data to train shared or third-party AI models. Where AI-assisted processing is used to deliver your work, it operates within your account context and under agreed instructions.',
    ],
  },
  {
    heading: '6. Sharing and processors',
    body: [
      'We do not sell personal information. We share it only with service providers who help us operate (for example hosting, email delivery and payment processing), under contracts that require them to protect it, or where required by law.',
      // OWNER APPROVAL: maintain and link the authoritative subprocessor list.
      'A current list of subprocessors is available on request from ' + COMPANY.email + '.',
    ],
  },
  {
    heading: '7. Retention',
    body: [
      // OWNER APPROVAL: confirm concrete retention periods with counsel.
      'We keep enquiry records for as long as needed to serve you and for reasonable business records thereafter. Client project records are retained for the life of the engagement and as required for legal, accounting and contractual purposes. You can request deletion of enquiry data at any time.',
    ],
  },
  {
    heading: '8. Security',
    body: [
      'We apply technical and organisational measures appropriate to the data we handle: authenticated access with session controls, tenant isolation, hashed credentials, validated file handling, audit logging, backups and monitoring. No system is perfectly secure, but we design and operate our platform with security as a core requirement.',
    ],
  },
  {
    heading: '9. Your rights',
    body: [
      // OWNER APPROVAL: confirm which statutory rights apply per jurisdiction
      // (e.g. GDPR/UK GDPR for international clients, US state laws).
      'Depending on where you live, you may have rights to access, correct, delete or port your personal information, to object to or restrict certain processing, and to withdraw consent. To exercise any right, email ' + COMPANY.email + ' — we respond within a reasonable time.',
    ],
  },
  {
    heading: '10. Cookies',
    body: [
      'We use essential cookies and local storage required to run the site and remember your preferences (such as theme choice). We do not use third-party advertising cookies.',
    ],
  },
  {
    heading: '11. International transfers',
    body: [
      'We operate from the United States and may process information in other countries where our infrastructure or providers operate. Where required, we use appropriate safeguards for cross-border transfers.',
    ],
  },
  {
    heading: '12. Changes and contact',
    body: [
      'We may update this policy as our services evolve; the latest version is always published on this page. Questions about privacy can be sent to ' + COMPANY.email + ' or by post to the head office address above.',
    ],
  },
]

export function PrivacyPage() {
  return (
    <>
      <PageHero
        crumbs={[{ href: '/site/privacy', label: 'Privacy Policy' }]}
        eyebrow="Legal"
        title={<>Privacy Policy.</>}
        lead="How ALO Labs collects, uses and protects personal information across our website, client portal and services. Written in plain language — questions are welcome."
      />
      <Section eyebrow="Privacy at ALO Labs" title="The details." narrow>
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
          Last updated: 15 November 2026. Related: <Link href="/site/terms" className="underline" style={{ color: BRAND.blue }}>Terms of Service</Link>.
        </p>
      </Section>
    </>
  )
}
