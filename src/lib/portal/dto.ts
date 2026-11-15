/**
 * Client-facing data shapes.
 *
 * Every object returned by `/api/portal/**` is built by one of these mappers.
 * They are ALLOW-LISTS: a field reaches a client only if it is named here, so
 * adding a column to a table can never expose it by accident. Internal-only
 * columns (storage keys, staff user ids, internal notes, fulfilment hints, the
 * execution bridge) are simply never read.
 */

import {
  CLIENT_STAGE_LABELS,
  PROJECT_STATUS_LABELS,
  TICKET_STATUS_LABELS,
  clientStageFor,
  isProjectStatus,
  pendingClientActionFor,
} from '@/lib/client-services/status';

type R = Record<string, any>;

const iso = (value: unknown): string | null =>
  value instanceof Date ? value.toISOString() : typeof value === 'string' && value ? value : null;

function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export interface LineItem { description: string; quantity: number; unitPrice: number; amount: number }

function lineItems(value: unknown): LineItem[] {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { return []; }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((row): row is R => Boolean(row) && typeof row === 'object')
    .map((row) => ({
      description: String(row.description ?? ''),
      quantity: Number(row.quantity ?? 1) || 0,
      unitPrice: Number(row.unitPrice ?? 0) || 0,
      amount: Number(row.amount ?? 0) || 0,
    }));
}

const money = (n: unknown): number => Math.round((Number(n) || 0) * 100) / 100;

export function serviceDto(s: R) {
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    category: s.category,
    summary: s.summary,
    description: s.description,
    benefits: list(s.benefits),
    deliverables: list(s.deliverables),
    scope: s.scope,
    pricing: {
      type: s.pricingModel as string, // fixed | starting_at | quote | subscription
      amount: s.priceAmount === null || s.priceAmount === undefined ? null : money(s.priceAmount),
      currency: s.currency,
      interval: s.billingInterval ?? null,
    },
    deliveryTimeframe: s.deliveryTimeframe,
    terms: s.terms,
  };
}

export function projectDto(p: R) {
  const status = isProjectStatus(p.status) ? p.status : 'requested';
  const stage = clientStageFor(status);
  return {
    id: p.id,
    reference: p.reference,
    title: p.title,
    serviceName: p.serviceName,
    requirements: p.requirements,
    status,
    statusLabel: PROJECT_STATUS_LABELS[status],
    stage,
    stageLabel: CLIENT_STAGE_LABELS[stage],
    progress: Math.max(0, Math.min(100, Number(p.progress) || 0)),
    pendingAction: p.pendingClientAction ?? pendingClientActionFor(status),
    targetDate: iso(p.targetDate),
    createdAt: iso(p.createdAt),
    updatedAt: iso(p.updatedAt),
    completedAt: iso(p.completedAt),
  };
}

export function milestoneDto(m: R) {
  return {
    id: m.id,
    title: m.title,
    description: m.description ?? null,
    status: m.status,
    dueDate: iso(m.dueDate),
    completedAt: iso(m.completedAt),
  };
}

export function messageDto(m: R) {
  const fromClient = m.senderType === 'client';
  return {
    id: m.id,
    from: fromClient ? 'you' : 'service_team',
    // For service-team messages this is the public display name staff chose
    // to sign with — never an internal account identifier.
    senderName: m.senderName,
    body: m.body,
    createdAt: iso(m.createdAt),
  };
}

export function documentDto(d: R) {
  return {
    id: d.id,
    projectId: d.projectId ?? null,
    ticketId: d.ticketId ?? null,
    kind: d.kind,
    fileName: d.fileName,
    mimeType: d.mimeType,
    size: d.size,
    uploadedBy: d.uploadedByType === 'client' ? 'you' : 'service_team',
    createdAt: iso(d.createdAt),
    downloadPath: `/api/portal/documents/${d.id}/download`,
  };
}

export function deliverableDto(d: R, projectTitle?: string) {
  return {
    id: d.id,
    projectId: d.projectId,
    ...(projectTitle !== undefined ? { projectTitle } : {}),
    title: d.title,
    description: d.description ?? null,
    type: d.type,
    version: d.version,
    isFinal: Boolean(d.isFinal),
    status: d.status, // delivered | approved | revision_requested | superseded
    deliveredAt: iso(d.deliveredAt),
    reviewedAt: iso(d.reviewedAt),
    revisionNote: d.revisionNote ?? null,
    downloadPath: d.documentId ? `/api/portal/deliverables/${d.id}/download` : null,
    externalUrl: d.downloadUrl ?? null,
  };
}

export function activityDto(a: R) {
  return {
    id: a.id,
    projectId: a.projectId ?? null,
    type: a.type,
    summary: a.summary,
    by: a.actorType === 'client' ? 'you' : 'alo_labs',
    createdAt: iso(a.createdAt),
  };
}

export function quotationDto(q: R) {
  return {
    id: q.id,
    number: q.number,
    projectId: q.projectId ?? null,
    title: q.title,
    lineItems: lineItems(q.lineItems),
    subtotal: money(q.subtotal),
    tax: money(q.tax),
    total: money(q.total),
    currency: q.currency,
    status: q.status,
    validUntil: iso(q.validUntil),
    notes: q.notes ?? null,
    terms: q.terms ?? null,
    issuedAt: iso(q.issuedAt),
    respondedAt: iso(q.respondedAt),
  };
}

export function invoiceDto(i: R) {
  const total = money(i.total);
  const paid = money(i.amountPaid);
  const balance = money(Math.max(0, total - paid));
  const overdue = balance > 0 && i.status !== 'void' && i.dueDate instanceof Date && i.dueDate.getTime() < Date.now();
  return {
    id: i.id,
    number: i.number,
    projectId: i.projectId ?? null,
    title: i.title,
    lineItems: lineItems(i.lineItems),
    subtotal: money(i.subtotal),
    tax: money(i.tax),
    total,
    amountPaid: paid,
    balanceDue: i.status === 'void' ? 0 : balance,
    currency: i.currency,
    status: overdue ? 'overdue' : i.status,
    issuedAt: iso(i.issuedAt),
    dueDate: iso(i.dueDate),
    paidAt: iso(i.paidAt),
    notes: i.notes ?? null,
  };
}

export function paymentDto(p: R, invoiceNumber?: string) {
  return {
    id: p.id,
    invoiceId: p.invoiceId,
    ...(invoiceNumber !== undefined ? { invoiceNumber } : {}),
    receiptNumber: p.receiptNumber,
    amount: money(p.amount),
    currency: p.currency,
    method: p.method,
    reference: p.reference ?? null,
    status: p.status,
    paidAt: iso(p.paidAt),
  };
}

export function ticketDto(t: R) {
  return {
    id: t.id,
    reference: t.reference,
    subject: t.subject,
    category: t.category,
    priority: t.priority,
    status: t.status,
    statusLabel: TICKET_STATUS_LABELS[t.status] ?? t.status,
    projectId: t.projectId ?? null,
    firstResponseAt: iso(t.firstResponseAt),
    resolvedAt: iso(t.resolvedAt),
    resolutionSummary: t.resolutionSummary ?? null,
    createdAt: iso(t.createdAt),
    updatedAt: iso(t.updatedAt),
  };
}

export function notificationDto(n: R) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    link: n.link ?? null,
    read: Boolean(n.readAt),
    createdAt: iso(n.createdAt),
  };
}

export function accountDto(ctx: {
  name: string;
  email: string;
  companyName: string;
  memberRole: string;
  account: {
    currency: string;
    accountManagerName: string | null;
    accountManagerTitle: string | null;
    accountManagerEmail: string | null;
    accountManagerPhone: string | null;
    billingEmail: string | null;
  };
}) {
  const a = ctx.account;
  return {
    user: { name: ctx.name, email: ctx.email, isAccountOwner: ctx.memberRole === 'owner' },
    company: { name: ctx.companyName },
    currency: a.currency,
    billingEmail: a.billingEmail,
    accountManager: a.accountManagerName
      ? { name: a.accountManagerName, title: a.accountManagerTitle, email: a.accountManagerEmail, phone: a.accountManagerPhone }
      : null,
  };
}
