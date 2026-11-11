'use client'

/**
 * Voice Library + consent-gated cloning (Module C). Clones require a verified
 * consent record; revoking consent disables the clone everywhere immediately.
 */

import { useState } from 'react'
import { AudioLines, ShieldCheck } from 'lucide-react'
import {
  Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  EmptyState, ErrorNote, InfoNote, Input, Label, Skeleton, StatusBadge,
  TableWrap, Td, Th, Textarea, voiceMutate, useVoiceApi, fmtDate,
} from './kit'

interface VoiceRow { id: string; name: string; language: string; gender: string; isClone: boolean; status: string; consentRecordId: string | null; createdAt: string }
interface ConsentRow { id: string; ownerName: string; ownerContact: string; status: string; verificationMethod: string; verifiedAt: string | null; revokedAt: string | null; gate: { allowed: boolean; reason: string } }

export default function VoiceLibraryPanel() {
  const voices = useVoiceApi<{ data: VoiceRow[] }>('/api/voice/voices')
  const consents = useVoiceApi<{ data: ConsentRow[] }>('/api/voice/consents')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [voiceForm, setVoiceForm] = useState({ name: '', language: 'bn-BD', gender: 'female', providerVoiceId: '' })
  const [consentForm, setConsentForm] = useState({ ownerName: '', ownerContact: '', consentStatement: '' })

  const createConsent = async () => {
    setBusy(true); setMsg(null)
    const res = await voiceMutate('/api/voice/consents', 'POST', consentForm)
    setMsg(res.ok ? { ok: true, text: 'Consent recorded as PENDING — a human verifier must confirm it before any clone can be created.' } : { ok: false, text: res.error ?? 'Failed' })
    if (res.ok) setConsentForm({ ownerName: '', ownerContact: '', consentStatement: '' })
    await consents.refresh()
    setBusy(false)
  }

  const verify = async (id: string, action: 'verify' | 'revoke') => {
    setBusy(true); setMsg(null)
    const res = await voiceMutate('/api/voice/consents', 'PATCH', { id, action })
    setMsg(res.ok ? { ok: true, text: action === 'revoke' ? 'Consent revoked — any clone voices using it are disabled immediately.' : 'Consent verified.' } : { ok: false, text: res.error ?? 'Failed' })
    await Promise.all([consents.refresh(), voices.refresh()])
    setBusy(false)
  }

  const createVoice = async () => {
    setBusy(true); setMsg(null)
    const res = await voiceMutate('/api/voice/voices', 'POST', voiceForm)
    setMsg(res.ok ? { ok: true, text: 'Voice added to the library (synthesis still requires a deployed engine).' } : { ok: false, text: res.error ?? 'Failed' })
    if (res.ok) setVoiceForm({ ...voiceForm, name: '', providerVoiceId: '' })
    await voices.refresh()
    setBusy(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2"><AudioLines className="h-5 w-5" /> Voice Library &amp; Authorized Cloning</h2>
        <p className="text-sm text-slate-500">Bangla-first voices. Cloning only with verified, revocable owner consent.</p>
      </div>

      <InfoNote>
        Cloning a third party&apos;s voice without authorization, or impersonation intended to deceive listeners, is forbidden
        and structurally blocked: the API refuses clone creation unless a <strong>verified, unrevoked</strong> consent record exists.
      </InfoNote>

      {msg && (msg.ok ? <InfoNote>{msg.text}</InfoNote> : <ErrorNote message={msg.text} />)}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" /> Consent records</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2">
              <Input placeholder="Voice owner name" value={consentForm.ownerName} onChange={(e) => setConsentForm({ ...consentForm, ownerName: e.target.value })} />
              <Input placeholder="Owner contact (phone/email)" value={consentForm.ownerContact} onChange={(e) => setConsentForm({ ...consentForm, ownerContact: e.target.value })} />
              <Textarea rows={2} placeholder="Consent statement (what the owner agreed to, when, how)" value={consentForm.consentStatement} onChange={(e) => setConsentForm({ ...consentForm, consentStatement: e.target.value })} />
              <Button onClick={createConsent} disabled={busy || !consentForm.ownerName.trim() || !consentForm.consentStatement.trim()}>Record consent (pending)</Button>
            </div>
            {consents.loading ? <Skeleton className="h-24" /> : !consents.data || consents.data.data.length === 0 ? (
              <EmptyState title="No consent records" />
            ) : (
              <TableWrap>
                <thead><tr><Th>Owner</Th><Th>Status</Th><Th>Clone gate</Th><Th>Actions</Th></tr></thead>
                <tbody>
                  {consents.data.data.map((c) => (
                    <tr key={c.id}>
                      <Td>{c.ownerName}<div className="text-xs text-slate-400">{c.verificationMethod}</div></Td>
                      <Td><StatusBadge status={c.status} /></Td>
                      <Td className="max-w-48 text-xs">{c.gate.allowed ? 'allowed' : c.gate.reason}</Td>
                      <Td>
                        <div className="flex gap-1">
                          {c.status === 'pending' && <Button size="sm" variant="outline" disabled={busy} onClick={() => verify(c.id, 'verify')}>Verify</Button>}
                          {c.status !== 'revoked' && <Button size="sm" variant="outline" disabled={busy} onClick={() => verify(c.id, 'revoke')}>Revoke</Button>}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Add a voice</CardTitle><CardDescription>Register a synthetic voice (or an authorized clone with consent).</CardDescription></CardHeader>
          <CardContent className="grid gap-2">
            <Input placeholder="Voice name" value={voiceForm.name} onChange={(e) => setVoiceForm({ ...voiceForm, name: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Language (bn-BD)" value={voiceForm.language} onChange={(e) => setVoiceForm({ ...voiceForm, language: e.target.value })} />
              <Input placeholder="Gender" value={voiceForm.gender} onChange={(e) => setVoiceForm({ ...voiceForm, gender: e.target.value })} />
            </div>
            <Input placeholder="Provider voice id" value={voiceForm.providerVoiceId} onChange={(e) => setVoiceForm({ ...voiceForm, providerVoiceId: e.target.value })} />
            <Button onClick={createVoice} disabled={busy || !voiceForm.name.trim() || !voiceForm.providerVoiceId.trim()}>Add voice</Button>
            {voices.loading ? <Skeleton className="h-24" /> : !voices.data || voices.data.data.length === 0 ? (
              <EmptyState title="Voice library is empty" />
            ) : (
              <TableWrap>
                <thead><tr><Th>Name</Th><Th>Lang</Th><Th>Type</Th><Th>Status</Th><Th>Added</Th></tr></thead>
                <tbody>
                  {voices.data.data.map((v) => (
                    <tr key={v.id}>
                      <Td className="font-medium">{v.name}</Td>
                      <Td>{v.language}</Td>
                      <Td>{v.isClone ? 'authorized clone' : 'synthetic'}</Td>
                      <Td><StatusBadge status={v.status} /></Td>
                      <Td>{fmtDate(v.createdAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
