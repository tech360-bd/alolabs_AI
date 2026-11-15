/** Client-side shape of a service from /api/portal/services, and its price label. */

export interface ServiceView {
  id: string
  slug: string
  name: string
  category: string
  summary: string
  description: string
  benefits: string[]
  deliverables: string[]
  scope: string
  pricing: { type: string; amount: number | null; currency: string; interval: string | null }
  deliveryTimeframe: string
  terms: string
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${currency} ${amount}`
  }
}

export function priceLabel(p: ServiceView['pricing']): string {
  if (p.amount === null || p.type === 'quote') return 'Priced by quotation'
  const per = p.interval ? ` / ${p.interval}` : ''
  return p.type === 'starting_at' ? `From ${money(p.amount, p.currency)}${per}` : `${money(p.amount, p.currency)}${per}`
}
