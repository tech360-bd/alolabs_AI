// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { channels } from '@/lib/realtime/server';

describe('workspace stream contract', () => {
  it('maps each trusted input to an event consumed by the UI hooks', () => {
    expect(channels).toEqual({ 'notification:new': 'notification', 'dashboard:update': 'dashboard.update', 'ai:response': 'agent.event', 'queue:update': 'queue.update', 'social:event': 'message', 'whatsapp:message': 'message', 'email:new': 'message' });
  });
});
