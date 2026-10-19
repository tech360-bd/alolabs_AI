import { db } from '@/lib/db';

const SECRET_KEY = /(token|password|secret|authorization|cookie|api[-_]?key|credential|email|phone)/i;

/** Minimal audit redaction; prompts and credential material should never be passed. */
export function safeAuditDetails(value: Record<string, unknown> = {}): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) {
      cleaned[key] = '[redacted]';
      continue;
    }
    if (typeof raw === 'string') cleaned[key] = raw.length > 500 ? `${raw.slice(0, 500)}…` : raw;
    else if (raw === null || typeof raw === 'number' || typeof raw === 'boolean') cleaned[key] = raw;
    else if (Array.isArray(raw)) cleaned[key] = raw.slice(0, 50).map((item) => typeof item === 'string' ? item.slice(0, 120) : item);
    else cleaned[key] = '[omitted]';
  }
  return cleaned;
}

export interface AuditEventInput {
  actorUserId?: string | null;
  companyId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  details?: Record<string, unknown>;
}

/** Persist an append-only audit event. Callers doing privileged writes fail closed if this fails. */
export async function writeAuditEvent(input: AuditEventInput): Promise<void> {
  await db.auditEvent.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      companyId: input.companyId ?? null,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId ?? null,
      requestId: input.requestId ?? null,
      ipAddress: input.ipAddress ?? null,
      details: JSON.stringify(safeAuditDetails(input.details)),
    },
  });
}
