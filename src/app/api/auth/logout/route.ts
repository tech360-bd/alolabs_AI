import { NextRequest, NextResponse } from 'next/server';
import { deleteSessionToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token } = body;

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