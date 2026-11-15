import { NextRequest, NextResponse } from 'next/server';
import { deleteSessionToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // Signing out must work for every signed-in user on either surface, with or
    // without a JSON body (the client portal posts none). It only ever deletes
    // the session the caller already holds, so it needs no role check.
    const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
    const bodyToken = typeof body?.token === 'string' ? body.token : '';
    const header = request.headers.get('authorization');
    const bearer = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
    const token = bodyToken || bearer;

    // Also check cookie
    const cookieToken = request.cookies.get('session-token')?.value;
    const tokenToDelete = token || cookieToken;

    if (tokenToDelete) {
      await deleteSessionToken(tokenToDelete);
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set('session-token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}