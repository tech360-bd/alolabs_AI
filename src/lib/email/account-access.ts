import type { NextRequest } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { db } from '@/lib/db';
import { readMailAccount } from './account-credentials';

export async function authenticateMailSession(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return null;
  return verifySessionToken(token);
}

export async function getAccountConfig(accountId: string) {
  const setting = await db.settings.findUnique({
    where: { key: `email:account:${accountId}` },
  });
  if (!setting) return null;
  try {
    return JSON.parse(readMailAccount(setting.value)) as {
      id: string;
      email: string;
      imap: { host: string; port: number; tls: boolean };
      smtp: { host: string; port: number; secure: boolean };
      auth: { user: string; pass: string };
      isActive: boolean;
    };
  } catch {
    return null;
  }
}
