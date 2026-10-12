/**
 * Built-in Worker Handlers
 * ALO Labs AIOS — Concrete worker implementations for each WorkerType.
 * Each handler extends BaseWorker and implements the `process()` method.
 */

import { BaseWorker } from './worker';
import type { WorkerJob, WorkerConfig, WorkerType } from './types';

// ──────────────────────────────────────────────────────────────────────────────
// AI Worker
// ──────────────────────────────────────────────────────────────────────────────

export class AIWorker extends BaseWorker {
  constructor(config?: Partial<WorkerConfig>) {
    super('ai', config);
  }

  async process(job: WorkerJob): Promise<Record<string, unknown>> {
    const { action, model, messages, temperature, maxTokens } = job.payload as {
      action: string;
      model?: string;
      messages?: Array<{ role: string; content: string }>;
      temperature?: number;
      maxTokens?: number;
    };

    switch (action) {
      case 'chat':
      case 'completion': {
        // Delegate to the AI router / LLM route
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
        const response = await fetch(`${baseUrl}/api/llm/route`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model ?? 'default',
            messages: messages ?? [],
            temperature: temperature ?? 0.7,
            maxTokens: maxTokens ?? 2048,
          }),
        });

        if (!response.ok) {
          const text = await response.text().catch(() => 'Unknown error');
          throw new Error(`AI request failed (${response.status}): ${text}`);
        }

        const data = await response.json();
        return {
          completion: data.content ?? data.message ?? data,
          model: data.model ?? model,
          usage: data.usage ?? null,
        };
      }

      default:
        throw new Error(`Unknown AI action: ${action}`);
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Email Worker
// ──────────────────────────────────────────────────────────────────────────────

export class EmailWorker extends BaseWorker {
  constructor(config?: Partial<WorkerConfig>) {
    super('email', { concurrency: 3, ...config });
  }

  async process(job: WorkerJob): Promise<Record<string, unknown>> {
    const { action, to, subject, body, html } = job.payload as {
      action: string;
      to: string;
      subject?: string;
      body?: string;
      html?: string;
    };

    switch (action) {
      case 'send': {
        if (!to) throw new Error('Email "to" is required');
        if (!subject && !body && !html) throw new Error('Email requires subject, body, or html');

        // Email sending is delegated to an external service / API route.
        // In production, integrate with SendGrid, SES, or similar.
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
        const response = await fetch(`${baseUrl}/api/notifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'email',
            to,
            subject,
            body,
            html,
          }),
        });

        if (!response.ok) {
          const text = await response.text().catch(() => 'Unknown error');
          throw new Error(`Email send failed (${response.status}): ${text}`);
        }

        return { sent: true, to, subject };
      }

      case 'sync': {
        // Email sync placeholder — triggers a mailbox sync
        return { synced: true, syncedAt: new Date().toISOString() };
      }

      default:
        throw new Error(`Unknown email action: ${action}`);
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Social Worker
// ──────────────────────────────────────────────────────────────────────────────

export class SocialWorker extends BaseWorker {
  constructor(config?: Partial<WorkerConfig>) {
    super('social', { concurrency: 2, ...config });
  }

  async process(job: WorkerJob): Promise<Record<string, unknown>> {
    const { action, platform, content, postId } = job.payload as {
      action: string;
      platform: string;
      content?: string;
      postId?: string;
    };

    switch (action) {
      case 'publish': {
        if (!platform) throw new Error('Social "platform" is required');
        if (!content) throw new Error('Social "content" is required');

        return {
          published: true,
          platform,
          postId: postId ?? `social_${job.id}`,
          publishedAt: new Date().toISOString(),
        };
      }

      case 'sync-analytics': {
        if (!platform) throw new Error('Social "platform" is required');

        return {
          synced: true,
          platform,
          syncedAt: new Date().toISOString(),
        };
      }

      default:
        throw new Error(`Unknown social action: ${action}`);
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Notification Worker
// ──────────────────────────────────────────────────────────────────────────────

export class NotificationWorker extends BaseWorker {
  constructor(config?: Partial<WorkerConfig>) {
    super('notification', { concurrency: 10, pollInterval: 1000, ...config });
  }

  async process(job: WorkerJob): Promise<Record<string, unknown>> {
    const { action, userId, title, message, type } = job.payload as {
      action: string;
      userId?: string;
      title?: string;
      message?: string;
      type?: string;
    };

    switch (action) {
      case 'in-app': {
        if (!userId) throw new Error('Notification "userId" is required');
        if (!title) throw new Error('Notification "title" is required');

        // Store in-app notification via API
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
        const response = await fetch(`${baseUrl}/api/notifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            title,
            message,
            type: type ?? 'info',
          }),
        });

        if (!response.ok) {
          const text = await response.text().catch(() => 'Unknown error');
          throw new Error(`Notification creation failed (${response.status}): ${text}`);
        }

        return { delivered: true, userId, title };
      }

      case 'push': {
        if (!userId) throw new Error('Push notification "userId" is required');

        // Push notification delivery placeholder
        return {
          delivered: true,
          userId,
          channel: 'push',
          deliveredAt: new Date().toISOString(),
        };
      }

      default:
        throw new Error(`Unknown notification action: ${action}`);
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Backup Worker
// ──────────────────────────────────────────────────────────────────────────────

export class BackupWorker extends BaseWorker {
  constructor(config?: Partial<WorkerConfig>) {
    super('backup', { concurrency: 1, pollInterval: 10_000, ...config });
  }

  async process(job: WorkerJob): Promise<Record<string, unknown>> {
    const { action } = job.payload as { action: string };

    switch (action) {
      case 'create': {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
        const response = await fetch(`${baseUrl}/api/backups/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          const text = await response.text().catch(() => 'Unknown error');
          throw new Error(`Backup creation failed (${response.status}): ${text}`);
        }

        const data = await response.json();
        return {
          backupId: data.id ?? job.id,
          status: 'created',
          createdAt: new Date().toISOString(),
        };
      }

      case 'restore': {
        const { backupId } = job.payload as { backupId: string };
        if (!backupId) throw new Error('Backup "backupId" is required');

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
        const response = await fetch(`${baseUrl}/api/backups/restore`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ backupId }),
        });

        if (!response.ok) {
          const text = await response.text().catch(() => 'Unknown error');
          throw new Error(`Backup restore failed (${response.status}): ${text}`);
        }

        return {
          backupId,
          status: 'restored',
          restoredAt: new Date().toISOString(),
        };
      }

      default:
        throw new Error(`Unknown backup action: ${action}`);
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Media Worker
// ──────────────────────────────────────────────────────────────────────────────

export class MediaWorker extends BaseWorker {
  constructor(config?: Partial<WorkerConfig>) {
    super('media', { concurrency: 2, pollInterval: 3000, ...config });
  }

  async process(job: WorkerJob): Promise<Record<string, unknown>> {
    const { action, fileKey, width, height, format, quality } = job.payload as {
      action: string;
      fileKey: string;
      width?: number;
      height?: number;
      format?: string;
      quality?: number;
    };

    if (!fileKey) throw new Error('Media "fileKey" is required');

    switch (action) {
      case 'resize':
      case 'thumbnail': {
        // Media processing is CPU-intensive; in production this would use sharp/ffmpeg
        // in a separate process or lambda. Here we delegate to an internal API.
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
        const response = await fetch(`${baseUrl}/api/uploads`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            fileKey,
            width: width ?? 256,
            height: height ?? 256,
            format: format ?? 'webp',
            quality: quality ?? 80,
          }),
        });

        if (!response.ok) {
          const text = await response.text().catch(() => 'Unknown error');
          throw new Error(`Media processing failed (${response.status}): ${text}`);
        }

        return {
          processed: true,
          fileKey,
          action,
          dimensions: { width, height },
          format: format ?? 'webp',
        };
      }

      case 'transcode': {
        // Video transcoding placeholder
        return {
          processed: true,
          fileKey,
          action: 'transcode',
          outputFormat: format ?? 'mp4',
          processedAt: new Date().toISOString(),
        };
      }

      default:
        throw new Error(`Unknown media action: ${action}`);
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Minimal Concrete Custom Worker
// ──────────────────────────────────────────────────────────────────────────────

export class CustomWorker extends BaseWorker {
  constructor(config?: Partial<WorkerConfig>) {
    super('custom', config);
  }

  async process(job: WorkerJob): Promise<Record<string, unknown>> {
    throw new Error(`Custom worker has no default processor. Job ${job.id} requires a custom handler.`);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Handler Factory
// ──────────────────────────────────────────────────────────────────────────────

export type WorkerClassMap = Partial<Record<WorkerType, BaseWorker>>;

export function createWorker(type: WorkerType, config?: Partial<WorkerConfig>): BaseWorker {
  const classMap: Record<WorkerType, new (c?: Partial<WorkerConfig>) => BaseWorker> = {
    ai: AIWorker,
    email: EmailWorker,
    social: SocialWorker,
    notification: NotificationWorker,
    backup: BackupWorker,
    media: MediaWorker,
    custom: CustomWorker,
  };

  const Cls = classMap[type];
  if (!Cls) throw new Error(`No worker class registered for type: ${type}`);

  return new Cls(config);
}