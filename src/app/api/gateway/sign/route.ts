import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { generateHMAC, verifyApiKey } from '@/lib/api-gateway';
import { db } from '@/lib/db';
import { legacyTenant, legacyAuthResponse } from '@/lib/api/legacy-session';

export async function POST(request: NextRequest) {
  try {
    const tenant = await legacyTenant(request);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const { companyId: requestedCompanyId, payload, apiKey, method = 'POST', url = '/api/test' } = body;

    if (requestedCompanyId && requestedCompanyId !== tenant.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const companyId = tenant.companyId;

    if (!payload || typeof payload !== 'string') {
      return NextResponse.json(
        { error: 'payload is required and must be a string' },
        { status: 400 }
      );
    }

    let signingSecret: string;
    let companyInfo: { id: string; name: string; slug: string } | null = null;

    // If apiKey is provided, verify it AND ensure it belongs to the caller's company
    if (apiKey) {
      const keyData = await verifyApiKey(apiKey);
      if (!keyData) {
        return NextResponse.json(
          { error: 'Invalid or inactive API key' },
          { status: 401 }
        );
      }
      if (keyData.company.id !== tenant.companyId) {
        return NextResponse.json(
          { error: 'Forbidden' },
          { status: 403 }
        );
      }
      signingSecret = apiKey;
      companyInfo = keyData.company;
    } else if (companyId) {
      // Look up the company and its active API key
      const company = await db.company.findUnique({
        where: { id: companyId },
        select: { id: true, name: true, slug: true, status: true },
      });
      if (!company) {
        return NextResponse.json(
          { error: 'Company not found' },
          { status: 404 }
        );
      }
      if (company.status !== 'active') {
        return NextResponse.json(
          { error: 'Company is not active' },
          { status: 400 }
        );
      }
      companyInfo = { id: company.id, name: company.name, slug: company.slug };

      // Find the first active API key for this company
      const activeKey = await db.companyApiKey.findFirst({
        where: { companyId, isActive: true },
        orderBy: { createdAt: 'desc' },
        select: { id: true, keyPrefix: true, scopes: true },
      });

      if (!activeKey) {
        return NextResponse.json(
          { error: 'No active API key found for this company. Please provide an apiKey parameter.' },
          { status: 400 }
        );
      }

      // We cannot retrieve the raw API key (only the hash is stored).
      // Signing requires the raw key, so the caller must provide apiKey.
      return NextResponse.json(
        { error: 'Raw API key is required for signing. The key hash is stored securely and cannot be used for HMAC generation. Please provide the apiKey parameter.' },
        { status: 400 }
      );
    } else {
      return NextResponse.json(
        { error: 'Either apiKey or companyId is required' },
        { status: 400 }
      );
    }

    const timestamp = Date.now().toString();
    const payloadToSign = `${method}\n${url}\n${timestamp}\n${payload}`;
    const signature = generateHMAC(payloadToSign, signingSecret);

    return NextResponse.json({
      signature,
      timestamp,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey!.substring(0, 8)}...`,
        'X-ALO-Company-ID': companyInfo?.id || '',
        'X-ALO-Timestamp': timestamp,
        'X-ALO-Signature': signature,
        'X-ALO-Request-ID': randomUUID(),
      },
      signingPayload: payloadToSign,
      company: companyInfo,
    });
  } catch (error) {
    const authFailure = legacyAuthResponse(error);
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status });
    console.error('[Gateway Sign Error]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}