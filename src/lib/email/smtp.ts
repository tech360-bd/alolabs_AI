// ALO Labs AIOS — SMTP Email Sender (raw net module, no npm deps)

import * as net from 'net';
import * as crypto from 'crypto';
import type {
  SMTPConfig,
  EmailMessage,
  EmailAttachment,
  EmailSendResult,
  EmailBulkSendResult,
  EmailTemplate,
} from './types';

const CRLF = '\r\n';

function generateMessageId(domain: string): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(8).toString('hex');
  return `<${timestamp}-${random}@${domain}>`;
}

function generateBoundary(): string {
  return `----=_Part_${crypto.randomBytes(12).toString('hex')}`;
}

function formatDate(): string {
  const now = new Date();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const pad = (n: number): string => n.toString().padStart(2, '0');
  const offset = -now.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const absOffset = Math.abs(offset);
  const hours = pad(Math.floor(absOffset / 60));
  const mins = pad(absOffset % 60);

  return `${days[now.getUTCDay()]}, ${pad(now.getUTCDate())} ${months[now.getUTCMonth()]} ${now.getUTCFullYear()} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())} ${sign}${hours}${mins}`;
}

function encodeBase64(buffer: Buffer): string {
  return buffer.toString('base64');
}

function wrapBase64(base64: string, lineLength: number = 76): string {
  const lines: string[] = [];
  for (let i = 0; i < base64.length; i += lineLength) {
    lines.push(base64.substring(i, i + lineLength));
  }
  return lines.join(CRLF);
}

function escapeHeader(value: string): string {
  if (/[^\x20-\x7E]/.test(value)) {
    const encoded = Buffer.from(value, 'utf-8').toString('base64');
    return `=?utf-8?B?${encoded}?=`;
  }
  return value;
}

function buildEmailAddress(addr: string): string {
  const match = addr.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return `${escapeHeader(match[1].trim())} <${match[2].trim()}>`;
  }
  return addr;
}

function encodeWord(word: string): string {
  if (/[^\x20-\x7E]/.test(word)) {
    const encoded = Buffer.from(word, 'utf-8').toString('base64');
    return `=?utf-8?B?${encoded}?=`;
  }
  return word;
}

function buildMimeMessage(message: EmailMessage, domain: string): string {
  const messageId = message.id || generateMessageId(domain);
  const hasAttachments = message.attachments.length > 0;
  const hasHtml = Boolean(message.html);
  const hasText = Boolean(message.text);

  const lines: string[] = [];

  // Headers
  lines.push(`From: ${buildEmailAddress(message.from)}`);
  lines.push(`To: ${message.to.map(buildEmailAddress).join(', ')}`);

  if (message.cc.length > 0) {
    lines.push(`Cc: ${message.cc.map(buildEmailAddress).join(', ')}`);
  }

  // BCC is NOT included in the message headers (by design)

  lines.push(`Subject: ${encodeWord(message.subject)}`);
  lines.push(`Date: ${formatDate()}`);
  lines.push(`Message-ID: ${messageId}`);
  lines.push(`MIME-Version: 1.0`);

  if (message.inReplyTo) {
    lines.push(`In-Reply-To: ${message.inReplyTo}`);
  }
  if (message.references.length > 0) {
    lines.push(`References: ${message.references.join(' ')}`);
  }

  // Custom headers
  for (const [key, value] of Object.entries(message.headers)) {
    lines.push(`${key}: ${value}`);
  }

  if (hasAttachments) {
    // multipart/mixed with nested multipart/alternative for body
    const mixedBoundary = generateBoundary();
    const altBoundary = generateBoundary();

    lines.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);
    lines.push('');

    // Start mixed
    lines.push(`--${mixedBoundary}`);

    if (hasHtml && hasText) {
      lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
      lines.push('');
      lines.push(`--${altBoundary}`);
      lines.push('Content-Type: text/plain; charset=utf-8');
      lines.push('Content-Transfer-Encoding: 7bit');
      lines.push('');
      lines.push(message.text);
      lines.push('');
      lines.push(`--${altBoundary}`);
      lines.push('Content-Type: text/html; charset=utf-8');
      lines.push('Content-Transfer-Encoding: 7bit');
      lines.push('');
      lines.push(message.html);
      lines.push('');
      lines.push(`--${altBoundary}--`);
    } else if (hasHtml) {
      lines.push('Content-Type: text/html; charset=utf-8');
      lines.push('Content-Transfer-Encoding: 7bit');
      lines.push('');
      lines.push(message.html);
    } else {
      lines.push('Content-Type: text/plain; charset=utf-8');
      lines.push('Content-Transfer-Encoding: 7bit');
      lines.push('');
      lines.push(message.text);
    }

    lines.push('');

    // Attachments
    for (const attachment of message.attachments) {
      lines.push(`--${mixedBoundary}`);
      lines.push(
        `Content-Type: ${attachment.contentType}; name="${escapeHeader(attachment.filename)}"`
      );
      lines.push('Content-Transfer-Encoding: base64');
      lines.push(
        `Content-Disposition: attachment; filename="${escapeHeader(attachment.filename)}"`
      );
      lines.push('');
      lines.push(wrapBase64(encodeBase64(attachment.content)));
      lines.push('');
    }

    lines.push(`--${mixedBoundary}--`);
  } else if (hasHtml && hasText) {
    // multipart/alternative only
    const altBoundary = generateBoundary();
    lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
    lines.push('');
    lines.push(`--${altBoundary}`);
    lines.push('Content-Type: text/plain; charset=utf-8');
    lines.push('Content-Transfer-Encoding: 7bit');
    lines.push('');
    lines.push(message.text);
    lines.push('');
    lines.push(`--${altBoundary}`);
    lines.push('Content-Type: text/html; charset=utf-8');
    lines.push('Content-Transfer-Encoding: 7bit');
    lines.push('');
    lines.push(message.html);
    lines.push('');
    lines.push(`--${altBoundary}--`);
  } else if (hasHtml) {
    lines.push('Content-Type: text/html; charset=utf-8');
    lines.push('Content-Transfer-Encoding: 7bit');
    lines.push('');
    lines.push(message.html);
  } else {
    lines.push('Content-Type: text/plain; charset=utf-8');
    lines.push('Content-Transfer-Encoding: 7bit');
    lines.push('');
    lines.push(message.text);
  }

  return lines.join(CRLF);
}

interface SMTPResponse {
  code: number;
  lines: string[];
  complete: boolean;
}

class SMTPConnection {
  private socket: net.Socket | null = null;
  private buffer = '';
  private connected = false;
  private readonly config: SMTPConfig;

  constructor(config: SMTPConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      this.socket = socket;

      socket.on('error', (err) => {
        this.connected = false;
        reject(new Error(`SMTP connection error: ${err.message}`));
      });

      socket.connect(this.config.port, this.config.host, () => {
        // Wait for greeting
        this.readResponse()
          .then((response) => {
            if (response.code !== 220) {
              reject(new Error(`SMTP greeting failed: ${response.code} ${response.lines.join(' ')}`));
              return;
            }
            this.connected = true;
            resolve();
          })
          .catch(reject);
      });

      socket.on('data', (data: Buffer) => {
        this.buffer += data.toString('binary');
      });
    });
  }

  private async readResponse(timeout: number = 30000): Promise<SMTPResponse> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('SMTP response timeout'));
      }, timeout);

      const check = (): void => {
        const lines = this.buffer.split(CRLF);
        let lastCompleteIndex = -1;
        const responseLines: string[] = [];
        let code = 0;
        let complete = false;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.length >= 4 && /^\d{3}/.test(line)) {
            code = parseInt(line.substring(0, 3), 10);
            if (line[3] === ' ') {
              responseLines.push(line.substring(4));
              lastCompleteIndex = i;
              complete = true;
              break;
            } else if (line[3] === '-') {
              responseLines.push(line.substring(4));
              lastCompleteIndex = i;
            }
          }
        }

        if (complete) {
          this.buffer = lines.slice(lastCompleteIndex + 1).join(CRLF);
          clearTimeout(timer);
          resolve({ code, lines: responseLines, complete });
        } else {
          setTimeout(check, 50);
        }
      };

      check();
    });
  }

  private async command(cmd: string, expectedCode: number, timeout?: number): Promise<SMTPResponse> {
    if (!this.socket || !this.connected) {
      throw new Error('SMTP not connected');
    }

    this.socket.write(cmd + CRLF, 'binary');
    const response = await this.readResponse(timeout);

    if (response.code !== expectedCode) {
      throw new Error(
        `SMTP command "${cmd.split(' ')[0]}" failed: expected ${expectedCode}, got ${response.code} ${response.lines.join(' ')}`
      );
    }

    return response;
  }

  async authenticate(): Promise<void> {
    await this.command(`EHLO ${this.config.host}`, 250);

    // Check if STARTTLS is available (when not already using secure connection)
    if (!this.config.secure) {
      // Already sent EHLO, check capabilities - we'd need to parse 250 lines
      // For simplicity, try STARTTLS if not secure
    }

    // AUTH LOGIN
    const userB64 = Buffer.from(this.config.auth.user).toString('base64');
    const passB64 = Buffer.from(this.config.auth.pass).toString('base64');

    await this.command('AUTH LOGIN', 334);
    await this.command(userB64, 334);
    await this.command(passB64, 235);
  }

  async sendRaw(raw: string): Promise<string> {
    const fromMatch = raw.match(/^From:\s*(.+)$/m);
    const fromAddr = fromMatch ? fromMatch[1] : '';
    const envelopeFrom = this.config.auth.user;

    const mailFromResponse = await this.command(`MAIL FROM:<${envelopeFrom}>`, 250);
    const rcptResults: string[] = [];

    // Extract recipients from To, Cc, Bcc
    const recipientRegex = /<([^>]+)>/g;
    const recipients: string[] = [];
    const toCcText = raw.match(/^(To|Cc):.*$/gm) || [];
    for (const line of toCcText) {
      let match: RegExpExecArray | null;
      while ((match = recipientRegex.exec(line)) !== null) {
        recipients.push(match[1]);
      }
    }
    recipientRegex.lastIndex = 0;

    // Deduplicate recipients
    const uniqueRecipients = [...new Set(recipients)];
    for (const rcpt of uniqueRecipients) {
      await this.command(`RCPT TO:<${rcpt}>`, 250);
      rcptResults.push(rcpt);
    }

    await this.command('DATA', 354);

    // Send message body, ensuring line length limits
    const formattedRaw = raw.replace(/\r?\n/g, CRLF);
    // Ensure dot-stuffing: lines starting with a dot get an extra dot
    const dotStuffed = formattedRaw
      .split(CRLF)
      .map((line) => (line.startsWith('.') ? `.${line}` : line))
      .join(CRLF);

    const dataResponse = await this.command(dotStuffed + CRLF + '.', 250);
    return dataResponse.lines[0] || '';
  }

  async quit(): Promise<void> {
    try {
      if (this.connected && this.socket) {
        await this.command('QUIT', 221);
      }
    } finally {
      this.close();
    }
  }

  close(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
    this.buffer = '';
  }
}

export class SMTPEmailService {
  private readonly config: SMTPConfig;
  private readonly domain: string;

  constructor(config: SMTPConfig) {
    this.config = config;
    // Extract domain from username for Message-ID generation
    const atIdx = config.auth.user.indexOf('@');
    this.domain = atIdx >= 0 ? config.auth.user.substring(atIdx + 1) : config.host;
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const conn = new SMTPConnection(this.config);

    try {
      await conn.connect();
      await conn.authenticate();

      const raw = buildMimeMessage(message, this.domain);
      const response = await conn.sendRaw(raw);

      // Extract message-id from the server response if available
      const idMatch = response.match(/<[^>]+>/);
      const messageId = idMatch ? idMatch[0] : message.id || generateMessageId(this.domain);

      return { success: true, messageId };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { success: false, messageId: message.id || '', error: errorMessage };
    } finally {
      conn.quit();
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
    const conn = new SMTPConnection(this.config);

    try {
      await conn.connect();
      await conn.authenticate();
      return true;
    } catch {
      return false;
    } finally {
      conn.quit();
    }
  }

  private interpolate(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
      return variables[key] !== undefined ? variables[key] : match;
    });
  }
}