'use client'

/**
 * Shared Inbox (Module I) — unified view over conversations (web chat / AI
 * agent threads). WhatsApp, SMS and email sending live in their existing
 * channel modules; this panel gives the contact-center agent one timeline.
 * Also links to the existing CRM contacts panel (Module H).
 */

import { MessageSquare } from 'lucide-react'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
  EmptyState, ErrorNote, InfoNote, Skeleton, StatusBadge,
  TableWrap, Td, Th, useVoiceApi, fmtDate,
} from './kit'

interface ConversationRow {
  id: string; title: string; status: string; updatedAt: string
  messageCount: number; lastMessage: string | null
}

export default function VoiceOmniPanel() {
  const { data, error, loading } = useVoiceApi<{ data: ConversationRow[] }>('/api/voice/conversations?limit=25')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2"><MessageSquare className="h-5 w-5" /> Shared Inbox</h2>
        <p className="text-sm text-slate-500">One conversation timeline across channels. Voice calls appear in Call History; this inbox covers messaging channels.</p>
      </div>

      <InfoNote>
        WhatsApp uses the official WhatsApp Business integration already configured in AgentOS (WhatsApp module), and SMS/email
        use their existing channel modules — those keep their own compliance settings. Customer profiles and pipelines live in
        the CRM (Contacts) panel.
      </InfoNote>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conversations</CardTitle>
          <CardDescription>Newest first, your tenant only.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-40" /> : error ? <ErrorNote message={error} /> :
          !data || data.data.length === 0 ? (
            <EmptyState title="No conversations yet" hint="Messages from web chat, WhatsApp and other channels appear here." />
          ) : (
            <TableWrap>
              <thead><tr><Th>Conversation</Th><Th>Status</Th><Th>Messages</Th><Th>Last message</Th><Th>Updated</Th></tr></thead>
              <tbody>
                {data.data.map((c) => (
                  <tr key={c.id}>
                    <Td className="font-medium">{c.title}</Td>
                    <Td><StatusBadge status={c.status} /></Td>
                    <Td className="tabular-nums">{c.messageCount}</Td>
                    <Td className="max-w-80 truncate text-xs text-slate-500">{c.lastMessage ?? '—'}</Td>
                    <Td>{fmtDate(c.updatedAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
