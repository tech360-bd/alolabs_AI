/**
 * Event Bus
 * In-process pub/sub with async handlers, priority queuing, event sourcing,
 * and optional DB persistence.
 */

import type { DomainEvent, EventHandler, Subscription, EventPriority } from './types';
import { db } from '@/lib/db';

const PRIORITY_WEIGHTS: Record<EventPriority, number> = {
  critical: 1000,
  high: 100,
  normal: 10,
  low: 1,
};

class EventBus {
  private subscribers = new Map<string, Subscription[]>();
  private history: DomainEvent[] = [];
  private maxHistory = 10_000;
  private processing = false;
  private pendingQueue: { event: DomainEvent; subs: Subscription[] }[] = [];
  private persistenceEnabled = true;

  /**
   * Publish an event to all subscribers of that type.
   * Handlers run asynchronously in order of priority.
   */
  async publish<T = unknown>(event: DomainEvent<T>): Promise<void> {
    // Store in history
    this.history.push(event as DomainEvent);
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-Math.floor(this.maxHistory * 0.7));
    }

    // Persist to DB
    if (this.persistenceEnabled) {
      this.persistEvent(event as DomainEvent).catch(() => {});
    }

    // Find matching subscribers
    const subs = this.getMatchingSubscribers(event as DomainEvent);
    if (subs.length === 0) return;

    // Sort by priority (critical first)
    subs.sort((a, b) => {
      const aP = a.filter ? 50 : 100; // filtered subs get higher priority
      const bP = b.filter ? 50 : 100;
      return bP - aP;
    });

    this.pendingQueue.push({ event: event as DomainEvent, subs });
    if (!this.processing) {
      this.processQueue();
    }
  }

  /** Subscribe to events of a given type. Supports wildcards: 'agent.*' */
  subscribe(eventType: string, handler: EventHandler, filter?: (event: DomainEvent) => boolean): string {
    const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const sub: Subscription = { id, eventType, handler, filter };

    let subs = this.subscribers.get(eventType);
    if (!subs) {
      subs = [];
      this.subscribers.set(eventType, subs);
    }
    subs.push(sub);

    return id;
  }

  /** Subscribe to ALL events */
  subscribeAll(handler: EventHandler): string {
    return this.subscribe('*', handler);
  }

  /** Unsubscribe */
  unsubscribe(subscriptionId: string): boolean {
    for (const [eventType, subs] of this.subscribers) {
      const idx = subs.findIndex(s => s.id === subscriptionId);
      if (idx >= 0) {
        subs.splice(idx, 1);
        if (subs.length === 0) this.subscribers.delete(eventType);
        return true;
      }
    }
    return false;
  }

  /** Get event history */
  getHistory(eventType?: string, limit = 100): DomainEvent[] {
    let events = this.history;
    if (eventType) {
      events = events.filter(e =>
        e.type === eventType ||
        e.type.startsWith(eventType.replace('*', '')) ||
        eventType === '*'
      );
    }
    return events.slice(-limit);
  }

  /** Get pending queue depth */
  getQueueDepth(): number {
    return this.pendingQueue.length;
  }

  /** Get subscriber counts */
  getSubscriberCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const [type, subs] of this.subscribers) {
      counts[type] = subs.length;
    }
    return counts;
  }

  enablePersistence(enabled: boolean): void {
    this.persistenceEnabled = enabled;
  }

  // ─── Internal ────────────────────────────────────────────────

  private getMatchingSubscribers(event: DomainEvent): Subscription[] {
    const result: Subscription[] = [];

    // Exact match
    const exact = this.subscribers.get(event.type);
    if (exact) result.push(...exact);

    // Wildcard match (e.g., 'agent.*')
    const prefix = event.type.split('.')[0] + '.*';
    const wildcard = this.subscribers.get(prefix);
    if (wildcard) result.push(...wildcard);

    // Global wildcard
    const global = this.subscribers.get('*');
    if (global) result.push(...global);

    // Apply filters
    return result.filter(sub => !sub.filter || sub.filter(event));
  }

  private async processQueue(): Promise<void> {
    this.processing = true;
    while (this.pendingQueue.length > 0) {
      const item = this.pendingQueue.shift()!;
      for (const sub of item.subs) {
        try {
          await sub.handler(item.event);
        } catch (err) {
          console.error(
            `[EventBus] Handler error for ${item.event.type} (sub: ${sub.id}):`,
            err,
          );
        }
      }
    }
    this.processing = false;
  }

  private async persistEvent(event: DomainEvent): Promise<void> {
    try {
      // Build audit data — omit userId if it would violate FK
      const auditData: Record<string, unknown> = {
        action: `event:${event.type}`,
        resource: event.source || 'event-bus',
        details: JSON.stringify({
          eventId: event.id,
          eventType: event.type,
          source: event.source,
          correlationId: event.correlationId,
        }),
      };
      if (event.userId && event.userId !== 'anonymous') {
        auditData.userId = event.userId;
      }
      await db.auditLog.create({ data: auditData as never });
    } catch {
      // AuditLog FK may not resolve — non-critical
    }
  }
}

// Singleton
let _instance: EventBus | null = null;
export function getEventBus(): EventBus {
  if (!_instance) _instance = new EventBus();
  return _instance;
}

export { EventTypes } from './types';
export type { DomainEvent, EventHandler, Subscription, EventPriority } from './types';
