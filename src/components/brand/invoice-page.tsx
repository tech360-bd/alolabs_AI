'use client'

/**
 * InvoicePage — the printable invoice.
 *
 * Left column explains the policy and the arithmetic; the right column is the
 * letterhead document itself. `Print` sends the sheet to A4 with the browser
 * chrome suppressed (see the print rules in globals.css).
 */

import * as React from 'react'
import Link from 'next/link'
import { InvoiceDocument } from './invoice-document'
import { AloLabsLogo } from './alo-logo'
import { BRAND, COMPANY } from '@/lib/brand/tokens'
import {
  computeInvoice,
  formatMoney,
  invoiceToText,
  sampleInvoice,
  type Invoice,
} from '@/lib/brand/invoice'
import { invoiceToHtml } from '@/lib/brand/invoice-html'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ArrowLeft, Copy, Check, Printer, ShieldCheck, TrendingDown, FileCode2 } from 'lucide-react'

export function InvoicePage({ invoice = sampleInvoice() }: { invoice?: Invoice }) {
  const totals = computeInvoice(invoice)
  const money = (n: number) => formatMoney(n, invoice.meta.currency)
  const [copied, setCopied] = React.useState(false)

  /** Download the pad as one self-contained HTML file — email-ready, prints as A4. */
  const downloadHtml = () => {
    const html = invoiceToHtml(invoice)
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `invoice-${invoice.meta.number}.html`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast.success('Letterhead document downloaded', { description: `${invoice.meta.number}.html` })
  }

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(invoiceToText(invoice))
      setCopied(true)
      toast.success('Invoice copied as text')
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy — use Print instead')
    }
  }

  return (
    <div className="alo-print-page min-h-screen" style={{ background: BRAND.canvas }}>
      <header className="no-print border-b bg-white" style={{ borderColor: BRAND.grayLine }}>
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-4">
            <AloLabsLogo size={40} tagline />
            <span className="hidden h-8 w-px sm:block" style={{ background: BRAND.grayLine }} />
            <div className="hidden sm:block">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: BRAND.graySoft }}>
                Document
              </p>
              <p className="text-[13px] font-semibold" style={{ color: BRAND.blue }}>
                Invoice {invoice.meta.number}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="font-mono text-[10px] uppercase tracking-wider" style={{ background: BRAND.blue }}>
              {invoice.policy.chargeable ? 'Payable' : 'No charge policy'}
            </Badge>
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <Link href="/brand">
                <ArrowLeft className="size-3.5" /> Brand book
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={copyText}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} Copy as text
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={downloadHtml}>
              <FileCode2 className="size-3.5" /> Download as HTML
            </Button>
            <Button size="sm" className="gap-1.5" style={{ background: BRAND.orange }} onClick={() => window.print()}>
              <Printer className="size-3.5" /> Print / save PDF
            </Button>
          </div>
        </div>
      </header>

      <div className="alo-print-flow mx-auto grid max-w-[1400px] gap-8 px-6 py-8 xl:grid-cols-[380px_1fr]">
        <aside className="no-print space-y-5">
          <div className="rounded-xl border bg-white p-5" style={{ borderColor: BRAND.grayLine }}>
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em]" style={{ color: BRAND.orange }}>
              The policy
            </p>
            <h1 className="mt-2 text-xl font-bold" style={{ color: BRAND.blue }}>
              We don’t charge for new attempts
            </h1>
            <p className="mt-2 text-[12px] leading-relaxed" style={{ color: BRAND.gray }}>
              {invoice.policy.note}
            </p>
            <p className="mt-3 text-[12px] leading-relaxed" style={{ color: BRAND.gray }}>
              The document is issued on the official ALO Labs letterhead, carries the full arithmetic, and shows a zero
              balance — the avoided figure is what an equivalent paid stack would have billed.
            </p>
          </div>

          <div className="rounded-xl border bg-white p-5" style={{ borderColor: BRAND.grayLine }}>
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em]" style={{ color: BRAND.graySoft }}>
              The numbers
            </p>
            <dl className="mt-3 space-y-2">
              <Row label="Line items" value={String(totals.lineCount)} />
              <Row label="Subtotal" value={money(totals.subtotal)} />
              <Row label="Contribution" value={`− ${money(totals.discount)}`} />
              <Row label="Balance due" value={money(totals.total)} strong />
            </dl>
            <div
              className="mt-4 rounded-lg p-4"
              style={{ background: 'rgba(255,106,0,0.08)', border: `1px solid ${BRAND.orange}` }}
            >
              <div className="flex items-center gap-2">
                <TrendingDown className="size-4" style={{ color: BRAND.orange }} />
                <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em]" style={{ color: BRAND.orange }}>
                  Cost avoided
                </span>
              </div>
              <p className="mt-1.5 font-mono text-2xl font-bold" style={{ color: BRAND.blue }}>
                {money(totals.avoided || totals.net)}
              </p>
              <p className="mt-1 text-[11px]" style={{ color: BRAND.gray }}>
                Paid-API equivalent for the same period.
              </p>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-5" style={{ borderColor: BRAND.grayLine }}>
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4" style={{ color: BRAND.blue }} />
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em]" style={{ color: BRAND.graySoft }}>
                Issued by
              </p>
            </div>
            <p className="mt-2 text-[13px] font-semibold" style={{ color: BRAND.blue }}>
              {COMPANY.legalName} {COMPANY.product}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed" style={{ color: BRAND.gray }}>
              {COMPANY.entity}
              <br />
              {COMPANY.address[0]}
              <br />
              {COMPANY.address[1]}
            </p>
            <p className="mt-2 font-mono text-[11px]" style={{ color: BRAND.ink }}>
              {COMPANY.email} · {COMPANY.phone}
            </p>
          </div>
        </aside>

        <div className="alo-sheet-frame">
          <InvoiceDocument invoice={invoice} />
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between border-b pb-1.5" style={{ borderColor: BRAND.grayLine }}>
      <dt className="text-[11px]" style={{ color: BRAND.gray }}>
        {label}
      </dt>
      <dd className={strong ? 'font-mono text-[13px] font-bold' : 'font-mono text-[12px] font-semibold'} style={{ color: strong ? BRAND.blue : BRAND.ink }}>
        {value}
      </dd>
    </div>
  )
}
