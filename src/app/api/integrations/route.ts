import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

// GET /api/integrations — list all integrations (webhooks + oauth)
export async function GET() {
  try {
    await requireAuth();

    const [webhooks, oauthProviders] = await Promise.all([
      db.webhookConfig.findMany({ orderBy: { createdAt: 'desc' } }),
      db.oAuthProvider.findMany({ orderBy: { createdAt: 'desc' } }),
    ]);

    // No McpServer model exists in the schema, so MCP integrations are empty
    const mcpServers: unknown[] = [];

    const integrations = [
      ...webhooks.map((w) => ({
        id: w.id,
        name: w.name,
        type: 'webhook' as const,
        status: w.isActive ? 'active' : 'inactive',
        config: { url: w.url, events: JSON.parse(w.events || '[]'), secret: w.secret ? '***' : undefined },
        createdAt: w.createdAt.toISOString(),
      })),
      ...mcpServers,
      ...oauthProviders.map((o) => ({
        id: o.id,
        name: o.provider,
        type: 'oauth' as const,
        status: o.isActive ? 'active' : 'inactive',
        config: {
          clientId: o.clientId,
          authorizationUrl: o.authorizationUrl,
          tokenUrl: o.tokenUrl,
          scopes: JSON.parse(o.scopes || '[]'),
        },
        createdAt: o.createdAt.toISOString(),
      })),
    ];

    return NextResponse.json({ data: integrations, total: integrations.length });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/integrations — create an integration
export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    const body = await req.json();
    const { name, type, config } = body;

    if (!name || !type) {
      return NextResponse.json({ error: 'name and type are required' }, { status: 400 });
    }

    let record;

    if (type === 'webhook') {
      if (!config?.url) {
        return NextResponse.json({ error: 'url is required for webhook integrations' }, { status: 400 });
      }
      record = await db.webhookConfig.create({
        data: {
          companyId: config.companyId || 'default',
          name,
          url: config.url,
          events: JSON.stringify(config.events || []),
          secret: config.secret || null,
          isActive: true,
        },
      });
      return NextResponse.json({
        data: {
          id: record.id,
          name: record.name,
          type: 'webhook',
          status: 'active',
          config: { url: record.url, events: JSON.parse(record.events) },
          createdAt: record.createdAt.toISOString(),
        },
      }, { status: 201 });
    }

    if (type === 'oauth') {
      if (!config?.clientId || !config?.clientSecret || !config?.authorizationUrl || !config?.tokenUrl) {
        return NextResponse.json({ error: 'clientId, clientSecret, authorizationUrl, and tokenUrl are required for OAuth integrations' }, { status: 400 });
      }
      record = await db.oAuthProvider.create({
        data: {
          provider: name,
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          authorizationUrl: config.authorizationUrl,
          tokenUrl: config.tokenUrl,
          userInfoUrl: config.userInfoUrl || '',
          scopes: JSON.stringify(config.scopes || []),
          isActive: true,
        },
      });
      return NextResponse.json({
        data: {
          id: record.id,
          name: record.provider,
          type: 'oauth',
          status: 'active',
          config: { clientId: record.clientId, authorizationUrl: record.authorizationUrl, tokenUrl: record.tokenUrl, scopes: JSON.parse(record.scopes) },
          createdAt: record.createdAt.toISOString(),
        },
      }, { status: 201 });
    }

    return NextResponse.json({ error: `Unsupported integration type: ${type}` }, { status: 400 });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/integrations — update an integration
export async function PUT(req: NextRequest) {
  try {
    await requireAuth();
    const body = await req.json();
    const { id, type, ...updates } = body;

    if (!id || !type) {
      return NextResponse.json({ error: 'id and type are required' }, { status: 400 });
    }

    if (type === 'webhook') {
      const data: Record<string, unknown> = {};
      if (updates.name) data.name = updates.name;
      if (updates.config?.url) data.url = updates.config.url;
      if (updates.config?.events) data.events = JSON.stringify(updates.config.events);
      if (updates.config?.secret) data.secret = updates.config.secret;
      if (typeof updates.status !== 'undefined') data.isActive = updates.status === 'active';

      const record = await db.webhookConfig.update({
        where: { id },
        data,
      });

      return NextResponse.json({
        data: {
          id: record.id,
          name: record.name,
          type: 'webhook',
          status: record.isActive ? 'active' : 'inactive',
          config: { url: record.url, events: JSON.parse(record.events) },
          createdAt: record.createdAt.toISOString(),
        },
      });
    }

    if (type === 'oauth') {
      const data: Record<string, unknown> = {};
      if (updates.name) data.provider = updates.name;
      if (updates.config?.clientId) data.clientId = updates.config.clientId;
      if (updates.config?.clientSecret) data.clientSecret = updates.config.clientSecret;
      if (updates.config?.authorizationUrl) data.authorizationUrl = updates.config.authorizationUrl;
      if (updates.config?.tokenUrl) data.tokenUrl = updates.config.tokenUrl;
      if (updates.config?.scopes) data.scopes = JSON.stringify(updates.config.scopes);
      if (typeof updates.status !== 'undefined') data.isActive = updates.status === 'active';

      const record = await db.oAuthProvider.update({
        where: { id },
        data,
      });

      return NextResponse.json({
        data: {
          id: record.id,
          name: record.provider,
          type: 'oauth',
          status: record.isActive ? 'active' : 'inactive',
          config: { clientId: record.clientId, authorizationUrl: record.authorizationUrl, tokenUrl: record.tokenUrl, scopes: JSON.parse(record.scopes) },
          createdAt: record.createdAt.toISOString(),
        },
      });
    }

    return NextResponse.json({ error: `Unsupported integration type: ${type}` }, { status: 400 });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/integrations — delete an integration
export async function DELETE(req: NextRequest) {
  try {
    await requireAuth();
    const body = await req.json();
    const { id, type } = body;

    if (!id || !type) {
      return NextResponse.json({ error: 'id and type are required' }, { status: 400 });
    }

    if (type === 'webhook') {
      await db.webhookConfig.delete({ where: { id } });
    } else if (type === 'oauth') {
      await db.oAuthProvider.delete({ where: { id } });
    } else {
      return NextResponse.json({ error: `Unsupported integration type: ${type}` }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}