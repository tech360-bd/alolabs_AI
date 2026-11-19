import type { NextRequest } from 'next/server';
import crypto from 'node:crypto';

export function clientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}
