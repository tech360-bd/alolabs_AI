// ALO Labs AIOS — WhatsApp Campaigns API
// Create and list WhatsApp Business messaging campaigns

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth';
import { WhatsAppBusinessClient } from '@/lib/whatsapp/client';
import type { WhatsAppConfig, WhatsAppTemplate } from '@/lib/whatsapp/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'completed' | 'failed' | 'paused' | 'cancelled';

interface CampaignRecipient {
  phone: string;
  name?: string;
  variables?: Record<string, string>;
  status?: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  messageId?: string;
  error?: string;
}

interface CampaignStats {
  total: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}

interface StoredCampaign {
  id: string;
  name: string;
  description: string;
  template: WhatsAppTemplate;
  recipients: CampaignRecipient[];
  status: CampaignStatus;
  phoneNumberId: string;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  stats: CampaignStats;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

interface CreateCampaignRequest {
  name: string;
  description?: string;
  template: WhatsAppTemplate;
  recipients: Array<{
    phone: string;
    name?: string;
    variables?: Record<string, string>;
  }>;
  phoneNumberId?: string;
  scheduledAt?: string;
  metadata?: Record<string, unknown>;
}

// ─── Storage Helpers ──────────────────────────────────────────────────────────

const CAMPAIGNS_KEY_PREFIX = 'whatsapp:campaign:';

async function getCampaign(id: string): Promise<StoredCampaign | null> {
  try {
    const setting = await db.settings.findUnique({
      where: { key: `${CAMPAIGNS_KEY_PREFIX}${id}` },
    });
    if (!setting) return null;
    return JSON.parse(setting.value) as StoredCampaign;
  } catch {
    return null;
  }
}

async function saveCampaign(campaign: StoredCampaign): Promise<void> {
  await db.settings.upsert({
    where: { key: `${CAMPAIGNS_KEY_PREFIX}${campaign.id}` },
    update: {
      value: JSON.stringify(campaign),
      type: 'json',
      updatedAt: new Date(),
    },
    create: {
      key: `${CAMPAIGNS_KEY_PREFIX}${campaign.id}`,
      value: JSON.stringify(campaign),
      type: 'json',
    },
  });
}

async function listAllCampaigns(): Promise<StoredCampaign[]> {
  try {
    const allSettings = await db.settings.findMany({
      where: { key: { startsWith: CAMPAIGNS_KEY_PREFIX } },
      orderBy: { createdAt: 'desc' },
    });

    const campaigns: StoredCampaign[] = [];
    for (const setting of allSettings) {
      try {
        campaigns.push(JSON.parse(setting.value) as StoredCampaign);
      } catch {
        // Skip malformed entries
      }
    }
    return campaigns;
  } catch {
    return [];
  }
}

// ─── WhatsApp Client Helper ───────────────────────────────────────────────────

async function getWhatsAppClient(phoneNumberId?: string): Promise<{
  client: WhatsAppBusinessClient;
  resolvedPhoneNumberId: string;
} | null> {
  const apiUrl = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com';
  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v21.0';
  let accessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
  let resolvedPhoneNumberId = phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || '';

  if (!resolvedPhoneNumberId || !accessToken) {
    try {
      const numbersSetting = await db.settings.findUnique({
        where: { key: 'whatsapp:numbers' },
      });
      if (numbersSetting) {
        const numbers = JSON.parse(numbersSetting.value) as Array<{
          phoneNumberId: string;
          accessToken: string;
          isDefault: boolean;
        }>;
        const target = resolvedPhoneNumberId
          ? numbers.find((n) => n.phoneNumberId === resolvedPhoneNumberId)
          : numbers.find((n) => n.isDefault) || numbers[0];

        if (target) {
          if (!resolvedPhoneNumberId) resolvedPhoneNumberId = target.phoneNumberId;
          if (!accessToken) accessToken = target.accessToken;
        }
      }
    } catch { /* ignore */ }
  }

  if (!accessToken) {
    try {
      const tokenSetting = await db.settings.findUnique({
        where: { key: 'social:whatsapp:token' },
      });
      if (tokenSetting) {
        const data = JSON.parse(tokenSetting.value) as { accessToken: string };
        accessToken = data.accessToken;
      }
    } catch { /* ignore */ }
  }

  if (!resolvedPhoneNumberId || !accessToken) return null;

  const config: WhatsAppConfig = {
    apiUrl,
    apiVersion,
    phoneNumberId: resolvedPhoneNumberId,
    accessToken,
    verifyToken,
    webhookUrl: '',
  };

  return {
    client: new WhatsAppBusinessClient(config),
    resolvedPhoneNumberId,
  };
}

// ─── Campaign Execution ───────────────────────────────────────────────────────

async function executeCampaign(
  campaign: StoredCampaign,
  client: WhatsAppBusinessClient,
): Promise<void> {
  // Mark as sending
  campaign.status = 'sending';
  campaign.startedAt = new Date().toISOString();
  campaign.updatedAt = new Date().toISOString();
  await saveCampaign(campaign);

  const pendingRecipients = campaign.recipients.filter(
    (r) => !r.status || r.status === 'pending',
  );

  for (const recipient of pendingRecipients) {
    try {
      // Build personalized template components
      const components = campaign.template.components.map((comp) => {
        if (comp.type === 'body' && recipient.variables) {
          const personalizedParams = (comp.parameters || []).map((param) => {
            if (param.type === 'text' && param.text) {
              // Replace {{variable_name}} patterns in parameter text
              let replaced = param.text;
              for (const [key, value] of Object.entries(recipient.variables || {})) {
                replaced = replaced.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
              }
              return { ...param, text: replaced };
            }
            return param;
          });
          return { ...comp, parameters: personalizedParams };
        }
        return comp;
      });

      const personalizedTemplate: WhatsAppTemplate = {
        name: campaign.template.name,
        language: campaign.template.language,
        components,
      };

      const result = await client.sendTemplate(recipient.phone, personalizedTemplate);

      if (result.success) {
        recipient.status = 'sent';
        recipient.messageId = result.messageId;
        campaign.stats.sent++;
      } else {
        recipient.status = 'failed';
        recipient.error = result.error;
        campaign.stats.failed++;
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      recipient.status = 'failed';
      recipient.error = msg;
      campaign.stats.failed++;
    }

    // Save progress after each recipient
    campaign.updatedAt = new Date().toISOString();
    await saveCampaign(campaign);

    // Small delay to respect rate limits
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  // Mark as completed
  campaign.status = campaign.stats.failed === campaign.stats.total ? 'failed' : 'completed';
  campaign.completedAt = new Date().toISOString();
  campaign.updatedAt = new Date().toISOString();
  await saveCampaign(campaign);
}

// ─── POST: Create Campaign ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
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

    const body = (await request.json()) as CreateCampaignRequest;

    if (!body.name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    if (!body.template?.name) {
      return NextResponse.json({ error: 'template.name is required' }, { status: 400 });
    }

    if (!body.recipients || body.recipients.length === 0) {
      return NextResponse.json({ error: 'recipients array is required with at least one entry' }, { status: 400 });
    }

    if (body.recipients.length > 10000) {
      return NextResponse.json(
        { error: 'Maximum 10,000 recipients per campaign' },
        { status: 400 },
      );
    }

    // Validate recipient phone numbers (basic E.164 check)
    for (const r of body.recipients) {
      if (!r.phone || !/^\d{7,15}$/.test(r.phone.replace(/[^0-9]/g, ''))) {
        return NextResponse.json(
          { error: `Invalid phone number: ${r.phone}. Use E.164 format.` },
          { status: 400 },
        );
      }
    }

    // Resolve phone number ID
    let resolvedPhoneNumberId = body.phoneNumberId || '';
    if (!resolvedPhoneNumberId) {
      try {
        const numbersSetting = await db.settings.findUnique({
          where: { key: 'whatsapp:numbers' },
        });
        if (numbersSetting) {
          const numbers = JSON.parse(numbersSetting.value) as Array<{
            phoneNumberId: string;
            isDefault: boolean;
          }>;
          const defaultNumber = numbers.find((n) => n.isDefault) || numbers[0];
          if (defaultNumber) resolvedPhoneNumberId = defaultNumber.phoneNumberId;
        }
      } catch { /* ignore */ }
    }

    if (!resolvedPhoneNumberId) {
      return NextResponse.json(
        { error: 'No WhatsApp phone number configured. Register a number first.' },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const campaignId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).substring(2)}`;

    // Determine initial status
    let initialStatus: CampaignStatus = 'draft';
    let scheduledAt: string | null = null;

    if (body.scheduledAt) {
      const scheduledDate = new Date(body.scheduledAt);
      if (scheduledDate <= new Date()) {
        return NextResponse.json({ error: 'scheduledAt must be in the future' }, { status: 400 });
      }
      initialStatus = 'scheduled';
      scheduledAt = body.scheduledAt;
    }

    const campaign: StoredCampaign = {
      id: campaignId,
      name: body.name,
      description: body.description || '',
      template: body.template,
      recipients: body.recipients.map((r) => ({
        phone: r.phone,
        name: r.name,
        variables: r.variables,
        status: 'pending' as const,
      })),
      status: initialStatus,
      phoneNumberId: resolvedPhoneNumberId,
      scheduledAt,
      startedAt: null,
      completedAt: null,
      stats: {
        total: body.recipients.length,
        sent: 0,
        delivered: 0,
        read: 0,
        failed: 0,
      },
      createdBy: session.userId,
      createdAt: now,
      updatedAt: now,
      metadata: body.metadata,
    };

    await saveCampaign(campaign);

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'whatsapp_campaign_create',
        resource: `whatsapp:campaign:${campaignId}`,
        details: JSON.stringify({
          name: body.name,
          recipientCount: body.recipients.length,
          status: initialStatus,
          scheduledAt,
          templateName: body.template.name,
          phoneNumberId: resolvedPhoneNumberId,
        }),
      },
    });

    // If no schedule, execute immediately in background
    if (!body.scheduledAt) {
      // Fire-and-forget execution
      const clientResult = await getWhatsAppClient(resolvedPhoneNumberId);
      if (clientResult) {
        executeCampaign(campaign, clientResult.client).catch((err) => {
          console.error(`Campaign ${campaignId} execution failed:`, err);
        });
      } else {
        campaign.status = 'failed';
        campaign.error = 'WhatsApp client not configured';
        campaign.updatedAt = new Date().toISOString();
        await saveCampaign(campaign);
      }
    }

    return NextResponse.json({
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        recipientCount: campaign.stats.total,
        scheduledAt: campaign.scheduledAt,
        createdAt: campaign.createdAt,
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('WhatsApp campaigns POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── GET: List Campaigns ──────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
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

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as CampaignStatus | null;
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);
    const includeRecipients = searchParams.get('includeRecipients') === 'true';
    const campaignId = searchParams.get('id');

    // If specific campaign requested
    if (campaignId) {
      const campaign = await getCampaign(campaignId);
      if (!campaign) {
        return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
      }
      return NextResponse.json({ data: campaign });
    }

    // List all campaigns
    let campaigns = await listAllCampaigns();

    // Filter by status
    if (status) {
      campaigns = campaigns.filter((c) => c.status === status);
    }

    const total = campaigns.length;

    // Paginate
    const paginated = campaigns.slice(offset, offset + limit);

    // Optionally strip recipients for list view (they can be large)
    const response = paginated.map((c) => {
      if (includeRecipients) return c;
      const { recipients, ...rest } = c;
      return {
        ...rest,
        recipientCount: recipients.length,
        recipients: undefined,
      };
    });

    return NextResponse.json({
      data: response,
      total,
      limit,
      offset,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('WhatsApp campaigns GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}