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
export {
  aloLeadApiAdapter,
  aloLeadApiVerify,
  aloLeadApiListRecentLeads,
  ALO_LEAD_API_ID,
} from './connectors/crm/alo-lead-api';
export type { CrmLead, CrmFailureKind, LeadReadOutcome } from './connectors/crm/alo-lead-api';
export type { VideoJob, VideoJobStatus } from './connectors/media/video-gen';

// ─── Wave-2: free / open systems (docs/FREE_SYSTEMS_INTEGRATION.md) ──────────
export { litellmAdapter, litellmListModels, litellmChat } from './connectors/gateway/litellm';
export type { LiteLLMModel } from './connectors/gateway/litellm';
export { omnirouteAdapter, omnirouteListModels } from './connectors/gateway/omniroute';
export { freeClaudeCodeAdapter, freeClaudeCodeListModels } from './connectors/gateway/free-claude-code';
export { librechatAdapter, librechatListModels } from './connectors/ai-chat/librechat';
export { openWebuiAdapter, openWebuiListModels } from './connectors/ai-chat/open-webui';
export { aiderAdapter, aiderFormatHunks, aiderParseHunks } from './connectors/coding-agent/aider';
export type { AiderHunk } from './connectors/coding-agent/aider';
export { sweAgentAdapter, sweValidateTrajectory } from './connectors/coding-agent/swe-agent';
export type { SweTrajectoryStep } from './connectors/coding-agent/swe-agent';
export {
  toolLoopAdapter,
  toolLoopShouldContinue,
  DEFAULT_TOOL_LOOP_POLICY,
} from './connectors/coding-agent/tool-loop';
export type { ToolLoopPolicy } from './connectors/coding-agent/tool-loop';
export { directusAdapter, directusListItems } from './connectors/content/directus';
export { grapesjsAdapter, grapesSanitizeTemplate } from './connectors/content/grapesjs';
export type { GrapesTemplate } from './connectors/content/grapesjs';
export { activepiecesAdapter, activepiecesListFlows } from './connectors/automation/activepieces';
export { nocobaseAdapter, nocobaseListCollections } from './connectors/automation/nocobase';
export { temporalAdapter } from './connectors/automation/temporal';
export {
  jarvisAdapter,
  jarvisRequiresApproval,
  jarvisAllowsCloud,
} from './connectors/automation/jarvis';
export type { JarvisPrivacyMode, JarvisApproval } from './connectors/automation/jarvis';
export { caproverAdapter } from './connectors/deploy/caprover';
export { dokkuAdapter, dokkuValidateSpec } from './connectors/deploy/dokku';
export type { DokkuDeploySpec } from './connectors/deploy/dokku';
export { callGptAdapter, callGptValidateCall } from './connectors/telephony/call-gpt';
export type { CallGptFunctionCall } from './connectors/telephony/call-gpt';
export { aiNativeCallcenterAdapter } from './connectors/telephony/ai-native-callcenter';
export { callIntelligenceAdapter, callIntelValidate } from './connectors/telephony/call-intelligence';
export type { CallIntelligenceSummary } from './connectors/telephony/call-intelligence';
export { infiniteTalkAdapter } from './connectors/media/infinite-talk';
export type { InfiniteTalkJob } from './connectors/media/infinite-talk';

// ─── Wave-3: Complete Ecosystem Integrations (2026-11-28) ────────────────────
export { livekitAdapter, livekitCreateRoom, signLiveKitAccessToken } from './connectors/telephony/livekit';
export type { LiveKitTokenClaims } from './connectors/telephony/livekit';
export { freesbcAdapter, cascadeRealtimeGatewayAdapter } from './connectors/telephony/rasonyang-stack';
export { joincallAdapter, joincallCreateMeeting } from './connectors/media/joincall';
export { obsWebSocketAdapter, computeObsWebSocketAuth, probeObsWebSocket } from './connectors/media/obs-websocket';
export { browseMcpAdapter } from './connectors/coding-agent/browse-mcp';
export { opencodeAdapter } from './connectors/coding-agent/opencode';
export { postmillAdapter } from './connectors/content/postmill';
export { larksuiteAdapter } from './connectors/messaging/larksuite';

import { integrationRegistry } from './registry';
import { twentyAdapter } from './connectors/crm/twenty';
import { frappeAdapter } from './connectors/crm/frappe';
import { httpsmsAdapter } from './connectors/messaging/httpsms';
import { rsshubAdapter } from './connectors/content/rsshub';
import { videoGenAdapter } from './connectors/media/video-gen';
import { aloLeadApiAdapter } from './connectors/crm/alo-lead-api';
import { litellmAdapter } from './connectors/gateway/litellm';
import { omnirouteAdapter } from './connectors/gateway/omniroute';
import { freeClaudeCodeAdapter } from './connectors/gateway/free-claude-code';
import { librechatAdapter } from './connectors/ai-chat/librechat';
import { openWebuiAdapter } from './connectors/ai-chat/open-webui';
import { aiderAdapter } from './connectors/coding-agent/aider';
import { sweAgentAdapter } from './connectors/coding-agent/swe-agent';
import { toolLoopAdapter } from './connectors/coding-agent/tool-loop';
import { directusAdapter } from './connectors/content/directus';
import { grapesjsAdapter } from './connectors/content/grapesjs';
import { activepiecesAdapter } from './connectors/automation/activepieces';
import { nocobaseAdapter } from './connectors/automation/nocobase';
import { temporalAdapter } from './connectors/automation/temporal';
import { jarvisAdapter } from './connectors/automation/jarvis';
import { caproverAdapter } from './connectors/deploy/caprover';
import { dokkuAdapter } from './connectors/deploy/dokku';
import { callGptAdapter } from './connectors/telephony/call-gpt';
import { aiNativeCallcenterAdapter } from './connectors/telephony/ai-native-callcenter';
import { callIntelligenceAdapter } from './connectors/telephony/call-intelligence';
import { infiniteTalkAdapter } from './connectors/media/infinite-talk';
import { livekitAdapter } from './connectors/telephony/livekit';
import { freesbcAdapter, cascadeRealtimeGatewayAdapter } from './connectors/telephony/rasonyang-stack';
import { joincallAdapter } from './connectors/media/joincall';
import { obsWebSocketAdapter } from './connectors/media/obs-websocket';
import { browseMcpAdapter } from './connectors/coding-agent/browse-mcp';
import { opencodeAdapter } from './connectors/coding-agent/opencode';
import { postmillAdapter } from './connectors/content/postmill';
import { larksuiteAdapter } from './connectors/messaging/larksuite';

import type { ExternalSystemAdapter } from './types';

let bootstrapped = false;

/**
 * Register an adapter unless its id is already present.
 *
 * The `bootstrapped` flag above is module-local, and a module can legitimately be
 * instantiated more than once in a bundler graph (Turbopack evaluated
 * `@/lib/integrations` and `./index` as separate instances while rendering the
 * stack register): the flag reset, the singleton registry did not, and the second
 * pass threw `integration registry: duplicate adapter id "crm.twenty"` — a 500 on
 * every route that imports the catalogue.
 *
 * The registry owns that state, so the guard belongs here. Registration stays
 * strict for a *different* adapter claiming an existing id, because that is a
 * real programming error and `register()` keeps throwing for it.
 */
function registerAdapter(adapter: ExternalSystemAdapter): void {
  if (integrationRegistry.get(adapter.id)) return;
  integrationRegistry.register(adapter);
}

/** Idempotent registration of the Wave-1 + Wave-2 connector set (26 adapters). */
export function bootstrapIntegrations(): void {
  if (bootstrapped) return;
  registerAdapter(twentyAdapter);
  registerAdapter(frappeAdapter);
  registerAdapter(httpsmsAdapter);
  registerAdapter(rsshubAdapter);
  registerAdapter(videoGenAdapter);
  registerAdapter(aloLeadApiAdapter);
  // Wave-2 free/open systems — same ONE Runtime contract, same license gates.
  registerAdapter(litellmAdapter);
  registerAdapter(omnirouteAdapter);
  registerAdapter(freeClaudeCodeAdapter);
  registerAdapter(librechatAdapter);
  registerAdapter(openWebuiAdapter);
  registerAdapter(aiderAdapter);
  registerAdapter(sweAgentAdapter);
  registerAdapter(toolLoopAdapter);
  registerAdapter(directusAdapter);
  registerAdapter(grapesjsAdapter);
  registerAdapter(activepiecesAdapter);
  registerAdapter(nocobaseAdapter);
  registerAdapter(temporalAdapter);
  registerAdapter(jarvisAdapter);
  registerAdapter(caproverAdapter);
  registerAdapter(dokkuAdapter);
  registerAdapter(callGptAdapter);
  registerAdapter(aiNativeCallcenterAdapter);
  registerAdapter(callIntelligenceAdapter);
  registerAdapter(infiniteTalkAdapter);
  // Wave-3 ecosystem connectors — same ONE Runtime contract + license gates.
  registerAdapter(livekitAdapter);
  registerAdapter(freesbcAdapter);
  registerAdapter(cascadeRealtimeGatewayAdapter);
  registerAdapter(joincallAdapter);
  registerAdapter(obsWebSocketAdapter);
  registerAdapter(browseMcpAdapter);
  registerAdapter(opencodeAdapter);
  registerAdapter(postmillAdapter);
  registerAdapter(larksuiteAdapter);
  bootstrapped = true;
}

// Auto-bootstrap on first import so the registry is never empty.
bootstrapIntegrations();
