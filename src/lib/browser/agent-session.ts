/**
 * Browser Automation & Responsive Visual QA Policy (`anomalyco/browse` + Playwright).
 *
 * Separates safe read-only browsing (inspect, snapshot, responsive screenshot QA)
 * from mutating/sensitive browser actions (form submit, publish, purchase,
 * account/credential edits) which MUST stay gated behind human approval.
 */

export type BrowserActionKind =
  | 'navigate'
  | 'screenshot'
  | 'extract_dom'
  | 'check_links'
  | 'fill_form'
  | 'submit_form'
  | 'publish_content'
  | 'purchase_checkout'
  | 'account_mutation';

export interface BrowserActionDecision {
  action: BrowserActionKind;
  tier: 'read_only' | 'sensitive_mutation';
  requiresHumanApproval: boolean;
  reason: string;
}

const READ_ONLY_ACTIONS = new Set<BrowserActionKind>([
  'navigate',
  'screenshot',
  'extract_dom',
  'check_links',
]);

export function classifyBrowserAction(action: BrowserActionKind): BrowserActionDecision {
  if (READ_ONLY_ACTIONS.has(action)) {
    return {
      action,
      tier: 'read_only',
      requiresHumanApproval: false,
      reason: 'Read-only browsing & verification allowed under SSRF navigation guard.',
    };
  }
  return {
    action,
    tier: 'sensitive_mutation',
    requiresHumanApproval: true,
    reason: `Sensitive action "${action}" modifies external state or account/payment workflows and requires explicit human approval.`,
  };
}

export interface ViewportPreset {
  id: 'desktop' | 'tablet' | 'mobile';
  label: string;
  width: number;
  height: number;
}

/**
 * Standard 3-width screenshot verification targets aligned with
 * `abdiraimov-otabek/dashboard-design-skill` QA pass.
 */
export const QA_VIEWPORT_PRESETS: readonly ViewportPreset[] = [
  { id: 'desktop', label: 'Desktop (1440x900)', width: 1440, height: 900 },
  { id: 'tablet', label: 'Tablet (768x1024)', width: 768, height: 1024 },
  { id: 'mobile', label: 'Mobile (390x844)', width: 390, height: 844 },
];
