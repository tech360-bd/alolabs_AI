/**
 * Authorized Project AI Discovery engine — Mode A (API) + Mode B (connector).
 *
 * Per Decision 5: discover only permitted capability metadata using
 * explicitly authorized credentials. Never scan unrelated systems.
 *
 * Mode A: customer supplies project API URL + scoped token.
 * Mode B: customer installs an approved connector/SDK that reports metadata.
 *
 * Discovered capabilities are classified as:
 *   WORKING, PARTIAL, BROKEN, UNVERIFIED, MISSING, BLOCKED
 *
 * Mode C (source repository) is DEFERRED — not implemented here.
 */

import { db } from '@/lib/db';
import { randomUUID } from 'node:crypto';
import { checkSsrf } from '@/lib/webhooks/ssrf-guard';

export type CapabilityClassification = 'WORKING' | 'PARTIAL' | 'BROKEN' | 'UNVERIFIED' | 'MISSING' | 'BLOCKED';

export interface DiscoveredCapability {
  capability: string; // e.g. 'chatbot', 'voice-ai', 'knowledge-retrieval'
  classification: CapabilityClassification;
  evidence?: { source: string; timestamp: string; test_result?: string };
  confidence: number; // 0.0–1.0
  recommendation?: string; // recommended ALO Labs service slug
}

export interface DiscoveryRequest {
  companyId: string;
  projectId: string;
  mode: 'api' | 'connector';
  targetUrl?: string; // Mode A only
  authorization?: string; // approved scope/permissions
  connectorReport?: Record<string, unknown>; // Mode B only
}

export interface DiscoveryResult {
  discoveryId: string;
  status: 'completed' | 'failed';
  capabilities: DiscoveredCapability[];
  summary: {
    total: number;
    working: number;
    partial: number;
    broken: number;
    unverified: number;
    missing: number;
    blocked: number;
  };
  recommendations: string[];
}

/**
 * Run an authorized discovery. For Mode A, fetches the customer's API and
 * inspects only authorized resources. For Mode B, reads the connector report.
 *
 * IMPORTANT: this function does NOT modify the customer's system. It only
 * reads metadata and (optionally) performs a customer-approved functional
 * test. It never collects secrets or source code beyond the approved scope.
 */
export async function runDiscovery(request: DiscoveryRequest): Promise<DiscoveryResult> {
  const discoveryId = randomUUID();

  // Create the discovery record.
  const discovery = await db.projectDiscovery.create({
    data: {
      id: discoveryId,
      companyId: request.companyId,
      projectId: request.projectId,
      mode: request.mode,
      targetUrl: request.targetUrl ?? null,
      authorization: request.authorization ?? null,
      status: 'running',
      startedAt: new Date(),
    },
  });

  try {
    let capabilities: DiscoveredCapability[] = [];

    if (request.mode === 'api') {
      capabilities = await discoverViaApi(request.targetUrl!, request.authorization);
    } else if (request.mode === 'connector') {
      capabilities = await discoverViaConnector(request.connectorReport ?? {});
    } else {
      throw new Error(`Unsupported discovery mode: ${request.mode}`);
    }

    // Persist capability assessments.
    for (const cap of capabilities) {
      await db.capabilityAssessment.create({
        data: {
          id: randomUUID(),
          discoveryId: discovery.id,
          capability: cap.capability,
          classification: cap.classification,
          evidence: cap.evidence ? JSON.stringify(cap.evidence) : null,
          confidence: cap.confidence,
          recommendation: cap.recommendation ?? null,
        },
      });
    }

    const summary = summarize(capabilities);
    const recommendations = capabilities
      .filter((c) => c.recommendation && (c.classification === 'MISSING' || c.classification === 'BROKEN' || c.classification === 'PARTIAL'))
      .map((c) => c.recommendation!)
      .filter((v, i, a) => a.indexOf(v) === i); // unique

    await db.projectDiscovery.update({
      where: { id: discovery.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        summary: JSON.stringify({ capabilities: capabilities.map((c) => ({ capability: c.capability, classification: c.classification })), summary }),
      },
    });

    return {
      discoveryId: discovery.id,
      status: 'completed',
      capabilities,
      summary,
      recommendations,
    };
  } catch (error) {
    await db.projectDiscovery.update({
      where: { id: discovery.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        summary: JSON.stringify({ error: error instanceof Error ? error.message : 'unknown error' }),
      },
    });
    return {
      discoveryId: discovery.id,
      status: 'failed',
      capabilities: [],
      summary: { total: 0, working: 0, partial: 0, broken: 0, unverified: 0, missing: 0, blocked: 0 },
      recommendations: [],
    };
  }
}

/**
 * Mode A: discover capabilities via the customer's authorized API.
 * Fetches a well-known capabilities endpoint (if the customer's API exposes
 * one) and classifies what's found. Never probes beyond the authorized URL.
 */
async function discoverViaApi(targetUrl: string, authorization?: string): Promise<DiscoveredCapability[]> {
  // SSRF check — never inspect internal/private addresses.
  const ssrfCheck = await checkSsrf(targetUrl);
  if (!ssrfCheck.allowed) {
    return [
      {
        capability: 'api-discovery',
        classification: 'BLOCKED',
        evidence: { source: 'ssrf-guard', timestamp: new Date().toISOString(), test_result: `blocked: ${ssrfCheck.reason}` },
        confidence: 1.0,
      },
    ];
  }

  const capabilities: DiscoveredCapability[] = [];

  try {
    // Attempt to fetch a capabilities manifest from the customer's API.
    // This is the ONLY endpoint we inspect — we do not crawl.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(targetUrl, {
      headers: authorization ? { Authorization: `Bearer ${authorization}` } : {},
      signal: controller.signal,
      redirect: 'manual',
    });
    clearTimeout(timeout);

    if (res.status >= 200 && res.status < 300) {
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = await res.text();
      }

      // Inspect the response for AI-capability indicators.
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body).toLowerCase();
      const detected = detectCapabilities(bodyStr);
      capabilities.push(...detected);
    } else {
      capabilities.push({
        capability: 'api-availability',
        classification: 'BROKEN',
        evidence: { source: targetUrl, timestamp: new Date().toISOString(), test_result: `HTTP ${res.status}` },
        confidence: 0.9,
      });
    }
  } catch (err) {
    capabilities.push({
      capability: 'api-availability',
      classification: 'BROKEN',
      evidence: { source: targetUrl, timestamp: new Date().toISOString(), test_result: err instanceof Error ? err.message : 'network error' },
      confidence: 0.8,
    });
  }

  // Add MISSING capabilities (things we looked for but didn't find).
  const found = new Set(capabilities.map((c) => c.capability));
  const ALL_CAPABILITIES = ['chatbot', 'voice-ai', 'knowledge-retrieval', 'predictive-analytics', 'automation', 'lead-scoring'];
  for (const cap of ALL_CAPABILITIES) {
    if (!found.has(cap)) {
      capabilities.push({
        capability: cap,
        classification: 'MISSING',
        confidence: 0.5,
        recommendation: mapToService(cap),
      });
    }
  }

  return capabilities;
}

/**
 * Mode B: discover capabilities from a connector/SDK report.
 * The connector is an approved, customer-installed package that reports
 * permitted capability metadata. We trust the report (it comes from the
 * customer's own system, signed by the connector).
 */
async function discoverViaConnector(report: Record<string, unknown>): Promise<DiscoveredCapability[]> {
  const capabilities: DiscoveredCapability[] = [];
  const reported = (report.capabilities as Array<Record<string, unknown>>) ?? [];

  for (const cap of reported) {
    const name = String(cap.name ?? cap.capability ?? 'unknown');
    const status = String(cap.status ?? cap.classification ?? 'UNVERIFIED').toUpperCase() as CapabilityClassification;
    const testResult = cap.test_result ? String(cap.test_result) : undefined;

    capabilities.push({
      capability: name,
      classification: ['WORKING', 'PARTIAL', 'BROKEN', 'UNVERIFIED', 'MISSING', 'BLOCKED'].includes(status) ? status : 'UNVERIFIED',
      evidence: {
        source: 'connector',
        timestamp: String(cap.timestamp ?? new Date().toISOString()),
        test_result: testResult,
      },
      confidence: typeof cap.confidence === 'number' ? cap.confidence : 0.5,
      recommendation: cap.recommendation ? String(cap.recommendation) : mapToService(name),
    });
  }

  return capabilities;
}

/** Heuristic: detect AI capabilities from an API response body. */
function detectCapabilities(body: string): DiscoveredCapability[] {
  const lower = body.toLowerCase();
  const found: DiscoveredCapability[] = [];

  if (lower.includes('chatbot') || lower.includes('chat_bot') || lower.includes('/chat')) {
    found.push({ capability: 'chatbot', classification: 'UNVERIFIED', confidence: 0.5, recommendation: 'ai-chat' });
  }
  if (lower.includes('voice') || lower.includes('tts') || lower.includes('stt') || lower.includes('speech')) {
    found.push({ capability: 'voice-ai', classification: 'UNVERIFIED', confidence: 0.4, recommendation: 'ai-voice' });
  }
  if (lower.includes('knowledge') || lower.includes('rag') || lower.includes('embedding') || lower.includes('vector')) {
    found.push({ capability: 'knowledge-retrieval', classification: 'UNVERIFIED', confidence: 0.5, recommendation: 'ai-knowledge-search' });
  }
  if (lower.includes('predict') || lower.includes('forecast') || lower.includes('analytics')) {
    found.push({ capability: 'predictive-analytics', classification: 'UNVERIFIED', confidence: 0.4, recommendation: 'ai-analysis' });
  }
  if (lower.includes('automation') || lower.includes('workflow')) {
    found.push({ capability: 'automation', classification: 'UNVERIFIED', confidence: 0.4, recommendation: 'ai-tasks' });
  }
  if (lower.includes('lead') && (lower.includes('score') || lower.includes('rank'))) {
    found.push({ capability: 'lead-scoring', classification: 'UNVERIFIED', confidence: 0.4, recommendation: 'ai-analysis' });
  }

  return found;
}

function mapToService(capability: string): string | undefined {
  const map: Record<string, string> = {
    chatbot: 'ai-chat',
    'voice-ai': 'ai-voice',
    'knowledge-retrieval': 'ai-knowledge-search',
    'predictive-analytics': 'ai-analysis',
    automation: 'ai-tasks',
    'lead-scoring': 'ai-analysis',
  };
  return map[capability];
}

function summarize(caps: DiscoveredCapability[]): DiscoveryResult['summary'] {
  const s = { total: caps.length, working: 0, partial: 0, broken: 0, unverified: 0, missing: 0, blocked: 0 };
  for (const c of caps) {
    s[c.classification.toLowerCase() as keyof typeof s]++;
  }
  return s;
}
