/**
 * Prisma-backed implementation of the workforce store port.
 *
 * Every read is chunked so large `IN (...)` lists stay well inside database
 * parameter limits. Creates are batched. Uniqueness constraints on
 * Company.slug, Department.slug/name and Agent.agentId/slug are the final
 * guard against duplicate rows if two provisioners ever race.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { db } from '@/lib/db';
import type {
  AgentWrite,
  DepartmentWrite,
  StoredAgent,
  StoredDepartment,
  WorkforceStore,
} from './provision';

const AGENT_INCLUDE = { department: { select: { slug: true } } } as const;

type AgentRowWithDept = Prisma.AgentGetPayload<{ include: typeof AGENT_INCLUDE }>;
type DeptRow = Prisma.DepartmentGetPayload<object>;

function toStoredDepartment(r: DeptRow): StoredDepartment {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    agentCount: r.agentCount,
    sortOrder: r.sortOrder,
    status: r.status,
    companyId: r.companyId,
    runtimeProfile: r.runtimeProfile,
  };
}

function toStoredAgent(r: AgentRowWithDept): StoredAgent {
  return {
    id: r.id,
    agentId: r.agentId,
    name: r.name,
    slug: r.slug,
    departmentId: r.departmentId,
    departmentSlug: r.department?.slug ?? null,
    departmentName: r.departmentName,
    purpose: r.purpose,
    type: r.type,
    role: r.role,
    allowedSkills: r.allowedSkills,
    forbiddenSkills: r.forbiddenSkills,
    allowedTools: r.allowedTools,
    forbiddenTools: r.forbiddenTools,
    inputSchema: r.inputSchema,
    outputSchema: r.outputSchema,
    workflowSteps: r.workflowSteps,
    protectionRules: r.protectionRules,
    approvalRules: r.approvalRules,
    handoffRules: r.handoffRules,
    qualityChecklist: r.qualityChecklist,
    selfImprovement: r.selfImprovement,
    productivityRules: r.productivityRules,
    status: r.status,
    version: r.version,
    companyId: r.companyId,
    systemInstructions: r.systemInstructions,
    runtimeProfile: r.runtimeProfile,
  };
}

const LOOKUP_CHUNK = 500;

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function createPrismaWorkforceStore(client: PrismaClient = db): WorkforceStore {
  return {
    async findTenantId(slug) {
      const row = await client.company.findUnique({ where: { slug }, select: { id: true } });
      return row?.id ?? null;
    },

    async createTenant({ slug, name }) {
      const row = await client.company.create({ data: { slug, name, status: 'active' }, select: { id: true } });
      return row.id;
    },

    async findDepartments({ slugs, names }) {
      const found = new Map<string, DeptRow>();
      for (const slugChunk of chunks(slugs, LOOKUP_CHUNK)) {
        const rows = await client.department.findMany({ where: { slug: { in: slugChunk } } });
        for (const r of rows) found.set(r.id, r);
      }
      for (const nameChunk of chunks(names, LOOKUP_CHUNK)) {
        const rows = await client.department.findMany({ where: { name: { in: nameChunk } } });
        for (const r of rows) found.set(r.id, r);
      }
      return [...found.values()].map(toStoredDepartment);
    },

    async createDepartment(data) {
      const row = await client.department.create({
        data: {
          name: data.name,
          slug: data.slug,
          description: data.description,
          agentCount: data.agentCount,
          sortOrder: data.sortOrder,
          status: data.status,
          companyId: data.companyId,
          runtimeProfile: data.runtimeProfile,
        },
        select: { id: true },
      });
      return row.id;
    },

    async updateDepartment(id, data: Omit<DepartmentWrite, 'slug'>) {
      await client.department.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description,
          agentCount: data.agentCount,
          sortOrder: data.sortOrder,
          companyId: data.companyId,
          runtimeProfile: data.runtimeProfile,
        },
      });
    },

    async findAgents({ agentIds, slugs }) {
      const found = new Map<string, StoredAgent>();
      for (const c of chunks(agentIds, LOOKUP_CHUNK)) {
        for (const r of await client.agent.findMany({ where: { agentId: { in: c } }, include: AGENT_INCLUDE })) {
          found.set(r.id, toStoredAgent(r));
        }
      }
      for (const c of chunks(slugs, LOOKUP_CHUNK)) {
        for (const r of await client.agent.findMany({ where: { slug: { in: c } }, include: AGENT_INCLUDE })) {
          found.set(r.id, toStoredAgent(r));
        }
      }
      return [...found.values()];
    },

    async loadAll() {
      const [deptRows, agentRows] = await Promise.all([
        client.department.findMany(),
        client.agent.findMany({ include: AGENT_INCLUDE }),
      ]);
      return {
        departments: deptRows.map(toStoredDepartment),
        agents: agentRows.map(toStoredAgent),
      };
    },

    async createAgents(rows: Array<AgentWrite & { status: string }>) {
      await client.agent.createMany({ data: rows });
    },

    async updateAgent(id, data: Omit<AgentWrite, 'agentId'>) {
      await client.agent.update({ where: { id }, data });
    },
  };
}
