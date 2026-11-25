/**
 * /api/v1/knowledge — tenant knowledge-graph nodes over the existing
 * KnowledgeNode store (Shared AI Services: Knowledge Base + RAG source data).
 *
 *   GET  — list/search this company's nodes (scope: knowledge:read)
 *   POST — create a node in this company's graph (scope: knowledge:write)
 *
 * Scoping rule: every query filters on `companyId` from the authenticated
 * identity, never from the request. A guessed nodeId cannot cross tenants
 * because reads go through findMany with the companyId predicate, and node
 * creation always stamps the caller's companyId.
 *
 * Search (`q`) and filters are applied in memory after the scoped query so
 * behaviour is identical on the real Prisma client and the test fake DB.
 */
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { v1Handler, v1Body, v1Pagination, v1RateLimit, V1Error } from '@/lib/v1';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const NODE_TYPES = [
  'concept', 'entity', 'process', 'rule', 'skill', 'tool', 'document', 'person', 'department',
] as const;

const CreateNodeSchema = z.object({
  title: z.string().trim().min(1).max(300),
  type: z.enum(NODE_TYPES),
  content: z.string().max(50_000).optional(),
  domain: z.string().trim().max(100).optional(),
  departmentId: z.string().trim().max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  confidence: z.number().min(0).max(1).optional(),
  source: z.string().trim().max(100).optional(),
});

export const GET = v1Handler(async ({ identity }, request) => {
  await v1RateLimit(request, identity, '/api/v1/knowledge');
  const { limit, offset } = v1Pagination(request);
  const q = request.nextUrl.searchParams.get('q')?.trim().toLowerCase();
  const type = request.nextUrl.searchParams.get('type');
  const domain = request.nextUrl.searchParams.get('domain');

  // Tenant predicate first; text/enum filters applied in memory (fake-DB safe).
  const rows = await db.knowledgeNode.findMany({
    where: { companyId: identity.companyId },
    orderBy: { updatedAt: 'desc' },
  });

  const filtered = rows.filter((node: Record<string, unknown>) => {
    if (type && node.type !== type) return false;
    if (domain && node.domain !== domain) return false;
    if (q) {
      const haystack = `${String(node.title ?? '')} ${String(node.content ?? '')}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  // Public-safe projection: never expose raw metadata wholesale.
  const page = filtered.slice(offset, offset + limit).map((node: Record<string, unknown>) => ({
    nodeId: node.nodeId,
    title: node.title,
    type: node.type,
    domain: node.domain,
    content: node.content,
    confidence: node.confidence,
    source: node.source,
    version: node.version,
    updatedAt: node.updatedAt,
  }));

  return { nodes: page, limit, offset, hasMore: offset + limit < filtered.length };
});

export const POST = v1Handler(async ({ identity }, request) => {
  await v1RateLimit(request, identity, '/api/v1/knowledge');
  const body = await v1Body<unknown>(request);
  const parsed = CreateNodeSchema.safeParse(body);
  if (!parsed.success) {
    throw new V1Error(`Validation failed: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`, 400, 'VALIDATION_ERROR');
  }
  const data = parsed.data;

  const node = await db.knowledgeNode.create({
    data: {
      nodeId: `kn_${randomUUID()}`,
      companyId: identity.companyId,
      title: data.title,
      type: data.type,
      content: data.content ?? '',
      domain: data.domain ?? 'enterprise',
      departmentId: data.departmentId ?? null,
      metadata: JSON.stringify(data.metadata ?? {}),
      confidence: data.confidence ?? 1.0,
      source: data.source ?? 'api',
      version: 1,
    },
  });

  return {
    nodeId: node.nodeId,
    title: node.title,
    type: node.type,
    domain: node.domain,
    createdAt: node.createdAt,
  };
});
