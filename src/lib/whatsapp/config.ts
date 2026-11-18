import { readSocialCredential } from '@/lib/social/credentials';
/**
 * WhatsApp client/config resolution shared by the webhook and the inbox.
 *
 * The webhook previously carried its own private copy of this logic; the
 * shared-inbox feature needs the same resolution, so it lives here.
 */

import { db } from '@/lib/db';
import { WhatsAppBusinessClient } from './client';
import type { WhatsAppConfig } from './types';

export interface StoredWhatsAppNumber {
  id?: string;
  phoneNumberId: string;
  displayName?: string;
  accessToken: string;
  isDefault?: boolean;
  companyId?: string;
  metadata?: Record<string, unknown>;
}

export async function getStoredWhatsAppNumbers(): Promise<StoredWhatsAppNumber[]> {
  try {
    const setting = await db.settings.findUnique({ where: { key: 'whatsapp:numbers' } });
    if (!setting) return [];
    return JSON.parse(setting.value) as StoredWhatsAppNumber[];
  } catch {
    return [];
  }
}

/** Tenant that owns a phone number. Falls back to the schema's default tenant. */
export async function resolveWhatsAppCompanyId(phoneNumberId: string): Promise<string> {
  const numbers = await getStoredWhatsAppNumbers();
  const number =
    numbers.find((entry) => entry.phoneNumberId === phoneNumberId) ?? numbers.find((entry) => entry.isDefault);
  const fromMetadata = number?.metadata?.companyId;
  return (
    number?.companyId ||
    (typeof fromMetadata === 'string' ? fromMetadata : '') ||
    process.env.WHATSAPP_DEFAULT_COMPANY_ID ||
    'default-company'
  );
}

export async function buildWhatsAppClient(phoneNumberId?: string): Promise<WhatsAppBusinessClient | null> {
  const apiUrl = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com';
  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v21.0';
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || '';

  let resolvedPhoneNumberId = phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  let resolvedAccessToken = accessToken;

  if (!resolvedPhoneNumberId || !resolvedAccessToken) {
    const numbers = await getStoredWhatsAppNumbers();
    const defaultNumber = numbers.find((n) => n.isDefault) || numbers[0];
    if (defaultNumber) {
      if (!resolvedPhoneNumberId) resolvedPhoneNumberId = defaultNumber.phoneNumberId;
      if (!resolvedAccessToken) resolvedAccessToken = defaultNumber.accessToken;
    }
  }

  if (!resolvedAccessToken) {
    try {
      const tokenSetting = await db.settings.findUnique({ where: { key: 'social:whatsapp:token' } });
      if (tokenSetting) {
        const data = JSON.parse(readSocialCredential(tokenSetting.value)) as { accessToken: string };
        resolvedAccessToken = data.accessToken;
      }
    } catch {
      // ignore malformed token settings
    }
  }

  if (!resolvedPhoneNumberId || !resolvedAccessToken) return null;

  const config: WhatsAppConfig = {
    apiUrl,
    apiVersion,
    phoneNumberId: resolvedPhoneNumberId,
    accessToken: resolvedAccessToken,
    verifyToken,
    webhookUrl: '',
  };

  return new WhatsAppBusinessClient(config);
}

/** Outbound sends resolve credentials for the requested number, not the inbox default. */
export async function getWhatsAppClient(phoneNumberId?: string): Promise<{
  client: WhatsAppBusinessClient;
  resolvedPhoneNumberId: string;
} | null> {
  const apiUrl = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com';
  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v21.0';
  let accessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
  let resolvedPhoneNumberId = phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || '';

  if (!resolvedPhoneNumberId || !accessToken) {
    try {
      const numbersSetting = await db.settings.findUnique({
        where: { key: 'whatsapp:numbers' },
      });
      if (numbersSetting) {
        const numbers = JSON.parse(numbersSetting.value) as Array<{
          phoneNumberId: string;
          accessToken: string;
          isDefault: boolean;
        }>;
        const target = resolvedPhoneNumberId
          ? numbers.find((n) => n.phoneNumberId === resolvedPhoneNumberId)
          : numbers.find((n) => n.isDefault) || numbers[0];

        if (target) {
          if (!resolvedPhoneNumberId) resolvedPhoneNumberId = target.phoneNumberId;
          if (!accessToken) accessToken = target.accessToken;
        }
      }
    } catch { /* ignore */ }
  }

  if (!accessToken) {
    try {
      const tokenSetting = await db.settings.findUnique({
        where: { key: 'social:whatsapp:token' },
      });
      if (tokenSetting) {
        const data = JSON.parse(readSocialCredential(tokenSetting.value)) as { accessToken: string };
        accessToken = data.accessToken;
      }
    } catch { /* ignore */ }
  }

  if (!resolvedPhoneNumberId || !accessToken) return null;

  const config: WhatsAppConfig = {
    apiUrl,
    apiVersion,
    phoneNumberId: resolvedPhoneNumberId,
    accessToken,
    verifyToken,
    webhookUrl: '',
  };

  return {
    client: new WhatsAppBusinessClient(config),
    resolvedPhoneNumberId,
  };
}
