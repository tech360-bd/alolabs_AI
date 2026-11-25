/**
 * Command-run event store (Phase C2).
 *
 * A chat turn is a run: it has a start, model attempts, tool calls, possibly an
 * approval pause, and a terminal status. The panel must be able to show that
 * timeline again after a reload — and a reviewer must be able to fetch it later.
 *
 * Storage decision: **no new model**. `AgentRun` requires an `Agent` foreign key
 * (a command run is not a workforce agent), and `AgentExecution` requires an
 * `AgentInstance`. Creating either would mean inventing parent rows or a
 * migration, so the timeline is stored as a tenant-scoped `Artifact` of type
 * `json`, with `metadata.kind = 'command_run'`. It is queryable by id + company,
 * bounded in size, and reuses the artifact retention surface that already
 * exists. A dedicated `CommandRun` model is the follow-up once a migration is
 * approved.
 */

import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import type { CommandStatus } from './status';

export const COMMAND_RUN_KIND = 'command_run';
export const MAX_STORED_EVENTS = 200;
export const MAX_EVENT_PAYLOAD_CHARS = 4_000;

export type CommandRunEventType =
  | 'run_started'
  | 'model'
  | 'tool'
  | 'approval'
  | 'final'
  | 'error';

export interface CommandRunEvent {
  seq: number;
  at: string;
  type: CommandRunEventType;
  data: Record<string, unknown>;
}

export interface StoredCommandRun {
  id: string;
  status: CommandStatus | 'running';
  events: CommandRunEvent[];
  createdAt: string;
  updatedAt: string;
  sessionId: string | null;
  profile: string | null;
  provider: string | null;
  model: string | null;
  truncated: boolean;
}

function safeJsonParse(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function boundEvents(events: CommandRunEvent[]): CommandRunEvent[] {
  return events.slice(-MAX_STORED_EVENTS).map((event) => {
    const serialised = JSON.stringify(event.data);
    if (serialised.length <= MAX_EVENT_PAYLOAD_CHARS) return event;
    return {
      ...event,
      data: { truncated: true, preview: serialised.slice(0, MAX_EVENT_PAYLOAD_CHARS) },
    };
  });
}

/**
 * Create the run row. Returns `null` when persistence is unavailable; the caller
 * must not fail the user's command for that (it is reported, not hidden).
 */
export async function startCommandRun(params: {
  companyId: string;
  userId: string;
  sessionId: string;
  profile: string;
  messageChars: number;
}): Promise<{ id: string } | null> {
  try {
    const artifact = await db.artifact.create({
      data: {
        name: `Command run · ${params.sessionId}`.slice(0, 200),
        type: 'json',
        content: JSON.stringify({ status: 'running', events: [] }),
        mimeType: 'application/json',
        size: 0,
        checksum: '',
        companyId: params.companyId,
        createdBy: params.userId,
        metadata: JSON.stringify({
          kind: COMMAND_RUN_KIND,
          sessionId: params.sessionId,
          profile: params.profile,
          messageChars: params.messageChars,
          startedAt: new Date().toISOString(),
        }),
      },
      select: { id: true },
    });
    return artifact;
  } catch (error) {
    console.error('[command-agent] run create failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

/** Finalise the run with its terminal status and bounded event list. */
export async function finishCommandRun(params: {
  runId: string;
  companyId: string;
  status: CommandStatus;
  events: CommandRunEvent[];
  provider?: string | null;
  model?: string | null;
  durationMs?: number;
  summary?: Record<string, unknown>;
}): Promise<boolean> {
  const events = boundEvents(params.events);
  const body = JSON.stringify({
    status: params.status,
    events,
    provider: params.provider ?? null,
    model: params.model ?? null,
    durationMs: params.durationMs ?? null,
    summary: params.summary ?? {},
  });

  try {
    const existing = await db.artifact.findFirst({
      where: { id: params.runId, companyId: params.companyId, type: 'json' },
      select: { metadata: true },
    });
    if (!existing) return false;

    const metadata = safeJsonParse(existing.metadata);
    const updated = await db.artifact.updateMany({
      where: { id: params.runId, companyId: params.companyId },
      data: {
        content: body,
        size: Buffer.byteLength(body, 'utf-8'),
        checksum: createHash('sha256').update(body).digest('hex'),
        metadata: JSON.stringify({
          ...metadata,
          status: params.status,
          finishedAt: new Date().toISOString(),
          eventCount: events.length,
          provider: params.provider ?? null,
          model: params.model ?? null,
          durationMs: params.durationMs ?? null,
        }),
      },
    });
    return updated.count === 1;
  } catch (error) {
    console.error('[command-agent] run finish failed:', error instanceof Error ? error.message : error);
    return false;
  }
}

/** Read a run by id within its tenant. Never returns another tenant's run. */
export async function getCommandRun(runId: string, companyId: string): Promise<StoredCommandRun | null> {
  try {
    const row = await db.artifact.findFirst({
      where: { id: runId, companyId, type: 'json' },
      select: {
        id: true,
        content: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!row) return null;

    const metadata = safeJsonParse(row.metadata);
    if (metadata.kind !== COMMAND_RUN_KIND) return null;

    const content = safeJsonParse(row.content);
    const rawEvents = Array.isArray(content.events) ? content.events : [];
    const events: CommandRunEvent[] = rawEvents
      .filter((event): event is CommandRunEvent => {
        if (!event || typeof event !== 'object') return false;
        const candidate = event as Record<string, unknown>;
        return typeof candidate.seq === 'number' && typeof candidate.type === 'string';
      })
      .map((event) => ({
        seq: event.seq,
        at: typeof event.at === 'string' ? event.at : '',
        type: event.type,
        data: event.data && typeof event.data === 'object' && !Array.isArray(event.data)
          ? (event.data as Record<string, unknown>)
          : {},
      }));

    return {
      id: row.id,
      status: typeof content.status === 'string'
        ? (content.status as StoredCommandRun['status'])
        : 'running',
      events,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
      sessionId: typeof metadata.sessionId === 'string' ? metadata.sessionId : null,
      profile: typeof metadata.profile === 'string' ? metadata.profile : null,
      provider: typeof content.provider === 'string' ? content.provider : null,
      model: typeof content.model === 'string' ? content.model : null,
      truncated: events.length >= MAX_STORED_EVENTS,
    };
  } catch (error) {
    console.error('[command-agent] run read failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

/** Append helper used by the agent: never throws, always sequenced. */
export function createEventCollector(onEvent?: (event: CommandRunEvent) => void) {
  const events: CommandRunEvent[] = [];
  let seq = 0;

  return {
    events,
    emit(type: CommandRunEventType, data: Record<string, unknown> = {}): CommandRunEvent {
      seq += 1;
      const event: CommandRunEvent = { seq, at: new Date().toISOString(), type, data };
      events.push(event);
      if (onEvent) {
        try {
          onEvent(event);
        } catch (error) {
          // A broken consumer must not break the run; the stored timeline stays complete.
          console.error('[command-agent] event sink failed:', error instanceof Error ? error.message : error);
        }
      }
      return event;
    },
  };
}
