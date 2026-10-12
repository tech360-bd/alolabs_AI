import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { db } from '@/lib/db';

// ─── Types ────────────────────────────────────────────────────────────

interface LeadExtraction {
  name: string;
  email: string;
  company?: string;
  role?: string;
  phone?: string;
  confidence: 'high' | 'medium' | 'low';
  source: 'signature' | 'body' | 'header';
}

interface AIReplyResult {
  replyHtml: string;
  replyText: string;
  tone: string;
  leadsExtracted: LeadExtraction[];
  suggestedSubject: string;
  summary: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────

async function authenticate(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return null;
  return verifySessionToken(token);
}

async function callAI(systemPrompt: string, userPrompt: string): Promise<string> {
  // Try to use the AI router endpoint internally
  const aiEndpoint = process.env.AI_ROUTE_ENDPOINT || 'http://localhost:3000/api/llm/route';

  try {
    const response = await fetch(aiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.AI_REPLY_MODEL || 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.6,
        maxTokens: 2048,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      throw new Error(`AI endpoint returned ${response.status}`);
    }

    const data = await response.json();
    return data.content || data.choices?.[0]?.message?.content || data.text || '';
  } catch (err) {
    console.error('AI call failed:', err);
    throw new Error('AI service unavailable. Please try again later.');
  }
}

function buildReplySystemPrompt(tone: string): string {
  const toneInstructions: Record<string, string> = {
    professional: `Write in a professional, formal tone. Be concise and business-appropriate. Use proper salutations and closings.`,
    casual: `Write in a friendly, casual tone. Be warm and conversational while remaining professional.`,
    friendly: `Write in a warm, approachable tone. Be personable and helpful.`,
    concise: `Write a very brief, to-the-point reply. Keep it under 3 sentences.`,
    detailed: `Write a comprehensive, detailed reply. Address all points raised in the original email.`,
  };

  return `You are an AI email assistant for ALO Labs. You help compose email replies.

${toneInstructions[tone] || toneInstructions.professional}

Rules:
1. Only output the reply body text (no subject, no metadata).
2. Do NOT include placeholder text like [Your Name] - use a natural closing.
3. If the email is a lead/inquiry, be particularly helpful and welcoming.
4. Maintain context from the original email thread.
5. Suggest a brief, appropriate subject line.

After the reply, on a new line, output: ---LEADS--- followed by a JSON array of any leads/contact info found in the email. Each lead should have: name, email, company (optional), role (optional), phone (optional), confidence (high/medium/low), source (signature/body/header).
If no leads found, output: ---LEADS--- []`;
}

function extractLeads(aiResponse: string): LeadExtraction[] {
  const leadMarker = '---LEADS---';
  const idx = aiResponse.indexOf(leadMarker);
  if (idx === -1) return [];

  const jsonStr = aiResponse.substring(idx + leadMarker.length).trim();
  try {
    const leads = JSON.parse(jsonStr);
    if (Array.isArray(leads)) {
      return leads.filter(
        (l: LeadExtraction) => l.name || l.email,
      );
    }
  } catch {
    // Try to extract any email-like patterns
    const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g;
    const emails = jsonStr.match(emailRegex) || [];
    return emails.map((email) => ({
      email,
      name: '',
      confidence: 'low' as const,
      source: 'body' as const,
    }));
  }
  return [];
}

function parseReplyAndLeads(aiResponse: string): { replyText: string; leads: LeadExtraction[] } {
  const leadMarker = '---LEADS---';
  const idx = aiResponse.indexOf(leadMarker);
  const replyText = idx >= 0 ? aiResponse.substring(0, idx).trim() : aiResponse.trim();
  const leads = extractLeads(aiResponse);
  return { replyText, leads };
}

function textToSimpleHtml(text: string): string {
  const paragraphs = text.split('\n\n').filter(Boolean);
  const htmlParts = paragraphs.map((p) => {
    const escaped = p
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<p>${escaped.replace(/\n/g, '<br>')}</p>`;
  });
  return `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">${htmlParts.join('')}</div>`;
}

// ─── POST: AI-powered email reply ─────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const session = await authenticate(request);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const {
      originalSubject,
      originalFrom,
      originalBody,
      originalHtml,
      threadContext = [],
      tone = 'professional',
      instructions,
      accountId,
    } = body;

    if (!originalBody && !originalHtml) {
      return NextResponse.json(
        { error: 'originalBody or originalHtml is required' },
        { status: 400 },
      );
    }

    if (!originalFrom) {
      return NextResponse.json({ error: 'originalFrom is required' }, { status: 400 });
    }

    // Build the user prompt
    let userPrompt = `Original email from: ${originalFrom}\n`;
    userPrompt += `Subject: ${originalSubject || '(No Subject)'}\n\n`;
    userPrompt += `--- Original Email ---\n`;
    userPrompt += originalBody || originalHtml?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '';
    userPrompt += `\n--- End Original Email ---\n`;

    if (threadContext.length > 0) {
      userPrompt += `\n--- Previous Thread Context ---\n`;
      for (const ctx of threadContext) {
        userPrompt += `From: ${ctx.from || 'Unknown'}\n`;
        userPrompt += `${ctx.body || ctx.text || ''}\n\n`;
      }
      userPrompt += `--- End Thread Context ---\n`;
    }

    if (instructions) {
      userPrompt += `\n--- Additional Instructions ---\n${instructions}\n--- End Instructions ---\n`;
    }

    userPrompt += `\nCompose a reply to this email.`;

    // Call AI
    const systemPrompt = buildReplySystemPrompt(tone);
    const aiResponse = await callAI(systemPrompt, userPrompt);

    // Parse the response
    const { replyText, leads } = parseReplyAndLeads(aiResponse);

    // Generate suggested subject
    const replySubject = originalSubject
      ? originalSubject.startsWith('Re: ')
        ? originalSubject
        : `Re: ${originalSubject}`
      : 'Re: (No Subject)';

    // Generate summary
    const summaryWords = replyText.split(' ').slice(0, 30).join(' ');
    const summary = replyText.length > 150
      ? `${summaryWords}...`
      : replyText;

    const result: AIReplyResult = {
      replyHtml: textToSimpleHtml(replyText),
      replyText,
      tone,
      leadsExtracted: leads,
      suggestedSubject: replySubject,
      summary,
    };

    // Store extracted leads as CRM contacts if high/medium confidence
    for (const lead of leads) {
      if (lead.confidence !== 'low' && lead.email) {
        try {
          const contactKey = `crm:auto-lead:${lead.email}`;
          await db.settings.upsert({
            where: { key: contactKey },
            update: { value: JSON.stringify({ ...lead, source: 'email-reply', updatedAt: new Date().toISOString() }), updatedAt: new Date() },
            create: {
              key: contactKey,
              value: JSON.stringify({ ...lead, source: 'email-reply', createdAt: new Date().toISOString() }),
              type: 'json',
            },
          });
        } catch {
          // Non-critical: lead storage failed
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('AI service unavailable')) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error('Email reply POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}