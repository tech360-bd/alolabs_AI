'use client'

/**
 * CRM & Customer 360 (Module H).
 *
 * - Search/create contacts with server-side duplicate detection
 * - Customer 360 drawer: calls, appointments, consents, contactability
 * - CSV import (per-row report) and export
 *
 * Contactability is resolved by the SERVER from DNC + consent records; the UI
 * never infers it from a checkbox.
 */

import { useState } from 'react'
import { Search, UserPlus, Upload, Download, Users, ShieldCheck, ShieldAlert, HelpCircle } from 'lucide-react'
import {
  Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  EmptyState, ErrorNote, InfoNote, Input, Label, Skeleton, StatusBadge,
  TableWrap, Td, Th, useVoiceApi, fmtDate, voiceMutate, fmtDuration,
} from './kit'

interface ContactRow {
  id: string; firstName: string; lastName: string; email: string; phone: string | null
  company: string | null; status: string; tags: string; score: number; lastContactAt: string | null
}

interface Customer360 {
  contact: ContactRow & { createdAt: string; metadata: Record<string, unknown> }
  calls: Array<{ id: string; direction: string; status: string; disposition: string | null; durationSeconds: number; startedAt: string | null; simulated: boolean }>
  appointments: Array<{ id: string; title: string; scheduledFor: string; status: string }>
  consents: Array<{ id: string; channel: string; purpose: string; granted: boolean; revokedAt: string | null; method: string }>
  stats: { totalCalls: number; answered: number; missed: number; totalTalkSeconds: number; lastContactAt: string | null }
}

type Contactability = { contactable: 'allowed' | 'blocked' | 'unknown'; reason: string; dnc: boolean; consentGranted: boolean }

export default function VoiceCrmPanel() {
  const [query, setQuery] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const list = useVoiceApi<{ data: ContactRow[]; total: number }>(`/api/voice/crm?q=${encodeURIComponent(searchTerm)}`)
  const [selected, setSelected] = useState<string | null>(null)
  // Only fetch when a contact is selected — an empty contactId would be a 400.
  const detail = useVoiceApi<{ data: Customer360 }>(selected ? `/api/voice/crm?contactId=${selected}` : '/api/voice/crm?limit=1')
  const [contactability, setContactability] = useState<Contactability | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', company: '' })
  const [duplicates, setDuplicates] = useState<Array<{ id: string; firstName: string; lastName: string; matchedOn: string }>>([])
  const [importCsv, setImportCsv] = useState('')
  const [importReport, setImportReport] = useState<{ created: number; duplicates: number; invalid: number; total: number } | null>(null)

  const createContact = async (allowDuplicate = false) => {
    setBusy(true); setMsg(null); setDuplicates([])
    const res = await voiceMutate('/api/voice/crm', 'POST', { ...form, allowDuplicate })
    if (res.ok) {
      setMsg({ ok: true, text: 'Contact created.' })
      setForm({ firstName: '', lastName: '', email: '', phone: '', company: '' })
      await list.refresh()
    } else {
      setMsg({ ok: false, text: res.error ?? 'Failed' })
      // A duplicate refusal carries the matching contacts in the message; resolve
      // them properly via the duplicates endpoint so the operator can act.
      if (res.error && /duplicate/i.test(res.error)) {
        const found = await fetch(
          `/api/voice/crm?duplicates=${encodeURIComponent(form.phone)},${encodeURIComponent(form.email)}`,
          { cache: 'no-store' },
        ).then((r) => r.json()).catch(() => null)
        setDuplicates(found?.data ?? [])
      }
    }
    setBusy(false)
  }

  const openContact = async (contactId: string) => {
    setSelected(contactId)
    setContactability(null)
    const phone = list.data?.data.find((c) => c.id === contactId)?.phone
    if (phone) {
      const result = await fetch(`/api/voice/crm?contactability=${encodeURIComponent(phone)}`, { cache: 'no-store' })
        .then((r) => r.json()).catch(() => null)
      setContactability(result?.data ?? null)
    }
  }

  const runImport = async () => {
    setBusy(true); setMsg(null); setImportReport(null)
    const res = await voiceMutate('/api/voice/crm', 'PATCH', { action: 'import_csv', csv: importCsv })
    if (res.ok) {
      const report = (res.data as { data?: { created: number; duplicates: number; invalid: number; total: number } })?.data
      setImportReport(report ?? null)
      setMsg({ ok: true, text: 'Import finished — see the per-row outcome below.' })
      await list.refresh()
    } else setMsg({ ok: false, text: res.error ?? 'Import failed' })
    setBusy(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2"><Users className="h-5 w-5" /> CRM &amp; Customer 360</h2>
        <p className="text-sm text-slate-500">
          Contacts, call history, consents and contactability. Duplicates are detected on normalized phone and lowercased email.
        </p>
      </div>

      {msg && (msg.ok ? <InfoNote>{msg.text}</InfoNote> : <ErrorNote message={msg.text} />)}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><UserPlus className="h-4 w-4" /> New contact</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label htmlFor="c-first">First name</Label>
              <Input id="c-first" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="c-last">Last name</Label>
              <Input id="c-last" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="c-phone">Phone</Label>
              <Input id="c-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="01712345678" /></div>
            <div className="space-y-1"><Label htmlFor="c-email">Email</Label>
              <Input id="c-email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-1 sm:col-span-2"><Label htmlFor="c-company">Company</Label>
              <Input id="c-company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
            <div className="flex items-end gap-2 sm:col-span-2">
              <Button onClick={() => createContact(false)} disabled={busy || !form.firstName.trim()}>Create</Button>
              {duplicates.length > 0 && (
                <Button variant="outline" onClick={() => createContact(true)} disabled={busy}>Create anyway</Button>
              )}
            </div>
            {duplicates.length > 0 && (
              <div className="sm:col-span-2 space-y-1 rounded border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
                <p className="font-medium text-amber-700 dark:text-amber-400">Possible duplicates:</p>
                {duplicates.map((d) => (
                  <p key={d.id}>{d.firstName} {d.lastName} — matched on {d.matchedOn} ({d.id})</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Upload className="h-4 w-4" /> CSV import / export</CardTitle>
            <CardDescription>Header row required. Aliases like phone_number / mobile are recognized.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea value={importCsv} onChange={(e) => setImportCsv(e.target.value)} rows={6}
              placeholder={'first_name,last_name,phone,email\nRahim,Uddin,01712345678,rahim@example.com'}
              className="w-full rounded-md border bg-transparent p-2 font-mono text-xs" />
            <div className="flex flex-wrap gap-2">
              <Button onClick={runImport} disabled={busy || !importCsv.trim()}>Import</Button>
              <a href="/api/voice/crm?export=csv" download className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm">
                <Download className="h-3.5 w-3.5" /> Export CSV
              </a>
            </div>
            {importReport && (
              <p className="text-xs text-slate-500">
                {importReport.created} created · {importReport.duplicates} duplicates skipped · {importReport.invalid} invalid · {importReport.total} rows
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Search className="h-4 w-4" /> Contacts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, phone, email or company" className="max-w-sm" />
            <Button variant="outline" onClick={() => setSearchTerm(query)}>Search</Button>
          </div>
          {/* A failed request is NOT an empty list: showing "No contacts" when
              the API is down would tell an operator their data vanished. */}
          {list.loading ? <Skeleton className="h-40" /> : list.error ? (
            <ErrorNote message={`Could not load contacts: ${list.error}`} />
          ) : !list.data || list.data.data.length === 0 ? (
            <EmptyState title="No contacts" hint="Create one above, import a CSV, or let an inbound call identify a caller." />
          ) : (
            <TableWrap>
              <thead><tr><Th>Name</Th><Th>Phone</Th><Th>Email</Th><Th>Status</Th><Th>Last contact</Th><Th /></tr></thead>
              <tbody>
                {list.data.data.map((contact) => (
                  <tr key={contact.id}>
                    <Td className="font-medium">{contact.firstName} {contact.lastName}</Td>
                    <Td className="tabular-nums">{contact.phone ?? '—'}</Td>
                    <Td className="max-w-56 truncate">{contact.email || '—'}</Td>
                    <Td><StatusBadge status={contact.status} /></Td>
                    <Td>{fmtDate(contact.lastContactAt)}</Td>
                    <Td><Button size="sm" variant="outline" onClick={() => openContact(contact.id)}>Open</Button></Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </CardContent>
      </Card>

      {selected && detail.data?.data?.contact && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {detail.data.data.contact.firstName} {detail.data.data.contact.lastName}
            </CardTitle>
            <CardDescription>
              {detail.data.data.contact.phone ?? 'no phone'} · {detail.data.data.contact.email || 'no email'} · created {fmtDate(detail.data.data.contact.createdAt)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded border p-2"><p className="text-xs text-slate-400">Calls</p><p className="text-xl tabular-nums">{detail.data.data.stats.totalCalls}</p></div>
              <div className="rounded border p-2"><p className="text-xs text-slate-400">Answered</p><p className="text-xl tabular-nums">{detail.data.data.stats.answered}</p></div>
              <div className="rounded border p-2"><p className="text-xs text-slate-400">Missed</p><p className="text-xl tabular-nums">{detail.data.data.stats.missed}</p></div>
              <div className="rounded border p-2"><p className="text-xs text-slate-400">Talk time</p><p className="text-xl tabular-nums">{fmtDuration(detail.data.data.stats.totalTalkSeconds)}</p></div>
            </div>

            {contactability && (
              <div className="flex items-start gap-2 rounded border p-2 text-sm">
                {contactability.contactable === 'allowed' ? <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-500" />
                  : contactability.contactable === 'blocked' ? <ShieldAlert className="mt-0.5 h-4 w-4 text-red-500" />
                  : <HelpCircle className="mt-0.5 h-4 w-4 text-amber-500" />}
                <div>
                  <p className="font-medium">
                    Contactability: {contactability.contactable}
                    {contactability.dnc && <Badge variant="outline" className="ml-2 border-red-500/50 text-red-600">DNC</Badge>}
                  </p>
                  <p className="text-xs text-slate-500">{contactability.reason}</p>
                </div>
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Recent calls</p>
                {detail.data.data.calls.length === 0 ? <EmptyState title="No calls" /> : (
                  <TableWrap>
                    <thead><tr><Th>When</Th><Th>Dir</Th><Th>Status</Th><Th>Duration</Th></tr></thead>
                    <tbody>
                      {detail.data.data.calls.slice(0, 10).map((call) => (
                        <tr key={call.id}>
                          <Td>{fmtDate(call.startedAt)}</Td>
                          <Td>{call.direction}</Td>
                          <Td><StatusBadge status={call.status} /></Td>
                          <Td className="tabular-nums">{fmtDuration(call.durationSeconds)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </TableWrap>
                )}
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Consents</p>
                {detail.data.data.consents.length === 0 ? <EmptyState title="No consent records" hint="Outbound contact without consent is an operator compliance decision." /> : (
                  <TableWrap>
                    <thead><tr><Th>Channel</Th><Th>Purpose</Th><Th>Granted</Th><Th>Method</Th></tr></thead>
                    <tbody>
                      {detail.data.data.consents.map((consent) => (
                        <tr key={consent.id}>
                          <Td>{consent.channel}</Td>
                          <Td>{consent.purpose}</Td>
                          <Td>{consent.revokedAt ? <Badge variant="outline" className="border-red-500/50 text-red-600">revoked</Badge>
                            : consent.granted ? <StatusBadge status="verified" /> : <StatusBadge status="pending" />}</Td>
                          <Td>{consent.method}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </TableWrap>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
