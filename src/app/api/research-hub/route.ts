import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

// ── Helpers ─────────────────────────────────────────────────────────
function paginate<T>(items: T[], page: number, limit: number) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const offset = (page - 1) * limit;
  return {
    data: items.slice(offset, offset + limit),
    pagination: { page, limit, total, pages },
  };
}

async function loadRecords(prefix: string) {
  const records = await db.settings.findMany({
    where: { key: { startsWith: prefix } },
    orderBy: { createdAt: 'desc' },
  });
  const results: Record<string, unknown>[] = [];
  for (const rec of records) {
    try {
      const parsed = JSON.parse(rec.value);
      results.push({ ...parsed, dbId: rec.id });
    } catch {
      // skip malformed records
    }
  }
  return results;
}

function filterByField(
  items: Record<string, unknown>[],
  field: string,
  value: string | null,
): Record<string, unknown>[] {
  if (!value || !field) return items;
  return items.filter((item) => {
    const v = item[field];
    if (Array.isArray(v)) return v.includes(value);
    if (typeof v === 'string') return v === value;
    return false;
  });
}

function filterByStatus(
  items: Record<string, unknown>[],
  status?: string | null,
): Record<string, unknown>[] {
  if (!status) return items;
  return items.filter((item) => item.status === status);
}

function filterBySearch(
  items: Record<string, unknown>[],
  search: string | null,
  fields: string[],
): Record<string, unknown>[] {
  if (!search) return items;
  const q = search.toLowerCase();
  return items.filter((item) =>
    fields.some((f) => {
      const v = item[f];
      return typeof v === 'string' && v.toLowerCase().includes(q);
    }),
  );
}

function filterByDateRange(
  items: Record<string, unknown>[],
  from?: string | null,
  to?: string | null,
): Record<string, unknown>[] {
  if (!from && !to) return items;
  return items.filter((item) => {
    const d = (item.date || item.startDate || '') as string;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

// ── GET ─────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '20', 10)));
    const status = searchParams.get('status');
    const domain = searchParams.get('domain');
    const source = searchParams.get('source');
    const type = searchParams.get('type');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const search = searchParams.get('search');

    const allRecords = await loadRecords('research_hub:');

    const papers = allRecords.filter((r) => r._type === 'paper_analysis');
    const gaps = allRecords.filter((r) => r._type === 'gap');
    const proposals = allRecords.filter((r) => r._type === 'proposal');
    const journals = allRecords.filter((r) => r._type === 'journal');
    const conferences = allRecords.filter((r) => r._type === 'conference');
    const projects = allRecords.filter((r) => r._type === 'project');

    // Filter papers
    let filteredPapers = filterByStatus(papers, status);
    if (domain) filteredPapers = filterByField(filteredPapers, 'domain', domain);
    if (source) filteredPapers = filterByField(filteredPapers, 'venue', source);
    filteredPapers = filterByDateRange(filteredPapers, dateFrom, dateTo);
    filteredPapers = filterBySearch(filteredPapers, search, ['title', 'abstract']);

    // Filter research gaps
    let filteredGaps = gaps;
    if (domain) filteredGaps = filterByField(filteredGaps, 'domain', domain);
    if (status) filteredGaps = filterByField(filteredGaps, 'priority', status);
    filteredGaps = filterBySearch(filteredGaps, search, ['title', 'description']);

    // Filter proposals
    let filteredProposals = filterByStatus(proposals, status);
    filteredProposals = filterBySearch(filteredProposals, search, ['title']);

    // Filter journals
    let filteredJournals = journals;
    filteredJournals = filterBySearch(filteredJournals, search, ['name']);

    // Filter conferences
    let filteredConferences = filterByStatus(conferences, status);
    filteredConferences = filterByDateRange(filteredConferences, dateFrom, dateTo);
    filteredConferences = filterBySearch(filteredConferences, search, ['name']);

    // Filter projects
    let filteredProjects = filterByStatus(projects, status);
    if (type) filteredProjects = filterByField(filteredProjects, 'type', type);
    filteredProjects = filterByDateRange(filteredProjects, dateFrom, dateTo);
    filteredProjects = filterBySearch(filteredProjects, search, ['name', 'description']);

    // Compute stats from real data only
    const totalCitations = papers.reduce(
      (sum, p) => sum + (typeof p.citations === 'number' ? p.citations : 0),
      0,
    );
    const avgProjectProgress = projects.length > 0
      ? Math.round(projects.reduce((sum, p) => sum + (typeof p.progress === 'number' ? p.progress : 0), 0) / projects.length)
      : 0;

    const stats = {
      totalPapers: papers.length,
      publishedPapers: papers.filter((p) => p.status === 'published').length,
      underReviewPapers: papers.filter((p) => p.status === 'under-review').length,
      draftPapers: papers.filter((p) => p.status === 'draft').length,
      totalCitations,
      activeProjects: projects.filter((p) => p.status === 'active').length,
      totalBudget: '$0',
      avgProjectProgress,
      upcomingDeadlines: conferences.filter((c) => c.status === 'submission-open').length,
    };

    const data = {
      papers: paginate(filteredPapers, page, limit),
      researchGaps: paginate(filteredGaps, page, limit),
      proposals: paginate(filteredProposals, page, limit),
      journals: paginate(filteredJournals, page, limit),
      conferences: paginate(filteredConferences, page, limit),
      projects: paginate(filteredProjects, page, limit),
      stats,
    };

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Research Hub GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── POST ────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const { action, ...payload } = body as { action: string; [key: string]: unknown };

    // ── Action: create_project ──────────────────────────────────────
    if (action === 'create_project') {
      const { name, description, lead, teamSize, budget, startDate, endDate, milestones } = payload as {
        name: string;
        description?: string;
        lead?: string;
        teamSize?: number;
        budget?: string;
        startDate?: string;
        endDate?: string;
        milestones?: string[];
      };

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
      }

      const projectData = {
        _type: 'project' as const,
        id: `proj-${Date.now()}`,
        name: name.trim(),
        description: description || '',
        status: 'planning',
        progress: 0,
        lead: lead || user.name,
        teamSize: teamSize || 1,
        budget: budget || '$0',
        spent: '$0',
        milestones: milestones || [],
        startDate: startDate || new Date().toISOString().split('T')[0],
        endDate: endDate || '',
        createdBy: user.userId,
        createdAt: new Date().toISOString(),
      };

      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const key = `research_hub:project:${slug}`;

      await db.settings.upsert({
        where: { key },
        update: { value: JSON.stringify(projectData), type: 'json', updatedAt: new Date() },
        create: { key, value: JSON.stringify(projectData), type: 'json' },
      });

      return NextResponse.json({ success: true, data: projectData });
    }

    // ── Action: submit_paper_analysis ───────────────────────────────
    if (action === 'submit_paper_analysis') {
      const { title, abstract, authors, arxivId, domain } = payload as {
        title: string;
        abstract?: string;
        authors?: string[];
        arxivId?: string;
        domain?: string;
      };

      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return NextResponse.json({ error: 'Paper title is required' }, { status: 400 });
      }

      const analysisData = {
        _type: 'paper_analysis' as const,
        id: `pa-${Date.now()}`,
        title: title.trim(),
        abstract: abstract || '',
        authors: authors || [],
        arxivId: arxivId || null,
        domain: domain || 'General',
        status: 'pending',
        citations: 0,
        submittedBy: user.userId,
        submittedAt: new Date().toISOString(),
        analysisResult: null,
      };

      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
      const key = `research_hub:paper_analysis:${slug}`;

      await db.settings.upsert({
        where: { key },
        update: { value: JSON.stringify(analysisData), type: 'json', updatedAt: new Date() },
        create: { key, value: JSON.stringify(analysisData), type: 'json' },
      });

      return NextResponse.json({ success: true, data: analysisData });
    }

    // ── Action: create_research_gap ─────────────────────────────────
    if (action === 'create_research_gap') {
      const { title, description, priority, domain, relatedPapers, suggestedApproaches } = payload as {
        title: string;
        description?: string;
        priority?: string;
        domain?: string;
        relatedPapers?: string[];
        suggestedApproaches?: string[];
      };

      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return NextResponse.json({ error: 'Research gap title is required' }, { status: 400 });
      }

      const validPriorities = ['low', 'medium', 'high', 'critical'];
      const gapPriority = validPriorities.includes(priority || '') ? priority : 'medium';

      const gapData = {
        _type: 'gap' as const,
        id: `gap-${Date.now()}`,
        title: title.trim(),
        description: description || '',
        priority: gapPriority,
        domain: domain || 'General',
        relatedPapers: relatedPapers || [],
        potentialImpact: gapPriority === 'high' || gapPriority === 'critical' ? 'high' : 'medium',
        suggestedApproaches: suggestedApproaches || [],
        createdBy: user.userId,
        createdAt: new Date().toISOString(),
      };

      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
      const key = `research_hub:gap:${slug}`;

      await db.settings.upsert({
        where: { key },
        update: { value: JSON.stringify(gapData), type: 'json', updatedAt: new Date() },
        create: { key, value: JSON.stringify(gapData), type: 'json' },
      });

      return NextResponse.json({ success: true, data: gapData });
    }

    // ── Action: create_proposal ─────────────────────────────────────
    if (action === 'create_proposal') {
      const { title, abstract: proposalAbstract, budget, duration, team, startDate, priority: propPriority } = payload as {
        title: string;
        abstract?: string;
        budget?: string;
        duration?: string;
        team?: string[];
        startDate?: string;
        priority?: string;
      };

      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return NextResponse.json({ error: 'Proposal title is required' }, { status: 400 });
      }

      const proposalData = {
        _type: 'proposal' as const,
        id: `prop-${Date.now()}`,
        title: title.trim(),
        abstract: proposalAbstract || '',
        status: 'draft',
        budget: budget || '$0',
        duration: duration || '3 months',
        team: team || [user.name],
        startDate: startDate || new Date().toISOString().split('T')[0],
        priority: propPriority || 'P2',
        createdBy: user.userId,
        createdAt: new Date().toISOString(),
      };

      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
      const key = `research_hub:proposal:${slug}`;

      await db.settings.upsert({
        where: { key },
        update: { value: JSON.stringify(proposalData), type: 'json', updatedAt: new Date() },
        create: { key, value: JSON.stringify(proposalData), type: 'json' },
      });

      return NextResponse.json({ success: true, data: proposalData });
    }

    // ── Action: generate (AI-assisted content generation) ───────────
    if (action === 'generate') {
      const { topic, type, section } = payload as {
        topic?: string;
        type?: string;
        section?: string;
      };

      if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
        return NextResponse.json({ error: 'Topic is required for generation' }, { status: 400 });
      }

      try {
        const { aiRouter } = await import('@/lib/ai-router');
        const sectionLabel = section ? ` for the "${section}" section` : '';
        const typeLabel = type === 'proposal' ? 'research proposal' : 'research';
        const prompt = `Generate ${typeLabel} content${sectionLabel} about: ${topic}. Respond with only the content, no preamble or explanation.`;

        const response = await aiRouter.chat({
          model: 'default',
          messages: [{ role: 'user', content: prompt }],
          maxTokens: 2000,
        });

        return NextResponse.json({ success: true, content: response.content });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: `AI generation failed: ${errorMsg}` }, { status: 502 });
      }
    }

    // ── Fallback: unknown action ────────────────────────────────────
    return NextResponse.json(
      { error: `Unknown action: ${action}. Supported: create_project, submit_paper_analysis, create_research_gap, create_proposal, generate` },
      { status: 400 },
    );
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Research Hub POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
