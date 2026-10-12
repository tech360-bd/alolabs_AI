// ALO Labs AIOS — WhatsApp AI Auto-Reply & Lead Creation Handler

import * as crypto from 'crypto';
import type {
  WhatsAppMessage,
  WhatsAppConversation,
} from './types';
import { WhatsAppBusinessClient as WhatsAppClient } from './client';

// ─── Constants ────────────────────────────────────────────────────────────────

const CONTEXT_WINDOW_SIZE = 10;

const NEGATIVE_SENTIMENT_PATTERNS = [
  /\b(angry|frustrat|annoyed|upset|disappointed|terrible|awful|horrible|worst|useless|stupid|ridiculous)\b/i,
  /\b(complain|sue|refund|cancel|unacceptable|unbelievable)\b/i,
  /\b(fuck|shit|damn|hell|crap)\b/i,
];

const HANDOVER_PATTERNS = [
  /\b(human|agent|person|speak to someone|real person|talk to someone|customer service|representative)\b/i,
  /\b(escalat|manager|supervisor|not helping|can't help|no help)\b/i,
];

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(?:\+?(\d{1,3}))?[-. (]*(\d{3})[-. )]*(\d{3})[-. ]*(\d{4})\b/g;
const NAME_PATTERNS = [
  /(?:my name is|i'm|i am|this is|call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g,
  /^[Hh]i(?:ya)?,?\s+I'?m\s+([A-Z][a-z]+)/,
  /^[Hh]ello,?\s+I'?m\s+([A-Z][a-z]+)/,
];

// ─── Options ──────────────────────────────────────────────────────────────────

export interface WhatsAppAIHandlerOptions {
  aiEndpoint?: string;
  leadCreationEnabled?: boolean;
  handoverThreshold?: number;
  negativeSentimentKeywords?: string[];
  greetingKeywords?: string[];
}

// ─── AI Handler ───────────────────────────────────────────────────────────────

export class WhatsAppAIHandler {
  private readonly client: WhatsAppClient;
  private readonly options: Required<WhatsAppAIHandlerOptions>;
  private readonly leadCreationCallbacks: Map<
    string,
    (leadData: Record<string, string>) => Promise<string>
  > = new Map();

  constructor(
    client: WhatsAppClient,
    options: WhatsAppAIHandlerOptions = {}
  ) {
    this.client = client;

    this.options = {
      aiEndpoint: options.aiEndpoint || '',
      leadCreationEnabled: options.leadCreationEnabled ?? true,
      handoverThreshold: options.handoverThreshold || 8,
      negativeSentimentKeywords: options.negativeSentimentKeywords || [],
      greetingKeywords: options.greetingKeywords || [
        'hi', 'hello', 'hey', 'good morning', 'good afternoon',
        'good evening', 'greetings', 'howdy', 'sup', 'what\'s up',
      ],
    };
  }

  /**
   * Register a callback for creating leads in an external system.
   * The callback receives extracted lead data and should return the lead ID.
   */
  onLeadCreated(companyId: string, callback: (leadData: Record<string, string>) => Promise<string>): void {
    this.leadCreationCallbacks.set(companyId, callback);
  }

  /**
   * Main handler for incoming WhatsApp messages.
   * Returns a reply message to send, or null if no auto-reply should be sent.
   */
  async handleIncomingMessage(
    message: WhatsAppMessage,
    conversation: WhatsAppConversation
  ): Promise<WhatsAppMessage | null> {
    // Extract text content from the message
    const textContent = this.extractTextContent(message);
    if (!textContent) {
      return null; // Non-text messages (images, audio, etc.) are not auto-replied
    }

    // Check if we should hand over to a human
    if (this.shouldHandoverToHuman(conversation, textContent)) {
      // Attempt to create a lead before handing over
      if (this.options.leadCreationEnabled) {
        await this.attemptLeadCreation(message, conversation.companyId);
      }
      return null; // Return null to signal handover needed
    }

    // Extract lead info from the message
    if (this.options.leadCreationEnabled) {
      const leadInfo = this.extractLeadInfo(message);
      if (leadInfo) {
        await this.attemptLeadCreation(message, conversation.companyId);
      }
    }

    // Check if the message is a greeting
    if (this.isGreeting(textContent)) {
      return this.buildReply(message.from, 'Hello! How can I help you today?');
    }

    // Generate AI reply
    const context = this.buildContextWindow(conversation);
    const reply = await this.generateAIReply(message, context);

    if (!reply) {
      return null;
    }

    return this.buildReply(message.from, reply);
  }

  /**
   * Determine if a conversation should be handed over to a human agent.
   */
  shouldHandoverToHuman(
    conversation: WhatsAppConversation,
    currentMessageText?: string
  ): boolean {
    const messageCount = conversation.messages.length;

    // Check message count threshold
    if (messageCount >= this.options.handoverThreshold) {
      return true;
    }

    // Check explicit handover request in current message
    if (currentMessageText) {
      for (const pattern of HANDOVER_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(currentMessageText)) {
          return true;
        }
      }

      // Check for negative sentiment in current message
      for (const pattern of NEGATIVE_SENTIMENT_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(currentMessageText)) {
          return true;
        }
      }

      // Check custom negative keywords
      const lowerText = currentMessageText.toLowerCase();
      for (const keyword of this.options.negativeSentimentKeywords) {
        if (lowerText.includes(keyword.toLowerCase())) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Extract lead information from a message (email, phone, name).
   */
  extractLeadInfo(message: WhatsAppMessage): Record<string, string> | null {
    const textContent = this.extractTextContent(message);
    if (!textContent) return null;

    const leadInfo: Record<string, string> = {};

    // Extract email
    const emailMatches = textContent.match(EMAIL_REGEX);
    if (emailMatches && emailMatches.length > 0) {
      leadInfo.email = emailMatches[0];
    }

    // Extract phone
    PHONE_REGEX.lastIndex = 0;
    const phoneMatch = PHONE_REGEX.exec(textContent);
    if (phoneMatch) {
      const [, country, area, prefix, line] = phoneMatch;
      const parts = [area, prefix, line].filter(Boolean);
      leadInfo.phone = parts.join('');
      if (country) {
        leadInfo.phoneCountryCode = country;
      }
    }

    // Extract name
    for (const pattern of NAME_PATTERNS) {
      pattern.lastIndex = 0;
      const nameMatch = pattern.exec(textContent);
      if (nameMatch && nameMatch[1]) {
        leadInfo.name = nameMatch[1].trim();
        break;
      }
    }

    // Extract from WhatsApp profile
    leadInfo.whatsappNumber = message.from;

    // Only return if we found at least one piece of info beyond the phone number
    const hasExtraInfo =
      (leadInfo.email !== undefined) ||
      (leadInfo.name !== undefined);

    return hasExtraInfo ? leadInfo : null;
  }

  /**
   * Create a lead from a message by invoking the registered callback.
   * Returns the lead ID.
   */
  async createLeadFromMessage(
    message: WhatsAppMessage,
    companyId: string
  ): Promise<string> {
    const leadInfo = this.extractLeadInfo(message);
    if (!leadInfo) {
      throw new Error('No lead information could be extracted from the message');
    }

    const callback = this.leadCreationCallbacks.get(companyId);
    if (!callback) {
      throw new Error(`No lead creation callback registered for company: ${companyId}`);
    }

    const leadId = await callback(leadInfo);
    return leadId;
  }

  /**
   * Generate an AI reply using the configured AI endpoint.
   * Falls back to a default response if no AI endpoint is configured.
   */
  async generateAIReply(
    message: WhatsAppMessage,
    context: string[]
  ): Promise<string> {
    const textContent = this.extractTextContent(message);
    if (!textContent) return '';

    // If no AI endpoint configured, return a simple acknowledgment
    if (!this.options.aiEndpoint) {
      return this.generateFallbackReply(textContent, context);
    }

    try {
      const systemPrompt = [
        'You are a helpful business assistant for a WhatsApp Business account.',
        'Respond concisely and professionally.',
        'Help customers with their inquiries.',
        'If you cannot help, suggest they speak to a human agent.',
      ].join(' ');

      const contextText = context.length > 0
        ? '\n\nConversation history:\n' + context.join('\n')
        : '';

      const response = await fetch(this.options.aiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: systemPrompt,
          messages: [
            { role: 'user', content: textContent + contextText },
          ],
        }),
      });

      if (!response.ok) {
        return this.generateFallbackReply(textContent, context);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        content?: string;
        text?: string;
        reply?: string;
      };

      // Try various response formats
      const reply =
        data.choices?.[0]?.message?.content ||
        data.content ||
        data.text ||
        data.reply ||
        '';

      return reply.trim();
    } catch {
      return this.generateFallbackReply(textContent, context);
    }
  }

  // ─── Private Methods ──────────────────────────────────────────────────────

  private extractTextContent(message: WhatsAppMessage): string | null {
    if (message.type === 'text' && message.text) {
      return message.text.body;
    }
    if (message.type === 'interactive') {
      // Interactive messages might have text in the payload
      const interactive = message as unknown as Record<string, unknown>;
      const body = (interactive as Record<string, Record<string, unknown>>).interactive?.body as
        | Record<string, unknown>
        | undefined;
      if (body?.text) {
        return String(body.text);
      }
    }
    return null;
  }

  private isGreeting(text: string): boolean {
    const trimmed = text.trim().toLowerCase();
    for (const keyword of this.options.greetingKeywords) {
      if (trimmed === keyword || trimmed.startsWith(keyword + ' ') || trimmed.startsWith(keyword + '!')) {
        return true;
      }
    }
    return false;
  }

  private buildContextWindow(conversation: WhatsAppConversation): string[] {
    const messages = conversation.messages;
    const start = Math.max(0, messages.length - CONTEXT_WINDOW_SIZE);
    const recent = messages.slice(start);

    return recent.map((msg) => {
      const role = msg.to === this.client['config'].phoneNumberId ? 'customer' : 'assistant';
      const text = this.extractTextContent(msg) || `[${msg.type} message]`;
      return `${role}: ${text}`;
    });
  }

  private buildReply(to: string, text: string): WhatsAppMessage {
    return {
      id: crypto.randomUUID(),
      from: this.client['config'].phoneNumberId,
      to,
      type: 'text',
      text: { body: text },
      timestamp: new Date().toISOString(),
      status: 'queued',
    };
  }

  private async attemptLeadCreation(
    message: WhatsAppMessage,
    companyId: string
  ): Promise<void> {
    const leadInfo = this.extractLeadInfo(message);
    if (!leadInfo) return;

    const callback = this.leadCreationCallbacks.get(companyId);
    if (!callback) return;

    try {
      await callback(leadInfo);
    } catch {
      // Lead creation is best-effort; don't let failures block the flow
    }
  }

  private generateFallbackReply(text: string, context: string[]): string {
    const lowerText = text.toLowerCase();

    // Check for common question patterns
    if (/\b(price|cost|pricing|how much|rate)\b/.test(lowerText)) {
      return 'Thank you for your interest! For detailed pricing information, I\'d recommend speaking with one of our team members. Would you like me to connect you with someone?';
    }

    if (/\b(hours|open|close|available|schedule)\b/.test(lowerText)) {
      return 'For our business hours and scheduling, I can connect you with a team member who can provide the most up-to-date information. Would you like that?';
    }

    if (/\b(urgent|emergency|asap|immediately)\b/.test(lowerText)) {
      return 'I understand this is urgent. Let me connect you with a team member right away who can help you immediately.';
    }

    // Check context length — if this is a longer conversation, suggest handover
    if (context.length >= 4) {
      return 'Thank you for the additional details. I want to make sure you get the best help possible. Would you like me to connect you with a team member who can assist you further?';
    }

    return 'Thank you for your message! I\'m here to help. Could you please provide a bit more detail about what you\'re looking for?';
  }
}