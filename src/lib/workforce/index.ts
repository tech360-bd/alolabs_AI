/**
 * ALO Labs workforce — department and primary-agent factory.
 *
 *   buildWorkforcePlan(registry)  pure, deterministic plan (100 departments, 2,000 agents)
 *   provisionWorkforce(store,plan) idempotent upsert with conflict refusal
 *   verifyWorkforce(plan, rows)   configuration verifier (no "operational" claims)
 *   createPrismaWorkforceStore()  database adapter
 */
export * from './constants';
export * from './roles';
export * from './canonical';
export { buildWorkforcePlan, approvedToolsFor, slugify, agentSpecHash, departmentSpecHash } from './plan';
export type { WorkforcePlan, DepartmentSpec, AgentSpec } from './plan';
export { provisionWorkforce, departmentWrite, agentWrite, isManagedAgent, isManagedDepartment } from './provision';
export type { WorkforceStore, ProvisionReport, StoredAgent, StoredDepartment, AgentWrite, DepartmentWrite } from './provision';
export { verifyWorkforce } from './verify';
export type { VerifyReport, VerifyCheck } from './verify';
export { createPrismaWorkforceStore } from './prisma-store';
