/**
 * Client project lifecycle.
 *
 *   requested → reviewing → quotation → approved → in_progress
 *             → client_review ⇄ revision → completed
 *
 * This is the ONLY state a client ever sees about a piece of work. How the
 * work is produced inside ALO Labs is tracked separately (ClientProjectExecution)
 * and is never mapped onto these statuses in any more detail than the four
 * client-facing stages below.
 */

export const PROJECT_STATUSES = [
  'requested',
  'reviewing',
  'quotation',
  'approved',
  'in_progress',
  'client_review',
  'revision',
  'completed',
  'cancelled',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  requested: 'Requested',
  reviewing: 'Reviewing',
  quotation: 'Quotation',
  approved: 'Approved',
  in_progress: 'In Progress',
  client_review: 'Client Review',
  revision: 'Revision',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/** The four things a client is told about work happening behind the scenes. */
export type ClientStage = 'service_received' | 'work_in_progress' | 'review_required' | 'deliverable_completed';

export const CLIENT_STAGE_LABELS: Record<ClientStage, string> = {
  service_received: 'Service received',
  work_in_progress: 'Work in progress',
  review_required: 'Review required',
  deliverable_completed: 'Deliverable completed',
};

export function clientStageFor(status: string): ClientStage {
  switch (status) {
    case 'in_progress':
    case 'revision':
    case 'approved':
      return 'work_in_progress';
    case 'client_review':
    case 'quotation':
      return 'review_required';
    case 'completed':
      return 'deliverable_completed';
    default:
      return 'service_received';
  }
}

/** Transitions ALO Labs staff may make. */
const STAFF_TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
  requested: ['reviewing', 'cancelled'],
  reviewing: ['quotation', 'approved', 'cancelled'],
  quotation: ['reviewing', 'cancelled'],
  approved: ['in_progress', 'cancelled'],
  in_progress: ['client_review', 'cancelled'],
  client_review: ['in_progress'],
  revision: ['in_progress', 'client_review'],
  completed: [],
  cancelled: [],
};

/**
 * Transitions a client may cause — and only through a specific action
 * (accepting a quotation, approving a deliverable, requesting a revision,
 * withdrawing a request). A client can never set a status directly.
 */
const CLIENT_TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
  requested: ['cancelled'],
  reviewing: ['cancelled'],
  quotation: ['approved', 'reviewing', 'cancelled'],
  approved: [],
  in_progress: [],
  client_review: ['completed', 'revision'],
  revision: [],
  completed: [],
  cancelled: [],
};

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === 'string' && (PROJECT_STATUSES as readonly string[]).includes(value);
}

export function canTransition(actor: 'staff' | 'client', from: string, to: string): boolean {
  if (!isProjectStatus(from) || !isProjectStatus(to)) return false;
  const table = actor === 'staff' ? STAFF_TRANSITIONS : CLIENT_TRANSITIONS;
  return table[from].includes(to);
}

/** Default progress shown for a status when staff have not set one. */
export function defaultProgressFor(status: string): number {
  switch (status) {
    case 'requested': return 5;
    case 'reviewing': return 10;
    case 'quotation': return 15;
    case 'approved': return 25;
    case 'in_progress': return 50;
    case 'revision': return 70;
    case 'client_review': return 85;
    case 'completed': return 100;
    default: return 0;
  }
}

/** What, if anything, the client must do next for a project in this status. */
export function pendingClientActionFor(status: string): string | null {
  switch (status) {
    case 'quotation': return 'Review and respond to your quotation';
    case 'client_review': return 'Review the delivered work and approve it or request a revision';
    default: return null;
  }
}

export const OPEN_PROJECT_STATUSES: readonly ProjectStatus[] = [
  'requested', 'reviewing', 'quotation', 'approved', 'in_progress', 'client_review', 'revision',
];

export const TICKET_STATUSES = ['open', 'awaiting_support', 'awaiting_client', 'resolved', 'closed'] as const;
export const TICKET_STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  awaiting_support: 'Awaiting our response',
  awaiting_client: 'Awaiting your reply',
  resolved: 'Resolved',
  closed: 'Closed',
};
