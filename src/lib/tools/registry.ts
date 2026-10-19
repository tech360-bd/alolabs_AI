/**
 * Built-in tool registry.
 *
 * Every handler is read-only and tenant-scoped. There is intentionally no
 * shell, filesystem write, raw SQL, HTTP-to-anywhere, or payment tool: those
 * would need a separate approval-gated subsystem and are out of scope here.
 */

import { db } from '@/lib/db';
import { agentCompanyScope } from '@/lib/agent-access';
import { retrieveRelevantKnowledge } from '@/lib/agent-runtime/pipeline';
import type { ToolDefinition, ToolContext } from './types';
import { evaluateArithmetic } from './arithmetic';

const MAX_ROWS = 20;

function asString(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

/* ── search_knowledge ─────────────────────────────────────────────────── */

const searchKnowledge: ToolDefinition = {
  name: 'search_knowledge',
  description:
    "Search the company's indexed knowledge base (documents, SOPs, policies and prior agent memory) and return the most relevant passages.",
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What to look for, in natural language.' },
      limit: { type: 'integer', minimum: 1, maximum: 10, description: 'Number of passages (default 5).' },
    },
    required: ['query'],
    additionalProperties: false,
  },
  category: 'knowledge',
  risk: 'low',
  requiresApproval: false,
  async handler(args, context) {
    const query = asString(args.query, 1000).trim();
    if (!query) throw new Error('query is required');

    const limit = Number.isFinite(Number(args.limit)) ? Math.min(10, Math.max(1, Number(args.limit))) : 5;
    const result = await retrieveRelevantKnowledge(query, context.departmentId ?? '', limit, context.companyId);

    return {
      query,
      totalFound: result.totalFound,
      results: result.results.map((item) => ({
        source: item.source,
        score: Number(item.score.toFixed(4)),
        content: item.content.slice(0, 1500),
      })),
    };
  },
};

/* ── crm_lookup_contact ───────────────────────────────────────────────── */

const crmLookupContact: ToolDefinition = {
  name: 'crm_lookup_contact',
  description:
    'Look up CRM contacts by name, email or company and return their status, score and open deals. Tenant-scoped.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Name, email or company fragment.' },
      limit: { type: 'integer', minimum: 1, maximum: 20 },
    },
    required: ['query'],
    additionalProperties: false,
  },
  category: 'crm',
  risk: 'low',
  requiresApproval: false,
  async handler(args, context) {
    const query = asString(args.query, 200).trim();
    if (!query) throw new Error('query is required');
    const limit = Number.isFinite(Number(args.limit)) ? Math.min(MAX_ROWS, Math.max(1, Number(args.limit))) : 5;

    const contacts = await db.crmContact.findMany({
      where: {
        companyId: context.companyId,
        OR: [
          { firstName: { contains: query } },
          { lastName: { contains: query } },
          { email: { contains: query } },
          { company: { contains: query } },
        ],
      },
      take: limit,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        company: true,
        status: true,
        score: true,
        lastContactAt: true,
        deals: { select: { title: true, value: true, stage: { select: { name: true } } }, take: 5 },
      },
    });

    return { query, count: contacts.length, contacts };
  },
};

/* ── crm_pipeline_summary ─────────────────────────────────────────────── */

const crmPipelineSummary: ToolDefinition = {
  name: 'crm_pipeline_summary',
  description: 'Summarise open CRM deals by pipeline stage, with counts and total value.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  category: 'crm',
  risk: 'low',
  requiresApproval: false,
  async handler(_args, context) {
    const deals = await db.crmDeal.findMany({
      where: { companyId: context.companyId },
      select: { value: true, stage: { select: { name: true } }, status: true },
      take: 2000,
    });

    const byStage = new Map<string, { count: number; value: number }>();
    for (const deal of deals) {
      const stage = deal.stage?.name ?? 'unassigned';
      const entry = byStage.get(stage) ?? { count: 0, value: 0 };
      entry.count += 1;
      entry.value += Number(deal.value) || 0;
      byStage.set(stage, entry);
    }

    return {
      totalDeals: deals.length,
      stages: [...byStage.entries()].map(([stage, entry]) => ({ stage, ...entry })),
    };
  },
};

/* ── department_directory ─────────────────────────────────────────────── */

const departmentDirectory: ToolDefinition = {
  name: 'department_directory',
  description:
    'List the active agents in a department (name, role, type) so an employee agent can decide who to delegate to.',
  parameters: {
    type: 'object',
    properties: {
      department: { type: 'string', description: 'Department slug or name. Defaults to the caller’s department.' },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
    },
    additionalProperties: false,
  },
  category: 'workforce',
  risk: 'low',
  requiresApproval: false,
  async handler(args, context) {
    const requestedDepartment = asString(args.department, 120).trim();
    const limit = Number.isFinite(Number(args.limit)) ? Math.min(50, Math.max(1, Number(args.limit))) : 20;

    // Department itself must be owned by the caller's company. This also
    // prevents a shared agent from using its foreign owner-department as the
    // implicit directory scope.
    const department = requestedDepartment
      ? await db.department.findFirst({
          where: {
            companyId: context.companyId,
            OR: [{ slug: requestedDepartment }, { name: requestedDepartment }],
          },
          select: { id: true },
        })
      : context.departmentId
        ? await db.department.findFirst({
            where: { id: context.departmentId, companyId: context.companyId },
            select: { id: true },
          })
        : null;

    if (!department) return { count: 0, agents: [] };

    const agents = await db.agent.findMany({
      where: {
        status: 'active',
        departmentId: department.id,
        ...agentCompanyScope(context.companyId, 'execute'),
      },
      take: limit,
      select: { agentId: true, name: true, role: true, type: true, departmentName: true },
      orderBy: { agentId: 'asc' },
    });

    return { count: agents.length, agents };
  },
};

/* ── calculate ────────────────────────────────────────────────────────── */

const calculate: ToolDefinition = {
  name: 'calculate',
  description: 'Evaluate an arithmetic expression (+ - * / parentheses). No variables, no functions.',
  parameters: {
    type: 'object',
    properties: { expression: { type: 'string', description: 'e.g. (1200 * 1.15) - 300' } },
    required: ['expression'],
    additionalProperties: false,
  },
  category: 'utility',
  risk: 'low',
  requiresApproval: false,
  async handler(args) {
    const expression = asString(args.expression, 200).trim();
    if (!expression) throw new Error('expression is required');
    return { expression, result: evaluateArithmetic(expression) };
  },
};

/* ── Registry ─────────────────────────────────────────────────────────── */

const DEFINITIONS: ToolDefinition[] = [
  searchKnowledge,
  crmLookupContact,
  crmPipelineSummary,
  departmentDirectory,
  calculate,
];

const REGISTRY = new Map<string, ToolDefinition>(DEFINITIONS.map((tool) => [tool.name, tool]));

export function getTool(name: string): ToolDefinition | undefined {
  return REGISTRY.get(name);
}

export function listToolDefinitions(): ToolDefinition[] {
  return [...REGISTRY.values()];
}

/** Definitions in the shape the router expects, limited to what an agent may call. */
export function toolSchemasFor(allowedNames: string[]) {
  return allowedNames
    .map((name) => REGISTRY.get(name))
    .filter((tool): tool is ToolDefinition => Boolean(tool))
    .map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
}

export { evaluateArithmetic } from './arithmetic';

export type { ToolContext };
