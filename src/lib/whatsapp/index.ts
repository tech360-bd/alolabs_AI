// ALO Labs AIOS — WhatsApp Business System Exports

// Types
export type {
  WhatsAppConfig,
  WhatsAppNumberConfig,
  WhatsAppMessage,
  WhatsAppMessageContentType,
  WhatsAppMessageStatus,
  WhatsAppMessageError,
  WhatsAppTextContent,
  WhatsAppImageContent,
  WhatsAppAudioContent,
  WhatsAppDocumentContent,
  WhatsAppVideoContent,
  WhatsAppLocationContent,
  WhatsAppTemplate,
  WhatsAppTemplateComponent,
  WhatsAppTemplateParameter,
  WhatsAppMedia,
  WhatsAppConversation,
  WhatsAppWebhookEvent,
  WhatsAppWebhookEntry,
  WhatsAppWebhookChange,
  WhatsAppWebhookChangeValue,
  WhatsAppWebhookContact,
  WhatsAppWebhookMessagePayload,
  WhatsAppWebhookStatusPayload,
  WhatsAppSendResult,
  WhatsAppMessageSendResponse,
  WhatsAppBusinessProfile,
  WhatsAppNumberStats,
} from './types';

// Client
export { WhatsAppBusinessClient } from './client';

// AI Handler
export { WhatsAppAIHandler } from './ai-handler';
export type { WhatsAppAIHandlerOptions } from './ai-handler';

// Multi-Number Manager
export { WhatsAppMultiNumberManager } from './multi-number';