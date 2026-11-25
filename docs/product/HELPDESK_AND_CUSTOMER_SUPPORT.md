# Helpdesk and Customer Support

Status: partial (client portal ticket list) · 2026-11-25

## 1. What exists

| Piece | State | Evidence |
| --- | --- | --- |
| Support ticket model | Implemented | `ClientSupportTicket` in `prisma/schema.prisma` |
| Portal ticket list/detail | Implemented | `src/app/portal/support/page.tsx`, `src/app/portal/support/[id]/page.tsx` |
| Customer notifications | Implemented | `ClientNotification` |
| Client messaging | Implemented | `ClientMessage` |
| AI support agent | Not implemented | No ticket-aware agent |
| SLA, assignment, escalation, categories, internal notes, attachments, resolution summary, feedback | Not implemented | — |

The existing surface is a client-visible ticket list inside the client portal. It is
**not** an operational helpdesk.

## 2. Required data model (planned, additive)

| Model | Purpose | Notes |
| --- | --- | --- |
| `SupportTicket` | Operational ticket | Extend `ClientSupportTicket` or introduce a company-scoped ticket; do not keep both as competing stores |
| `SupportMessage` | Thread with visibility (`public`/`internal`) | Attachments via `File` |
| `SupportAssignment` | Assignee (human or agent), queue, timestamps | |
| `SupportSla` | Policy per priority, response/resolution targets | |
| `SupportEscalation` | Reason, from, to, timestamp | Reconcile with existing `Escalation` model |
| `SupportFeedback` | CSAT per resolution | |

Before designing, reconcile `ClientSupportTicket`, `Escalation` and
`MessageTemplate` — three existing models overlap. Duplication is the failure mode
the specification explicitly forbids.

## 3. AI support behaviour

Allowed without approval (low risk):

- answer from tenant knowledge with citations;
- ask diagnostic questions;
- summarise the ticket;
- draft a reply for human review.

Requires approval or human action:

- sending a reply externally (`external.communicate`);
- issuing a refund or credit (`financial.transact`);
- deleting or exporting customer data;
- changing account settings.

Must escalate when: uncertain, customer asks for a human, security/privacy issue,
restricted action required, high business impact, or evidence is insufficient.
Never fabricate a resolution. Closing a ticket as "AI resolved" requires customer
confirmation or a human decision, recorded.

## 4. Governance mapping

| Action | Class | Outcome |
| --- | --- | --- |
| Read ticket in own org | `knowledge.read` | allowed |
| Draft reply | `draft.content` | allowed |
| Send reply | `external.communicate` | approval unless an authorised automation is configured |
| Refund | `financial.transact` | approval + `costAuthorized` |
| Export ticket data | `data.export` | owner approval |
| Access another org's ticket | — | `SEC-TENANT-001` deny |

Support users (`customer_support` role) must be restricted to assigned records;
that scoping is not implemented yet (GAP-017).

## 5. Delivery plan

1. Reconcile models; add `SupportMessage` with internal/public visibility.
2. Staff ticket queue UI with filters (status, priority, assignee).
3. AI triage: categorise, suggest priority, propose a draft reply (no send).
4. Approval-driven send using the existing approval + governance binding.
5. SLA timers + escalation rules.
6. CSAT capture and reporting.
7. Public webchat handoff creates a ticket with consent (depends on the public
   chat surface).

## 6. Acceptance tests

1. A support user cannot read an unassigned ticket from another team/tenant.
2. AI never sends a reply without approval; the audit trail shows the approval id.
3. Escalation triggers on the documented conditions.
4. Closing a ticket requires a resolution summary.
5. Internal notes are never visible to the customer.
