import { createTransport } from 'nodemailer';
import { randomUUID } from 'node:crypto';
import type { SMTPConfig, EmailMessage, EmailSendResult, EmailBulkSendResult, EmailTemplate } from './types';

function generateMessageId(domain: string) { return `<${randomUUID()}@${domain}>`; }

/** Use implicit TLS or require STARTTLS before authentication. MIME, envelope
 * recipients (including Bcc), dot-stuffing and timeouts belong to the transport. */
export class SMTPEmailService {
  private readonly domain: string;
  constructor(private readonly config: SMTPConfig) {
    this.domain = config.auth.user.split('@')[1] || config.host;
  }
  private transport() {
    return createTransport({
      host: this.config.host, port: this.config.port, auth: this.config.auth,
      secure: this.config.secure, requireTLS: !this.config.secure,
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
      connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 15000,
      disableFileAccess: true, disableUrlAccess: true,
    });
  }
  async send(m: EmailMessage): Promise<EmailSendResult> {
    try {
      const info = await this.transport().sendMail({
        from: m.from, to: m.to, cc: m.cc, messageId: m.id || generateMessageId(this.domain),
        // Blind recipients belong only in the envelope. The bounce address remains the authenticated mailbox.
        envelope: { from: this.config.auth.user, to: [...m.to, ...m.cc, ...m.bcc] },
        subject: m.subject, html: m.html || undefined, text: m.text, headers: m.headers,
        inReplyTo: m.inReplyTo || undefined, references: m.references,
        attachments: m.attachments.map(({ filename, contentType, content }) => ({ filename, contentType, content })),
      });
      return { success: true, messageId: info.messageId };
    } catch {
      return { success: false, messageId: m.id || '', error: 'SMTP delivery failed; check transport configuration.' };
    }
  }

  async sendBulk(messages: EmailMessage[]): Promise<EmailBulkSendResult> {
    const results: EmailSendResult[] = [];
    let successCount = 0;
    let failedCount = 0;

    // Process in batches to avoid overwhelming the server
    const batchSize = 10;
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map((msg) => this.send(msg)));
      results.push(...batchResults);

      for (const r of batchResults) {
        if (r.success) successCount++;
        else failedCount++;
      }

      // Brief pause between batches
      if (i + batchSize < messages.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return { success: successCount, failed: failedCount, results };
  }

  async sendTemplate(
    template: EmailTemplate,
    variables: Record<string, string>,
    to: string[]
  ): Promise<EmailSendResult[]> {
    const messages: EmailMessage[] = to.map((recipient) => {
      const subject = this.interpolate(template.subject, variables);
      const html = this.interpolate(template.html, variables);
      const text = this.interpolate(template.text, variables);

      return {
        id: generateMessageId(this.domain),
        from: this.config.auth.user,
        to: [recipient],
        cc: [],
        bcc: [],
        subject,
        html,
        text,
        attachments: [],
        headers: { 'X-Template': template.name, 'X-Template-Id': template.id },
        inReplyTo: null,
        references: [],
      };
    });

    const results = await this.sendBulk(messages);
    return results.results;
  }

  async verifyConnection(): Promise<boolean> {
    try { return await this.transport().verify(); } catch { return false; }
  }

  private interpolate(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
      return variables[key] !== undefined ? variables[key] : match;
    });
  }
}
