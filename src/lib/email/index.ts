// ALO Labs AIOS — Email System Exports

// Types
export type {
  EmailMessage,
  EmailAttachment,
  EmailFolder,
  EmailFolderName,
  EmailThread,
  EmailTemplate,
  EmailProvider,
  SMTPConfig,
  IMAPConfig,
  TLSOptions,
  EmailSyncResult,
  EmailTrackingEvent,
  EmailTrackingEventType,
  SearchQuery,
  EmailSendResult,
  EmailBulkSendResult,
} from './types';

// SMTP Service
export { SMTPEmailService } from './smtp';

// IMAP Service
export { IMAPEmailService } from './imap';

// Template Engine
export { EmailTemplateEngine } from './templates';

// Tracking Service
export { EmailTrackingService } from './tracking';