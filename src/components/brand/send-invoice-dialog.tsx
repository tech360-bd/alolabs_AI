'use client'

/**
 * SendInvoiceDialog — emails the letterhead invoice.
 *
 * The pad travels as portable HTML (`invoiceToHtml`), so the recipient gets the
 * same document the operator sees, with the frame, the contact strip and the
 * cost-avoided figure. Sending uses the platform's own mail accounts through
 * /api/email/send, so nothing leaves the deployment.
 */

import * as React from 'react'
import { fetchApi } from '@/lib/api'
import { invoiceToHtml, invoiceEmailSubject, invoiceEmailText } from '@/lib/brand/invoice-html'
import { type Invoice } from '@/lib/brand/invoice'
import { BRAND, COMPANY } from '@/lib/brand/tokens'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Check, Loader2, Mail } from 'lucide-react'

interface EmailAccount {
  id: string
  label?: string
  email: string
  isActive: boolean
}

export function SendInvoiceDialog({ invoice }: { invoice: Invoice }) {
  const [open, setOpen] = React.useState(false)
  const [accounts, setAccounts] = React.useState<EmailAccount[] | null>(null)
  const [accountId, setAccountId] = React.useState('')
  const [to, setTo] = React.useState('')
  const [subject, setSubject] = React.useState(() => invoiceEmailSubject(invoice))
  const [sending, setSending] = React.useState(false)
  const [sentTo, setSentTo] = React.useState<string | null>(null)

  // Load the deployment's mail accounts the first time the dialog opens.
  React.useEffect(() => {
    if (!open || accounts !== null) return
    let cancelled = false
    fetchApi<{ data: EmailAccount[] }>('/api/email/accounts')
      .then((res) => {
        if (cancelled) return
        const list = res.data ?? []
        setAccounts(list)
        const firstActive = list.find((a) => a.isActive) ?? list[0]
        if (firstActive) setAccountId(firstActive.id)
      })
      .catch(() => {
        if (!cancelled) setAccounts([])
      })
    return () => {
      cancelled = true
    }
  }, [open, accounts])

  React.useEffect(() => setSubject(invoiceEmailSubject(invoice)), [invoice])

  const send = async () => {
    if (!accountId) {
      toast.error('No mail account configured', {
        description: 'Add one in Settings → Email accounts, then send again.',
      })
      return
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to.trim())) {
      toast.error('Enter a valid recipient address')
      return
    }
    setSending(true)
    try {
      await fetchApi('/api/email/send', {
        method: 'POST',
        body: JSON.stringify({
          accountId,
          to: [to.trim()],
          subject,
          html: invoiceToHtml(invoice, { intro: `Invoice from ${COMPANY.legalName} ${COMPANY.product}.` }),
          text: invoiceEmailText(invoice),
        }),
      })
      setSentTo(to.trim())
      toast.success('Invoice sent', { description: `Delivered to ${to.trim()}` })
    } catch (error) {
      toast.error('Could not send the invoice', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full gap-1.5">
          <Mail className="size-3.5" /> Send by email
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle style={{ color: BRAND.blue }}>Send the invoice</DialogTitle>
          <DialogDescription>
            The letterhead travels with the email — frame, contact strip and the cost-avoided figure included.
          </DialogDescription>
        </DialogHeader>

        {sentTo ? (
          <div className="space-y-3 py-2">
            <div className="flex items-start gap-3 rounded-lg border p-4" style={{ borderColor: BRAND.orange, background: 'rgba(255,106,0,0.06)' }}>
              <Check className="mt-0.5 size-4" style={{ color: BRAND.orange }} />
              <div>
                <p className="text-[13px] font-semibold" style={{ color: BRAND.blue }}>
                  Invoice {invoice.meta.number} sent
                </p>
                <p className="mt-1 text-[12px]" style={{ color: BRAND.gray }}>
                  Delivered to {sentTo} from the selected mail account. The sent message is stored in the email log.
                </p>
              </div>
            </div>
            <Button variant="outline" className="w-full" onClick={() => setSentTo(null)}>
              Send another copy
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-1">
            <div>
              <Label htmlFor="inv-from" className="text-[11px] uppercase tracking-wider text-slate-500">
                From
              </Label>
              {accounts === null ? (
                <div className="mt-1.5 flex items-center gap-2 text-[12px] text-slate-500">
                  <Loader2 className="size-3.5 animate-spin" /> Loading mail accounts…
                </div>
              ) : accounts.length === 0 ? (
                <p className="mt-1.5 rounded-md border border-dashed p-3 text-[12px]" style={{ borderColor: BRAND.grayLine, color: BRAND.gray }}>
                  No mail account is configured yet. Add one under Settings → Email accounts, then send the invoice from
                  here.
                </p>
              ) : (
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger id="inv-from" className="mt-1.5">
                    <SelectValue placeholder="Choose an account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.label ? `${a.label} · ` : ''}
                        {a.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div>
              <Label htmlFor="inv-to" className="text-[11px] uppercase tracking-wider text-slate-500">
                Recipient
              </Label>
              <Input
                id="inv-to"
                type="email"
                inputMode="email"
                placeholder="billing@example.com"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="inv-subject" className="text-[11px] uppercase tracking-wider text-slate-500">
                Subject
              </Label>
              <Input
                id="inv-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mt-1.5"
              />
            </div>

            <p className="text-[11px] leading-relaxed" style={{ color: BRAND.graySoft }}>
              Attached as an HTML document. The recipient sees the A4 pad and can print or save it as a PDF; a plain-text
              version is included for clients that block HTML.
            </p>
          </div>
        )}

        {!sentTo ? (
          <DialogFooter>
            <Button
              onClick={send}
              disabled={sending || accounts?.length === 0}
              className="gap-1.5"
              style={{ background: BRAND.orange }}
            >
              {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />}
              {sending ? 'Sending…' : 'Send invoice'}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
