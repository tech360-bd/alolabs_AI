'use client'

/**
 * /portal/billing — quotations to approve, invoices, payments and receipts,
 * the outstanding balance and any recurring services. These are the client's
 * charges for services; nothing about how ALO Labs runs is shown or stored here.
 */

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { BRAND } from '@/lib/brand/tokens'
import {
  ErrorBanner, LoadingRows, PortalPageHero, SectionCard, StatCard, StatusPill, fmtDay, fmtMoney, usePortalData, usePortalFetch,
} from '@/components/portal/portal-primitives'

interface Line { description: string; quantity: number; unitPrice: number; amount: number }
interface Quotation { id: string; number: string; title: string; lineItems: Line[]; subtotal: number; tax: number; total: number; currency: string; status: string; validUntil: string | null; notes: string | null; terms: string | null; issuedAt: string | null }
interface Invoice { id: string; number: string; title: string; lineItems: Line[]; subtotal: number; tax: number; total: number; amountPaid: number; balanceDue: number; currency: string; status: string; issuedAt: string | null; dueDate: string | null }
interface Payment { id: string; invoiceNumber?: string; receiptNumber: string; amount: number; currency: string; method: string; reference: string | null; paidAt: string | null }
interface Billing {
  currency: string
  summary: { totalInvoiced: number; totalPaid: number; outstandingBalance: number; overdueBalance: number }
  quotations: Quotation[]; invoices: Invoice[]; payments: Payment[]
  subscriptions: { projectId: string; service: string; title: string; billedEvery: string | null; since: string | null }[]
}

const METHODS: Record<string, string> = { bank_transfer: 'Bank transfer', card: 'Card', mobile_banking: 'Mobile banking', cash: 'Cash', other: 'Other' }

function Lines({ lines, currency, subtotal, tax, total }: { lines: Line[]; currency: string; subtotal: number; tax: number; total: number }) {
  return (
    <table className="mt-3 w-full text-left text-[13px]">
      <thead>
        <tr className="border-b text-[11px] uppercase tracking-[0.08em]" style={{ borderColor: BRAND.grayLine, color: BRAND.gray }}>
          <th className="py-2 font-semibold">Description</th>
          <th className="py-2 text-right font-semibold">Qty</th>
          <th className="py-2 text-right font-semibold">Unit price</th>
          <th className="py-2 text-right font-semibold">Amount</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => (
          <tr key={i} className="border-b" style={{ borderColor: BRAND.grayLine }}>
            <td className="py-2" style={{ color: BRAND.ink }}>{l.description}</td>
            <td className="py-2 text-right">{l.quantity}</td>
            <td className="py-2 text-right">{fmtMoney(l.unitPrice, currency)}</td>
            <td className="py-2 text-right">{fmtMoney(l.amount, currency)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr><td colSpan={3} className="pt-2 text-right" style={{ color: BRAND.gray }}>Subtotal</td><td className="pt-2 text-right">{fmtMoney(subtotal, currency)}</td></tr>
        {tax > 0 ? <tr><td colSpan={3} className="text-right" style={{ color: BRAND.gray }}>Tax</td><td className="text-right">{fmtMoney(tax, currency)}</td></tr> : null}
        <tr><td colSpan={3} className="text-right font-semibold" style={{ color: BRAND.ink }}>Total</td><td className="text-right font-bold" style={{ color: BRAND.blue }}>{fmtMoney(total, currency)}</td></tr>
      </tfoot>
    </table>
  )
}

export default function PortalBillingPage() {
  const { data, loading, error, reload } = usePortalData<Billing>('/billing')
  const { portalFetch } = usePortalFetch()
  const [open, setOpen] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState('')
  const [actionError, setActionError] = React.useState('')

  const respond = async (id: string, decision: 'accept' | 'decline') => {
    if (decision === 'decline' && !window.confirm('Decline this quotation?')) return
    setBusy(id)
    setActionError('')
    try {
      await portalFetch(`/quotations/${id}/respond`, { method: 'POST', body: JSON.stringify({ decision }) })
      reload()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      <PortalPageHero eyebrow="Billing" title="Quotations, invoices and payments" lead="Review and approve quotations, see what has been invoiced and paid, and download your payment receipts." />
      {actionError ? <div className="mb-4"><ErrorBanner message={actionError} /></div> : null}
      {loading ? <LoadingRows rows={4} /> : error ? <ErrorBanner message={error} onRetry={reload} /> : data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Outstanding balance" value={fmtMoney(data.summary.outstandingBalance, data.currency)} />
            <StatCard label="Overdue" value={fmtMoney(data.summary.overdueBalance, data.currency)} />
            <StatCard label="Total invoiced" value={fmtMoney(data.summary.totalInvoiced, data.currency)} />
            <StatCard label="Total paid" value={fmtMoney(data.summary.totalPaid, data.currency)} />
          </div>

          <SectionCard title="Quotations" description="A quotation must be accepted before work begins.">
            {data.quotations.length === 0 ? <p className="text-[13px]" style={{ color: BRAND.gray }}>No quotations yet.</p> : (
              <div className="space-y-3">
                {data.quotations.map((q) => (
                  <div key={q.id} className="rounded-md border p-4" style={{ borderColor: BRAND.grayLine }}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <button className="text-left" onClick={() => setOpen(open === q.id ? null : q.id)} aria-expanded={open === q.id}>
                        <span className="block text-[14px] font-semibold" style={{ color: BRAND.ink }}>{q.title}</span>
                        <span className="block text-[12px]" style={{ color: BRAND.gray }}>
                          {q.number} · issued {fmtDay(q.issuedAt)}{q.validUntil ? ` · valid until ${fmtDay(q.validUntil)}` : ''}
                        </span>
                      </button>
                      <div className="flex items-center gap-3">
                        <span className="text-[15px] font-bold" style={{ color: BRAND.blue }}>{fmtMoney(q.total, q.currency)}</span>
                        <StatusPill status={q.status} label={q.status === 'sent' ? 'Awaiting your response' : undefined} />
                      </div>
                    </div>
                    {open === q.id || q.status === 'sent' ? (
                      <>
                        <Lines lines={q.lineItems} currency={q.currency} subtotal={q.subtotal} tax={q.tax} total={q.total} />
                        {q.notes ? <p className="mt-3 text-[12px]" style={{ color: BRAND.gray }}>{q.notes}</p> : null}
                        {q.terms ? <p className="mt-2 text-[12px]" style={{ color: BRAND.gray }}><strong>Terms:</strong> {q.terms}</p> : null}
                      </>
                    ) : null}
                    {q.status === 'sent' ? (
                      <div className="mt-4 flex gap-2">
                        <Button disabled={busy === q.id} onClick={() => void respond(q.id, 'accept')} style={{ background: BRAND.orange, color: '#FFFFFF' }}>Accept quotation</Button>
                        <Button variant="outline" disabled={busy === q.id} onClick={() => void respond(q.id, 'decline')}>Decline</Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Invoices">
            {data.invoices.length === 0 ? <p className="text-[13px]" style={{ color: BRAND.gray }}>No invoices yet.</p> : (
              <div className="space-y-3">
                {data.invoices.map((inv) => (
                  <div key={inv.id} className="rounded-md border p-4" style={{ borderColor: BRAND.grayLine }}>
                    <button className="flex w-full flex-wrap items-start justify-between gap-3 text-left" onClick={() => setOpen(open === inv.id ? null : inv.id)} aria-expanded={open === inv.id}>
                      <span>
                        <span className="block text-[14px] font-semibold" style={{ color: BRAND.ink }}>{inv.number}{inv.title ? ` — ${inv.title}` : ''}</span>
                        <span className="block text-[12px]" style={{ color: BRAND.gray }}>Issued {fmtDay(inv.issuedAt)} · due {fmtDay(inv.dueDate)}</span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="text-right">
                          <span className="block text-[15px] font-bold" style={{ color: BRAND.blue }}>{fmtMoney(inv.total, inv.currency)}</span>
                          {inv.balanceDue > 0 ? <span className="block text-[11px]" style={{ color: BRAND.orange }}>{fmtMoney(inv.balanceDue, inv.currency)} due</span> : null}
                        </span>
                        <StatusPill status={inv.status} />
                      </span>
                    </button>
                    {open === inv.id ? <Lines lines={inv.lineItems} currency={inv.currency} subtotal={inv.subtotal} tax={inv.tax} total={inv.total} /> : null}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <div className="grid gap-6 lg:grid-cols-3">
            <SectionCard className="lg:col-span-2" title="Payment history" description="Each payment has a receipt number for your records.">
              {data.payments.length === 0 ? <p className="text-[13px]" style={{ color: BRAND.gray }}>No payments recorded yet.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[13px]">
                    <thead>
                      <tr className="border-b text-[11px] uppercase tracking-[0.08em]" style={{ borderColor: BRAND.grayLine, color: BRAND.gray }}>
                        <th className="py-2 font-semibold">Receipt</th><th className="py-2 font-semibold">Invoice</th><th className="py-2 font-semibold">Date</th>
                        <th className="py-2 font-semibold">Method</th><th className="py-2 text-right font-semibold">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.payments.map((p) => (
                        <tr key={p.id} className="border-b last:border-0" style={{ borderColor: BRAND.grayLine }}>
                          <td className="py-2 font-mono text-[12px]" style={{ color: BRAND.ink }}>{p.receiptNumber}</td>
                          <td className="py-2">{p.invoiceNumber}</td>
                          <td className="py-2" style={{ color: BRAND.gray }}>{fmtDay(p.paidAt)}</td>
                          <td className="py-2" style={{ color: BRAND.gray }}>{METHODS[p.method] ?? 'Other'}</td>
                          <td className="py-2 text-right font-semibold">{fmtMoney(p.amount, p.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Recurring services">
              {data.subscriptions.length === 0 ? <p className="text-[13px]" style={{ color: BRAND.gray }}>You have no recurring services.</p> : (
                <ul className="space-y-3">
                  {data.subscriptions.map((s) => (
                    <li key={s.projectId} className="text-[13px]">
                      <span className="block font-semibold" style={{ color: BRAND.ink }}>{s.service}</span>
                      <span className="block text-[12px]" style={{ color: BRAND.gray }}>{s.title} · billed every {s.billedEvery} · since {fmtDay(s.since)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        </div>
      ) : null}
    </>
  )
}
