// ALO Labs AIOS — Email Type Definitions

// ─── Attachment ───────────────────────────────────────────────────────────────

export interface EmailAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
  size: number;
}

// ─── Message ──────────────────────────────────────────────────────────────────

export interface EmailMessage {
  id: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  html: string;
  text: string;
  attachments: EmailAttachment[];
  headers: Record<string, string>;
  inReplyTo: string | null;
  references: string[];
}

// ─── Folder ───────────────────────────────────────────────────────────────────

export type EmailFolderName =
  | 'inbox'
  | 'sent'
  | 'drafts'
  | 'trash'
  | 'archive'
  | 'custom';

export interface EmailFolder {
  name: string;
  displayName: string;
  type: EmailFolderName;
  totalMessages: number;
  unreadMessages: number;
  delimiter: string;
  path: string;
}

// ─── Thread ───────────────────────────────────────────────────────────────────

export interface EmailThread {
  id: string;
  subject: string;
  messages: EmailMessage[];
  participants: string[];
  folder: string;
  isRead: boolean;
  isFlagged: boolean;
  lastMessageAt: Date;
}

// ─── Template ─────────────────────────────────────────────────────────────────

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  html: string;
  text: string;
  variables: string[];
  category: string;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export type EmailProvider = 'gmail' | 'outlook' | 'zoho' | 'custom-smtp';

// ─── SMTP Config ──────────────────────────────────────────────────────────────

export interface TLSOptions {
  rejectUnauthorized?: boolean;
  ca?: Buffer | string[];
  cert?: Buffer | string;
  key?: Buffer | string;
  ciphers?: string;
  minVersion?: string;
}

export interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  tls?: TLSOptions;
}

// ─── IMAP Config ──────────────────────────────────────────────────────────────

export interface IMAPConfig {
  host: string;
  port: number;
  tls: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

// ─── Sync Result ──────────────────────────────────────────────────────────────

export interface EmailSyncResult {
  synced: number;
  failed: number;
  errors: string[];
}

// ─── Tracking Events ──────────────────────────────────────────────────────────

export type EmailTrackingEventType = 'open' | 'click' | 'bounce' | 'complaint' | 'delivered';

export interface EmailTrackingEvent {
  id: string;
  messageId: string;
  type: EmailTrackingEventType;
  timestamp: Date;
  ip?: string;
  userAgent?: string;
  link?: string;
  metadata?: Record<string, string>;
}

// ─── Search Query (IMAP) ─────────────────────────────────────────────────────

export interface SearchQuery {
  unseen?: boolean;
  from?: string;
  to?: string;
  subject?: string;
  since?: Date;
  before?: Date;
  body?: string;
  flagged?: boolean;
  answered?: boolean;
  larger?: number;
  smaller?: number;
}

// ─── Send Result ──────────────────────────────────────────────────────────────

export interface EmailSendResult {
  success: boolean;
  messageId: string;
  error?: string;
}

export interface EmailBulkSendResult {
  success: number;
  failed: number;
  results: EmailSendResult[];
}