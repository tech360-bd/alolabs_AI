// ALO Labs AIOS — WhatsApp Business API Client

import * as crypto from 'crypto';
import type {
  WhatsAppConfig,
  WhatsAppMessage,
  WhatsAppTemplate,
  WhatsAppMedia,
  WhatsAppWebhookEvent,
  WhatsAppWebhookEntry,
  WhatsAppWebhookChangeValue,
  WhatsAppWebhookMessagePayload,
  WhatsAppWebhookStatusPayload,
  WhatsAppWebhookContact,
  WhatsAppMessageContentType,
  WhatsAppTextContent,
  WhatsAppImageContent,
  WhatsAppDocumentContent,
  WhatsAppMessageSendResponse,
  WhatsAppSendResult,
  WhatsAppBusinessProfile,
} from './types';

// ─── Webhook Signature Verification ───────────────────────────────────────────

function computeSignature(payload: string, appSecret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', appSecret).update(payload).digest('hex');
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ─── WhatsApp Business Client ─────────────────────────────────────────────────

export class WhatsAppBusinessClient {
  private readonly config: WhatsAppConfig;
  private readonly baseUrl: string;

  constructor(config: WhatsAppConfig) {
    this.config = config;
    const version = config.apiVersion || 'v21.0';
    this.baseUrl = `${config.apiUrl.replace(/\/+$/, '')}/${version}`;
  }

  // ─── Messaging ────────────────────────────────────────────────────────────

  async sendMessage(to: string, message: WhatsAppMessage): Promise<WhatsAppSendResult> {
    const body = this.buildMessagePayload(to, message);

    try {
      const response = await this.apiRequest<{
        messaging_product: string;
        contacts: Array<{ input: string; wa_id: string }>;
        messages: Array<{ id: string }>;
      }>('/messages', 'POST', body);

      const messageId = response.messages?.[0]?.id;
      if (!messageId) {
        return { success: false, messageId: '', error: 'No message ID in response' };
      }

      return { success: true, messageId };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { success: false, messageId: message.id, error: errorMsg };
    }
  }

  async sendText(to: string, text: string, previewUrl: boolean = false): Promise<WhatsAppSendResult> {
    const message: WhatsAppMessage = {
      id: crypto.randomUUID(),
      from: this.config.phoneNumberId,
      to,
      type: 'text',
      text: { body: text, preview_url: previewUrl },
      timestamp: new Date().toISOString(),
      status: 'queued',
    };

    return this.sendMessage(to, message);
  }

  async sendImage(
    to: string,
    imageId: string,
    caption?: string
  ): Promise<WhatsAppSendResult> {
    const message: WhatsAppMessage = {
      id: crypto.randomUUID(),
      from: this.config.phoneNumberId,
      to,
      type: 'image',
      image: { id: imageId, caption },
      timestamp: new Date().toISOString(),
      status: 'queued',
    };

    return this.sendMessage(to, message);
  }

  async sendDocument(
    to: string,
    documentId: string,
    filename?: string,
    caption?: string
  ): Promise<WhatsAppSendResult> {
    const message: WhatsAppMessage = {
      id: crypto.randomUUID(),
      from: this.config.phoneNumberId,
      to,
      type: 'document',
      document: { id: documentId, filename, caption },
      timestamp: new Date().toISOString(),
      status: 'queued',
    };

    return this.sendMessage(to, message);
  }

  async sendTemplate(to: string, template: WhatsAppTemplate): Promise<WhatsAppSendResult> {
    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: template.name,
        language: template.language,
        components: template.components,
      },
    };

    try {
      const response = await this.apiRequest<WhatsAppMessageSendResponse>(
        '/messages',
        'POST',
        body
      );

      const messageId = response.messages?.[0]?.id;
      if (!messageId) {
        return { success: false, messageId: '', error: 'No message ID in template response' };
      }

      return { success: true, messageId };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { success: false, messageId: '', error: errorMsg };
    }
  }

  // ─── Message Status ───────────────────────────────────────────────────────

  async markAsRead(messageId: string): Promise<void> {
    await this.apiRequest('/messages', 'POST', {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
  }

  async sendTypingIndicator(to: string): Promise<void> {
    // WhatsApp Cloud API does not have a native typing indicator endpoint,
    // but we can document the pattern for when it's supported.
    // The official workaround is to send a message immediately after.
    await this.apiRequest('/messages', 'POST', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'reaction',
      reaction: {
        message_id: to,
        emoji: '👍',
      },
    }).catch(() => {
      // Typing indicator is a best-effort operation
    });
  }

  // ─── Media ────────────────────────────────────────────────────────────────

  async getMediaUrl(mediaId: string): Promise<string> {
    const response = await this.apiRequest<{ url: string }>(
      `/${mediaId}`,
      'GET'
    );
    if (!response.url) {
      throw new Error('No URL returned for media');
    }
    return response.url;
  }

  async downloadMedia(mediaUrl: string): Promise<Buffer> {
    const response = await fetch(mediaUrl, {
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download media: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async uploadMedia(
    fileBuffer: Buffer,
    mimeType: string,
    type: 'image' | 'video' | 'audio' | 'document' | 'sticker'
  ): Promise<string> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType });
    formData.append('file', blob, `upload.${mimeType.split('/')[1] || 'bin'}`);
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', type);

    const response = await fetch(`${this.baseUrl}/${this.config.phoneNumberId}/media`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Media upload failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as { id: string };
    return data.id;
  }

  async deleteMedia(mediaId: string): Promise<void> {
    await this.apiRequest(`/${mediaId}`, 'DELETE');
  }

  // ─── Business Profile ─────────────────────────────────────────────────────

  async getBusinessProfile(): Promise<Record<string, string>> {
    const response = await this.apiRequest<{
      data: Array<Record<string, unknown>>;
    }>(`/${this.config.phoneNumberId}/business_profile`, 'GET');

    const profile = response.data?.[0];
    if (!profile) {
      return {};
    }

    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(profile)) {
      if (typeof value === 'string') {
        result[key] = value;
      } else if (Array.isArray(value)) {
        result[key] = value.join(', ');
      } else if (value !== null && value !== undefined) {
        result[key] = String(value);
      }
    }

    return result;
  }

  // ─── Webhook Verification ─────────────────────────────────────────────────

  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    if (mode === 'subscribe' && token === this.config.verifyToken) {
      return challenge;
    }
    return null;
  }

  /**
   * Verify the X-Hub-Signature-256 header of an incoming webhook.
   * Call this with the raw request body string and the signature header value.
   */
  verifyWebhookSignature(payload: string, signatureHeader: string): boolean {
    const expected = computeSignature(payload, this.config.verifyToken);
    return timingSafeEqual(signatureHeader, expected);
  }

  // ─── Webhook Parsing ──────────────────────────────────────────────────────

  parseWebhook(body: unknown): WhatsAppWebhookEvent {
    const parsed = body as Record<string, unknown>;

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid webhook body: expected an object');
    }

    if (parsed.object !== 'whatsapp_business_account') {
      throw new Error(`Invalid webhook object type: ${String(parsed.object)}`);
    }

    const entries = this.parseEntries(parsed.entry as unknown[]);
    return {
      object: String(parsed.object),
      entry: entries,
    };
  }

  /**
   * Extract incoming messages from a parsed webhook event.
   */
  extractMessages(event: WhatsAppWebhookEvent): Array<{
    message: WhatsAppMessage;
    contactName?: string;
    phoneNumberId: string;
  }> {
    const results: Array<{
      message: WhatsAppMessage;
      contactName?: string;
      phoneNumberId: string;
    }> = [];

    for (const entry of event.entry) {
      for (const change of entry.changes) {
        if (change.field !== 'messages' || !change.value.messages) continue;

        const contactName = change.value.contacts?.[0]?.profile?.name;
        const phoneNumberId = change.value.metadata?.phone_number_id || '';

        for (const msgPayload of change.value.messages) {
          const message = this.convertPayloadToMessage(msgPayload, phoneNumberId);
          results.push({ message, contactName, phoneNumberId });
        }
      }
    }

    return results;
  }

  /**
   * Extract status updates from a parsed webhook event.
   */
  extractStatuses(
    event: WhatsAppWebhookEvent
  ): Array<{
    messageId: string;
    recipientId: string;
    status: string;
    timestamp: string;
    conversationId?: string;
  }> {
    const results: Array<{
      messageId: string;
      recipientId: string;
      status: string;
      timestamp: string;
      conversationId?: string;
    }> = [];

    for (const entry of event.entry) {
      for (const change of entry.changes) {
        if (change.field !== 'messages' || !change.value.statuses) continue;

        for (const statusPayload of change.value.statuses) {
          results.push({
            messageId: statusPayload.id,
            recipientId: statusPayload.recipient_id,
            status: statusPayload.status,
            timestamp: statusPayload.timestamp,
            conversationId: statusPayload.conversation?.id,
          });
        }
      }
    }

    return results;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async apiRequest<T>(
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.accessToken}`,
      'Content-Type': 'application/json',
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `WhatsApp API error: ${response.status} ${response.statusText} — ${errorBody}`
      );
    }

    const data = (await response.json()) as T;
    return data;
  }

  private buildMessagePayload(to: string, message: WhatsAppMessage): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to,
      type: message.type,
    };

    switch (message.type) {
      case 'text':
        payload.text = message.text as WhatsAppTextContent;
        break;
      case 'image':
        payload.image = message.image as WhatsAppImageContent;
        break;
      case 'audio':
        payload.audio = message.audio;
        break;
      case 'document':
        payload.document = message.document as WhatsAppDocumentContent;
        break;
      case 'video':
        payload.video = message.video;
        break;
      case 'location':
        payload.location = message.location;
        break;
      default:
        throw new Error(`Unsupported message type: ${message.type}`);
    }

    // Include reply context if present
    if (message.context?.message_id) {
      payload.context = {
        message_id: message.context.message_id,
      };
    }

    return payload;
  }

  private parseEntries(rawEntries: unknown[]): WhatsAppWebhookEntry[] {
    if (!Array.isArray(rawEntries)) return [];

    return rawEntries.map((entry) => {
      const e = entry as Record<string, unknown>;
      const changes = (e.changes as unknown[] || []).map((change) => {
        const c = change as Record<string, unknown>;
        const value = c.value as Record<string, unknown>;

        const changeValue: WhatsAppWebhookChangeValue = {
          messaging_product: String(value?.messaging_product || ''),
          metadata: {
            display_phone_number: String(
              (value?.metadata as Record<string, unknown>)?.display_phone_number || ''
            ),
            phone_number_id: String(
              (value?.metadata as Record<string, unknown>)?.phone_number_id || ''
            ),
          },
        };

        if (Array.isArray(value?.contacts)) {
          changeValue.contacts = value.contacts.map((contact) => {
            const ct = contact as Record<string, unknown>;
            const profile = ct.profile as Record<string, unknown> | undefined;
            return {
              wa_id: String(ct.wa_id || ''),
              profile: profile?.name ? { name: String(profile.name) } : undefined,
            } as WhatsAppWebhookContact;
          });
        }

        if (Array.isArray(value?.messages)) {
          changeValue.messages = value.messages.map((msg) =>
            this.parseMessagePayload(msg as Record<string, unknown>)
          );
        }

        if (Array.isArray(value?.statuses)) {
          changeValue.statuses = value.statuses.map((st) => {
            const s = st as Record<string, unknown>;
            return {
              id: String(s.id || ''),
              recipient_id: String(s.recipient_id || ''),
              status: String(s.status || ''),
              timestamp: String(s.timestamp || ''),
              conversation: s.conversation as WhatsAppWebhookStatusPayload['conversation'],
            } as WhatsAppWebhookStatusPayload;
          });
        }

        return {
          field: String(c.field || ''),
          value: changeValue,
        };
      });

      return {
        id: String(e.id || ''),
        changes,
      };
    });
  }

  private parseMessagePayload(raw: Record<string, unknown>): WhatsAppWebhookMessagePayload {
    const payload: WhatsAppWebhookMessagePayload = {
      from: String(raw.from || ''),
      id: String(raw.id || ''),
      timestamp: String(raw.timestamp || ''),
      type: (raw.type as WhatsAppMessageContentType) || 'unknown',
    };

    if (raw.text) {
      const t = raw.text as Record<string, unknown>;
      payload.text = {
        body: String(t.body || ''),
        preview_url: t.preview_url as boolean | undefined,
      };
    }

    if (raw.image) {
      const img = raw.image as Record<string, unknown>;
      payload.image = {
        id: String(img.id || ''),
        caption: img.caption ? String(img.caption) : undefined,
        sha256: img.sha256 ? String(img.sha256) : undefined,
        mime_type: img.mime_type ? String(img.mime_type) : undefined,
      };
    }

    if (raw.audio) {
      const a = raw.audio as Record<string, unknown>;
      payload.audio = {
        id: String(a.id || ''),
        mime_type: a.mime_type ? String(a.mime_type) : undefined,
      };
    }

    if (raw.document) {
      const d = raw.document as Record<string, unknown>;
      payload.document = {
        id: String(d.id || ''),
        filename: d.filename ? String(d.filename) : undefined,
        caption: d.caption ? String(d.caption) : undefined,
        mime_type: d.mime_type ? String(d.mime_type) : undefined,
        sha256: d.sha256 ? String(d.sha256) : undefined,
      };
    }

    if (raw.video) {
      const v = raw.video as Record<string, unknown>;
      payload.video = {
        id: String(v.id || ''),
        caption: v.caption ? String(v.caption) : undefined,
        sha256: v.sha256 ? String(v.sha256) : undefined,
        mime_type: v.mime_type ? String(v.mime_type) : undefined,
      };
    }

    if (raw.location) {
      const loc = raw.location as Record<string, unknown>;
      payload.location = {
        latitude: Number(loc.latitude) || 0,
        longitude: Number(loc.longitude) || 0,
        name: loc.name ? String(loc.name) : undefined,
        address: loc.address ? String(loc.address) : undefined,
      };
    }

    if (raw.context) {
      const ctx = raw.context as Record<string, unknown>;
      payload.context = {
        from: ctx.from ? String(ctx.from) : undefined,
        id: ctx.id ? String(ctx.id) : undefined,
        group_id: ctx.group_id ? String(ctx.group_id) : undefined,
        forwarded: ctx.forwarded as boolean | undefined,
        frequently_forwarded: ctx.frequently_forwarded as boolean | undefined,
      };
    }

    return payload;
  }

  private convertPayloadToMessage(
    payload: WhatsAppWebhookMessagePayload,
    phoneNumberId: string
  ): WhatsAppMessage {
    const message: WhatsAppMessage = {
      id: payload.id,
      from: payload.from,
      to: phoneNumberId,
      type: payload.type,
      timestamp: payload.timestamp,
      status: 'received',
    };

    if (payload.text) {
      message.text = payload.text;
    }
    if (payload.image) {
      message.image = payload.image;
    }
    if (payload.audio) {
      message.audio = payload.audio;
    }
    if (payload.document) {
      message.document = payload.document;
    }
    if (payload.video) {
      message.video = payload.video;
    }
    if (payload.location) {
      message.location = payload.location;
    }
    if (payload.context) {
      message.context = {
        message_id: payload.context.id,
        from: payload.context.from,
        id: payload.context.id,
      };
    }

    return message;
  }
}