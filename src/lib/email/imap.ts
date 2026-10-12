// ALO Labs AIOS — IMAP Email Reader (raw net module, no npm deps)

import * as net from 'net';
import * as crypto from 'crypto';
import type {
  IMAPConfig,
  EmailMessage,
  EmailAttachment,
  EmailFolder,
  EmailSyncResult,
  SearchQuery,
} from './types';

const CRLF = '\r\n';

// ─── IMAP Response Parser ────────────────────────────────────────────────────

interface IMAPUntaggedResponse {
  tag: string | null; // null for untagged
  status: string | null;
  text: string;
  lineNumber: number;
}

interface IMAPCommandResult {
  ok: boolean;
  status: string;
  text: string;
  untagged: IMAPUntaggedResponse[];
  literalData: Map<string, string>; // keyed by a generated key from sequence
}

class IMAPConnection {
  private socket: net.Socket | null = null;
  private buffer = '';
  private connected = false;
  private readonly config: IMAPConfig;
  private tagCounter = 0;
  private literalBuffers: Map<string, Buffer> = new Map();
  private idleActive = false;
  private idleResolve: (() => void) | null = null;
  private idleTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(config: IMAPConfig) {
    this.config = config;
  }

  private nextTag(): string {
    this.tagCounter++;
    return `A${this.tagCounter.toString().padStart(4, '0')}`;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      this.socket = socket;

      socket.on('error', (err) => {
        this.connected = false;
        reject(new Error(`IMAP connection error: ${err.message}`));
      });

      socket.connect(this.config.port, this.config.host, () => {
        this.connected = true;
        // Wait for server greeting
        this.readResponse(null)
          .then(() => resolve())
          .catch(reject);
      });

      socket.on('data', (data: Buffer) => {
        this.buffer += data.toString('binary');

        // If in IDLE mode, check for continuation
        if (this.idleActive) {
          if (this.buffer.includes('OK') || this.buffer.includes('EXISTS') || this.buffer.includes('EXPUNGE')) {
            // IDLE response received
            if (this.idleResolve) {
              const resolve = this.idleResolve;
              this.idleResolve = null;
              resolve();
            }
          }
        }
      });
    });
  }

  private async readResponse(expectedTag: string | null, timeout: number = 30000): Promise<IMAPCommandResult> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('IMAP response timeout'));
      }, timeout);

      const check = (): void => {
        const lines = this.buffer.split(CRLF);
        const untagged: IMAPUntaggedResponse[] = [];
        let lastCompleteIndex = -1;
        let resultOk = false;
        let resultStatus = '';
        let resultText = '';

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          // Tagged response: TAG STATUS text
          if (expectedTag) {
            const taggedMatch = line.match(new RegExp(`^${expectedTag}\\s+(OK|NO|BAD)\\s*(.*)$`, 'i'));
            if (taggedMatch) {
              resultStatus = taggedMatch[1].toUpperCase();
              resultText = taggedMatch[2];
              resultOk = resultStatus === 'OK';
              lastCompleteIndex = i;
              break;
            }
          }

          // Untagged response: * STATUS text
          const untaggedMatch = line.match(/^\*\s+(OK|NO|BAD|FETCH|LIST|LSUB|SEARCH|EXISTS|EXPUNGE|FLAGS|RECENT|CAPABILITY)\s*(.*)$/i);
          if (untaggedMatch) {
            untagged.push({
              tag: null,
              status: untaggedMatch[1].toUpperCase(),
              text: untaggedMatch[2],
              lineNumber: i,
            });
          }

          // Untagged numeric: * N STATUS
          const numMatch = line.match(/^\*\s+(\d+)\s+(FETCH|EXISTS|EXPUNGE|RECENT)\s*(.*)$/i);
          if (numMatch) {
            untagged.push({
              tag: null,
              status: numMatch[2].toUpperCase(),
              text: `${numMatch[1]} ${numMatch[3] || ''}`.trim(),
              lineNumber: i,
            });
          }
        }

        if (lastCompleteIndex >= 0 || (expectedTag === null && lines.length > 0)) {
          this.buffer = lines.slice(lastCompleteIndex + 1).join(CRLF);
          clearTimeout(timer);
          resolve({
            ok: resultOk,
            status: resultStatus,
            text: resultText,
            untagged,
            literalData: new Map(),
          });
        } else {
          setTimeout(check, 50);
        }
      };

      check();
    });
  }

  private async command(cmd: string, timeout?: number): Promise<IMAPCommandResult> {
    if (!this.socket || !this.connected) {
      throw new Error('IMAP not connected');
    }

    const tag = this.nextTag();
    const fullCmd = `${tag} ${cmd}`;
    this.socket.write(fullCmd + CRLF, 'binary');
    const result = await this.readResponse(tag, timeout);

    if (result.status === 'NO') {
      throw new Error(`IMAP command failed: ${result.text}`);
    }
    if (result.status === 'BAD') {
      throw new Error(`IMAP bad command: ${result.text}`);
    }

    return result;
  }

  async authenticate(): Promise<void> {
    if (this.config.tls) {
      // With implicit TLS, connection is already secure
    }
    await this.command(`LOGIN "${this.escapeString(this.config.auth.user)}" "${this.escapeString(this.config.auth.pass)}"`);
  }

  async select(folder: string): Promise<{ count: number; recent: number }> {
    const result = await this.command(`SELECT "${folder}"`);
    let count = 0;
    let recent = 0;

    for (const ut of result.untagged) {
      if (ut.status === 'EXISTS') {
        count = parseInt(ut.text, 10) || 0;
      }
      if (ut.status === 'RECENT') {
        recent = parseInt(ut.text, 10) || 0;
      }
    }

    return { count, recent };
  }

  async search(query: SearchQuery): Promise<number[]> {
    const criteria: string[] = [];

    if (query.unseen) criteria.push('UNSEEN');
    if (query.from) criteria.push(`FROM "${this.escapeString(query.from)}"`);
    if (query.to) criteria.push(`TO "${this.escapeString(query.to)}"`);
    if (query.subject) criteria.push(`SUBJECT "${this.escapeString(query.subject)}"`);
    if (query.since) {
      const d = query.since;
      const day = d.getUTCDate().toString().padStart(2, '0');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      criteria.push(`SINCE ${day}-${months[d.getUTCMonth()]}-${d.getUTCFullYear()}`);
    }
    if (query.before) {
      const d = query.before;
      const day = d.getUTCDate().toString().padStart(2, '0');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      criteria.push(`BEFORE ${day}-${months[d.getUTCMonth()]}-${d.getUTCFullYear()}`);
    }
    if (query.body) criteria.push(`BODY "${this.escapeString(query.body)}"`);
    if (query.flagged) criteria.push('FLAGGED');
    if (query.answered !== undefined) criteria.push(query.answered ? 'ANSWERED' : 'UNANSWERED');
    if (query.larger !== undefined) criteria.push(`LARGER ${query.larger}`);
    if (query.smaller !== undefined) criteria.push(`SMALLER ${query.smaller}`);

    if (criteria.length === 0) criteria.push('ALL');

    const searchCmd = `SEARCH ${criteria.join(' ')}`;
    const result = await this.command(searchCmd);

    for (const ut of result.untagged) {
      if (ut.status === 'SEARCH') {
        const nums = ut.text.trim().split(/\s+/).filter(Boolean).map(Number);
        return nums.filter((n) => !isNaN(n));
      }
    }

    return [];
  }

  async fetchHeaders(sequenceNumber: number): Promise<string> {
    const result = await this.command(`FETCH ${sequenceNumber} (RFC822.HEADER)`, 15000);
    for (const ut of result.untagged) {
      if (ut.status === 'FETCH' && ut.text.includes('RFC822.HEADER')) {
        return this.extractLiteral(ut.text);
      }
    }
    return '';
  }

  async fetchBody(sequenceNumber: number): Promise<string> {
    const result = await this.command(`FETCH ${sequenceNumber} (RFC822)`, 30000);
    for (const ut of result.untagged) {
      if (ut.status === 'FETCH' && ut.text.includes('RFC822')) {
        return this.extractLiteral(ut.text);
      }
    }
    return '';
  }

  async fetchStructure(sequenceNumber: number): Promise<string> {
    const result = await this.command(`FETCH ${sequenceNumber} (BODYSTRUCTURE)`);
    for (const ut of result.untagged) {
      if (ut.status === 'FETCH') {
        return ut.text;
      }
    }
    return '';
  }

  async storeFlags(sequenceNumber: number, flags: string[], operation: '+' | '-' = '+'): Promise<void> {
    await this.command(`STORE ${sequenceNumber} ${operation}FLAGS (${flags.join(' ')})`);
  }

  async copy(sequenceNumber: number, folder: string): Promise<void> {
    await this.command(`COPY ${sequenceNumber} "${folder}"`);
  }

  async expunge(): Promise<void> {
    await this.command('EXPUNGE');
  }

  async list(): Promise<string[]> {
    const result = await this.command('LIST "" "*"');
    const folders: string[] = [];
    for (const ut of result.untagged) {
      if (ut.status === 'LIST') {
        // LIST response: LIST (\\HasNoChildren) "/" "INBOX"
        const match = ut.text.match(/"([^"]+)"\s*$/);
        if (match) {
          folders.push(match[1]);
        }
      }
    }
    return folders;
  }

  async noop(): Promise<void> {
    await this.command('NOOP');
  }

  async capability(): Promise<string[]> {
    const result = await this.command('CAPABILITY');
    for (const ut of result.untagged) {
      if (ut.status === 'CAPABILITY') {
        return ut.text.split(/\s+/).filter(Boolean);
      }
    }
    return [];
  }

  async startIdle(): Promise<void> {
    const tag = this.nextTag();
    const cmd = `${tag} IDLE`;
    this.socket!.write(cmd + CRLF, 'binary');

    // Wait for continuation (+)
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('IDLE continuation timeout'));
      }, 10000);

      const check = (): void => {
        if (this.buffer.includes('+')) {
          this.buffer = this.buffer.replace(/\+.*?\r\n/, '');
          clearTimeout(timer);
          this.idleActive = true;
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };

      check();
    });
  }

  async endIdle(): Promise<void> {
    if (!this.idleActive || !this.socket) return;
    this.idleActive = false;
    this.socket.write('DONE' + CRLF, 'binary');

    // Wait for tagged OK response
    const checkTag = this.tagCounter.toString().padStart(4, '0');
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('IDLE end timeout'));
      }, 10000);

      const check = (): void => {
        if (this.buffer.includes(`A${checkTag}`)) {
          this.buffer = '';
          clearTimeout(timer);
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };

      check();
    });

    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }
  }

  async logout(): Promise<void> {
    try {
      if (this.connected) {
        await this.command('LOGOUT');
      }
    } finally {
      this.close();
    }
  }

  close(): void {
    this.idleActive = false;
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
    this.buffer = '';
  }

  private extractLiteral(text: string): string {
    // IMAP literal format: {N}\r\n<literal data>
    const literalMatch = text.match(/\{(\d+)\}\s*$/);
    if (literalMatch) {
      const size = parseInt(literalMatch[1], 10);
      // The literal data should be in the buffer after the {} token
      // For simplicity, return the portion after the literal marker
      const markerEnd = text.indexOf('}') + 1;
      return text.substring(markerEnd).trim();
    }
    return text;
  }

  private escapeString(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }
}

// ─── MIME Parser ──────────────────────────────────────────────────────────────

function parseMimeMessage(raw: string): { headers: Record<string, string>; body: string; parts: MimePart[] } {
  const headerEnd = raw.indexOf('\r\n\r\n');
  const separator = headerEnd >= 0 ? '\r\n\r\n' : '\n\n';
  const sepIdx = raw.indexOf(separator);
  const headerSection = sepIdx >= 0 ? raw.substring(0, sepIdx) : raw;
  const bodySection = sepIdx >= 0 ? raw.substring(sepIdx + separator.length) : '';

  const headers = parseHeaders(headerSection);
  const contentType = headers['content-type'] || '';

  if (contentType.includes('multipart/')) {
    const boundaryMatch = contentType.match(/boundary="?([^";\s]+)"?/);
    if (boundaryMatch) {
      const parts = parseMultipart(bodySection, boundaryMatch[1]);
      return { headers, body: bodySection, parts };
    }
  }

  return { headers, body: bodySection, parts: [{ headers, body: bodySection }] };
}

interface MimePart {
  headers: Record<string, string>;
  body: string;
  filename?: string;
  contentType?: string;
  isAttachment?: boolean;
}

function parseHeaders(headerSection: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const lines = headerSection.split(/\r?\n/);
  let currentKey = '';

  for (const line of lines) {
    if (line.match(/^\s/) && currentKey) {
      // Continuation line
      headers[currentKey] += ' ' + line.trim();
    } else {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        currentKey = line.substring(0, colonIdx).trim().toLowerCase();
        headers[currentKey] = line.substring(colonIdx + 1).trim();
      }
    }
  }

  return headers;
}

function parseMultipart(body: string, boundary: string): MimePart[] {
  const parts: MimePart[] = [];
  const delimiter = `--${boundary}`;
  const endDelimiter = `--${boundary}--`;
  const sections = body.split(delimiter);

  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];
    if (section.startsWith('--')) continue; // End marker

    const sepIdx = section.indexOf('\r\n\r\n');
    if (sepIdx < 0) continue;

    const headerSection = section.substring(0, sepIdx);
    const partBody = section.substring(sepIdx + 4).replace(/\r\n$/, '');

    const headers = parseHeaders(headerSection);
    const contentType = headers['content-type'] || '';
    const contentDisposition = headers['content-disposition'] || '';

    const filenameMatch = contentDisposition.match(/filename="?([^";\n]+)"?/) ||
      contentType.match(/name="?([^";\n]+)"?/);

    const isAttachment = contentDisposition.toLowerCase().includes('attachment') ||
      Boolean(filenameMatch && !contentType.startsWith('text/'));

    parts.push({
      headers,
      body: partBody,
      filename: filenameMatch ? filenameMatch[1].replace(/^["']|["']$/g, '') : undefined,
      contentType,
      isAttachment,
    });
  }

  return parts;
}

function decodeQuotedPrintable(str: string): string {
  return str.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function decodeBase64(str: string): string {
  const cleaned = str.replace(/[\r\n\s]/g, '');
  return Buffer.from(cleaned, 'base64').toString('utf-8');
}

function decodeHeader(header: string): string {
  // Decode RFC 2047 encoded words
  return header.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_, charset, encoding, text) => {
      try {
        if (encoding.toUpperCase() === 'B') {
          return Buffer.from(text, 'base64').toString(charset.toLowerCase() === 'utf-8' ? 'utf-8' : 'ascii');
        }
        if (encoding.toUpperCase() === 'Q') {
          return decodeQuotedPrintable(text.replace(/_/g, ' '));
        }
      } catch {
        return header;
      }
      return header;
    }
  );
}

function parseEmailAddressList(header: string): string[] {
  const addresses: string[] = [];
  const regex = /<([^>]+)>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(header)) !== null) {
    addresses.push(match[1]);
  }
  // If no angle brackets found, try comma-separated
  if (addresses.length === 0) {
    return header.split(',').map((a) => a.trim()).filter(Boolean);
  }
  return addresses;
}

function parseMessageId(header: string): string {
  const match = header.match(/<([^>]+)>/);
  return match ? `<${match[1]}>` : '';
}

function parseReferences(header: string): string[] {
  const refs: string[] = [];
  const regex = /<([^>]+)>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(header)) !== null) {
    refs.push(`<${match[1]}>`);
  }
  return refs;
}

// ─── IMAP Email Service ──────────────────────────────────────────────────────

export class IMAPEmailService {
  private readonly config: IMAPConfig;
  private connection: IMAPConnection | null = null;

  constructor(config: IMAPConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    this.connection = new IMAPConnection(this.config);
    await this.connection.connect();
    await this.connection.authenticate();
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.logout();
      this.connection = null;
    }
  }

  private ensureConnected(): IMAPConnection {
    if (!this.connection) {
      throw new Error('IMAP not connected. Call connect() first.');
    }
    return this.connection;
  }

  async listFolders(): Promise<EmailFolder[]> {
    const conn = this.ensureConnected();
    const rawFolders = await conn.list();

    const folders: EmailFolder[] = rawFolders.map((path) => {
      const displayName = path.split(conn['escapeString'] ? '/' : '/').pop() || path;
      let type: EmailFolder['type'] = 'custom';

      const lower = path.toLowerCase();
      if (lower === 'inbox' || lower.endsWith('/inbox')) type = 'inbox';
      else if (lower === 'sent' || lower.includes('sent')) type = 'sent';
      else if (lower === 'drafts' || lower.includes('draft')) type = 'drafts';
      else if (lower === 'trash' || lower.includes('trash') || lower.includes('deleted')) type = 'trash';
      else if (lower === 'archive' || lower.includes('archive')) type = 'archive';

      return {
        name: path,
        displayName,
        type,
        totalMessages: 0,
        unreadMessages: 0,
        delimiter: '/',
        path,
      };
    });

    return folders;
  }

  async searchMessages(folder: string, query: SearchQuery): Promise<EmailMessage[]> {
    const conn = this.ensureConnected();
    await conn.select(folder);
    const sequenceNumbers = await conn.search(query);

    const messages: EmailMessage[] = [];
    // Fetch in batches to avoid overwhelming
    const batchSize = 20;
    for (let i = 0; i < sequenceNumbers.length; i += batchSize) {
      const batch = sequenceNumbers.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map((seq) => this.fetchMessageBySeq(conn, seq))
      );
      for (const r of batchResults) {
        if (r.status === 'fulfilled') {
          messages.push(r.value);
        }
      }
    }

    return messages;
  }

  async getMessage(uid: string): Promise<EmailMessage> {
    const conn = this.ensureConnected();
    const seqNum = parseInt(uid, 10);
    if (isNaN(seqNum)) {
      throw new Error(`Invalid message UID: ${uid}`);
    }
    return this.fetchMessageBySeq(conn, seqNum);
  }

  async moveMessage(uid: string, folder: string): Promise<void> {
    const conn = this.ensureConnected();
    const seqNum = parseInt(uid, 10);
    if (isNaN(seqNum)) {
      throw new Error(`Invalid message UID: ${uid}`);
    }
    await conn.copy(seqNum, folder);
    await conn.storeFlags(seqNum, ['\\Deleted']);
    await conn.expunge();
  }

  async deleteMessage(uid: string): Promise<void> {
    const conn = this.ensureConnected();
    const seqNum = parseInt(uid, 10);
    if (isNaN(seqNum)) {
      throw new Error(`Invalid message UID: ${uid}`);
    }
    await conn.storeFlags(seqNum, ['\\Deleted']);
    await conn.expunge();
  }

  async markAsRead(uid: string): Promise<void> {
    const conn = this.ensureConnected();
    const seqNum = parseInt(uid, 10);
    if (isNaN(seqNum)) {
      throw new Error(`Invalid message UID: ${uid}`);
    }
    await conn.storeFlags(seqNum, ['\\Seen']);
  }

  async sync(folder: string, since: Date): Promise<EmailSyncResult> {
    const conn = this.ensureConnected();
    const errors: string[] = [];
    let synced = 0;
    let failed = 0;

    try {
      await conn.select(folder);
      const seqNums = await conn.search({ since, unseen: true });

      for (const seq of seqNums) {
        try {
          await this.fetchMessageBySeq(conn, seq);
          synced++;
        } catch (err) {
          failed++;
          errors.push(`Message ${seq}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch (err) {
      errors.push(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    return { synced, failed, errors };
  }

  private async fetchMessageBySeq(conn: IMAPConnection, seqNum: number): Promise<EmailMessage> {
    const raw = await conn.fetchBody(seqNum);
    const parsed = parseMimeMessage(raw);
    const headers = parsed.headers;

    // Extract content from parts
    let textContent = '';
    let htmlContent = '';
    const attachments: EmailAttachment[] = [];

    if (parsed.parts.length > 0) {
      for (const part of parsed.parts) {
        const ct = (part.contentType || '').toLowerCase();
        const transferEncoding = (part.headers['content-transfer-encoding'] || '').toLowerCase();

        let decodedBody = part.body;
        if (transferEncoding === 'quoted-printable') {
          decodedBody = decodeQuotedPrintable(part.body);
        } else if (transferEncoding === 'base64') {
          decodedBody = decodeBase64(part.body);
        }

        if (part.isAttachment && part.filename) {
          const contentBuffer = transferEncoding === 'base64'
            ? Buffer.from(part.body.replace(/[\r\n\s]/g, ''), 'base64')
            : Buffer.from(decodedBody, 'utf-8');

          attachments.push({
            filename: part.filename,
            contentType: part.contentType || 'application/octet-stream',
            content: contentBuffer,
            size: contentBuffer.length,
          });
        } else if (ct.startsWith('text/plain')) {
          textContent = decodedBody;
        } else if (ct.startsWith('text/html')) {
          htmlContent = decodedBody;
        }
      }
    } else {
      // Single part message
      const ct = (headers['content-type'] || '').toLowerCase();
      const transferEncoding = (headers['content-transfer-encoding'] || '').toLowerCase();
      let body = parsed.body;
      if (transferEncoding === 'quoted-printable') body = decodeQuotedPrintable(body);
      else if (transferEncoding === 'base64') body = decodeBase64(body);

      if (ct.startsWith('text/html')) {
        htmlContent = body;
      } else {
        textContent = body;
      }
    }

    const fromHeader = decodeHeader(headers['from'] || '');
    const toHeader = decodeHeader(headers['to'] || '');
    const ccHeader = decodeHeader(headers['cc'] || '');

    const dateStr = headers['date'] || new Date().toISOString();
    const date = new Date(dateStr);

    return {
      id: String(seqNum),
      from: fromHeader,
      to: parseEmailAddressList(toHeader),
      cc: parseEmailAddressList(ccHeader),
      bcc: [],
      subject: decodeHeader(headers['subject'] || '(No Subject)'),
      html: htmlContent,
      text: textContent,
      attachments,
      headers,
      inReplyTo: headers['in-reply-to'] ? parseMessageId(headers['in-reply-to']) : null,
      references: headers['references'] ? parseReferences(headers['references']) : [],
      // Extra parsed fields not in the interface but useful
    } as EmailMessage & { _date?: Date };
  }
}