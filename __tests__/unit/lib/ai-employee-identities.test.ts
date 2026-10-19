// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getDepartmentRegistry } from '@/lib/department-registry';
import { AI_EMPLOYEE_MANAGED_BY, buildAIEmployeePlan, verifyAIEmployeeIdentities, type AIEmployeeVerificationRecord } from '@/lib/workforce/employee-identities';
import { MANAGED_BY } from '@/lib/workforce/constants';
import { buildWorkforcePlan } from '@/lib/workforce/plan';

const workforcePlan = buildWorkforcePlan(getDepartmentRegistry().getAllDepartments());
const employeePlan = buildAIEmployeePlan(workforcePlan.agents);
const companyId = 'company-test';

function verifiedRows(): AIEmployeeVerificationRecord[] {
  return employeePlan.map((spec) => ({
    id: `identity-${spec.sequence}`,
    employeeKey: spec.employeeKey,
    companyId,
    departmentId: `department-${spec.departmentSlug}`,
    agentDbId: `agent-db-${spec.sequence}`,
    roleKey: spec.roleKey,
    title: spec.title,
    status: 'provisioned',
    managedBy: AI_EMPLOYEE_MANAGED_BY,
    planVersion: spec.planVersion,
    configurationHash: spec.configurationHash,
    supervisorEmployeeKey: spec.supervisorEmployeeKey,
    lastVerifiedAt: null,
    lastVerificationExecutionId: null,
    agentKey: spec.agentKey,
    agentCompanyId: companyId,
    agentDepartmentId: `department-${spec.departmentSlug}`,
    agentDepartmentSlug: spec.departmentSlug,
    agentDepartmentCompanyId: companyId,
    agentManagedBy: MANAGED_BY,
    executionEvidenceValid: false,
  }));
}

describe('AI employee identity plan and verifier', () => {
  it('creates 2,000 distinct tenant-owned identities without pinning model instances', () => {
    expect(employeePlan).toHaveLength(2000);
    expect(new Set(employeePlan.map((spec) => spec.employeeKey)).size).toBe(2000);
    expect(new Set(employeePlan.map((spec) => spec.agentKey)).size).toBe(2000);
    expect(employeePlan[0].employeeKey).toBe('AIEMP-0001');
    expect(employeePlan[1999].employeeKey).toBe('AIEMP-2000');
    expect(employeePlan.every((spec) => spec.modelPolicy.length > 0 && spec.status === 'provisioned')).toBe(true);
    expect(employeePlan.every((spec) => !('pinnedModel' in spec))).toBe(true);
  });

  it('assigns 20 identities per department and gives non-directors a director supervisor', () => {
    const counts = new Map<string, number>();
    for (const spec of employeePlan) counts.set(spec.departmentSlug, (counts.get(spec.departmentSlug) ?? 0) + 1);
    expect(counts.size).toBe(100);
    expect([...counts.values()].every((count) => count === 20)).toBe(true);
    expect(employeePlan.filter((spec) => spec.roleKey === 'director').every((spec) => spec.supervisorEmployeeKey === null)).toBe(true);
    expect(employeePlan.filter((spec) => spec.roleKey !== 'director').every((spec) => /^AIEMP-\d{4}$/.test(spec.supervisorEmployeeKey ?? ''))).toBe(true);
  });

  it('verifies exact count, tenant/agent/department assignment, policy hash, and supervisor coverage', () => {
    const report = verifyAIEmployeeIdentities(employeePlan, verifiedRows(), companyId);
    expect(report.ok).toBe(true);
    expect(report.counts).toMatchObject({ identities: 2000, active: 0, provisioned: 2000, missing: 0, orphaned: 0, invalidExecutionEvidence: 0 });
    expect(report.checks.every((check) => check.pass)).toBe(true);
  });

  it('fails closed on a missing identity and an orphan, without counting either as coverage', () => {
    const rows = verifiedRows();
    rows[0] = { ...rows[0], employeeKey: 'AIEMP-9999' };
    const report = verifyAIEmployeeIdentities(employeePlan, rows, companyId);
    expect(report.ok).toBe(false);
    expect(report.counts.missing).toBe(1);
    expect(report.counts.orphaned).toBe(1);
    expect(report.checks.find((check) => check.name === 'employee.plan_coverage')?.pass).toBe(false);
    expect(report.checks.find((check) => check.name === 'employee.no_orphans')?.pass).toBe(false);
  });

  it('fails closed on duplicate employee keys and multiple identities for one agent', () => {
    const rows = verifiedRows();
    rows[1] = { ...rows[1], employeeKey: rows[0].employeeKey, agentDbId: rows[0].agentDbId };
    const report = verifyAIEmployeeIdentities(employeePlan, rows, companyId);
    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.name === 'employee.keys.unique')?.pass).toBe(false);
    expect(report.checks.find((check) => check.name === 'employee.agents.unique')?.pass).toBe(false);
  });

  it('rejects foreign company, department, unmanaged agent, and plan configuration drift', () => {
    const rows = verifiedRows();
    rows[0] = { ...rows[0], agentCompanyId: 'company-other', agentDepartmentCompanyId: 'company-other', agentManagedBy: 'manual' };
    rows[1] = { ...rows[1], configurationHash: 'tampered' };
    const report = verifyAIEmployeeIdentities(employeePlan, rows, companyId);
    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.name === 'employee.tenant_isolation')?.pass).toBe(false);
    expect(report.checks.find((check) => check.name === 'employee.configuration')?.pass).toBe(false);
  });

  it('requires valid execution evidence for tested or active identities', () => {
    const rows = verifiedRows();
    rows[0] = { ...rows[0], status: 'active', lastVerifiedAt: new Date(), lastVerificationExecutionId: 'exec-1' };
    const failed = verifyAIEmployeeIdentities(employeePlan, rows, companyId);
    expect(failed.ok).toBe(false);
    expect(failed.counts.invalidExecutionEvidence).toBe(1);

    rows[0] = { ...rows[0], executionEvidenceValid: true };
    const passed = verifyAIEmployeeIdentities(employeePlan, rows, companyId);
    expect(passed.ok).toBe(true);
  });
});
