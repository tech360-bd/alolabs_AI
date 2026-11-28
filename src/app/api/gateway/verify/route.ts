import { NextRequest, NextResponse } from 'next/server';
import { validateGatewayRequest, GatewayRequest } from '@/lib/api-gateway';
import { legacyTenant, legacyAuthResponse } from '@/lib/api/legacy-session';

function headerString(obj: Record<string, unknown> | undefined, key: string): string | undefined {
  const val = obj?.[key];
  return typeof val === 'string' ? val : undefined;
}

export async function POST(request: NextRequest) {
  try {
    // Tenant-scoped verification oracle: callers can only verify gateway
    // credentials belonging to their own organisation.
    const tenant = await legacyTenant(request);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const rawHeaders =
      body.headers && typeof body.headers === 'object' && !Array.isArray(body.headers)
        ? (body.headers as Record<string, unknown>)
        : undefined;

    const gatewayReq: GatewayRequest = {
      headers: {
        authorization: headerString(rawHeaders, 'authorization'),
        'x-alo-company-id': headerString(rawHeaders, 'x-alo-company-id'),
        'x-alo-user-id': headerString(rawHeaders, 'x-alo-user-id'),
        'x-alo-request-id': headerString(rawHeaders, 'x-alo-request-id'),
        'x-alo-timestamp': headerString(rawHeaders, 'x-alo-timestamp'),
        'x-alo-signature': headerString(rawHeaders, 'x-alo-signature'),
      },
      body: body.body,
      url: typeof body.url === 'string' && body.url ? body.url : request.url,
      method: typeof body.method === 'string' && body.method ? body.method : 'POST',
    };

    const result = await validateGatewayRequest(gatewayReq);

    if (!result.authenticated) {
      return NextResponse.json(result, { status: result.errorCode || 401 });
    }

    if (result.company && result.company.id !== tenant.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(result);
  } catch (error) {
    const authFailure = legacyAuthResponse(error);
    if (authFailure) {
      return NextResponse.json({ error: authFailure.error }, { status: authFailure.status });
    }
    console.error('[Gateway Verify Error]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
