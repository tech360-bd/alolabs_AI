/**
 * Policy-as-code catalogue.
 *
 * Every policy is code, versioned in git and shipped with the release. That is
 * deliberate: an agent cannot rewrite, disable or downgrade a rule at runtime,
 * because the only way to change a policy is a reviewed code change (and, once
 * tenant overrides exist, an authorised approval — see
 * docs/security/GOVERNANCE_POLICY_ENGINE.md).
 *
 * Rules for editing this file:
 *   1. Never reuse an `id` for a different rule. Add a new id instead.
 *   2. Bump `version` when behaviour changes.
 *   3. `allow` is only meaningful at organisation/project/user/agent level as an
 *      explicit, documented override; it can never relax a higher-level deny
 *      (the engine resolves by restrictiveness, not by recency).
 *   4. Every policy needs at least one entry in `tests` and that test must exist
 *      in __tests__/unit/governance-policy-engine.test.ts.
 */

import type { PolicyDefinition } from './types';

export const POLICY_CATALOG_VERSION = '2026.11.25.1';

/* ── Platform security ───────────────────────────────────────────────────── */

const PLATFORM_POLICIES: PolicyDefinition[] = [
  {
    id: 'SEC-TENANT-001',
    version: '1.0.0',
    name: 'Tenant boundary is absolute',
    description:
      'A request whose caller tenant differs from the tenant that owns the resource is always denied, regardless of role, surface, or any lower-level policy.',
    level: 'platform_security',
    severity: 'critical',
    match: {},
    invariant: 'tenant_boundary',
    enforcement: 'deny',
    reason: 'Cross-tenant access is not permitted. The caller and the resource belong to different organisations.',
    owner: 'platform-security',
    effectiveDate: '2026-11-25',
    reviewDate: '2027-05-25',
    tests: ['tenant-boundary-deny'],
  },
  {
    id: 'SEC-SECRET-001',
    version: '1.0.0',
    name: 'No secret or credential disclosure',
    description:
      'Reading, printing, exporting or transmitting raw credentials, API keys, tokens or hosting passwords through an agent action is denied. Credentials move only through the encrypted connector flow.',
    level: 'platform_security',
    severity: 'critical',
    match: { actionClasses: ['secret.access'] },
    enforcement: 'deny',
    reason: 'Credential material must never be read or disclosed through an agent action. Use the encrypted connector flow instead.',
    owner: 'platform-security',
    effectiveDate: '2026-11-25',
    reviewDate: '2027-05-25',
    tests: ['secret-access-deny'],
  },
  {
    id: 'SEC-PRIV-001',
    version: '1.0.0',
    name: 'Privilege changes need an authorised human',
    description:
      'Role, permission and admin-access changes require explicit approval from a Super Admin. A customer can never raise its own privilege level.',
    level: 'platform_security',
    severity: 'critical',
    match: { actionClasses: ['privilege.change'] },
    enforcement: 'require_approval',
    approvers: ['super_admin'],
    reason: 'Privilege changes require explicit Super Admin approval.',
    owner: 'platform-security',
    effectiveDate: '2026-11-25',
    reviewDate: '2027-05-25',
    tests: ['privilege-change-requires-super-admin', 'approval-token-satisfies'],
  },
  {
    id: 'SEC-POLICY-001',
    version: '1.0.0',
    name: 'Agents cannot rewrite their own governance',
    description:
      'Changes to governance policy, the agent registry, provider credentials or security controls require Super Admin approval and are always audited.',
    level: 'platform_security',
    severity: 'critical',
    match: { actionClasses: ['policy.change', 'agent.registry.change'] },
    enforcement: 'require_approval',
    approvers: ['super_admin'],
    reason: 'Governance, registry and security-control changes require explicit Super Admin approval.',
    owner: 'platform-security',
    effectiveDate: '2026-11-25',
    reviewDate: '2027-05-25',
    tests: ['policy-change-requires-super-admin'],
  },
  {
    id: 'SEC-SHELL-001',
    version: '1.0.0',
    name: 'No unsandboxed code execution',
    description:
      'Arbitrary code, shell or SQL execution is denied until it is routed through an isolated sandbox executor with CPU, memory, time and network limits. Production hosts are never an execution target.',
    level: 'platform_security',
    severity: 'critical',
    match: { actionClasses: ['code.execute.untrusted'] },
    enforcement: 'deny',
    reason: 'Arbitrary code execution is blocked: no verified sandbox executor is available for this request.',
    owner: 'platform-security',
    effectiveDate: '2026-11-25',
    reviewDate: '2027-05-25',
    tests: ['untrusted-code-deny'],
  },
  {
    id: 'SEC-WEBCHAT-001',
    version: '1.0.0',
    name: 'Public WebChat cannot reach internal systems',
    description:
      'The public chat surface may only read public knowledge. It can never read private memory, repositories, credentials, agent definitions, admin configuration or any other tenant record, and it can never mutate state.',
    level: 'platform_security',
    severity: 'critical',
    match: {
      surfaces: ['public_webchat'],
      actionClasses: [
        'secret.access',
        'data.export',
        'data.delete',
        'write.project',
        'agent.execute',
        'policy.change',
        'agent.registry.change',
        'privilege.change',
        'deploy.production',
        'deploy.preview',
        'dns.change',
        'infra.change',
        'financial.transact',
        'code.execute.untrusted',
        'schema.migrate',
      ],
    },
    enforcement: 'deny',
    reason: 'The public WebChat surface has no access to internal systems, private memory or state-changing actions.',
    owner: 'platform-security',
    effectiveDate: '2026-11-25',
    reviewDate: '2027-05-25',
    tests: ['webchat-internal-boundary-deny'],
  },
];

/* ── Legal and regulatory ────────────────────────────────────────────────── */

const LEGAL_POLICIES: PolicyDefinition[] = [
  {
    id: 'LEGAL-IP-001',
    version: '1.0.0',
    name: 'Voice and likeness rights',
    description:
      'High-impact media generation (voice cloning, real-person likeness, avatar reproduction) requires a recorded consent or licence before generation. Normal imagery stays automatic.',
    level: 'legal_regulatory',
    severity: 'high',
    match: { actionClasses: ['media.generate'], minDeclaredRisk: 'high' },
    enforcement: 'require_approval',
    approvers: ['organization_owner'],
    requiredEvidence: ['consentRecorded'],
    onMissingEvidence: 'deny',
    reason: 'Voice or likeness reproduction requires a recorded consent or licence before generation.',
    owner: 'legal',
    effectiveDate: '2026-11-25',
    reviewDate: '2027-02-25',
    tests: ['media-consent-evidence'],
  },
  {
    id: 'LEGAL-ADVICE-001',
    version: '1.0.0',
    name: 'Regulated professional documents need human review',
    description:
      'Legal, financial, medical or otherwise regulated documents and advice require human review before publication or delivery, and must be labelled as drafts where appropriate.',
    level: 'legal_regulatory',
    severity: 'high',
    match: { actionClasses: ['content.publish'], minDeclaredRisk: 'high' },
    enforcement: 'require_approval',
    approvers: ['organization_owner', 'project_manager'],
    requiredEvidence: ['humanReview'],
    reason: 'Regulated professional content requires recorded human review before publication.',
    owner: 'legal',
    effectiveDate: '2026-11-25',
    reviewDate: '2027-02-25',
    tests: ['regulated-content-human-review'],
  },
  {
    id: 'LEGAL-DATA-001',
    version: '1.0.0',
    name: 'Data export is approved and scoped',
    description:
      'Exporting tenant data outside the platform requires organisation-owner approval and an audit record. Bulk personal data exports are never automatic.',
    level: 'legal_regulatory',
    severity: 'high',
    match: { actionClasses: ['data.export'] },
    enforcement: 'require_approval',
    approvers: ['organization_owner'],
    reason: 'Exporting customer data outside the platform requires organisation-owner approval.',
    owner: 'legal',
    effectiveDate: '2026-11-25',
    reviewDate: '2027-02-25',
    tests: ['data-export-requires-owner'],
  },
];

/* ── Global operating rules ──────────────────────────────────────────────── */

const GLOBAL_POLICIES: PolicyDefinition[] = [
  {
    id: 'GLOB-DESTRUCT-001',
    version: '1.0.0',
    name: 'Destructive operations require approval and a rollback path',
    description:
      'Deleting data or running a destructive schema migration requires approval, a verified backup and a rollback plan. Without them the operation is denied, not deferred.',
    level: 'global',
    severity: 'critical',
    match: { actionClasses: ['data.delete', 'schema.migrate'] },
    enforcement: 'require_approval',
    approvers: ['super_admin', 'organization_owner'],
    requiredEvidence: ['backupTaken', 'rollbackPlan'],
    onMissingEvidence: 'deny',
    reason: 'Destructive operations require a verified backup, a rollback plan and explicit approval.',
    owner: 'platform-operations',
    effectiveDate: '2026-11-25',
    reviewDate: '2027-05-25',
    tests: ['destructive-requires-backup', 'destructive-missing-backup-deny'],
  },
  {
    id: 'GLOB-DEPLOY-001',
    version: '1.0.0',
    name: 'Production deployment is verified and approved',
    description:
      'A production deployment requires passing tests, a successful build, a rollback plan and explicit approval. A URL alone never authorises deployment.',
    level: 'global',
    severity: 'critical',
    match: { actionClasses: ['deploy.production'] },
    enforcement: 'require_approval',
    approvers: ['super_admin', 'organization_owner'],
    requiredEvidence: ['testsPassed', 'buildPassed', 'rollbackPlan'],
    onMissingEvidence: 'deny',
    reason: 'Production deployment requires passing tests, a successful build, a rollback plan and explicit approval.',
    owner: 'platform-operations',
    effectiveDate: '2026-11-25',
    reviewDate: '2027-05-25',
    tests: ['deploy-requires-evidence', 'deploy-with-evidence-needs-approval'],
  },
  {
    id: 'GLOB-DNS-001',
    version: '1.0.0',
    name: 'DNS and infrastructure changes are gated',
    description: 'DNS and infrastructure changes require approval and a rollback plan.',
    level: 'global',
    severity: 'high',
    match: { actionClasses: ['dns.change', 'infra.change'] },
    enforcement: 'require_approval',
    approvers: ['super_admin'],
    requiredEvidence: ['rollbackPlan'],
    onMissingEvidence: 'deny',
    reason: 'DNS and infrastructure changes require approval and a documented rollback plan.',
    owner: 'platform-operations',
    effectiveDate: '2026-11-25',
    reviewDate: '2027-05-25',
    tests: ['dns-requires-rollback'],
  },
  {
    id: 'GLOB-FIN-001',
    version: '1.0.0',
    name: 'No unauthorised financial transaction',
    description:
      'Payments, purchases and subscription changes require an authorised billing workflow, explicit approval and a recorded cost authorisation.',
    level: 'global',
    severity: 'critical',
    match: { actionClasses: ['financial.transact'] },
    enforcement: 'require_approval',
    approvers: ['super_admin', 'organization_owner'],
    requiredEvidence: ['costAuthorized'],
    onMissingEvidence: 'deny',
    reason: 'Financial transactions require an authorised billing workflow and explicit approval.',
    owner: 'finance',
    effectiveDate: '2026-11-25',
    reviewDate: '2027-05-25',
    tests: ['financial-requires-authorization'],
  },
  {
    id: 'GLOB-PAID-001',
    version: '1.0.0',
    name: 'Paid providers are never used silently',
    description:
      'A paid model or paid third-party service may only be used when the request carries an explicit cost authorisation. The router must report an honest limitation otherwise.',
    level: 'global',
    severity: 'high',
    match: { providerKinds: ['paid'] },
    enforcement: 'deny',
    requiredEvidence: ['costAuthorized'],
    onMissingEvidence: 'deny',
    reason: 'Paid AI or third-party providers require explicit cost authorisation; silent paid fallback is blocked.',
    owner: 'platform-operations',
    effectiveDate: '2026-11-25',
    reviewDate: '2027-02-25',
    tests: ['paid-provider-without-authorization-deny', 'paid-provider-with-authorization-allow'],
  },
  {
    id: 'GLOB-COMMS-001',
    version: '1.0.0',
    name: 'External communications and publishing need approval',
    description:
      'Sending customer communications or publishing content to an external service requires approval from an organisation owner or project manager (or a verified approval token).',
    level: 'global',
    severity: 'high',
    match: { actionClasses: ['external.communicate', 'content.publish'] },
    enforcement: 'require_approval',
    approvers: ['organization_owner', 'project_manager'],
    reason: 'External communication and publication require approval before anything leaves the platform.',
    owner: 'platform-operations',
    effectiveDate: '2026-11-25',
    reviewDate: '2027-02-25',
    tests: ['publish-requires-approval', 'approval-token-satisfies'],
  },
  {
    id: 'GLOB-EXTERNAL-001',
    version: '1.0.0',
    name: 'External reads are permitted but bounded',
    description:
      'Public research and read-only external calls are low-risk and proceed automatically, but remain subject to the emergency communication stop.',
    level: 'global',
    severity: 'low',
    match: { actionClasses: ['read.public', 'external.call'] },
    enforcement: 'allow',
    reason: 'Bounded, read-only external access is permitted.',
    owner: 'platform-operations',
    effectiveDate: '2026-11-25',
    reviewDate: '2027-02-25',
    tests: ['external-read-allow'],
  },
  {
    id: 'GLOB-PREVIEW-001',
    version: '1.0.0',
    name: 'Preview deploys stay isolated',
    description:
      'Preview environments are allowed within project scope and must never be presented as production. They cannot receive production credentials.',
    level: 'global',
    severity: 'moderate',
    match: { actionClasses: ['deploy.preview'] },
    enforcement: 'allow',
    reason: 'Isolated preview deployments are permitted; production remains a separate, gated action.',
    owner: 'platform-operations',
    effectiveDate: '2026-11-25',
    reviewDate: '2027-02-25',
    tests: ['preview-deploy-allow'],
  },
];

/* ── Organisation / project defaults ─────────────────────────────────────── */

const TENANT_POLICIES: PolicyDefinition[] = [
  {
    id: 'ORG-WRITE-001',
    version: '1.0.0',
    name: 'Project writes require a project member',
    description:
      'State-changing work inside a project requires an authenticated organisation member acting on that project. Anonymous or public callers are denied.',
    level: 'organization',
    severity: 'high',
    match: { actionClasses: ['write.project', 'agent.execute', 'queue.dispatch'] },
    invariant: 'member_required',
    enforcement: 'deny',
    reason: 'Public or anonymous callers cannot change project state.',
    owner: 'platform-security',
    effectiveDate: '2026-11-25',
    reviewDate: '2027-02-25',
    tests: ['project-write-requires-member'],
  },
  {
    id: 'PROJ-SCOPE-001',
    version: '1.0.0',
    name: 'Project scope is enforced server-side',
    description:
      'An action scoped to one project cannot mutate another project of the same organisation. The engine checks the resource identity, not a frontend flag.',
    level: 'project',
    severity: 'high',
    match: { actionClasses: ['write.project', 'deploy.preview', 'deploy.production'] },
    invariant: 'project_boundary',
    enforcement: 'deny',
    reason: 'This action targets a different project than the caller is authorised for.',
    owner: 'platform-security',
    effectiveDate: '2026-11-25',
    reviewDate: '2027-02-25',
    tests: ['project-mismatch-deny'],
  },
];

/**
 * The complete, immutable-at-runtime catalogue.
 *
 * Order does not matter: the engine always resolves by restrictiveness. It is
 * kept grouped by level for reviewability only.
 */
export const POLICY_CATALOG: readonly PolicyDefinition[] = Object.freeze([
  ...PLATFORM_POLICIES,
  ...LEGAL_POLICIES,
  ...GLOBAL_POLICIES,
  ...TENANT_POLICIES,
]);

export const POLICY_CATALOG_BY_ID: ReadonlyMap<string, PolicyDefinition> = new Map(
  POLICY_CATALOG.map((policy) => [policy.id, policy]),
);
