/**
 * invoice-html — the letterhead as portable HTML.
 *
 * The on-screen invoice is React + Tailwind. Email clients and PDF renderers
 * only understand tables and inline styles, so this module renders the same
 * document — same frame, same masthead, same contact strip, same arithmetic —
 * as a single self-contained HTML string.
 *
 * Used by the "Send invoice" action (posted to /api/email/send) and by anything
 * else that needs the pad without the app.
 */

import { BRAND, COMPANY, BRAND_FONTS } from './tokens'
import { computeInvoice, formatDate, formatMoney, formatPeriod, type Invoice } from './invoice'

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** Mark used inside the HTML pad — inline SVG so no asset fetch is required. */
const MARK_SVG = `<svg width="54" height="54" viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="ALO Labs AgentOS"><path d="M120 22 L210 73 L210 167 L120 218 L30 167 L30 73 Z" fill="none" stroke="${BRAND.orange}" stroke-width="16" stroke-linejoin="round"/><path d="M120 56 L70 184 L102 184 L132 88 Z" fill="#0047A1"/><path d="M120 56 L170 184 L138 184 L108 88 Z" fill="${BRAND.blue}"/><path d="M62 146 L152 118 L152 148 L94 174 Z" fill="${BRAND.blueLight}"/><rect x="102" y="155" width="52" height="26" rx="13" fill="${BRAND.orange}" transform="rotate(-9 128 168)"/></svg>`

export interface InvoiceHtmlOptions {
  /** Render the four-item contact strip across the foot (default true). */
  contactStrip?: boolean
  /** Add the “open in browser” style lead-in above the document. */
  intro?: string
  /** Print rules + page size, so the document can be saved as a true A4 PDF. */
  printStyles?: boolean
}

const CONTACT_ITEMS = [
  {
    label: 'Address',
    value: [COMPANY.entity, ...COMPANY.address],
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z" stroke="${BRAND.orange}" stroke-width="2"/><circle cx="12" cy="10" r="2.5" fill="${BRAND.orange}"/></svg>`,
  },
  {
    label: 'Phone',
    value: [COMPANY.phone],
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 4h4l2 5-2.5 1.5a12 12 0 0 0 6 6L15 14l5 2v4h-2A14 14 0 0 1 4 6V4z" stroke="${BRAND.orange}" stroke-width="2" stroke-linejoin="round"/></svg>`,
  },
  {
    label: 'Website',
    value: [COMPANY.website],
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="${BRAND.orange}" stroke-width="2"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" stroke="${BRAND.orange}" stroke-width="2"/></svg>`,
  },
  {
    label: 'Email',
    value: [COMPANY.email],
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" stroke="${BRAND.orange}" stroke-width="2"/><path d="m4 7 8 6 8-6" stroke="${BRAND.orange}" stroke-width="2"/></svg>`,
  },
]

/** The whole invoice as a standalone HTML document. */
export function invoiceToHtml(invoice: Invoice, options: InvoiceHtmlOptions = {}): string {
  const { contactStrip = true, intro, printStyles = true } = options
  const totals = computeInvoice(invoice)
  const money = (n: number) => formatMoney(n, invoice.meta.currency)
  const period = formatPeriod(invoice.meta)
  const font = BRAND_FONTS.primary.stack.replace(/'/g, "'")

  const lines = invoice.lines
    .map(
      (line) => `
      <tr>
        <td style="padding:11px 12px 11px 0;border-top:1px solid ${BRAND.grayLine};vertical-align:top">
          <div style="font-size:12px;font-weight:600;color:${BRAND.ink}">${escapeHtml(line.description)}</div>
          ${line.detail ? `<div style="margin-top:2px;font-family:'Geist Mono',ui-monospace,monospace;font-size:10px;color:${BRAND.gray}">${escapeHtml(line.detail)}</div>` : ''}
        </td>
        <td style="padding:11px 12px 11px 0;border-top:1px solid ${BRAND.grayLine};text-align:right;font-family:'Geist Mono',ui-monospace,monospace;font-size:11px;color:${BRAND.ink};vertical-align:top">
          ${line.quantity.toLocaleString('en-US')}
          <div style="font-size:9px;color:${BRAND.graySoft}">${escapeHtml(line.unit)}</div>
        </td>
        <td style="padding:11px 12px 11px 0;border-top:1px solid ${BRAND.grayLine};text-align:right;font-family:'Geist Mono',ui-monospace,monospace;font-size:11px;color:${BRAND.ink};vertical-align:top">${money(line.rate)}</td>
        <td style="padding:11px 0;border-top:1px solid ${BRAND.grayLine};text-align:right;font-family:'Geist Mono',ui-monospace,monospace;font-size:11px;font-weight:600;color:${BRAND.ink};vertical-align:top">${money(line.quantity * line.rate)}</td>
      </tr>`,
    )
    .join('')

  const totalRow = (label: string, value: string) => `
      <tr>
        <td style="padding:6px 0;border-bottom:1px solid ${BRAND.grayLine};font-size:11px;color:${BRAND.gray}">${label}</td>
        <td style="padding:6px 0;border-bottom:1px solid ${BRAND.grayLine};text-align:right;font-family:'Geist Mono',ui-monospace,monospace;font-size:11px;font-weight:600;color:${BRAND.ink}">${value}</td>
      </tr>`

  const notes = (invoice.notes ?? [])
    .map(
      (note) =>
        `<li style="margin:0 0 5px;font-size:10px;line-height:1.5;color:${BRAND.gray}">${escapeHtml(note)}</li>`,
    )
    .join('')

  const contact = !contactStrip
    ? ''
    : `
    <tr>
      <td style="background:${BRAND.blue};padding:18px 26px 20px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            ${CONTACT_ITEMS.map(
              (item) => `<td width="25%" valign="top" style="padding-right:10px">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                <td width="34" valign="top"><div style="width:28px;height:28px;border-radius:14px;background:#ffffff;text-align:center;line-height:28px">${item.icon}</div></td>
                <td valign="top" style="padding-left:8px">
                  <div style="font-family:'Geist Mono',ui-monospace,monospace;font-size:9px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#ffffff">${item.label}</div>
                  ${item.value
                    .map(
                      (v) =>
                        `<div style="font-family:${font};font-size:10px;line-height:1.45;color:rgba(255,255,255,0.92)">${escapeHtml(v)}</div>`,
                    )
                    .join('')}
                </td>
              </tr></table>
            </td>`,
            ).join('')}
          </tr>
        </table>
      </td>
    </tr>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Invoice ${escapeHtml(invoice.meta.number)} — ${escapeHtml(COMPANY.legalName)} ${escapeHtml(COMPANY.product)}</title>
${printStyles ? `<style>@page{size:A4;margin:0}body{margin:0;background:${BRAND.canvas};-webkit-print-color-adjust:exact;print-color-adjust:exact}@media print{body{background:#ffffff}.alo-pad{box-shadow:none !important;margin:0 !important}}</style>` : ''}
</head>
<body style="margin:0;padding:24px 12px;background:${BRAND.canvas};font-family:${font}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td align="center">
    <table role="presentation" class="alo-pad" width="794" cellpadding="0" cellspacing="0" border="0"
      style="width:794px;max-width:100%;background:#ffffff;border:9px solid ${BRAND.orange};border-radius:14px">
      ${
        intro
          ? `<tr><td style="padding:16px 26px 0;font-size:11px;color:${BRAND.gray}">${escapeHtml(intro)}</td></tr>`
          : ''
      }
      <tr>
        <td style="background:${BRAND.blue};padding:0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="padding:14px 26px 10px">${MARK_SVG}</td>
            <td align="right" style="padding:14px 26px 10px;font-family:'Geist Mono',ui-monospace,monospace;font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.85)">
              ${escapeHtml(COMPANY.legalName)} · ${escapeHtml(COMPANY.product)}<br />
              <span style="font-size:11px">${escapeHtml(COMPANY.domains[0].value)}</span>
            </td>
          </tr></table>
        </td>
      </tr>
      <tr>
        <td style="padding:26px 34px 28px">
          <div style="font-family:'Geist Mono',ui-monospace,monospace;font-size:10px;font-weight:700;letter-spacing:0.24em;text-transform:uppercase;color:${BRAND.orange}">Invoice</div>
          <div style="margin-top:8px;font-size:24px;font-weight:700;line-height:1.25;color:${BRAND.blue}">${escapeHtml(invoice.meta.project)}</div>
          <div style="margin-top:5px;font-size:12px;color:${BRAND.gray}">${escapeHtml(invoice.meta.number)}${period ? ` · ${escapeHtml(period)}` : ''}${invoice.meta.reference ? ` · ${escapeHtml(invoice.meta.reference)}` : ''}</div>
          <div style="margin-top:6px;font-family:'Geist Mono',ui-monospace,monospace;font-size:10px;color:${BRAND.gray}">
            Issued ${escapeHtml(formatDate(invoice.meta.issued))} · Currency ${escapeHtml(invoice.meta.currency)} ·
            ${invoice.policy.chargeable ? 'Payable' : 'No charge'}
          </div>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px">
            <tr>
              <td width="50%" valign="top" style="padding-right:14px">
                <div style="font-family:'Geist Mono',ui-monospace,monospace;font-size:9px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:${BRAND.graySoft}">From</div>
                <div style="margin-top:5px;font-size:12px;font-weight:600;color:${BRAND.blue}">${escapeHtml(invoice.from.name)}</div>
                ${invoice.from.lines.map((l) => `<div style="font-size:10px;color:${BRAND.gray}">${escapeHtml(l)}</div>`).join('')}
              </td>
              <td width="50%" valign="top">
                <div style="font-family:'Geist Mono',ui-monospace,monospace;font-size:9px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:${BRAND.graySoft}">Prepared for</div>
                <div style="margin-top:5px;font-size:12px;font-weight:600;color:${BRAND.blue}">${escapeHtml(invoice.to.name)}</div>
                ${invoice.to.lines.map((l) => `<div style="font-size:10px;color:${BRAND.gray}">${escapeHtml(l)}</div>`).join('')}
              </td>
            </tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px">
            <tr>
              <th align="left" style="padding-bottom:8px;font-family:'Geist Mono',ui-monospace,monospace;font-size:9px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${BRAND.gray}">Item</th>
              <th align="right" style="padding-bottom:8px;font-family:'Geist Mono',ui-monospace,monospace;font-size:9px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${BRAND.gray}">Qty</th>
              <th align="right" style="padding-bottom:8px;font-family:'Geist Mono',ui-monospace,monospace;font-size:9px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${BRAND.gray}">Rate</th>
              <th align="right" style="padding-bottom:8px;font-family:'Geist Mono',ui-monospace,monospace;font-size:9px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${BRAND.gray}">Amount</th>
            </tr>
            ${lines}
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px">
            <tr>
              <td width="52%" valign="top" style="padding-right:18px">
                <div style="background:${BRAND.canvas};border:1px solid ${BRAND.grayLine};border-radius:6px;padding:14px">
                  <div style="font-family:'Geist Mono',ui-monospace,monospace;font-size:9px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:${BRAND.blue}">Policy</div>
                  <div style="margin-top:7px;font-size:11px;line-height:1.6;color:${BRAND.gray}">${escapeHtml(invoice.policy.note)}</div>
                </div>
              </td>
              <td width="48%" valign="top">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  ${totalRow('Subtotal', money(totals.subtotal))}
                  ${totalRow(`Contribution (${Math.round(invoice.policy.discountRate * 100)}%)`, `− ${money(totals.discount)}`)}
                  ${totals.tax > 0 ? totalRow('Tax', money(totals.tax)) : ''}
                </table>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px">
                  <tr>
                    <td style="background:${BRAND.blue};border-radius:6px;padding:10px 12px">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                        <td style="font-family:'Geist Mono',ui-monospace,monospace;font-size:10px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#ffffff">Balance due</td>
                        <td align="right" style="font-family:'Geist Mono',ui-monospace,monospace;font-size:15px;font-weight:700;color:#ffffff">${money(totals.total)}</td>
                      </tr></table>
                    </td>
                  </tr>
                </table>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px">
                  <tr>
                    <td style="background:rgba(255,106,0,0.08);border:1px solid ${BRAND.orange};border-radius:6px;padding:12px">
                      <div style="font-family:'Geist Mono',ui-monospace,monospace;font-size:9px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:${BRAND.orange}">Cost avoided</div>
                      <div style="margin-top:5px;font-family:'Geist Mono',ui-monospace,monospace;font-size:22px;font-weight:700;line-height:1;color:${BRAND.blue}">${money(totals.avoided || totals.net)}</div>
                      <div style="margin-top:6px;font-size:10px;line-height:1.45;color:${BRAND.gray}">What this period would have cost on equivalent paid APIs.</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          ${notes ? `<ul style="margin:24px 0 0;padding:0 0 0 14px">${notes}</ul>` : ''}
        </td>
      </tr>
      ${contact}
    </table>
    <div style="margin-top:10px;font-family:'Geist Mono',ui-monospace,monospace;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND.graySoft}">
      ${escapeHtml(COMPANY.legalName)} ${escapeHtml(COMPANY.product)} · ${escapeHtml(COMPANY.tagline)} · ${escapeHtml(COMPANY.promise)}
    </div>
  </td></tr>
</table>
</body>
</html>`
}

/** Subject line for the emailed invoice. */
export function invoiceEmailSubject(invoice: Invoice): string {
  return `Invoice ${invoice.meta.number} — ${invoice.meta.project} (cost avoided)`
}

/** Plain-text alternative part for the multipart email. */
export function invoiceEmailText(invoice: Invoice): string {
  const totals = computeInvoice(invoice)
  return [
    `Invoice ${invoice.meta.number}`,
    invoice.meta.project,
    `Issued ${formatDate(invoice.meta.issued)}`,
    '',
    'No fee is charged for new build work. This statement records what the same',
    'workload would have cost on equivalent paid APIs.',
    '',
    `Balance due: ${formatMoney(totals.total, invoice.meta.currency)}`,
    `Cost avoided: ${formatMoney(totals.avoided || totals.net, invoice.meta.currency)}`,
    '',
    `${COMPANY.legalName} ${COMPANY.product} · ${COMPANY.addressOneLine}`,
    `${COMPANY.email} · ${COMPANY.phone} · ${COMPANY.website}`,
  ].join('\n')
}
