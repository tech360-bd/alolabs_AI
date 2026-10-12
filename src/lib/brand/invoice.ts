/**
 * Invoice model + arithmetic.
 *
 * The house policy this encodes: ALO Labs does not charge for new build work,
 * but every delivery is documented on the company letterhead with the cost the
 * same work would have carried on paid APIs. The document is therefore a real
 * invoice — lines, rate, subtotal, discount, tax — whose balance is zero and
 * which states the avoided amount prominently.
 *
 * Pure functions only: the same numbers drive the on-screen document, the print
 * view and the tests.
 */

export interface InvoiceLine {
  id: string
  description: string
  /** Technical sub-label — model, unit or endpoint. */
  detail?: string
  quantity: number
  /** Unit label shown after the quantity (calls, minutes, pages, seats…). */
  unit: string
  /** Unit price in the invoice currency. */
  rate: number
}

export interface InvoiceParty {
  name: string
  lines: string[]
  email?: string
}

export interface InvoiceMeta {
  number: string
  /** ISO date. */
  issued: string
  /** ISO date. */
  periodStart?: string
  periodEnd?: string
  project: string
  currency: 'USD'
  /** Po reference or statement of work id. */
  reference?: string
}

export interface InvoicePolicy {
  /** Fraction of the subtotal written off, 0–1. 1 = the house policy. */
  discountRate: number
  taxRate: number
  /** When false the balance is zero and the avoided amount is the headline. */
  chargeable: boolean
  note: string
}

export interface Invoice {
  meta: InvoiceMeta
  from: InvoiceParty
  to: InvoiceParty
  lines: InvoiceLine[]
  policy: InvoicePolicy
  notes?: string[]
}

export interface InvoiceTotals {
  subtotal: number
  discount: number
  net: number
  tax: number
  /** What the client pays (0 under the house policy). */
  total: number
  /** What the same work would have cost on paid APIs. */
  avoided: number
  lineCount: number
}

const cents = (n: number) => Math.round(n * 100) / 100

/** Totals for one invoice. Every amount is rounded once, at the cent. */
export function computeInvoice(invoice: Invoice): InvoiceTotals {
  const subtotal = cents(
    invoice.lines.reduce((sum, l) => sum + cents(l.quantity * l.rate), 0),
  )
  const discount = cents(subtotal * clamp(invoice.policy.discountRate))
  const net = cents(subtotal - discount)
  const tax = cents(net * clamp(invoice.policy.taxRate))
  const gross = cents(net + tax)
  const chargeable = invoice.policy.chargeable
  return {
    subtotal,
    discount,
    net,
    tax,
    total: chargeable ? gross : 0,
    avoided: chargeable ? 0 : gross,
    lineCount: invoice.lines.length,
  }
}

function clamp(rate: number): number {
  if (!Number.isFinite(rate) || rate < 0) return 0
  return Math.min(rate, 1)
}

export function formatMoney(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(d)
}

export function formatPeriod(meta: InvoiceMeta): string {
  if (!meta.periodStart || !meta.periodEnd) return ''
  return `${formatDate(meta.periodStart)} — ${formatDate(meta.periodEnd)}`
}

/**
 * The default invoice: one line per paid-API equivalent replaced by AgentOS in
 * the period. Rates are list prices at the time of writing and exist so the
 * document can show a defensible avoided cost.
 */
export function sampleInvoice(): Invoice {
  return {
    meta: {
      number: 'ALO-2026-0001',
      issued: '2026-10-08',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      project: 'AgentOS — September build & operations',
      currency: 'USD',
      reference: 'SOW-AGENTOS-2026',
    },
    from: {
      name: 'ALO Labs — AgentOS',
      lines: ['SOLE MBR', '117 S LEXINGTON ST STE 100', 'HARRISONVILLE, MO 64701'],
      email: 'info@alolabs.net',
    },
    to: {
      name: 'ALO Labs — Internal / Product Owner',
      lines: ['AgentOS platform account', 'command.alolabs.net'],
      email: 'info@alolabs.net',
    },
    lines: [
      {
        id: 'l1',
        description: 'Long-context reasoning',
        detail: 'frontier model · 41.2M tokens in / 6.8M out',
        quantity: 48_000,
        unit: 'k tokens',
        rate: 0.0125,
      },
      {
        id: 'l2',
        description: 'Agentic tool calls',
        detail: 'tool-calling loop · 1020 agents',
        quantity: 310_000,
        unit: 'calls',
        rate: 0.0021,
      },
      {
        id: 'l3',
        description: 'Voice agents',
        detail: 'speech synthesis + streaming STT',
        quantity: 2_400,
        unit: 'minutes',
        rate: 0.18,
      },
      {
        id: 'l4',
        description: 'Web research & enrichment',
        detail: 'crawl → markdown → extract',
        quantity: 86_000,
        unit: 'pages',
        rate: 0.0014,
      },
      {
        id: 'l5',
        description: 'Vector + graph store',
        detail: 'hybrid RAG · classic, graph, agentic',
        quantity: 1,
        unit: 'month',
        rate: 640,
      },
      {
        id: 'l6',
        description: 'Document intelligence',
        detail: 'OCR + table extraction · student ops',
        quantity: 12_500,
        unit: 'pages',
        rate: 0.008,
      },
    ],
    policy: {
      discountRate: 1,
      taxRate: 0,
      chargeable: false,
      note:
        'No fee is charged for new build work. This document records the amount the same workload would have cost on paid APIs, so the value delivered is on file.',
    },
    notes: [
      'All figures are modelled on published list prices for the equivalent managed services, measured over the period shown.',
      'Delivered on the ALO Labs AgentOS platform — 1 Command Center · 1020 AI Agents · 100+ Departments.',
      'Questions about this statement: info@alolabs.net · +1 (347) 433 1200.',
    ],
  }
}

/** Plain-text rendering — used by the copy-to-clipboard action and by tests. */
export function invoiceToText(invoice: Invoice): string {
  const totals = computeInvoice(invoice)
  const rows = invoice.lines.map(
    (l) => `${l.description} (${l.detail ?? ''}) — ${l.quantity.toLocaleString('en-US')} ${l.unit} @ ${formatMoney(l.rate, invoice.meta.currency)} = ${formatMoney(l.quantity * l.rate, invoice.meta.currency)}`,
  )
  return [
    `${invoice.from.name} · Invoice ${invoice.meta.number}`,
    `Issued ${formatDate(invoice.meta.issued)}${formatPeriod(invoice.meta) ? ` · period ${formatPeriod(invoice.meta)}` : ''}`,
    `Project: ${invoice.meta.project}`,
    '',
    ...rows,
    '',
    `Subtotal ${formatMoney(totals.subtotal, invoice.meta.currency)}`,
    `Discount ${formatMoney(totals.discount, invoice.meta.currency)}`,
    totals.tax ? `Tax ${formatMoney(totals.tax, invoice.meta.currency)}` : '',
    `Total due ${formatMoney(totals.total, invoice.meta.currency)}`,
    `Cost avoided ${formatMoney(totals.avoided, invoice.meta.currency)}`,
    '',
    invoice.policy.note,
  ]
    .filter(Boolean)
    .join('\n')
}
