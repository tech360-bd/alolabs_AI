import { NextRequest, NextResponse } from 'next/server';
import { validateGatewayRequest, GatewayRequest } from '@/lib/api-gateway';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const gatewayReq: GatewayRequest = {
      headers: {
        authorization: body.headers?.authorization,
        'x-alo-company-id': body.headers?.['x-alo-company-id'],
        'x-alo-user-id': body.headers?.['x-alo-user-id'],
        'x-alo-request-id': body.headers?.['x-alo-request-id'],
        'x-alo-timestamp': body.headers?.['x-alo-timestamp'],
        'x-alo-signature': body.headers?.['x-alo-signature'],
      },
      body: body.body,
      url: body.url || request.url,
      method: body.method || 'POST',
    };

    const result = await validateGatewayRequest(gatewayReq);

    if (!result.authenticated) {
      return NextResponse.json(result, { status: result.errorCode || 401 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Gateway Verify Error]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}