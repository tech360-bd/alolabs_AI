/**
 * Honest status vocabulary for a command-agent run.
 *
 * The rest of AgentOS uses Planned → Queued → Running → Waiting for approval →
 * Completed → Partially completed → Failed → Cancelled. A single chat turn is
 * synchronous, so only the terminal states apply — but they must be accurate:
 *
 *   - an answer produced while a tool was blocked is *partially completed*, not
 *     "completed";
 *   - a run paused for a human approval is *waiting for approval*, never
 *     "completed" with a footnote;
 *   - no answer and no successful tool is *failed*.
 *
 * This module is pure so the mapping is testable without a model or a database.
 */

export const COMMAND_STATUSES = [
  'completed',
  'partially_completed',
  'waiting_for_approval',
  'failed',
] as const

export type CommandStatus = (typeof COMMAND_STATUSES)[number]

export interface CommandApproval {
  tool: string
  /** Present when the governance gate created a bound approval. */
  approvalId: string | null
  /** Roles allowed to approve, as decided by the governance engine. */
  approvers: string[]
  reason: string
}

export interface CommandTraceLike {
  ok: boolean
}

export interface DeriveStatusInput {
  content: string
  trace: ReadonlyArray<CommandTraceLike>
  approvals: ReadonlyArray<CommandApproval>
}

export function deriveCommandStatus(input: DeriveStatusInput): CommandStatus {
  if (input.approvals.length > 0) return 'waiting_for_approval'

  const hasContent = input.content.trim().length > 0
  const hasSuccessfulStep = input.trace.some((step) => step.ok)

  // A tool ran but no answer was produced: work happened without a result the
  // operator can act on. That is partial, not complete.
  if (!hasContent) return hasSuccessfulStep ? 'partially_completed' : 'failed'
  if (input.trace.some((step) => !step.ok)) return 'partially_completed'
  return 'completed'
}

/** Human sentence for the UI; never upgrades a status into a claim. */
export function describeCommandStatus(status: CommandStatus): string {
  switch (status) {
    case 'completed':
      return 'Completed — every step succeeded.'
    case 'partially_completed':
      return 'Partially completed — at least one step failed or was blocked; the answer above reflects only what succeeded.'
    case 'waiting_for_approval':
      return 'Waiting for approval — a step needs a human decision before it can run.'
    case 'failed':
      return 'Failed — nothing completed. The detail below is the actual error.'
  }
}
