/**
 * Shared operations on client work, used by BOTH sides of the wall:
 * the client route group (`/api/portal/**`) and the staff route group
 * (`/api/internal/**`). Every function takes the owning `companyId` explicitly
 * and scopes its writes through `tenantDb`, so a staff action on one client can
 * never touch another client's rows either.
 *
 * Everything written here that a client can later read (activity summaries,
 * notification text) is phrased in service terms. Nothing in this module
 * accepts or stores a description of how the work was produced.
 */

import { randomBytes } from 'crypto';
import { db } from '@/lib/db';
import { tenantDb } from '@/lib/portal/tenant-db';
import {
  PROJECT_STATUS_LABELS,
  canTransition,
  defaultProgressFor,
  isProjectStatus,
  pendingClientActionFor,
  type ProjectStatus,
} from '@/lib/client-services/status';
import { SERVICE_CATALOGUE } from '@/lib/client-services/catalogue';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A human-friendly, non-sequential reference, e.g. `PRJ-2026-K7Q2MX`. */
export function newReference(prefix: string): string {
  const bytes = randomBytes(6);
  let code = '';
  for (const b of bytes) code += ALPHABET[b % ALPHABET.length];
  return `${prefix}-${new Date().getUTCFullYear()}-${code}`;
}

export class OperationError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'OperationError';
  }
}

export async function logActivity(
  companyId: string,
  input: {
    projectId?: string | null;
    entityType: 'project' | 'deliverable' | 'quotation' | 'invoice' | 'ticket' | 'document';
    entityId: string;
    type: string;
    summary: string;
    actorType: 'client' | 'service_team' | 'system';
  },
): Promise<void> {
  await tenantDb(companyId).clientActivity.create({
    data: {
      projectId: input.projectId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      type: input.type,
      summary: input.summary.slice(0, 500),
      actorType: input.actorType,
    },
  });
}

export async function notifyClient(
  companyId: string,
  input: { type: string; title: string; message: string; link?: string | null },
): Promise<void> {
  await tenantDb(companyId).clientNotification.create({
    data: {
      userId: null,
      type: input.type,
      title: input.title.slice(0, 160),
      message: input.message.slice(0, 500),
      link: input.link ?? null,
    },
  });
}

/**
 * Move a project along its lifecycle. `actor` selects the transition table:
 * staff move work forward; a client only ever reaches here through a named
 * action (accept quotation, approve deliverable, request revision, withdraw).
 */
export async function setProjectStatus(
  companyId: string,
  projectId: string,
  to: ProjectStatus,
  actor: 'staff' | 'client',
  opts: { progress?: number; silent?: boolean } = {},
) {
  const tdb = tenantDb(companyId);
  const project = await tdb.clientProject.findOwned(projectId);
  if (!project) throw new OperationError(404, 'Not found');
  const from = String(project.status);
  if (from === to) return project;
  if (!isProjectStatus(to) || !canTransition(actor, from, to)) {
    throw new OperationError(409, `This project cannot move from ${PROJECT_STATUS_LABELS[from as ProjectStatus] ?? from} to ${PROJECT_STATUS_LABELS[to] ?? to}.`);
  }
  const progress = Math.max(
    0,
    Math.min(100, opts.progress ?? Math.max(to === 'revision' ? 0 : Number(project.progress) || 0, defaultProgressFor(to))),
  );
  // Guard on the previous status so two concurrent transitions cannot both win.
  const updated = await tdb.clientProject.updateOwned(
    projectId,
    {
      status: to,
      progress: to === 'completed' ? 100 : to === 'revision' ? defaultProgressFor('revision') : progress,
      pendingClientAction: pendingClientActionFor(to),
      completedAt: to === 'completed' ? new Date() : null,
    },
    { status: from },
  );
  if (!updated) throw new OperationError(409, 'This project was updated by someone else. Please refresh and try again.');

  await logActivity(companyId, {
    projectId,
    entityType: 'project',
    entityId: projectId,
    type: 'project.status_changed',
    summary: `Status changed to ${PROJECT_STATUS_LABELS[to]}`,
    actorType: actor === 'client' ? 'client' : 'service_team',
  });
  if (actor === 'staff' && !opts.silent) {
    await notifyClient(companyId, {
      type: 'project.status',
      title: `${project.title}: ${PROJECT_STATUS_LABELS[to]}`,
      message: pendingClientActionFor(to) ?? `Your project is now ${PROJECT_STATUS_LABELS[to].toLowerCase()}.`,
      link: `/portal/projects/${projectId}`,
    });
  }
  return updated;
}

/** Recompute an invoice's paid amount and status from its recorded payments. */
export async function reconcileInvoice(companyId: string, invoiceId: string) {
  const tdb = tenantDb(companyId);
  const invoice = await tdb.clientInvoice.findOwned(invoiceId);
  if (!invoice) throw new OperationError(404, 'Not found');
  const sum = await tdb.clientPayment.aggregate({ where: { invoiceId, status: 'completed' }, _sum: { amount: true } });
  const paid = Math.round((Number(sum._sum?.amount) || 0) * 100) / 100;
  const total = Number(invoice.total) || 0;
  const status = invoice.status === 'void' ? 'void' : paid >= total && total > 0 ? 'paid' : paid > 0 ? 'partially_paid' : 'issued';
  return tdb.clientInvoice.updateOwned(invoiceId, {
    amountPaid: paid,
    status,
    paidAt: status === 'paid' ? (invoice.paidAt ?? new Date()) : null,
  });
}

export interface LineItemInput { description: string; quantity: number; unitPrice: number }

/** Validate and total quotation / invoice lines. Amounts are never trusted from input. */
export function priceLines(raw: unknown, taxRate = 0) {
  if (!Array.isArray(raw) || raw.length === 0) throw new OperationError(400, 'At least one line item is required.');
  if (raw.length > 100) throw new OperationError(400, 'Too many line items.');
  const lines = raw.map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    const description = typeof r.description === 'string' ? r.description.trim().slice(0, 300) : '';
    const quantity = Number(r.quantity ?? 1);
    const unitPrice = Number(r.unitPrice);
    if (!description) throw new OperationError(400, 'Every line item needs a description.');
    if (!Number.isFinite(quantity) || quantity <= 0) throw new OperationError(400, 'Line item quantity must be greater than zero.');
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new OperationError(400, 'Line item unit price must not be negative.');
    return { description, quantity, unitPrice, amount: Math.round(quantity * unitPrice * 100) / 100 };
  });
  const subtotal = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  const rate = Number.isFinite(taxRate) && taxRate > 0 && taxRate <= 100 ? taxRate : 0;
  const tax = Math.round(subtotal * rate) / 100;
  return { lines, subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100 };
}

/**
 * Make sure the published service catalogue exists. Idempotent: creates
 * missing entries and never overwrites edits staff have made to existing ones.
 */
export async function ensureServiceCatalogue(): Promise<void> {
  const existing = await db.serviceOffering.findMany({ select: { slug: true } });
  const have = new Set(existing.map((e) => e.slug));
  for (const entry of SERVICE_CATALOGUE) {
    if (have.has(entry.slug)) continue;
    await db.serviceOffering
      .create({
        data: {
          slug: entry.slug,
          name: entry.name,
          category: entry.category,
          summary: entry.summary,
          description: entry.description,
          benefits: JSON.stringify(entry.benefits),
          deliverables: JSON.stringify(entry.deliverables),
          scope: entry.scope,
          pricingModel: entry.pricingModel,
          priceAmount: entry.priceAmount,
          currency: entry.currency,
          billingInterval: entry.billingInterval,
          deliveryTimeframe: entry.deliveryTimeframe,
          terms: entry.terms,
          sortOrder: entry.sortOrder,
          internalFulfilment: JSON.stringify(entry.internalFulfilment),
        },
      })
      .catch(() => undefined); // lost a race with another request — already there
  }
}

/**
 * Create the client company, its account record and the owner membership for
 * a newly registered client user. Used by self-registration, OAuth sign-up and
 * staff-created clients so all three produce an identical, correctly-typed
 * tenant (`accountType: 'client'`).
 */
export async function provisionClientAccount(input: {
  userId: string;
  companyName: string;
  billingEmail?: string | null;
}): Promise<{ companyId: string }> {
  const base =
    input.companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'client';
  const slug = `${base}-${randomBytes(4).toString('hex')}`;
  const company = await db.company.create({
    data: {
      name: input.companyName.slice(0, 120),
      slug,
      accountType: 'client',
      users: { create: { userId: input.userId, role: 'owner' } },
      clientAccount: { create: { billingEmail: input.billingEmail ?? null } },
    },
    select: { id: true },
  });
  return { companyId: company.id };
}
