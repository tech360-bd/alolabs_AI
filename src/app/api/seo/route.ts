// ALO Labs AIOS — SEO Management API
// Create SEO audits, list audits and keywords, update SEO data

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

type AuditType = 'full' | 'technical' | 'content';

type AuditStatus = 'pending' | 'running' | 'completed' | 'failed';

interface SeoAudit {
  id: string;
  url: string;
  type: AuditType;
  score: number;
  status: AuditStatus;
  results: {
    performance: number | null;
    accessibility: number | null;
    seo: number | null;
    bestPractices: number | null;
    issues: Array<{ category: string; severity: 'info' | 'warning' | 'error'; message: string }>;
  };
  errorMessage?: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

interface SeoKeyword {
  id: string;
  keyword: string;
  url?: string;
  position: number;
  previousPosition: number;
  searchVolume: number;
  difficulty: number;
  clickThroughRate: number;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

interface CreateAuditRequest {
  url: string;
  type: AuditType;
}

interface UpdateSeoRequest {
  id: string;
  data: Partial<SeoAudit> | Partial<SeoKeyword>;
  kind: 'audit' | 'keyword';
}

// ─── Storage Helpers ──────────────────────────────────────────────────────────

const AUDIT_KEY_PREFIX = 'seo:audit:';
const KEYWORD_KEY_PREFIX = 'seo:keyword:';

async function saveAudit(audit: SeoAudit): Promise<void> {
  await db.settings.upsert({
    where: { key: `${AUDIT_KEY_PREFIX}${audit.id}` },
    update: {
      value: JSON.stringify(audit),
      type: 'json',
      updatedAt: new Date(),
    },
    create: {
      key: `${AUDIT_KEY_PREFIX}${audit.id}`,
      value: JSON.stringify(audit),
      type: 'json',
    },
  });
}

async function saveKeyword(keyword: SeoKeyword): Promise<void> {
  await db.settings.upsert({
    where: { key: `${KEYWORD_KEY_PREFIX}${keyword.id}` },
    update: {
      value: JSON.stringify(keyword),
      type: 'json',
      updatedAt: new Date(),
    },
    create: {
      key: `${KEYWORD_KEY_PREFIX}${keyword.id}`,
      value: JSON.stringify(keyword),
      type: 'json',
    },
  });
}

interface ListResult<T> {
  items: T[];
  total: number;
}

async function listAudits(limit: number, offset: number): Promise<ListResult<SeoAudit>> {
  const allSettings = await db.settings.findMany({
    where: { key: { startsWith: AUDIT_KEY_PREFIX } },
    orderBy: { createdAt: 'desc' },
  });
  const audits: SeoAudit[] = [];
  for (const setting of allSettings) {
    try { audits.push(JSON.parse(setting.value) as SeoAudit); } catch { /* skip */ }
  }
  return { items: audits.slice(offset, offset + limit), total: audits.length };
}

async function listKeywords(limit: number, offset: number): Promise<ListResult<SeoKeyword>> {
  const allSettings = await db.settings.findMany({
    where: { key: { startsWith: KEYWORD_KEY_PREFIX } },
    orderBy: { createdAt: 'desc' },
  });
  const keywords: SeoKeyword[] = [];
  for (const setting of allSettings) {
    try { keywords.push(JSON.parse(setting.value) as SeoKeyword); } catch { /* skip */ }
  }
  return { items: keywords.slice(offset, offset + limit), total: keywords.length };
}

// ─── Auth Helper ──────────────────────────────────────────────────────────────

async function authenticate(request: NextRequest): Promise<{ userId: string } | NextResponse> {
  const authHeader = await (await import('next/headers')).headers();
  const authorization = authHeader.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const token = authorization.substring(7);
  const session = await verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return session;
}

// ─── GET: List Audits and Keywords ─────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticate(request);
    if (authResult instanceof NextResponse) return authResult;

    const { searchParams } = new URL(request.url);
    const resource = searchParams.get('resource') || 'audits';
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

    if (resource === 'keywords') {
      const result = await listKeywords(limit, offset);
      return NextResponse.json({ data: result.items, total: result.total, limit, offset });
    }

    const result = await listAudits(limit, offset);
    return NextResponse.json({ data: result.items, total: result.total, limit, offset });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('SEO GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── POST: Create SEO Audit ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticate(request);
    if (authResult instanceof NextResponse) return authResult;

    const body = (await request.json()) as CreateAuditRequest;

    if (!body.url) {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }

    try {
      new URL(body.url);
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    const validTypes: AuditType[] = ['full', 'technical', 'content'];
    if (!body.type || !validTypes.includes(body.type)) {
      return NextResponse.json({ error: 'type must be one of: full, technical, content' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const auditId = crypto.randomUUID();

    const audit: SeoAudit = {
      id: auditId,
      url: body.url,
      type: body.type,
      score: 0,
      status: 'pending',
      results: {
        performance: null,
        accessibility: null,
        seo: null,
        bestPractices: null,
        issues: [],
      },
      userId: authResult.userId,
      createdAt: now,
      updatedAt: now,
    };

    await saveAudit(audit);

    // Audit log
    await db.auditLog.create({
      data: {
        userId: authResult.userId,
        action: 'seo_audit_create',
        resource: `${AUDIT_KEY_PREFIX}${auditId}`,
        details: JSON.stringify({ url: body.url, type: body.type }),
      },
    });

    return NextResponse.json({
      success: true,
      audit: {
        id: audit.id,
        url: audit.url,
        type: audit.type,
        score: audit.score,
        status: audit.status,
        createdAt: audit.createdAt,
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('SEO POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── PUT: Update SEO Data ──────────────────────────────────────────────────────

export async function PUT(request: NextRequest) {
  try {
    const authResult = await authenticate(request);
    if (authResult instanceof NextResponse) return authResult;

    const body = (await request.json()) as UpdateSeoRequest;

    if (!body.id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    if (body.kind !== 'audit' && body.kind !== 'keyword') {
      return NextResponse.json({ error: 'kind must be "audit" or "keyword"' }, { status: 400 });
    }

    const prefix = body.kind === 'audit' ? AUDIT_KEY_PREFIX : KEYWORD_KEY_PREFIX;

    const existing = await db.settings.findUnique({
      where: { key: `${prefix}${body.id}` },
    });

    if (!existing) {
      return NextResponse.json({ error: `${body.kind} not found` }, { status: 404 });
    }

    const existingData = JSON.parse(existing.value);
    const updatedData = { ...existingData, ...body.data, updatedAt: new Date().toISOString() };

    await db.settings.update({
      where: { key: `${prefix}${body.id}` },
      data: {
        value: JSON.stringify(updatedData),
        updatedAt: new Date(),
      },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        userId: authResult.userId,
        action: `seo_${body.kind}_update`,
        resource: `${prefix}${body.id}`,
        details: JSON.stringify({ updatedFields: Object.keys(body.data) }),
      },
    });

    return NextResponse.json({ success: true, data: updatedData });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('SEO PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
