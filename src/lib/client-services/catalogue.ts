/**
 * The ALO Labs service catalogue — what clients can actually buy.
 *
 * These are the six service lines ALO Labs publishes on its solutions page,
 * described in business terms. Each entry says what the client receives; none
 * says how ALO Labs produces it. `internalFulfilment` is the one field about
 * production and it is never sent to a client (see src/lib/portal/dto.ts).
 *
 * Pricing: only the managed-automation retainer has a published starting
 * price. Everything else is scoped per engagement, so it is offered as a
 * quotation request rather than given an invented price.
 */

export interface CatalogueEntry {
  slug: string;
  name: string;
  category: string;
  summary: string;
  description: string;
  benefits: string[];
  deliverables: string[];
  scope: string;
  pricingModel: 'fixed' | 'starting_at' | 'quote' | 'subscription';
  priceAmount: number | null;
  currency: string;
  billingInterval: 'month' | 'year' | null;
  deliveryTimeframe: string;
  terms: string;
  sortOrder: number;
  /** INTERNAL ONLY. */
  internalFulfilment: { serviceLine: string };
}

const STANDARD_TERMS =
  'Work begins once the quotation is accepted. Scope changes after acceptance are quoted separately. ' +
  'Each delivery includes a review period during which you may approve the work or request revisions within the agreed scope. ' +
  'Client materials remain confidential and are used only to deliver the engagement. ' +
  'Invoices are payable within the period stated on the invoice.';

export const SERVICE_CATALOGUE: readonly CatalogueEntry[] = [
  {
    slug: 'business-process-automation',
    name: 'Business Process Automation',
    category: 'Automation',
    summary: 'Take recurring operational work off your team — reporting, follow-ups, data entry and research — with every output reviewed before it reaches you.',
    description:
      'We take ownership of defined, repeatable work in your operations and deliver it on an agreed schedule. ' +
      'You tell us what needs to happen and what a good result looks like; we deliver the finished output and you approve it.',
    benefits: [
      'Hours returned to your team every week',
      'Consistent output on an agreed schedule',
      'Nothing is released without review and your approval',
      'A single point of contact for the whole engagement',
    ],
    deliverables: [
      'Process assessment and agreed scope document',
      'Scheduled reports and completed work items',
      'Monthly service summary',
    ],
    scope: 'One business function per engagement, defined during assessment. Additional functions are added as separate engagements.',
    pricingModel: 'starting_at',
    priceAmount: 1500,
    currency: 'USD',
    billingInterval: 'month',
    deliveryTimeframe: 'First deliveries typically 2–4 weeks after scope is agreed',
    terms: STANDARD_TERMS,
    sortOrder: 10,
    internalFulfilment: { serviceLine: 'automation' },
  },
  {
    slug: 'crm-marketing-automation',
    name: 'CRM & Marketing Automation',
    category: 'Marketing',
    summary: 'Lead capture, scoring and nurture connected to your CRM, with campaigns, SEO content and performance reporting delivered for you.',
    description:
      'We set up and run the path from first enquiry to qualified lead: capture, enrichment, scoring and follow-up inside your CRM, ' +
      'plus the campaign and content work that feeds it.',
    benefits: [
      'Faster response to every new enquiry',
      'A clean, prioritised pipeline for your sales team',
      'Campaign and content output without adding headcount',
      'Clear reporting on what is working',
    ],
    deliverables: [
      'CRM pipeline configuration and lead-handling rules',
      'Campaign plans, copy and SEO content',
      'Monthly performance report',
    ],
    scope: 'Agreed channels, CRM and campaign volume. Advertising spend is not included.',
    pricingModel: 'quote',
    priceAmount: null,
    currency: 'USD',
    billingInterval: null,
    deliveryTimeframe: 'Setup typically 2–4 weeks; campaigns run to an agreed calendar',
    terms: STANDARD_TERMS,
    sortOrder: 20,
    internalFulfilment: { serviceLine: 'crm-marketing' },
  },
  {
    slug: 'education-student-operations',
    name: 'Education & Student Operations',
    category: 'Education',
    summary: 'Student recruitment, application handling and compliance support for consultancies and institutions.',
    description:
      'Operational support across the student journey: enquiry handling, application preparation and tracking, compliance checks and ' +
      'student communications, delivered to your process and your deadlines.',
    benefits: [
      'Applications prepared and tracked against deadlines',
      'Compliance checks applied consistently',
      'Timely communication with every applicant',
      'Capacity for intake peaks without temporary hiring',
    ],
    deliverables: [
      'Application files and status tracking',
      'Compliance checklists per applicant',
      'Intake and conversion reports',
    ],
    scope: 'Agreed intakes, destinations and application volume.',
    pricingModel: 'quote',
    priceAmount: null,
    currency: 'USD',
    billingInterval: null,
    deliveryTimeframe: 'Onboarding typically 2–3 weeks before an intake cycle',
    terms: STANDARD_TERMS,
    sortOrder: 30,
    internalFulfilment: { serviceLine: 'education' },
  },
  {
    slug: 'voice-sms-communications',
    name: 'Voice, SMS & Customer Communications',
    category: 'Communications',
    summary: 'Inbound call handling, call summaries, SMS campaigns and telephony integration for your customer-facing teams.',
    description:
      'We set up and operate your customer communication channels: call routing and answering, written summaries of conversations, ' +
      'SMS notifications and campaigns, integrated with the phone system and CRM you already use.',
    benefits: [
      'Customers reach the right place first time',
      'A written record of every conversation',
      'Reminders and campaigns sent on schedule',
      'Works with your existing numbers and tools',
    ],
    deliverables: [
      'Call-flow design and configuration',
      'Conversation summaries and follow-up actions',
      'Campaign delivery and response reports',
    ],
    scope: 'Agreed numbers, languages, hours of cover and message volume. Carrier charges are billed at cost and itemised.',
    pricingModel: 'quote',
    priceAmount: null,
    currency: 'USD',
    billingInterval: null,
    deliveryTimeframe: 'Typically 3–5 weeks from scope to go-live',
    terms: STANDARD_TERMS,
    sortOrder: 40,
    internalFulfilment: { serviceLine: 'voice' },
  },
  {
    slug: 'knowledge-content-media',
    name: 'Knowledge, Content & Media',
    category: 'Content',
    summary: 'A searchable knowledge base built from your own documents, plus editorial content, diagrams, images and video for your teams to publish.',
    description:
      'We organise your documents into a knowledge base your staff can question in plain language, and we produce the content your ' +
      'organisation publishes — articles, reports, diagrams and media — grounded in your own material.',
    benefits: [
      'Answers from your own documents in seconds',
      'Publication-ready content in your brand voice',
      'Consistent visual standards across everything you publish',
    ],
    deliverables: [
      'Organised, searchable knowledge base',
      'Articles, reports and editorial diagrams',
      'Image and video assets in agreed formats',
    ],
    scope: 'Agreed document set and content volume per period.',
    pricingModel: 'quote',
    priceAmount: null,
    currency: 'USD',
    billingInterval: null,
    deliveryTimeframe: 'Knowledge base typically 2–4 weeks; content to an agreed calendar',
    terms: STANDARD_TERMS,
    sortOrder: 50,
    internalFulfilment: { serviceLine: 'content' },
  },
  {
    slug: 'custom-software-integrations',
    name: 'Custom Software & Integrations',
    category: 'Software',
    summary: 'When you need a product rather than a service: web platforms, internal tools, system integrations and branded assistants built to your specification.',
    description:
      'Design, build and delivery of software to an agreed specification — from a single integration between two systems to a ' +
      'complete multi-tenant platform — with releases you review and accept at each milestone.',
    benefits: [
      'Software specified around how your business works',
      'Milestone-based delivery with acceptance at every stage',
      'Documentation and handover included',
    ],
    deliverables: [
      'Specification and delivery plan',
      'Tested software releases',
      'Technical and user documentation',
      'Handover and support period',
    ],
    scope: 'Defined by an agreed specification. Hosting and third-party licences are quoted separately.',
    pricingModel: 'quote',
    priceAmount: null,
    currency: 'USD',
    billingInterval: null,
    deliveryTimeframe: 'Quoted per project after requirements review',
    terms: STANDARD_TERMS,
    sortOrder: 60,
    internalFulfilment: { serviceLine: 'software' },
  },
];
