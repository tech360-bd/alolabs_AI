/**
 * Tenant-scoped storage for research findings (Phase D).
 *
 * Findings are stored as `Artifact` rows with `metadata.kind='research_report'`.
 * Rationale (unchanged from Phase C2): `Artifact` is company-scoped and free-form,
 * so no migration is needed to persist evidence, and it is already covered by the
 * tenant-isolation rules. `RagDocument` would require a collection and a chunking
 * pipeline that this phase does not need.
 *
 * Every read/write is filtered by `companyId`. A report id from another tenant
 * resolves to `null`, never to data.
 */

import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import type { PageAnalysis, ResearchCitation } from '@/lib/research/public-page';

export const RESEARCH_KIND = 'research_report';

export interface ResearchReport {
  id: string;
  name: string;
  createdAt: string;
  url: string;
  finalUrl: string;
  status: number;
  fetchedAt: string;
  sha256: string;
  bytes: number;
  title: string;
  citations: ResearchCitation[];
  note: string | null;
  restricted: boolean;
  signals: string[];
  /** Full analysis, only returned by the single-report endpoint. */
  analysis?: PageAnalysis;
}

function safeParse(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Persist one analysis. Returns the artifact id plus the checksum actually stored. */
export async function saveResearchReport(input: {
  companyId: string;
  createdBy: string | null;
  analysis: PageAnalysis;
  note?: string | null;
}): Promise<{ id: string; checksum: string }> {
  const { companyId, createdBy, analysis } = input;
  const note = (input.note ?? '').slice(0, 500) || null;
  const content = JSON.stringify({ kind: RESEARCH_KIND, analysis, note });
  const checksum = createHash('sha256').update(content).digest('hex');
  const host = (() => {
    try {
      return new URL(analysis.finalUrl || analysis.requestedUrl).host;
    } catch {
      return 'unknown-host';
    }
  })();

  const metadata = {
    kind: RESEARCH_KIND,
    url: analysis.requestedUrl,
    finalUrl: analysis.finalUrl,
    status: analysis.status,
    fetchedAt: analysis.fetchedAt,
    sha256: analysis.sha256,
    bytes: analysis.bytes,
    citations: analysis.citations,
    restricted: analysis.access.restricted,
    signals: analysis.access.signals,
    note,
    javascriptRendered: analysis.javascriptRendered,
  };

  const artifact = await db.artifact.create({
    data: {
      name: `Research · ${host} · ${analysis.fetchedAt.slice(0, 10)}`.slice(0, 200),
      type: 'json',
      mimeType: 'application/json',
      content,
      size: Buffer.byteLength(content, 'utf-8'),
      checksum,
      metadata: JSON.stringify(metadata),
      companyId,
      createdBy,
    },
    select: { id: true },
  });

  return { id: artifact.id, checksum };
}

function toReport(row: {
  id: string;
  name: string;
  createdAt: Date;
  content: string;
  metadata: string;
}): ResearchReport | null {
  const meta = safeParse(row.metadata);
  if (meta.kind !== RESEARCH_KIND) return null;
  const content = safeParse(row.content);
  const analysis = content.analysis as PageAnalysis | undefined;

  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    url: typeof meta.url === 'string' ? meta.url : '',
    finalUrl: typeof meta.finalUrl === 'string' ? meta.finalUrl : '',
    status: typeof meta.status === 'number' ? meta.status : 0,
    fetchedAt: typeof meta.fetchedAt === 'string' ? meta.fetchedAt : row.createdAt.toISOString(),
    sha256: typeof meta.sha256 === 'string' ? meta.sha256 : '',
    bytes: typeof meta.bytes === 'number' ? meta.bytes : 0,
    title: analysis?.title ?? row.name,
    citations: Array.isArray(meta.citations) ? (meta.citations as ResearchCitation[]) : [],
    note: typeof meta.note === 'string' ? meta.note : null,
    restricted: meta.restricted === true,
    signals: Array.isArray(meta.signals) ? meta.signals.filter((signal): signal is string => typeof signal === 'string') : [],
    ...(analysis ? { analysis } : {}),
  };
}

/** Recent research reports for one company. Metadata only (no full page text). */
export async function listResearchReports(companyId: string, limit = 10): Promise<ResearchReport[]> {
  const rows = await db.artifact.findMany({
    where: { companyId, type: 'json' },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit * 3, 10), 60),
    select: { id: true, name: true, createdAt: true, content: true, metadata: true },
  });
  return (rows as Array<{ id: string; name: string; createdAt: Date; content: string; metadata: string }>)
    .map(toReport)
    .filter((report: ResearchReport | null): report is ResearchReport => report !== null)
    .slice(0, Math.min(Math.max(limit, 1), 20))
    .map(({ analysis: _analysis, ...meta }: ResearchReport) => meta);
}

/** One report, tenant-scoped. Returns null for unknown ids and other tenants alike. */
export async function getResearchReport(id: string, companyId: string): Promise<ResearchReport | null> {
  const row = await db.artifact.findFirst({
    where: { id, companyId, type: 'json' },
    select: { id: true, name: true, createdAt: true, content: true, metadata: true },
  });
  if (!row) return null;
  return toReport(row);
}
