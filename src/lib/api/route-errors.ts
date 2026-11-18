import { NextResponse } from 'next/server';

export function actionErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error'
  const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500
  return NextResponse.json({ error: message, success: false }, { status })
}

export function authFailure(error: unknown): NextResponse | null {
  if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (error instanceof Error && error.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

export function redactedErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error';
  const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
  return NextResponse.json({ error: status === 500 ? 'Internal server error' : message }, { status });
}

export function messageErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error'
  const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500
  return NextResponse.json({ error: message }, { status })
}

export function notFoundOrActionError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error'
  const status = message === 'Unauthorized' ? 401
    : message === 'Forbidden' ? 403
      : message.includes('not found') ? 404
        : 500
  return NextResponse.json({ success: false, error: message }, { status })
}
