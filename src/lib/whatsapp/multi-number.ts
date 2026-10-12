// ALO Labs AIOS — WhatsApp Multi-Number Manager

import * as crypto from 'crypto';
import type {
  WhatsAppConfig,
  WhatsAppNumberConfig,
  WhatsAppMessage,
  WhatsAppNumberStats,
} from './types';
import { WhatsAppBusinessClient } from './client';

// ─── Registry Entry ───────────────────────────────────────────────────────────

interface NumberRegistryEntry {
  numberId: string;
  config: WhatsAppNumberConfig;
  whatsappConfig: WhatsAppConfig;
  client: WhatsAppBusinessClient;
  companyId: string;
  stats: WhatsAppNumberStats;
}

// ─── Multi-Number Manager ─────────────────────────────────────────────────────

export class WhatsAppMultiNumberManager {
  private readonly registry: Map<string, NumberRegistryEntry> = new Map();
  private readonly companyToNumbers: Map<string, string[]> = new Map();
  private readonly sendCounters: Map<string, number> = new Map();
  private readonly receiveCounters: Map<string, number> = new Map();
  private readonly conversationCounters: Map<string, Set<string>> = new Map();

  /**
   * Register a new WhatsApp Business number.
   * Returns the generated number ID used for internal reference.
   */
  registerNumber(config: WhatsAppNumberConfig, companyId: string, accessToken?: string): string {
    const numberId = crypto.createHash('sha256')
      .update(`num:${config.phoneNumberId}:${Date.now()}`)
      .digest('hex')
      .substring(0, 16);

    const whatsappConfig: WhatsAppConfig = {
      apiUrl: 'https://graph.facebook.com',
      apiVersion: 'v21.0',
      phoneNumberId: config.phoneNumberId,
      accessToken: accessToken || '',
      verifyToken: crypto.randomBytes(16).toString('hex'),
      webhookUrl: '',
    };

    const client = new WhatsAppBusinessClient(whatsappConfig);

    const entry: NumberRegistryEntry = {
      numberId,
      config,
      whatsappConfig,
      client,
      companyId,
      stats: {
        messagesSent: 0,
        messagesReceived: 0,
        activeConversations: 0,
      },
    };

    this.registry.set(numberId, entry);

    // Map company to this number
    const companyNumbers = this.companyToNumbers.get(companyId) || [];
    companyNumbers.push(numberId);
    this.companyToNumbers.set(companyId, companyNumbers);

    // Initialize counters
    this.sendCounters.set(numberId, 0);
    this.receiveCounters.set(numberId, 0);
    this.conversationCounters.set(numberId, new Set());

    // If this is the default, move it to the front of the company's number list
    if (config.isDefault) {
      const idx = companyNumbers.indexOf(numberId);
      if (idx > 0) {
        companyNumbers.splice(idx, 1);
        companyNumbers.unshift(numberId);
      }
    }

    return numberId;
  }

  /**
   * Remove a registered number.
   */
  removeNumber(numberId: string): void {
    const entry = this.registry.get(numberId);
    if (!entry) {
      throw new Error(`Number not found: ${numberId}`);
    }

    // Remove from company mapping
    const companyNumbers = this.companyToNumbers.get(entry.companyId);
    if (companyNumbers) {
      const idx = companyNumbers.indexOf(numberId);
      if (idx >= 0) {
        companyNumbers.splice(idx, 1);
      }
      if (companyNumbers.length === 0) {
        this.companyToNumbers.delete(entry.companyId);
      }
    }

    // Clean up counters
    this.sendCounters.delete(numberId);
    this.receiveCounters.delete(numberId);
    this.conversationCounters.delete(numberId);

    this.registry.delete(numberId);
  }

  /**
   * Get the WhatsApp number configuration for a company.
   * Uses the default number if one is set, otherwise uses the first registered.
   */
  getNumberForCompany(companyId: string): WhatsAppNumberConfig {
    const numberIds = this.companyToNumbers.get(companyId);
    if (!numberIds || numberIds.length === 0) {
      throw new Error(`No numbers registered for company: ${companyId}`);
    }

    // Find the default number
    for (const nid of numberIds) {
      const entry = this.registry.get(nid);
      if (entry && entry.config.isDefault) {
        return { ...entry.config };
      }
    }

    // Fall back to first registered
    const entry = this.registry.get(numberIds[0]);
    if (!entry) {
      throw new Error(`Number registry inconsistent for company: ${companyId}`);
    }

    return { ...entry.config };
  }

  /**
   * Get the default number configuration across all companies.
   */
  getDefaultNumber(): WhatsAppNumberConfig {
    for (const [, entry] of this.registry) {
      if (entry.config.isDefault) {
        return { ...entry.config };
      }
    }

    // No default set — use the first registered
    const firstEntry = this.registry.values().next().value;
    if (!firstEntry) {
      throw new Error('No numbers registered');
    }

    return { ...firstEntry.config };
  }

  /**
   * Send a message from a company's number.
   * Uses load balancing if the company has multiple numbers.
   */
  async sendMessage(
    companyId: string,
    to: string,
    message: WhatsAppMessage
  ): Promise<{ success: boolean; messageId: string; numberId: string; error?: string }> {
    const numberId = this.selectNumber(companyId);
    const entry = this.registry.get(numberId);

    if (!entry) {
      return { success: false, messageId: '', numberId, error: `Number not found: ${numberId}` };
    }

    try {
      const result = await entry.client.sendMessage(to, message);

      if (result.success) {
        // Update stats
        const sent = this.sendCounters.get(numberId) || 0;
        this.sendCounters.set(numberId, sent + 1);
        entry.stats.messagesSent = sent + 1;

        // Track conversation
        const convos = this.conversationCounters.get(numberId) || new Set();
        convos.add(to);
        this.conversationCounters.set(numberId, convos);
        entry.stats.activeConversations = convos.size;
      }

      return {
        success: result.success,
        messageId: result.messageId,
        numberId,
        error: result.error,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { success: false, messageId: '', numberId, error: errorMsg };
    }
  }

  /**
   * Broadcast a message to all numbers registered for a company.
   * Each number sends the message to its own recipient list.
   */
  async broadcastToNumbers(
    companyId: string,
    message: WhatsAppMessage,
    recipients: string[]
  ): Promise<{
    totalSent: number;
    totalFailed: number;
    results: Array<{ recipient: string; numberId: string; success: boolean; messageId: string; error?: string }>;
  }> {
    const numberIds = this.companyToNumbers.get(companyId);
    if (!numberIds || numberIds.length === 0) {
      throw new Error(`No numbers registered for company: ${companyId}`);
    }

    const results: Array<{
      recipient: string;
      numberId: string;
      success: boolean;
      messageId: string;
      error?: string;
    }> = [];

    // Distribute recipients across numbers using round-robin
    for (let i = 0; i < recipients.length; i++) {
      const numberIdx = i % numberIds.length;
      const numberId = numberIds[numberIdx];
      const recipient = recipients[i];

      const result = await this.sendMessage(companyId, recipient, message);
      results.push({
        recipient,
        numberId,
        success: result.success,
        messageId: result.messageId,
        error: result.error,
      });
    }

    const totalSent = results.filter((r) => r.success).length;
    const totalFailed = results.filter((r) => !r.success).length;

    return { totalSent, totalFailed, results };
  }

  /**
   * Get stats for all registered numbers.
   */
  async getStats(): Promise<Map<string, WhatsAppNumberStats>> {
    const stats = new Map<string, WhatsAppNumberStats>();

    for (const [numberId, entry] of this.registry) {
      // Refresh active conversation counts
      const convos = this.conversationCounters.get(numberId);
      entry.stats.activeConversations = convos ? convos.size : 0;

      stats.set(numberId, { ...entry.stats });
    }

    return stats;
  }

  /**
   * Get stats for a specific number.
   */
  getNumberStats(numberId: string): WhatsAppNumberStats | null {
    const entry = this.registry.get(numberId);
    if (!entry) return null;

    const convos = this.conversationCounters.get(numberId);
    return {
      messagesSent: this.sendCounters.get(numberId) || 0,
      messagesReceived: this.receiveCounters.get(numberId) || 0,
      activeConversations: convos ? convos.size : 0,
    };
  }

  /**
   * Record an incoming message for stats tracking.
   */
  recordIncomingMessage(numberId: string, from: string): void {
    const received = this.receiveCounters.get(numberId) || 0;
    this.receiveCounters.set(numberId, received + 1);

    const entry = this.registry.get(numberId);
    if (entry) {
      entry.stats.messagesReceived = received + 1;
    }

    const convos = this.conversationCounters.get(numberId) || new Set();
    convos.add(from);
    this.conversationCounters.set(numberId, convos);

    if (entry) {
      entry.stats.activeConversations = convos.size;
    }
  }

  /**
   * Record a conversation as closed for stats tracking.
   */
  recordConversationClosed(numberId: string, participant: string): void {
    const convos = this.conversationCounters.get(numberId);
    if (convos) {
      convos.delete(participant);
    }
  }

  /**
   * Get the WhatsApp client for a specific number.
   */
  getClient(numberId: string): WhatsAppBusinessClient | null {
    const entry = this.registry.get(numberId);
    return entry ? entry.client : null;
  }

  /**
   * Get the WhatsApp client for a company's default number.
   */
  getClientForCompany(companyId: string): WhatsAppBusinessClient | null {
    const numberIds = this.companyToNumbers.get(companyId);
    if (!numberIds || numberIds.length === 0) return null;

    // Find default
    for (const nid of numberIds) {
      const entry = this.registry.get(nid);
      if (entry && entry.config.isDefault) {
        return entry.client;
      }
    }

    // Fall back to first
    const entry = this.registry.get(numberIds[0]);
    return entry ? entry.client : null;
  }

  /**
   * List all registered number IDs for a company.
   */
  listNumbersForCompany(companyId: string): Array<{ numberId: string; config: WhatsAppNumberConfig }> {
    const numberIds = this.companyToNumbers.get(companyId) || [];
    return numberIds
      .map((nid) => {
        const entry = this.registry.get(nid);
        return entry ? { numberId: nid, config: { ...entry.config } } : null;
      })
      .filter((x): x is { numberId: string; config: WhatsAppNumberConfig } => x !== null);
  }

  /**
   * List all registered companies.
   */
  listCompanies(): string[] {
    return Array.from(this.companyToNumbers.keys());
  }

  /**
   * Get the total number of registered numbers.
   */
  get totalNumbers(): number {
    return this.registry.size;
  }

  // ─── Load Balancing ───────────────────────────────────────────────────────

  /**
   * Select a number for sending a message using least-sent load balancing.
   */
  private selectNumber(companyId: string): string {
    const numberIds = this.companyToNumbers.get(companyId);
    if (!numberIds || numberIds.length === 0) {
      throw new Error(`No numbers registered for company: ${companyId}`);
    }

    if (numberIds.length === 1) {
      return numberIds[0];
    }

    // Find the number with the fewest sent messages (least-connections strategy)
    let selectedId = numberIds[0];
    let minSent = this.sendCounters.get(numberIds[0]) || 0;

    for (let i = 1; i < numberIds.length; i++) {
      const nid = numberIds[i];
      const sent = this.sendCounters.get(nid) || 0;
      if (sent < minSent) {
        minSent = sent;
        selectedId = nid;
      }
    }

    return selectedId;
  }
}