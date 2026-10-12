'use client'

/**
 * Invoice panel — issue a statement on the letterhead from inside the app.
 *
 * Renders the same document as `/invoice`, without the marketing header, and
 * adds a small composer so an operator can adjust the period, project and
 * discount policy before printing.
 */

import * as React from 'react'
import { InvoiceDocument } from './invoice-document'
import { computeInvoice, formatMoney, sampleInvoice, type Invoice } from '@/lib/brand/invoice'
import { BRAND } from '@/lib/brand/tokens'
import { SendInvoiceDialog } from './send-invoice-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Printer } from 'lucide-react'

export default function InvoicePanel() {
  const [invoice, setInvoice] = React.useState<Invoice>(() => sampleInvoice())
  const totals = computeInvoice(invoice)
  const money = (n: number) => formatMoney(n, invoice.meta.currency)

  return (
    <div className="space-y-6">
      <div className="no-print">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">Finance &amp; brand</p>
        <h2 className="mt-1 text-3xl font-normal tracking-tight text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>
          Invoice on the letterhead
        </h2>
        <p className="mt-1 max-w-[80ch] text-sm text-slate-600">
          No fee is charged for new build work. This document records the same workload at paid-API list prices, prints
          on the official A4 pad, and states the avoided cost as the headline figure.
        </p>
      </div>

      <div className="alo-print-flow grid gap-6 xl:grid-cols-[320px_1fr]">
        <aside className="no-print space-y-4">
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
            <div>
              <Label htmlFor="inv-number" className="text-[11px] uppercase tracking-wider text-slate-500">
                Invoice number
              </Label>
              <Input
                id="inv-number"
                value={invoice.meta.number}
                onChange={(e) => setInvoice({ ...invoice, meta: { ...invoice.meta, number: e.target.value } })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="inv-project" className="text-[11px] uppercase tracking-wider text-slate-500">
                Project
              </Label>
              <Input
                id="inv-project"
                value={invoice.meta.project}
                onChange={(e) => setInvoice({ ...invoice, meta: { ...invoice.meta, project: e.target.value } })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="inv-discount" className="text-[11px] uppercase tracking-wider text-slate-500">
                Contribution (%)
              </Label>
              <Input
                id="inv-discount"
                type="number"
                min={0}
                max={100}
                value={Math.round(invoice.policy.discountRate * 100)}
                onChange={(e) =>
                  setInvoice({
                    ...invoice,
                    policy: { ...invoice.policy, discountRate: Math.min(1, Math.max(0, Number(e.target.value) / 100)) },
                  })
                }
                className="mt-1.5"
              />
            </div>
            <label className="flex items-center gap-2 text-[12px] text-slate-600">
              <input
                type="checkbox"
                checked={invoice.policy.chargeable}
                onChange={(e) => setInvoice({ ...invoice, policy: { ...invoice.policy, chargeable: e.target.checked } })}
                className="size-3.5"
                style={{ accentColor: BRAND.orange }}
              />
              Chargeable (unchecked = house no-fee policy)
            </label>
            <Button className="w-full gap-1.5" style={{ background: BRAND.orange }} onClick={() => window.print()}>
              <Printer className="size-3.5" /> Print / save PDF
            </Button>
            <SendInvoiceDialog invoice={invoice} />
          </div>

          <dl className="space-y-2 rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-baseline justify-between">
              <dt className="text-[11px] text-slate-500">Subtotal</dt>
              <dd className="font-mono text-[12px] font-semibold text-slate-900">{money(totals.subtotal)}</dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-[11px] text-slate-500">Contribution</dt>
              <dd className="font-mono text-[12px] font-semibold text-slate-900">− {money(totals.discount)}</dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-[11px] text-slate-500">Balance due</dt>
              <dd className="font-mono text-[13px] font-bold" style={{ color: BRAND.blue }}>
                {money(totals.total)}
              </dd>
            </div>
            <div
              className="mt-2 rounded-lg p-3"
              style={{ background: 'rgba(255,106,0,0.08)', border: `1px solid ${BRAND.orange}` }}
            >
              <dt className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: BRAND.orange }}>
                Cost avoided
              </dt>
              <dd className="mt-1 font-mono text-xl font-bold" style={{ color: BRAND.blue }}>
                {money(totals.avoided || totals.net)}
              </dd>
            </div>
          </dl>
        </aside>

        <div className="alo-sheet-frame">
          <InvoiceDocument invoice={invoice} />
        </div>
      </div>
    </div>
  )
}
