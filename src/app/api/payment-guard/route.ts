import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const BLOCKED_PAID_APIS: { name: string; pattern: RegExp; replacement: string; replacementName: string }[] = [
  { name: 'OpenAI', pattern: /\bopenai\b/i, replacement: 'Use Ollama with local models (llama3, mistral, codellama) for text generation', replacementName: 'Ollama' },
  { name: 'Anthropic', pattern: /\banthropic\b/i, replacement: 'Use Ollama with local models for text generation', replacementName: 'Ollama' },
  { name: 'Gemini Paid', pattern: /\bgemini\b/i, replacement: 'Use Ollama with gemma2 or llama3 models locally', replacementName: 'Ollama (gemma2)' },
  { name: 'HeyGen', pattern: /\bheygen\b/i, replacement: 'Use local avatar/voice generation tools', replacementName: 'Local Avatar Tools' },
  { name: 'ElevenLabs', pattern: /\belevenlabs?\b/i, replacement: 'Use local TTS with Coqui, Bark, or Edge TTS free tier', replacementName: 'Coqui TTS / Edge TTS' },
  { name: 'Runway', pattern: /\brunway\b/i, replacement: 'Use local video generation tools', replacementName: 'Local Video Gen' },
  { name: 'Midjourney', pattern: /\bmidjourney\b/i, replacement: 'Use Stable Diffusion (SDXL, Flux) locally or via automatic1111', replacementName: 'Stable Diffusion / SDXL' },
  { name: 'Canva Paid', pattern: /\bcanva\b/i, replacement: 'Use local design tools or free alternatives', replacementName: 'Local Design Tools' },
  { name: 'Suno Paid', pattern: /\bsuno\b/i, replacement: 'Use local music generation (MusicGen, AudioCraft, Bark)', replacementName: 'MusicGen / AudioCraft' },
  { name: 'Paid Stock Media', pattern: /(?:shutterstock|getty|adobe.?stock)/i, replacement: 'Use free stock media (Unsplash, Pexels, Pixabay)', replacementName: 'Free Stock Media' },
  { name: 'Paid Ads Launch', pattern: /(?:launch|create|start)\s*(?:paid|sponsored)\s*(?:ad|campaign)/i, replacement: 'Use organic marketing, SEO, or social media content creation instead', replacementName: 'Organic Marketing' },
  { name: 'Bulk WhatsApp', pattern: /(?:bulk|mass)\s*(?:whatsapp|wa)\b/i, replacement: 'Use WhatsApp Business API with approval or batch processing', replacementName: 'Approved WA Business' },
  { name: 'SMS/Email Paid Credits', pattern: /(?:twilio|sendgrid|mailchimp|sendspark)\b/i, replacement: 'Use free SMTP (Resend free tier, Gmail API) or local mail server', replacementName: 'Resend Free / SMTP' },
  { name: 'Paid Hosting', pattern: /(?:aws|gcp|azure|heroku|vercel.*paid)\b/i, replacement: 'Use self-hosted solutions with existing infrastructure', replacementName: 'Self-Hosted' },
  { name: 'Paid SEO API', pattern: /(?:ahrefs|semrush|moz|seo.*api)/i, replacement: 'Use free SEO tools (Google Search Console, Screaming Frog free)', replacementName: 'Google Search Console' },
  { name: 'Paid CRM', pattern: /(?:salesforce|hubspot.*paid|zendesk.*paid)\b/i, replacement: 'Use free CRM or self-hosted solution', replacementName: 'Free CRM' },
  { name: 'Paid Automation', pattern: /(?:zapier|make\.com|integromat|n8n.*cloud)/i, replacement: 'Use n8n self-hosted or Huginn for free automation', replacementName: 'n8n Self-Hosted' },
  { name: 'Paid Scraping', pattern: /(?:scraperapi|brightdata|oxylabs|proxycrawl)\b/i, replacement: 'Use local scraping with proper rate limiting', replacementName: 'Local Scraper' },
];

export async function GET(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const [logs, total, blockedCount, replacementsFound, topApis] = await Promise.all([
      db.paymentGuardLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      db.paymentGuardLog.count(),
      db.paymentGuardLog.count({ where: { blocked: true } }),
      db.paymentGuardLog.count({ where: { replacementUsed: true } }),
      db.paymentGuardLog.groupBy({
        by: ['apiName'],
        where: { blocked: true },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
    ]);

    return NextResponse.json({
      logs: logs.map((l) => ({
        ...l,
        createdAt: l.createdAt.toISOString(),
      })),
      stats: {
        total,
        blocked: blockedCount,
        replacementsFound,
        topApis: topApis.map((a) => ({
          apiName: a.apiName,
          count: a._count.id,
        })),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const body = await request.json();
    const { apiName, commandId } = body;

    if (!apiName || typeof apiName !== 'string') {
      return NextResponse.json({ error: 'apiName is required' }, { status: 400 });
    }

    const apiNameStr = apiName.trim();

    for (const blockedApi of BLOCKED_PAID_APIS) {
      if (blockedApi.pattern.test(apiNameStr)) {
        await db.paymentGuardLog.create({
          data: {
            apiName: apiNameStr,
            blocked: true,
            replacementUsed: false,
            replacementName: blockedApi.replacementName,
            reason: `${blockedApi.name} is a paid API. ${blockedApi.replacement}`,
            commandId: commandId || null,
          },
        });

        return NextResponse.json({
          paidApiUsed: false,
          blocked: true,
          replacementUsed: false,
          reason: `${blockedApi.name} is a paid API that is blocked. Suggestion: ${blockedApi.replacement}`,
          suggestedReplacement: blockedApi.replacementName,
        });
      }
    }

    await db.paymentGuardLog.create({
      data: {
        apiName: apiNameStr,
        blocked: false,
        replacementUsed: false,
        reason: 'API not in blocked paid APIs list',
        commandId: commandId || null,
      },
    });

    return NextResponse.json({
      paidApiUsed: false,
      blocked: false,
      replacementUsed: false,
      reason: 'API check passed — not a blocked paid API',
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}