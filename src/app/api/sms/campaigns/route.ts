// ALO Labs AIOS — SMS Campaigns API
// Create and list SMS campaigns with bulk send and rate limiting (100ms delay)

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'completed' | 'failed';

interface CampaignRecipient {
  phone: string;
  name?: string;
  status?: 'pending' | 'sent' | 'delivered' | 'failed';
  messageId?: string;
  error?: string;
}

interface CampaignStats {
  total: number;
  sent: number;
  delivered: number;
  failed: number;
}

interface StoredCampaign {
  id: string;
  name: string;
  messageTemplate: string;
  recipients: CampaignRecipient[];
  status: CampaignStatus;
  from: string;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  stats: CampaignStats;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

interface CreateCampaignRequest {
  name: string;
  messageTemplate: string;
  recipients: Array<{ phone: string; name?: string }>;
  from?: string;
  schedule?: string;
}

// ─── Storage Helpers ──────────────────────────────────────────────────────────

const CAMPAIGN_KEY_PREFIX = 'sms:campaign:';
const MESSAGE_KEY_PREFIX = 'sms:message:';

async function saveCampaign(campaign: StoredCampaign): Promise<void> {
  await db.settings.upsert({
    where: { key: `${CAMPAIGN_KEY_PREFIX}${campaign.id}` },
    update: {
      value: JSON.stringify(campaign),
      type: 'json',
      updatedAt: new Date(),
    },
    create: {
      key: `${CAMPAIGN_KEY_PREFIX}${campaign.id}`,
      value: JSON.stringify(campaign),
      type: 'json',
    },
  });
}

async function saveMessage(msg: Record<string, unknown>): Promise<void> {
  await db.settings.upsert({
    where: { key: `${MESSAGE_KEY_PREFIX}${msg.id}` },
    update: {
      value: JSON.stringify(msg),
      type: 'json',
      updatedAt: new Date(),
    },
    create: {
      key: `${MESSAGE_KEY_PREFIX}${msg.id}`,
      value: JSON.stringify(msg),
      type: 'json',
    },
  });
}

async function listAllCampaigns(): Promise<StoredCampaign[]> {
  try {
    const allSettings = await db.settings.findMany({
      where: { key: { startsWith: CAMPAIGN_KEY_PREFIX } },
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

// ─── Campaign Execution ───────────────────────────────────────────────────────

async function executeCampaign(campaign: StoredCampaign): Promise<void> {
  campaign.status = 'sending';
  campaign.startedAt = new Date().toISOString();
  campaign.updatedAt = new Date().toISOString();
  await saveCampaign(campaign);

  const pendingRecipients = campaign.recipients.filter(
    (r) => !r.status || r.status === 'pending',
  );

  for (const recipient of pendingRecipients) {
    try {
      const now = new Date().toISOString();
      const messageId = crypto.randomUUID();

      // Send SMS — stores message record in database.
      // In production with an SMS provider (Twilio, Vonage, etc.),
      // replace this block with the provider's API call.
      const msg = {
        id: messageId,
        to: recipient.phone,
        body: campaign.messageTemplate,
        from: campaign.from,
        campaignId: campaign.id,
        status: 'sent',
        userId: campaign.createdBy,
        createdAt: now,
        updatedAt: now,
      };
      await saveMessage(msg);

      recipient.status = 'sent';
      recipient.messageId = messageId;
      campaign.stats.sent++;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      recipient.status = 'failed';
      recipient.error = msg;
      campaign.stats.failed++;
    }

    // Save progress after each recipient
    campaign.updatedAt = new Date().toISOString();
    await saveCampaign(campaign);

    // Rate limiting: 100ms delay between sends
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Mark as completed
  campaign.status = campaign.stats.failed === campaign.stats.total ? 'failed' : 'completed';
  campaign.completedAt = new Date().toISOString();
  campaign.updatedAt = new Date().toISOString();
  await saveCampaign(campaign);
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

// ─── POST: Create Campaign ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticate(request);
    if (authResult instanceof NextResponse) return authResult;

    const body = (await request.json()) as CreateCampaignRequest;

    if (!body.name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    if (!body.messageTemplate || body.messageTemplate.trim().length === 0) {
      return NextResponse.json({ error: 'messageTemplate is required' }, { status: 400 });
    }

    if (!body.recipients || body.recipients.length === 0) {
      return NextResponse.json(
        { error: 'recipients array is required with at least one entry' },
        { status: 400 },
      );
    }

    if (body.recipients.length > 10000) {
      return NextResponse.json(
        { error: 'Maximum 10,000 recipients per campaign' },
        { status: 400 },
      );
    }

    // Validate recipient phone numbers
    for (const r of body.recipients) {
      const digits = r.phone.replace(/[^0-9]/g, '');
      if (digits.length < 7 || digits.length > 15) {
        return NextResponse.json(
          { error: `Invalid phone number: ${r.phone}. Use E.164 format.` },
          { status: 400 },
        );
      }
    }

    const now = new Date().toISOString();
    const campaignId = crypto.randomUUID();

    // Determine initial status
    let initialStatus: CampaignStatus = 'draft';
    let scheduledAt: string | null = null;

    if (body.schedule) {
      const scheduledDate = new Date(body.schedule);
      if (scheduledDate <= new Date()) {
        return NextResponse.json({ error: 'schedule must be in the future' }, { status: 400 });
      }
      initialStatus = 'scheduled';
      scheduledAt = body.schedule;
    }

    const campaign: StoredCampaign = {
      id: campaignId,
      name: body.name,
      messageTemplate: body.messageTemplate.trim(),
      recipients: body.recipients.map((r) => ({
        phone: r.phone,
        name: r.name,
        status: 'pending' as const,
      })),
      status: initialStatus,
      from: body.from || process.env.SMS_DEFAULT_FROM || '+10000000000',
      scheduledAt,
      startedAt: null,
      completedAt: null,
      stats: {
        total: body.recipients.length,
        sent: 0,
        delivered: 0,
        failed: 0,
      },
      createdBy: authResult.userId,
      createdAt: now,
      updatedAt: now,
    };

    await saveCampaign(campaign);

    // Audit log
    await db.auditLog.create({
      data: {
        userId: authResult.userId,
        action: 'sms_campaign_create',
        resource: `${CAMPAIGN_KEY_PREFIX}${campaignId}`,
        details: JSON.stringify({
          name: body.name,
          recipientCount: body.recipients.length,
          status: initialStatus,
          scheduledAt,
          templateLength: body.messageTemplate.length,
        }),
      },
    });

    // If no schedule, execute immediately in background
    if (!body.schedule) {
      executeCampaign(campaign).catch((err) => {
        console.error(`SMS Campaign ${campaignId} execution failed:`, err);
      });
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
    console.error('SMS campaigns POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── GET: List Campaigns ──────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticate(request);
    if (authResult instanceof NextResponse) return authResult;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as CampaignStatus | null;
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);
    const includeRecipients = searchParams.get('includeRecipients') === 'true';
    const campaignId = searchParams.get('id');

    // If specific campaign requested
    if (campaignId) {
      try {
        const setting = await db.settings.findUnique({
          where: { key: `${CAMPAIGN_KEY_PREFIX}${campaignId}` },
        });
        if (!setting) {
          return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
        }
        return NextResponse.json({ data: JSON.parse(setting.value) });
      } catch {
        return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
      }
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

    // Optionally strip recipients for list view
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
    console.error('SMS campaigns GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}