/**
 * External System Integration — public surface.
 *
 * Usage (ONE Runtime):
 *   import { integrationRegistry } from '@/lib/integrations';
 *   integrationRegistry.register(twentyAdapter);          // at bootstrap
 *   const r = await twentyListPeople(ctx, { limit: 10 });
 *
 * Adding a new system? Follow docs/ECOSYSTEM_REVERSE_MAP.md:
 *   1. Check the license class -> pick strategy (AVOID systems get no adapter).
 *   2. Implement ExternalSystemAdapter, declare licenseClass + strategy.
 *   3. Register here; never bypass guardedFetch.
 */
export * from './types';
export { integrationRegistry } from './registry';
export { twentyAdapter, twentyListPeople, twentyCreatePerson } from './connectors/crm/twenty';
export type { TwentyPerson } from './connectors/crm/twenty';
export { frappeAdapter, frappeListDocs, frappeCreateDoc } from './connectors/crm/frappe';
export type { FrappeDoc } from './connectors/crm/frappe';
export { httpsmsAdapter, httpsmsSendSms } from './connectors/messaging/httpsms';
export type { SmsSendResult } from './connectors/messaging/httpsms';
export { rsshubAdapter, rsshubFetchRoute } from './connectors/content/rsshub';
export type { FeedItem } from './connectors/content/rsshub';
export { videoGenAdapter, submitVideoJob, getVideoJob } from './connectors/media/video-gen';
export type { VideoJob, VideoJobStatus } from './connectors/media/video-gen';

import { integrationRegistry } from './registry';
import { twentyAdapter } from './connectors/crm/twenty';
import { frappeAdapter } from './connectors/crm/frappe';
import { httpsmsAdapter } from './connectors/messaging/httpsms';
import { rsshubAdapter } from './connectors/content/rsshub';
import { videoGenAdapter } from './connectors/media/video-gen';

let bootstrapped = false;

/** Idempotent registration of the Wave-1 connector set. */
export function bootstrapIntegrations(): void {
  if (bootstrapped) return;
  integrationRegistry.register(twentyAdapter);
  integrationRegistry.register(frappeAdapter);
  integrationRegistry.register(httpsmsAdapter);
  integrationRegistry.register(rsshubAdapter);
  integrationRegistry.register(videoGenAdapter);
  bootstrapped = true;
}

// Auto-bootstrap on first import so the registry is never empty.
bootstrapIntegrations();
