/**
 * ALO Open AI Platform — the fallback engine.
 *
 * This is the implementation of requirement C. It answers one question: given a
 * task and a user, which deployments should we try, in what order, and what do
 * we do with each failure?
 *
 * WHAT IT GUARANTEES
 * ------------------
 *  1. Only *capability-compatible* deployments are considered (O.11).
 *  2. Local deployments are tried before free-cloud, before remote, and a paid
 *     remote provider is never used unless an administrator enabled it
 *     (`allowRemote`). Requirement C: "Do not use paid providers unless the
 *     administrator explicitly enables them."
 *  3. A failure is classified before any decision is taken (requirement C.1).
 *     Invalid requests, permission failures and content-policy refusals stop the
 *     chain — they are never retried as if they were quota errors.
 *  4. `Retry-After` is honoured (C.3) and a cooldown is applied (C.4), both
 *     written to shared state so every replica sees them.
 *  5. Health is recorded for every attempt (C.2) so the ordering of the *next*
 *     request reflects reality.
 *  6. Every attempt is returned to the caller so the UI can show the actual
 *     model used (C.10) and the API can log a `AiFallbackEvent`.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 *  - It does not retry the *same* deployment after a rate limit. A 429 means
 *    the window is closed; retrying it is what "bypassing free limits" would
 *    look like, and it is both ineffective and dishonest.
 *  - It does not fall back on a 400 or a content-policy refusal: those are
 *    caller problems that another model would either mask or reproduce.
 *  - It never uses another user's provider credentials. Candidate selection
 *    reads platform-level provider configuration only; a user's key is never a
 *    routing input in this architecture.
 */

import { db } from '@/lib/db';
import { classifyProviderError, isTerminalFailure, unavailableStatus, type ClassifiedError } from './error-classifier';
import { getCooldown, recordOutcome, setCooldown, consumeQuota, DEFAULT_HEALTH, type DeploymentHealth } from './routing-state';
import { selectCandidates, type AvailableDeployment, type ModelCapability } from './model-registry';

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionRequest {
  messages: ChatTurn[];
  temperature?: number;
  maxTokens?: number;
  /** Extra provider-native options passed through untouched. */
  extra?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface CompletionResult {
  content: string;
  model: string;
  provider: string;
  hostingType: AvailableDeployment['hostingType'];
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  latencyMs: number;
  finishReason?: string;
}

export interface AttemptRecord {
  provider: string;
  model: string;
  deploymentId: string;
  ok: boolean;
  errorClass?: string;
  httpStatus?: number;
  latencyMs: number;
  /** Safe, credential-free explanation for the user. */
  message?: string;
  coolDownMs?: number;
  retryAfterMs?: number;
}

export interface FallbackOutcome {
  ok: boolean;
  result?: CompletionResult;
  /** Every attempt, in order. The last entry is the one that produced `result`. */
  attempts: AttemptRecord[];
  /** Present when `ok` is false. */
  error?: {
    message: string;
    status: number;
    /** What the user should do about it. */
    remediation: string;
  };
  /** True when a fallback (not the first choice) answered the request. */
  usedFallback: boolean;
}

export interface RunOptions {
  taskType?: string;
  requires?: ModelCapability[];
  preferredModel?: string;
  allowRemote?: boolean;
  allowFreeCloud?: boolean;
  /** Try each deployment at most this many times for *transient* faults. */
  maxAttemptsPerDeployment?: number;
  /** Hard cap on total attempts across the chain. */
  maxTotalAttempts?: number;
  /** Milliseconds allowed for the whole chain. */
  deadlineMs?: number;
  /** Record usage into AiUsageRecord. Off for health probes. */
  recordUsage?: {
    workspaceId: string;
    projectId?: string | null;
    userId?: string | null;
    apiKeyId?: string | null;
    service?: string;
  };
}

/** A provider adapter call, injected so tests and other backends can reuse the engine. */
export type CompleteFn = (deployment: AvailableDeployment, request: CompletionRequest) => Promise<CompletionResult>;

function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function messagesTokens(messages: ChatTurn[]): number {
  return messages.reduce((sum, message) => sum + estimateTokens(message.content) + 4, 0);
}

/** Sleep that rejects early when the caller aborts. */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * How long this deployment should be left alone after a failure.
 *
 * Three inputs, in order of authority:
 *  1. What the provider told us (`Retry-After`).
 *  2. The classifier's default for that error class.
 *  3. A cap, so a misconfigured provider cannot remove a model for a whole day.
 * Consecutive failures lengthen the pause (backoff), but never beyond the cap.
 */
function cooldownFor(classified: ClassifiedError, consecutiveFailures: number): number {
  const requested = classified.retryAfterMs ?? classified.coolDownMs;
  if (requested <= 0) return 0;
  const backoffMultiplier = Math.min(4, 1 + consecutiveFailures * 0.5);
  const capped = Math.min(15 * 60 * 1000, requested * backoffMultiplier);
  return Math.round(capped);
}

/** Decide whether to try this deployment again after a transient fault. */
function shouldRetrySame(classified: ClassifiedError): boolean {
  return classified.retryable && !isTerminalFailure(classified) && classified.class !== 'rate_limit' && classified.class !== 'quota_exhausted';
}

/**
 * Run a completion through the fallback chain.
 *
 * The chain is computed once, up front, from live availability. If every
 * candidate fails, the returned `error` names the failure classes and tells the
 * user what to fix — never a bare "500".
 */
export async function runWithFallback(
  request: CompletionRequest,
  complete: CompleteFn,
  options: RunOptions = {},
): Promise<FallbackOutcome> {
  const startedAt = Date.now();
  const deadline = options.deadlineMs ?? 120_000;
  const maxTotalAttempts = options.maxTotalAttempts ?? 6;
  const maxAttemptsPerDeployment = options.maxAttemptsPerDeployment ?? 2;

  const attempts: AttemptRecord[] = [];

  const needsContext = messagesTokens(request.messages);
  let candidates: AvailableDeployment[];
  try {
    candidates = await selectCandidates({
      ...(options.requires ? { requires: options.requires } : {}),
      ...(options.preferredModel ? { preferredModel: options.preferredModel } : {}),
      ...(options.allowRemote !== undefined ? { allowRemote: options.allowRemote } : {}),
      ...(options.allowFreeCloud !== undefined ? { allowFreeCloud: options.allowFreeCloud } : {}),
      needsContext,
    });
  } catch (error) {
    return {
      ok: false,
      attempts,
      usedFallback: false,
      error: {
        message: 'Could not evaluate model availability',
        status: 503,
        remediation: `Model registry unavailable: ${error instanceof Error ? error.message.slice(0, 200) : 'unknown error'}`,
      },
    };
  }

  if (candidates.length === 0) {
    return {
      ok: false,
      attempts,
      usedFallback: false,
      error: {
        message: 'No model is available for this task',
        status: 503,
        remediation: noCandidateRemediation(options.requires ?? []),
      },
    };
  }

  const classifiedFailures: ClassifiedError[] = [];
  let totalAttempts = 0;

  for (const candidate of candidates) {
    if (totalAttempts >= maxTotalAttempts) break;
    if (Date.now() - startedAt > deadline) break;

    // A pinned-but-unavailable model is reported explicitly instead of skipped
    // silently: the user asked for this one and deserves to know why not.
    if (!candidate.selectable) {
      attempts.push({
        provider: candidate.provider,
        model: candidate.model,
        deploymentId: candidate.id,
        ok: false,
        errorClass: 'unavailable',
        latencyMs: 0,
        message: candidate.blockedReason ?? 'Deployment is not selectable',
      });
      if (options.preferredModel && (candidate.id === options.preferredModel || candidate.model === options.preferredModel)) {
        return {
          ok: false,
          attempts,
          usedFallback: false,
          error: {
            message: `Model "${candidate.displayName}" is not available`,
            status: 503,
            remediation: candidate.blockedReason ?? 'Choose Auto mode or start the required service.',
          },
        };
      }
      continue;
    }

    // Re-check cooldown at attempt time: a sibling replica may have set one
    // since the chain was built.
    const live = await getCooldown(candidate.provider, candidate.model);
    if (live.active) {
      attempts.push({
        provider: candidate.provider,
        model: candidate.model,
        deploymentId: candidate.id,
        ok: false,
        errorClass: 'cooldown',
        latencyMs: 0,
        message: `Skipped: in cooldown${live.reason ? ` (${live.reason})` : ''}`,
      });
      continue;
    }

    // A candidate may arrive without a health snapshot (fresh deployment, or a
    // caller that built the list itself). Defaulting here keeps a missing
    // *advisory* field from turning into a thrown TypeError that masks the real
    // provider failure.
    let health: DeploymentHealth = candidate.health ?? DEFAULT_HEALTH;
    for (let attemptIndex = 0; attemptIndex < maxAttemptsPerDeployment; attemptIndex++) {
      if (totalAttempts >= maxTotalAttempts) break;
      if (request.signal?.aborted) {
        return { ok: false, attempts, usedFallback: attempts.length > 1, error: { message: 'Request cancelled', status: 499, remediation: 'The request was cancelled by the client.' } };
      }

      totalAttempts += 1;
      const attemptStarted = Date.now();
      try {
        const result = await complete(candidate, request);
        const latencyMs = Date.now() - attemptStarted;
        health = await recordOutcome(candidate.provider, candidate.model, { ok: true, latencyMs }).catch(() => health);
        attempts.push({ provider: candidate.provider, model: candidate.model, deploymentId: candidate.id, ok: true, latencyMs });

        if (options.recordUsage) {
          await writeUsage(options.recordUsage, candidate, result, { status: attempts.length > 1 ? 'fallback' : 'success', fallbackChain: attempts }).catch(() => undefined);
        }
        if (attempts.length > 1) await recordFallbackEvent(options, attempts, result, null).catch(() => undefined);

        return { ok: true, result, attempts, usedFallback: attempts.length > 1 };
      } catch (error) {
        if (request.signal?.aborted) {
          return { ok: false, attempts, usedFallback: attempts.length > 1, error: { message: 'Request cancelled', status: 499, remediation: 'The request was cancelled by the client.' } };
        }
        const latencyMs = Date.now() - attemptStarted;
        const classified = classifyProviderError(error, candidate.provider);
        classifiedFailures.push(classified);

        // Update health + cooldown only for faults the classifier says are the
        // provider's fault. A 400 does not make a healthy model unhealthy.
        if (classified.countsAgainstHealth) {
          health = await recordOutcome(candidate.provider, candidate.model, {
            ok: false,
            errorClass: classified.class,
            error: classified.message,
          }).catch(() => health);
        }
        const coolDownMs = cooldownFor(classified, health.consecutiveFailures);
        if (coolDownMs > 0) {
          await setCooldown(candidate.provider, candidate.model, coolDownMs, classified.class, classified.class).catch(() => undefined);
        }
        if (candidate.quota) {
          await consumeQuota(candidate.provider, candidate.model, candidate.quota).catch(() => undefined);
        }

        attempts.push({
          provider: candidate.provider,
          model: candidate.model,
          deploymentId: candidate.id,
          ok: false,
          errorClass: classified.class,
          ...(classified.httpStatus ? { httpStatus: classified.httpStatus } : {}),
          latencyMs,
          message: classified.message.slice(0, 300),
          ...(coolDownMs ? { coolDownMs } : {}),
          ...(classified.retryAfterMs !== undefined ? { retryAfterMs: classified.retryAfterMs } : {}),
        });

        // Terminal failures stop the chain: another model cannot fix a
        // malformed request, a policy refusal or a cancellation.
        if (isTerminalFailure(classified)) {
          await recordFallbackEvent(options, attempts, null, classified.class).catch(() => undefined);
          return {
            ok: false,
            attempts,
            usedFallback: attempts.length > 1,
            error: {
              message: classified.message.slice(0, 500),
              status: classified.httpStatus,
              remediation: remediationFor(classified.class),
            },
          };
        }

        // Retry the same deployment only for transient faults, with backoff.
        if (attemptIndex + 1 < maxAttemptsPerDeployment && shouldRetrySame(classified)) {
          const backoff = Math.min(2000, 250 * 2 ** attemptIndex);
          await delay(backoff, request.signal).catch(() => undefined);
          continue;
        }
        break; // move to the next candidate
      }
    }
  }

  const status = unavailableStatus(classifiedFailures);
  await recordFallbackEvent(options, attempts, null, classifiedFailures.at(-1)?.class ?? 'unknown').catch(() => undefined);
  return {
    ok: false,
    attempts,
    usedFallback: attempts.length > 0,
    error: {
      message: classifiedFailures.length
        ? `All ${attempts.length} model attempt(s) failed: ${uniqueClasses(classifiedFailures).join(', ')}`
        : 'No model is available for this task',
      status,
      remediation: remediationFor(classifiedFailures.at(-1)?.class ?? 'unknown'),
    },
  };
}

function uniqueClasses(failures: ClassifiedError[]): string[] {
  return [...new Set(failures.map((f) => f.class))];
}

function noCandidateRemediation(requires: ModelCapability[]): string {
  const needed = requires.length ? ` with ${requires.join(' + ')} capability` : '';
  return (
    `No deployment is currently selectable${needed}. On a fresh install: start Ollama ` +
    '(`ollama serve`) and pull a model (`ollama pull qwen2.5-coder:1.5b`), then set ' +
    'OLLAMA_BASE_URL. The Super Admin panel shows each provider\'s exact state.'
  );
}

/** What the *user* can do, per failure class. Kept short and actionable. */
export function remediationFor(errorClass: string): string {
  switch (errorClass) {
    case 'rate_limit':
      return 'Every eligible model is rate limited right now. Retry after the cooldown shown on the response headers.';
    case 'quota_exhausted':
      return 'The free quota for the eligible models is exhausted for this window. An administrator can add a local model or another free provider in the Super Admin panel.';
    case 'auth':
      return 'A configured provider rejected its credentials. An administrator must re-enter the API key in the Super Admin panel.';
    case 'not_found':
      return 'The requested model is not present on its provider. Pull the model (for Ollama: `ollama pull <tag>`) or choose Auto mode.';
    case 'network':
    case 'overloaded':
    case 'server_error':
    case 'timeout':
      return 'The model service is unreachable or overloaded. Check that the local inference service is running (Super Admin → Providers shows the probe result).';
    case 'context_overflow':
      return 'The prompt is larger than every available model\'s context window. Shorten the conversation or start a new chat.';
    case 'invalid_request':
      return 'The request itself was rejected as invalid. Check the message shape and model parameters.';
    case 'content_policy':
      return 'The provider refused this content under its own policy. Rephrase the request.';
    case 'cancelled':
      return 'The request was cancelled.';
    case 'cooldown':
      return 'All eligible models are cooling down after recent failures. Retry shortly.';
    default:
      return 'No eligible model could serve this request. An administrator can check the Super Admin → Providers panel.';
  }
}

async function writeUsage(
  target: NonNullable<RunOptions['recordUsage']>,
  deployment: AvailableDeployment,
  result: CompletionResult,
  meta: { status: string; fallbackChain: AttemptRecord[] },
): Promise<void> {
  await db.aiUsageRecord.create({
    data: {
      workspaceId: target.workspaceId,
      projectId: target.projectId ?? null,
      userId: target.userId ?? null,
      apiKeyId: target.apiKeyId ?? null,
      service: target.service ?? 'chat',
      model: result.model,
      provider: result.provider,
      hostingType: deployment.hostingType,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      totalTokens: result.usage.totalTokens,
      costUsd: 0, // local + free lanes are zero-cost by construction
      latencyMs: result.latencyMs,
      status: meta.status,
      fallbackChain: JSON.stringify(meta.fallbackChain.map((a) => ({ provider: a.provider, model: a.model, ok: a.ok, errorClass: a.errorClass ?? null }))),
    },
  });
}

async function recordFallbackEvent(
  options: RunOptions,
  attempts: AttemptRecord[],
  result: CompletionResult | null,
  errorClass: string | null,
): Promise<void> {
  await db.aiFallbackEvent.create({
    data: {
      workspaceId: options.recordUsage?.workspaceId ?? null,
      projectId: options.recordUsage?.projectId ?? null,
      requestedModel: options.preferredModel ?? 'auto',
      taskType: options.taskType ?? null,
      attempts: JSON.stringify(attempts),
      finalProvider: result?.provider ?? null,
      finalModel: result?.model ?? null,
      outcome: result ? 'success' : 'exhausted',
      errorClass,
    },
  });
}
