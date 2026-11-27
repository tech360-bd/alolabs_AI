/**
 * The controlled bridge between a client project and the internal work that
 * fulfils it. INTERNAL ONLY — nothing in `/api/portal/**` imports this file.
 *
 *   client project ──(staff starts work)──▶ ClientProjectExecution ──▶ AgentOS run
 *   client project ◀─(staff reviews + publishes)── deliverable ◀── run output
 *
 * Information crosses the wall in exactly two places, both initiated by staff:
 *
 *   INWARD   `startExecution` hands the client's requirements to AgentOS as a
 *            run objective. The run is NOT attributed to the client company
 *            and is linked to the project only by the execution row, which no
 *            client-facing query ever reads.
 *
 *   OUTWARD  `publishExecutionOutput` turns reviewed output into a client
 *            deliverable. It refuses unless a named reviewer has approved the
 *            execution, and it refuses any text that names internal systems
 *            (see client-safe.ts). What reaches the client is a document and
 *            a title — not a run, a plan, a model or an author.
 *
 * To the client the whole thing is a status: In Progress → Client Review.
 */

import { db } from '@/lib/db';
import { createRun, getRun } from '@/lib/runs';
import { ALO_TENANT } from '@/lib/workforce/constants';
import { tenantDb } from '@/lib/portal/tenant-db';
import { storeClientDocument } from '@/lib/portal/documents';
import { findInternalDetail } from '@/lib/client-services/client-safe';
import { OperationError, logActivity, notifyClient, setProjectStatus } from '@/lib/client-services/operations';

const DELIVERABLE_TYPES = ['document', 'report', 'software_release', 'project_file'] as const;
export type DeliverableType = (typeof DELIVERABLE_TYPES)[number];
export const isDeliverableType = (v: unknown): v is DeliverableType =>
  typeof v === 'string' && (DELIVERABLE_TYPES as readonly string[]).includes(v);

/** Hand a client project to the internal workforce. */
/**
 * The internal ALO Labs company — the tenant that owns staff-side work.
 *
 * Resolved by the tenant slug pinned in `workforce/constants.ts`, which the seed
 * scripts also use, rather than by any guess about the company's name.
 */
async function resolveInternalCompanyId(): Promise<string> {
  const internal = await db.company.findUnique({
    where: { slug: ALO_TENANT.slug },
    select: { id: true, accountType: true },
  });
  if (!internal) {
    throw new Error(
      `Internal company '${ALO_TENANT.slug}' is missing. Staff-side runs cannot be attributed to a tenant.`,
    );
  }
  return internal.id;
}

export async function startExecution(input: {
  companyId: string;
  projectId: string;
  staffUserId: string;
  instructions?: string;
  workflowId?: string;
  priority?: string;
}) {
  const project = await tenantDb(input.companyId).clientProject.findOwned(input.projectId);
  if (!project) throw new OperationError(404, 'Client project not found.');
  if (!['approved', 'in_progress', 'revision'].includes(String(project.status))) {
    throw new OperationError(409, 'Work can only start on an approved project.');
  }

  const objective = [
    `Client service request ${project.reference}: ${project.title}`,
    `Service: ${project.serviceName}`,
    '',
    'Requirements:',
    String(project.requirements),
    ...(input.instructions ? ['', 'Delivery instructions:', input.instructions] : []),
    '',
    'Produce client-ready output. Do not describe how the work was produced.',
  ].join('\n');

  // The run is NOT attributed to the client company and carries no projectId —
  // the only link back to the client is the execution row, which no
  // client-facing query reads.
  //
  // It still needs a tenant of its own, and that tenant is the internal one.
  // Omitting the field entirely used to be "safe" only because the engine
  // silently substituted `'default-company'` at execution time (T-2) — an
  // unowned run pretending to be tenanted. Naming ALO Labs explicitly makes the
  // internal attribution a fact in the database rather than an accident of a
  // fallback, so the run is isolated from every client tenant on its own merits.
  const internalCompanyId = await resolveInternalCompanyId();
  const { runId, status } = await createRun({
    objective,
    companyId: internalCompanyId,
    userId: input.staffUserId,
    ...(input.workflowId ? { workflowId: input.workflowId } : {}),
    ...(input.priority ? { priority: input.priority } : {}),
  });

  const execution = await db.clientProjectExecution.create({
    data: {
      companyId: input.companyId,
      projectId: input.projectId,
      runId,
      workflowId: input.workflowId ?? null,
      objective,
      status: status === 'queued' ? 'queued' : 'running',
      startedByUserId: input.staffUserId,
    },
  });

  if (project.status !== 'in_progress') {
    await setProjectStatus(input.companyId, input.projectId, 'in_progress', 'staff');
  }
  return execution;
}

/** Bring an execution row up to date with its run. */
export async function syncExecution(executionId: string) {
  const execution = await db.clientProjectExecution.findUnique({ where: { id: executionId } });
  if (!execution) throw new OperationError(404, 'Execution not found.');
  if (!execution.runId || ['approved', 'rejected'].includes(execution.status)) return { execution, run: null };

  const run = await getRun(execution.runId);
  if (!run) return { execution, run: null };
  const next =
    run.status === 'completed' ? 'awaiting_review'
      : run.status === 'failed' || run.status === 'cancelled' ? 'failed'
        : run.status === 'queued' ? 'queued'
          : 'running';
  const updated = next === execution.status
    ? execution
    : await db.clientProjectExecution.update({ where: { id: executionId }, data: { status: next } });
  return { execution: updated, run };
}

/** Record the human review of an execution's output. */
export async function reviewExecution(input: {
  executionId: string;
  reviewerUserId: string;
  decision: 'approve' | 'reject';
  notes?: string;
}) {
  const { execution } = await syncExecution(input.executionId);
  if (execution.status !== 'awaiting_review') {
    throw new OperationError(409, 'Only completed work that is awaiting review can be reviewed.');
  }
  return db.clientProjectExecution.update({
    where: { id: execution.id },
    data: {
      status: input.decision === 'approve' ? 'approved' : 'rejected',
      reviewStatus: input.decision === 'approve' ? 'approved' : 'rejected',
      reviewedByUserId: input.reviewerUserId,
      reviewNotes: input.notes?.slice(0, 2000) ?? null,
    },
  });
}

export interface PublishDeliverableInput {
  companyId: string;
  projectId: string;
  staffUserId: string;
  title: string;
  description?: string;
  type?: DeliverableType;
  isFinal?: boolean;
  /** One of: an uploaded file, an external link, or reviewed text content. */
  file?: { name: string; type: string; buffer: Buffer };
  externalUrl?: string;
  content?: string;
  /** Move the project to Client Review (default true). */
  requestReview?: boolean;
}

/**
 * Deliver work to the client. Every piece of client-visible text is checked
 * for internal detail first; a finding blocks the delivery.
 */
export async function publishDeliverable(input: PublishDeliverableInput) {
  const tdb = tenantDb(input.companyId);
  const project = await tdb.clientProject.findOwned(input.projectId);
  if (!project) throw new OperationError(404, 'Client project not found.');
  if (!['in_progress', 'revision', 'client_review'].includes(String(project.status))) {
    throw new OperationError(409, 'Deliverables can only be published while a project is in progress.');
  }

  const title = input.title.trim().slice(0, 200);
  if (!title) throw new OperationError(400, 'A deliverable title is required.');
  const description = input.description?.trim().slice(0, 2000) || null;
  const findings = findInternalDetail([title, description ?? '', input.content ?? ''].join('\n'));
  if (findings.length) {
    throw new OperationError(
      422,
      `This content refers to internal systems and cannot be sent to a client (${findings.map((f) => `${f.label}: "${f.excerpt}"`).join('; ')}). Edit it and try again.`,
    );
  }

  let externalUrl: string | null = null;
  if (input.externalUrl) {
    let parsed: URL;
    try { parsed = new URL(input.externalUrl); } catch { throw new OperationError(400, 'The download link is not a valid URL.'); }
    if (parsed.protocol !== 'https:') throw new OperationError(400, 'Download links must use https.');
    externalUrl = parsed.toString();
  }

  const file = input.file
    ?? (input.content
      ? { name: `${title.replace(/[^\w.-]+/g, '-').slice(0, 80) || 'deliverable'}.md`, type: 'text/markdown', buffer: Buffer.from(input.content, 'utf8') }
      : undefined);
  if (!file && !externalUrl) throw new OperationError(400, 'Provide a file, reviewed content or a download link.');

  const document = file
    ? await storeClientDocument({
        companyId: input.companyId,
        projectId: input.projectId,
        kind: 'deliverable',
        file,
        uploadedByType: 'service_team',
        uploadedByUserId: input.staffUserId,
      })
    : null;

  // A new version replaces earlier unapproved versions of the same title.
  const previous = await tdb.clientDeliverable.findMany({ where: { projectId: input.projectId, title }, orderBy: { version: 'desc' }, take: 1 });
  await tdb.clientDeliverable.updateMany({
    where: { projectId: input.projectId, title, status: { in: ['delivered', 'revision_requested'] } },
    data: { status: 'superseded' },
  });
  const deliverable = await tdb.clientDeliverable.create({
    data: {
      projectId: input.projectId,
      title,
      description,
      type: input.type ?? 'document',
      version: previous.length ? Number(previous[0].version) + 1 : 1,
      isFinal: Boolean(input.isFinal),
      status: 'delivered',
      documentId: document?.id ?? null,
      downloadUrl: externalUrl,
    },
  });

  await logActivity(input.companyId, {
    projectId: input.projectId,
    entityType: 'deliverable',
    entityId: deliverable.id,
    type: 'deliverable.delivered',
    summary: `Deliverable ready: ${title}`,
    actorType: 'service_team',
  });
  if (input.requestReview !== false && project.status !== 'client_review') {
    await setProjectStatus(input.companyId, input.projectId, 'client_review', 'staff', { silent: true });
  }
  await notifyClient(input.companyId, {
    type: 'deliverable.ready',
    title: `Ready for your review: ${title}`,
    message: `New work has been delivered on ${project.title}. Please review it and approve it or request changes.`,
    link: `/portal/projects/${input.projectId}`,
  });
  return deliverable;
}

/** Publish the reviewed output of an execution as a client deliverable. */
export async function publishExecutionOutput(input: {
  executionId: string;
  staffUserId: string;
  title: string;
  description?: string;
  type?: DeliverableType;
  isFinal?: boolean;
  /** Reviewer-edited content. Defaults to the run's own summary. */
  content?: string;
}) {
  const execution = await db.clientProjectExecution.findUnique({ where: { id: input.executionId } });
  if (!execution) throw new OperationError(404, 'Execution not found.');
  if (execution.status !== 'approved' || execution.reviewStatus !== 'approved') {
    throw new OperationError(409, 'Output must be reviewed and approved before it is sent to the client.');
  }
  const run = execution.runId ? await getRun(execution.runId) : null;
  const content = (input.content ?? run?.summary ?? '').trim();
  if (!content) throw new OperationError(400, 'There is no output to publish. Provide the reviewed content.');

  return publishDeliverable({
    companyId: execution.companyId,
    projectId: execution.projectId,
    staffUserId: input.staffUserId,
    title: input.title,
    description: input.description,
    type: input.type,
    isFinal: input.isFinal,
    content,
  });
}
