import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { db } from '@/lib/db';
import * as crypto from 'crypto';

// ─── Types ────────────────────────────────────────────────────────────

interface StoredEmailTemplate {
  id: string;
  name: string;
  subject: string;
  html: string;
  text: string;
  variables: string[];
  category: string;
  isBuiltin: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────

const TEMPLATE_PREFIX = 'email:template:';

async function authenticate(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return null;
  return verifySessionToken(token);
}

function templateKey(id: string): string {
  return `${TEMPLATE_PREFIX}${id}`;
}

function generateId(): string {
  return crypto.randomUUID();
}

function extractVariables(str: string): string[] {
  const regex = /\{\{(\w+)\}\}/g;
  const vars = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(str)) !== null) {
    vars.add(match[1]);
  }
  return Array.from(vars);
}

async function getAllTemplates(): Promise<StoredEmailTemplate[]> {
  const settings = await db.settings.findMany({
    where: { key: { startsWith: TEMPLATE_PREFIX } },
    orderBy: { createdAt: 'desc' },
  });

  const templates: StoredEmailTemplate[] = [];
  for (const s of settings) {
    try {
      const parsed = JSON.parse(s.value) as StoredEmailTemplate;
      templates.push(parsed);
    } catch {
      // Skip malformed
    }
  }
  return templates;
}

function htmlToPlainText(html: string): string {
  let text = html;
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/?(p|div|h[1-6]|li|tr|blockquote)[^>]*>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

// ─── GET: List email templates ────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await authenticate(request);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    let templates = await getAllTemplates();

    if (category) {
      templates = templates.filter((t) => t.category === category);
    }

    // Group by category
    const categories = [...new Set(templates.map((t) => t.category))];

    return NextResponse.json({
      data: templates,
      count: templates.length,
      categories,
    });
  } catch (error) {
    console.error('Email templates GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── POST: Create template ────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const session = await authenticate(request);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { name, subject, html, text, category = 'custom' } = body;

    if (!name || !subject) {
      return NextResponse.json(
        { error: 'name and subject are required' },
        { status: 400 },
      );
    }

    if (!html && !text) {
      return NextResponse.json(
        { error: 'html or text body is required' },
        { status: 400 },
      );
    }

    const id = generateId();
    const now = new Date().toISOString();

    // Auto-generate text from html if not provided
    const finalText = text || htmlToPlainText(html || '');
    const finalHtml = html || finalText.split('\n').map((l: string) => `<p>${l}</p>`).join('');

    // Extract variables from both subject and body
    const variables = extractVariables(subject + ' ' + finalHtml + ' ' + finalText);

    const template: StoredEmailTemplate = {
      id,
      name,
      subject,
      html: finalHtml,
      text: finalText,
      variables,
      category,
      isBuiltin: false,
      createdAt: now,
      updatedAt: now,
    };

    await db.settings.upsert({
      where: { key: templateKey(id) },
      update: { value: JSON.stringify(template), updatedAt: new Date() },
      create: { key: templateKey(id), value: JSON.stringify(template), type: 'json' },
    });

    return NextResponse.json({ data: template }, { status: 201 });
  } catch (error) {
    console.error('Email templates POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── PUT: Update template ─────────────────────────────────────────────

export async function PUT(request: NextRequest) {
  try {
    const session = await authenticate(request);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const existing = await db.settings.findUnique({ where: { key: templateKey(id) } });
    if (!existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const template = JSON.parse(existing.value) as StoredEmailTemplate;

    // Prevent updating builtin templates
    if (template.isBuiltin) {
      return NextResponse.json(
        { error: 'Builtin templates cannot be modified' },
        { status: 403 },
      );
    }

    if (updates.name !== undefined) template.name = updates.name;
    if (updates.subject !== undefined) template.subject = updates.subject;
    if (updates.html !== undefined) template.html = updates.html;
    if (updates.text !== undefined) template.text = updates.text;
    if (updates.category !== undefined) template.category = updates.category;

    // Re-generate text from html if html was updated but text wasn't
    if (updates.html && !updates.text) {
      template.text = htmlToPlainText(updates.html);
    }

    // Re-extract variables
    template.variables = extractVariables(template.subject + ' ' + template.html + ' ' + template.text);
    template.updatedAt = new Date().toISOString();

    await db.settings.update({
      where: { key: templateKey(id) },
      data: { value: JSON.stringify(template), updatedAt: new Date() },
    });

    return NextResponse.json({ data: template });
  } catch (error) {
    console.error('Email templates PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── DELETE: Delete template ───────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const session = await authenticate(request);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id query parameter is required' }, { status: 400 });
    }

    const existing = await db.settings.findUnique({ where: { key: templateKey(id) } });
    if (!existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const template = JSON.parse(existing.value) as StoredEmailTemplate;

    if (template.isBuiltin) {
      return NextResponse.json(
        { error: 'Builtin templates cannot be deleted' },
        { status: 403 },
      );
    }

    await db.settings.delete({ where: { key: templateKey(id) } });

    return NextResponse.json({ success: true, deleted: id });
  } catch (error) {
    console.error('Email templates DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}