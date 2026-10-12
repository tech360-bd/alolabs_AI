// ALO Labs AIOS — WhatsApp Business Type Definitions

// ─── Config ───────────────────────────────────────────────────────────────────

export interface WhatsAppConfig {
  apiUrl: string;
  apiVersion: string;
  phoneNumberId: string;
  accessToken: string;
  verifyToken: string;
  webhookUrl: string;
}

export interface WhatsAppNumberConfig {
  phoneNumberId: string;
  displayName: string;
  businessName: string;
  isDefault: boolean;
}

// ─── Message ──────────────────────────────────────────────────────────────────

export interface WhatsAppTextContent {
  body: string;
  preview_url?: boolean;
}

export interface WhatsAppImageContent {
  id?: string;
  link?: string;
  caption?: string;
}

export interface WhatsAppAudioContent {
  id?: string;
  link?: string;
}

export interface WhatsAppDocumentContent {
  id?: string;
  link?: string;
  caption?: string;
  filename?: string;
}

export interface WhatsAppVideoContent {
  id?: string;
  link?: string;
  caption?: string;
}

export interface WhatsAppLocationContent {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export type WhatsAppMessageContentType =
  | 'text'
  | 'image'
  | 'audio'
  | 'document'
  | 'video'
  | 'location'
  | 'interactive'
  | 'template'
  | 'sticker'
  | 'reaction'
  | 'contacts'
  | 'unknown';

export interface WhatsAppMessage {
  id: string;
  from: string;
  to: string;
  type: WhatsAppMessageContentType;
  text?: WhatsAppTextContent;
  image?: WhatsAppImageContent;
  audio?: WhatsAppAudioContent;
  document?: WhatsAppDocumentContent;
  video?: WhatsAppVideoContent;
  location?: WhatsAppLocationContent;
  timestamp: string;
  status: WhatsAppMessageStatus;
  context?: {
    message_id?: string;
    from?: string;
    id?: string;
  };
  errors?: WhatsAppMessageError[];
}

export interface WhatsAppMessageError {
  code: number;
  title: string;
  message: string;
  href?: string;
}

// ─── Status ───────────────────────────────────────────────────────────────────

export type WhatsAppMessageStatus =
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'deleted'
  | 'queued'
  | 'received';

// ─── Template ─────────────────────────────────────────────────────────────────

export interface WhatsAppTemplateComponent {
  type: 'header' | 'body' | 'footer' | 'button';
  sub_type?: 'quick_reply' | 'url';
  index?: number;
  parameters?: WhatsAppTemplateParameter[];
  text?: string;
  url?: string;
  payload?: string;
}

export interface WhatsAppTemplateParameter {
  type: 'text' | 'currency' | 'date_time' | 'image' | 'document' | 'video';
  text?: string;
  currency?: {
    fallback_value: string;
    code: string;
    amount_1000: number;
  };
  date_time?: {
    fallback_value: string;
  };
  image?: {
    id?: string;
    link?: string;
  };
  document?: {
    id?: string;
    link?: string;
    filename?: string;
  };
  video?: {
    id?: string;
    link?: string;
  };
}

export interface WhatsAppTemplate {
  name: string;
  language: {
    code: string;
    policy?: string;
  };
  components: WhatsAppTemplateComponent[];
}

// ─── Media ────────────────────────────────────────────────────────────────────

export interface WhatsAppMedia {
  id: string;
  mimeType: string;
  sha256: string;
  url: string;
  caption?: string;
  filename?: string;
  size?: number;
}

// ─── Conversation ─────────────────────────────────────────────────────────────

export interface WhatsAppConversation {
  id: string;
  participants: string[];
  messages: WhatsAppMessage[];
  createdAt: Date;
  updatedAt: Date;
  companyId: string;
  assignedAgentId?: string;
  status?: 'active' | 'closed' | 'pending';
}

// ─── Webhook ──────────────────────────────────────────────────────────────────

export interface WhatsAppWebhookEntry {
  id: string;
  changes: WhatsAppWebhookChange[];
}

export interface WhatsAppWebhookChange {
  field: string;
  value: WhatsAppWebhookChangeValue;
}

export interface WhatsAppWebhookChangeValue {
  messaging_product: string;
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: WhatsAppWebhookContact[];
  messages?: WhatsAppWebhookMessagePayload[];
  statuses?: WhatsAppWebhookStatusPayload[];
  errors?: Array<{
    code: number;
    title: string;
    message: string;
    error_data?: Record<string, string>;
  }>;
}

export interface WhatsAppWebhookContact {
  wa_id: string;
  profile?: {
    name?: string;
  };
}

export interface WhatsAppWebhookMessagePayload {
  from: string;
  id: string;
  timestamp: string;
  type: WhatsAppMessageContentType;
  text?: { body: string; preview_url?: boolean };
  image?: { id: string; caption?: string; sha256?: string; mime_type?: string };
  audio?: { id: string; mime_type?: string };
  document?: { id: string; filename?: string; caption?: string; mime_type?: string; sha256?: string };
  video?: { id: string; caption?: string; sha256?: string; mime_type?: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  interactive?: {
    type: string;
    [key: string]: unknown;
  };
  template?: {
    name: string;
    language: { code: string };
    [key: string]: unknown;
  };
  sticker?: { id: string; mime_type?: string };
  reaction?: { emoji?: string; message_id?: string };
  context?: {
    from?: string;
    id?: string;
    group_id?: string;
    forwarded?: boolean;
    frequently_forwarded?: boolean;
    referred_product?: {
      catalog_id: string;
      product_retailer_id: string;
    };
  };
  errors?: WhatsAppMessageError[];
}

export interface WhatsAppWebhookStatusPayload {
  id: string;
  recipient_id: string;
  status: WhatsAppMessageStatus;
  timestamp: string;
  conversation?: {
    id: string;
    expiration_timestamp: number;
    origin?: {
      type: string;
    };
  };
  pricing?: {
    billable: boolean;
    pricing_model: string;
    category: string;
  };
  errors?: WhatsAppMessageError[];
}

export interface WhatsAppWebhookEvent {
  object: string;
  entry: WhatsAppWebhookEntry[];
}

// ─── Send Results ─────────────────────────────────────────────────────────────

export interface WhatsAppSendResult {
  success: boolean;
  messageId: string;
  error?: string;
}

export interface WhatsAppMessageSendResponse {
  messaging_product: string;
  contacts: Array<{
    input: string;
    wa_id: string;
  }>;
  messages: Array<{
    id: string;
    message_status?: string;
    timestamp?: string;
  }>;
}

// ─── Business Profile ─────────────────────────────────────────────────────────

export interface WhatsAppBusinessProfile {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  profile_picture_url?: string;
  websites?: string[];
  vertical?: string;
  business_hours?: unknown;
  categories?: string[];
}

// ─── Number Stats ─────────────────────────────────────────────────────────────

export interface WhatsAppNumberStats {
  messagesSent: number;
  messagesReceived: number;
  activeConversations: number;
}