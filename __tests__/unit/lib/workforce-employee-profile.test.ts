/**
 * Employee workforce profile completeness — guideline enforcement.
 *
 * For EVERY one of the 2,000 provisioned plan specs, the 13-category
 * workforce profile (role, mission, skills, prompts, sops, tools, knowledge,
 * memory, authority, kpis, collaboration, escalation, security) must be
 * satisfiable from persisted plan data alone. If a single category of a
 * single employee goes empty, this suite fails.
 */

import { describe, expect, it } from 'vitest';
import { getDepartmentRegistry } from '@/lib/department-registry';
import { buildWorkforcePlan } from '@/lib/workforce/plan';
import { buildEmployeeWorkforceProfile, deriveEmployeePrompts, PROFILE_CATEGORIES } from '@/lib/workforce/employee-profile';
import type { AgentSpec } from '@/lib/workforce/plan';

const WORKFORCE_PLAN = buildWorkforcePlan(getDepartmentRegistry().getAllDepartments());

function identityInputFor(agent: AgentSpec) {
  return {
    employeeKey: `EMP-${agent.agentId}`,
    roleKey: agent.roleKey,
    title: agent.name,
    responsibilities: agent.purpose,
    modelPolicy: agent.modelConfig.policy,
    permissionProfile: JSON.stringify({ tenant: agent.departmentSlug, forbiddenTools: agent.forbiddenTools }),
    memoryScope: JSON.stringify({ scope: agent.memoryPolicy.scope }),
    resourceLimits: JSON.stringify(agent.resourceLimits),
    approvalPolicy: JSON.stringify({ requireApprovalFor: agent.approvalRules }),
    supervisorEmployeeKey: null,
  };
}

// Department KPIs come from the authored department registry via the plan.
function departmentKpisFor(agent: AgentSpec): string[] {
  const dept = WORKFORCE_PLAN.departments.find((d) => d.slug === agent.departmentSlug);
  if (!dept) throw new Error(`department ${agent.departmentSlug} missing from plan`);
  return dept.kpis;
}

describe('employee workforce profile — 13-category completeness', () => {
  it('covers all 2,000 planned employees', () => {
    expect(WORKFORCE_PLAN.agents).toHaveLength(2000);
  });

  it('every employee satisfies every guideline category', () => {
    const failures: string[] = [];

    for (const agent of WORKFORCE_PLAN.agents) {
      const profile = buildEmployeeWorkforceProfile(
        agent as unknown as Parameters<typeof buildEmployeeWorkforceProfile>[0],
        identityInputFor(agent),
        { kpis: departmentKpisFor(agent) },
      );

      for (const check of profile.completeness) {
        if (!check.satisfied) {
          failures.push(`${agent.agentId} (${agent.name}): ${check.category} — ${check.evidence}`);
        }
      }
    }

    expect(failures, `${failures.length} incomplete employee profile(s)`).toEqual([]);
  });

  it('emits exactly the 13 guideline categories', () => {
    expect(PROFILE_CATEGORIES).toHaveLength(13);
  });

  it('derives a deterministic, non-trivial prompt set for every employee', () => {
    for (const agent of WORKFORCE_PLAN.agents) {
      const prompts = deriveEmployeePrompts(agent);
      // 1 kickoff + 5 workflow steps + 3 quality gates + 1 escalation.
      expect(prompts.length, agent.agentId).toBeGreaterThanOrEqual(10);
      expect(prompts.some((p) => p.kind === 'kickoff'), agent.agentId).toBe(true);
      expect(prompts.some((p) => p.kind === 'escalation'), agent.agentId).toBe(true);
      for (const prompt of prompts) {
        expect(prompt.prompt.length, `${agent.agentId}:${prompt.label}`).toBeGreaterThan(40);
      }
    }
  });

  it('same input always yields the same prompts (no fabricated variance)', () => {
    const agent = WORKFORCE_PLAN.agents[0];
    const first = deriveEmployeePrompts(agent);
    const second = deriveEmployeePrompts(agent);
    expect(second).toEqual(first);
  });

  it('malformed JSON columns fail closed instead of throwing', () => {
    const agent = WORKFORCE_PLAN.agents[0];
    const broken = {
      ...agent,
      allowedSkills: '{not json',
      workflowSteps: '[',
      runtimeProfile: 'nope',
    } as unknown as Parameters<typeof buildEmployeeWorkforceProfile>[0];
    const profile = buildEmployeeWorkforceProfile(broken, identityInputFor(agent), {});
    expect(profile.skills).toEqual([]);
    expect(profile.prompts.taskPrompts.length).toBeGreaterThanOrEqual(2); // kickoff + escalation survive
    expect(profile.completeness.find((c) => c.category === 'skills')?.satisfied).toBe(false);
  });
});
