/**
 * Honest status derivation for a Commanding Center run.
 *
 * The status vocabulary is only useful if it refuses to overstate: an answer with
 * a blocked step is not "completed", and a pending approval is not a footnote.
 */

import { describe, expect, it } from 'vitest';
import {
  COMMAND_STATUSES,
  deriveCommandStatus,
  describeCommandStatus,
  type CommandApproval,
} from '@/lib/command-agent/status';

const approval: CommandApproval = {
  tool: 'send_campaign_email',
  approvalId: 'apr-1',
  approvers: ['organization_owner'],
  reason: 'External communication requires approval.',
};

describe('deriveCommandStatus', () => {
  it('completed only when an answer exists and every step succeeded', () => {
    expect(deriveCommandStatus({ content: 'Done.', trace: [{ ok: true }], approvals: [] })).toBe('completed');
    expect(deriveCommandStatus({ content: 'Done.', trace: [], approvals: [] })).toBe('completed');
  });

  it('partially_completed when a step failed but an answer was produced', () => {
    expect(
      deriveCommandStatus({ content: 'Here is what I found.', trace: [{ ok: true }, { ok: false }], approvals: [] }),
    ).toBe('partially_completed');
  });

  it('waiting_for_approval wins over a produced answer', () => {
    expect(
      deriveCommandStatus({ content: 'Waiting on you.', trace: [{ ok: false }], approvals: [approval] }),
    ).toBe('waiting_for_approval');
  });

  it('failed when there is no answer and no successful step', () => {
    expect(deriveCommandStatus({ content: '   ', trace: [{ ok: false }], approvals: [] })).toBe('failed');
  });

  it('does not treat a successful step as a completed answer', () => {
    expect(deriveCommandStatus({ content: '', trace: [{ ok: true }], approvals: [] })).toBe('partially_completed');
  });
});

describe('describeCommandStatus', () => {
  it('never softens a partial or pending result', () => {
    expect(describeCommandStatus('partially_completed')).toMatch(/partially completed/i);
    expect(describeCommandStatus('waiting_for_approval')).toMatch(/waiting for approval/i);
    expect(describeCommandStatus('failed')).toMatch(/failed/i);
    expect(describeCommandStatus('completed')).toMatch(/completed/i);
  });

  it('publishes a closed vocabulary', () => {
    expect([...COMMAND_STATUSES]).toEqual([
      'completed',
      'partially_completed',
      'waiting_for_approval',
      'failed',
    ]);
  });
});
