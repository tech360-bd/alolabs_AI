/**
 * InvoiceDocument — a real invoice printed on the ALO Labs letterhead.
 *
 * House policy: no fee for new build work. The document therefore carries the
 * full arithmetic (lines, subtotal, discount, tax, balance) with a zero balance
 * and states the avoided cost — what the same workload would have cost on paid
 * APIs — as the headline figure.
 */

import * as React from 'react'
import { Letterhead } from './letterhead'
import { BRAND } from '@/lib/brand/tokens'
import {
  computeInvoice,
  formatDate,
  formatMoney,
  formatPeriod,
  type Invoice,
} from '@/lib/brand/invoice'

export function InvoiceDocument({ invoice }: { invoice: Invoice }) {
  const totals = computeInvoice(invoice)
  const money = (n: number) => formatMoney(n, invoice.meta.currency)
  const period = formatPeriod(invoice.meta)

  return (
    <Letterhead>
      {/* Masthead */}
      <div className="flex items-start justify-between gap-8">
        <div>
          <h1 className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em]" style={{ color: BRAND.orange }}>
            Invoice
          </h1>
          <p className="mt-2 text-[26px] font-bold leading-tight" style={{ color: BRAND.blue }}>
            {invoice.meta.project}
          </p>
          <p className="mt-1 text-[12px]" style={{ color: BRAND.gray }}>
            {invoice.meta.number}
            {period ? ` · ${period}` : ''}
            {invoice.meta.reference ? ` · ${invoice.meta.reference}` : ''}
          </p>
        </div>
        <dl className="w-[210px] shrink-0 text-right">
          <MetaRow label="Issued" value={formatDate(invoice.meta.issued)} />
          <MetaRow label="Currency" value={invoice.meta.currency} />
          <MetaRow label="Status" value={invoice.policy.chargeable ? 'Payable' : 'No charge'} />
        </dl>
      </div>

      <div className="mt-8 h-px w-full" style={{ background: BRAND.grayLine }} />

      {/* Parties */}
      <div className="mt-6 grid grid-cols-2 gap-8">
        <PartyBlock title="From" name={invoice.from.name} lines={invoice.from.lines} email={invoice.from.email} />
        <PartyBlock title="Prepared for" name={invoice.to.name} lines={invoice.to.lines} email={invoice.to.email} />
      </div>

      {/* Lines */}
      <table className="mt-8 w-full border-collapse text-left">
        <thead>
          <tr>
            <Th className="w-[46%]">Item</Th>
            <Th className="text-right">Qty</Th>
            <Th className="text-right">Rate</Th>
            <Th className="text-right">Amount</Th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((line) => (
            <tr key={line.id} className="align-top" style={{ borderTop: `1px solid ${BRAND.grayLine}` }}>
              <td className="py-3 pr-3">
                <p className="text-[12px] font-semibold" style={{ color: BRAND.ink }}>
                  {line.description}
                </p>
                {line.detail ? (
                  <p className="mt-0.5 font-mono text-[10px]" style={{ color: BRAND.gray }}>
                    {line.detail}
                  </p>
                ) : null}
              </td>
              <td className="py-3 text-right font-mono text-[11px]" style={{ color: BRAND.ink }}>
                {line.quantity.toLocaleString('en-US')}
                <span className="block text-[9px]" style={{ color: BRAND.graySoft }}>
                  {line.unit}
                </span>
              </td>
              <td className="py-3 text-right font-mono text-[11px]" style={{ color: BRAND.ink }}>
                {money(line.rate)}
              </td>
              <td className="py-3 text-right font-mono text-[11px] font-semibold" style={{ color: BRAND.ink }}>
                {money(line.quantity * line.rate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="mt-8 flex items-start justify-between gap-10">
        <div className="max-w-[360px] rounded-md p-4" style={{ background: BRAND.canvas, border: `1px solid ${BRAND.grayLine}` }}>
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em]" style={{ color: BRAND.blue }}>
            Policy
          </p>
          <p className="mt-2 text-[11px] leading-relaxed" style={{ color: BRAND.gray }}>
            {invoice.policy.note}
          </p>
        </div>
        <dl className="w-[280px] shrink-0">
          <TotalRow label="Subtotal" value={money(totals.subtotal)} />
          <TotalRow label={`Contribution (${Math.round(invoice.policy.discountRate * 100)}%)`} value={`− ${money(totals.discount)}`} />
          {totals.tax > 0 ? <TotalRow label="Tax" value={money(totals.tax)} /> : null}
          <div className="mt-2 flex items-center justify-between rounded-md px-3 py-2" style={{ background: BRAND.blue }}>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-white">Balance due</span>
            <span className="font-mono text-[15px] font-bold text-white">{money(totals.total)}</span>
          </div>
          <div
            className="mt-3 rounded-md px-3 py-3"
            style={{ background: 'rgba(255,106,0,0.08)', border: `1px solid ${BRAND.orange}` }}
          >
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em]" style={{ color: BRAND.orange }}>
              Cost avoided
            </p>
            <p className="mt-1 font-mono text-[22px] font-bold leading-none" style={{ color: BRAND.blue }}>
              {money(totals.avoided || totals.net)}
            </p>
            <p className="mt-1.5 text-[10px] leading-snug" style={{ color: BRAND.gray }}>
              What this period would have cost on equivalent paid APIs.
            </p>
          </div>
        </dl>
      </div>

      {/* Notes */}
      {invoice.notes?.length ? (
        <ul className="mt-8 space-y-1.5">
          {invoice.notes.map((note) => (
            <li key={note} className="flex gap-2 text-[10px] leading-relaxed" style={{ color: BRAND.gray }}>
              <span aria-hidden="true" style={{ color: BRAND.orange }}>
                ▪
              </span>
              <span>{note}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Letterhead>
  )
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`pb-2 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] ${className ?? ''}`}
      style={{ color: BRAND.gray }}
      scope="col"
    >
      {children}
    </th>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b py-1.5" style={{ borderColor: BRAND.grayLine }}>
      <dt className="font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: BRAND.graySoft }}>
        {label}
      </dt>
      <dd className="font-mono text-[10px] font-semibold" style={{ color: BRAND.ink }}>
        {value}
      </dd>
    </div>
  )
}

function PartyBlock({
  title,
  name,
  lines,
  email,
}: {
  title: string
  name: string
  lines: string[]
  email?: string
}) {
  return (
    <div>
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em]" style={{ color: BRAND.graySoft }}>
        {title}
      </p>
      <p className="mt-1.5 text-[12px] font-semibold" style={{ color: BRAND.blue }}>
        {name}
      </p>
      {lines.map((line) => (
        <p key={line} className="text-[10px] leading-snug" style={{ color: BRAND.gray }}>
          {line}
        </p>
      ))}
      {email ? (
        <p className="mt-1 font-mono text-[10px]" style={{ color: BRAND.ink }}>
          {email}
        </p>
      ) : null}
    </div>
  )
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b py-1.5" style={{ borderColor: BRAND.grayLine }}>
      <dt className="text-[11px]" style={{ color: BRAND.gray }}>
        {label}
      </dt>
      <dd className="font-mono text-[11px] font-semibold" style={{ color: BRAND.ink }}>
        {value}
      </dd>
    </div>
  )
}
