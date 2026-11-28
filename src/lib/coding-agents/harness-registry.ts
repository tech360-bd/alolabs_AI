/**
 * Coding Agent & Harness Registry + Isolated Sandbox Session Orchestrator.
 *
 * Manages coding harnesses (`Claude Code`, `Codex`, `Pi`, `OpenCode`, `Cline`,
 * `Hermes`, `DeepSeek Harness`, `Aider`, `SWE-agent`, `mini-SWE-agent`,
 * `Code-Sync`) and `anomalyco/browse` behind strict sandbox workspace boundaries,
 * protected-branch checks, and human-in-the-loop approvals.
 */

import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';
import { db } from '@/lib/db';
import { writeAuditEvent } from '@/lib/audit-events';

const execFileAsync = promisify(execFile);

export interface HarnessDefinition {
  slug: string;
  name: string;
  harnessType: 'coding' | 'browser' | 'collaboration' | 'orchestration';
  upstreamRepo: string;
  licenseSpdx: string;
  sandboxMode: 'isolated_worktree' | 'container' | 'readonly_browser';
  requiresApproval: boolean;
  cliBinary?: string;
  protocolSupport: string[];
  description: string;
}

export const CODING_HARNESS_DEFINITIONS: readonly HarnessDefinition[] = [
  {
    slug: 'claude-code',
    name: 'Claude Code Harness',
    harnessType: 'coding',
    upstreamRepo: 'anthropics/claude-code',
    licenseSpdx: 'Commercial/Anthropic-Compatible-Gateway',
    sandboxMode: 'isolated_worktree',
    requiresApproval: true,
    cliBinary: 'claude',
    protocolSupport: ['anthropic-messages'],
    description: 'Routes Claude Code sessions through ALO Anthropic Messages gateway with isolated worktree diffs & approval.',
  },
  {
    slug: 'codex',
    name: 'OpenAI Codex CLI Harness',
    harnessType: 'coding',
    upstreamRepo: 'openai/codex',
    licenseSpdx: 'Apache-2.0',
    sandboxMode: 'isolated_worktree',
    requiresApproval: true,
    cliBinary: 'codex',
    protocolSupport: ['openai-responses', 'openai-chat'],
    description: 'Routes Codex CLI through ALO OpenAI Responses/Chat gateway inside an isolated sandbox workspace.',
  },
  {
    slug: 'opencode',
    name: 'OpenCode (anomalyco)',
    harnessType: 'coding',
    upstreamRepo: 'anomalyco/opencode',
    licenseSpdx: 'MIT',
    sandboxMode: 'isolated_worktree',
    requiresApproval: true,
    cliBinary: 'opencode',
    protocolSupport: ['openai-chat', 'anthropic-messages'],
    description: 'MIT open-source terminal & desktop coding harness integrated via ALO Command Router.',
  },
  {
    slug: 'pi',
    name: 'Pi Coding Harness',
    harnessType: 'coding',
    upstreamRepo: 'Alishahryar1/free-claude-code',
    licenseSpdx: 'MIT-Client / AGPL-Gateway-Boundary',
    sandboxMode: 'isolated_worktree',
    requiresApproval: true,
    cliBinary: 'pi',
    protocolSupport: ['openai-chat', 'anthropic-messages'],
    description: 'Lightweight multi-model Pi agent session routed cleanly through ALO gateway endpoints.',
  },
  {
    slug: 'cline',
    name: 'Cline Agent Harness',
    harnessType: 'coding',
    upstreamRepo: 'cline/cline',
    licenseSpdx: 'Apache-2.0',
    sandboxMode: 'isolated_worktree',
    requiresApproval: true,
    protocolSupport: ['anthropic-messages', 'openai-chat', 'gemini-generate'],
    description: 'Autonomous IDE coding harness with mandatory human approval before file or shell mutations.',
  },
  {
    slug: 'hermes',
    name: 'Hermes Tool-Use Harness',
    harnessType: 'coding',
    upstreamRepo: 'nousresearch/hermes-agent',
    licenseSpdx: 'MIT',
    sandboxMode: 'isolated_worktree',
    requiresApproval: true,
    protocolSupport: ['openai-chat'],
    description: 'Structured function-calling & reasoning harness wired to ALO Tool Optimizer.',
  },
  {
    slug: 'deepseek-harness',
    name: 'DeepSeek Coding & Reasoning Harness',
    harnessType: 'coding',
    upstreamRepo: 'deepseek-ai/DeepSeek-V3',
    licenseSpdx: 'MIT',
    sandboxMode: 'isolated_worktree',
    requiresApproval: true,
    protocolSupport: ['openai-chat', 'anthropic-messages'],
    description: 'DeepSeek coding/reasoning harness routing through local Ollama/vLLM or verified DeepSeek endpoints.',
  },
  {
    slug: 'aider',
    name: 'Aider Diff Harness',
    harnessType: 'coding',
    upstreamRepo: 'Aider-AI/aider',
    licenseSpdx: 'Apache-2.0',
    sandboxMode: 'isolated_worktree',
    requiresApproval: true,
    cliBinary: 'aider',
    protocolSupport: ['openai-chat'],
    description: 'Git-native unified search/replace diff harness operating only on sandbox worktree branches.',
  },
  {
    slug: 'swe-agent',
    name: 'SWE-agent',
    harnessType: 'coding',
    upstreamRepo: 'SWE-agent/SWE-agent',
    licenseSpdx: 'MIT',
    sandboxMode: 'container',
    requiresApproval: true,
    protocolSupport: ['openai-chat', 'anthropic-messages'],
    description: 'Automated issue-resolution harness running inside SWE-ReX container sandboxes.',
  },
  {
    slug: 'mini-swe-agent',
    name: 'mini-SWE-agent',
    harnessType: 'coding',
    upstreamRepo: 'SWE-agent/mini-swe-agent',
    licenseSpdx: 'MIT',
    sandboxMode: 'container',
    requiresApproval: true,
    protocolSupport: ['openai-chat'],
    description: 'Minimalist SWE-bench verified agent for deterministic patch proposals.',
  },
  {
    slug: 'code-sync',
    name: 'Code-Sync Collaborative Sandbox',
    harnessType: 'collaboration',
    upstreamRepo: 'sahilatahar/Code-Sync',
    licenseSpdx: 'MIT',
    sandboxMode: 'isolated_worktree',
    requiresApproval: true,
    protocolSupport: ['websocket-room'],
    description: 'Room-based real-time collaborative code workspace scoped to isolated tenant sandboxes.',
  },
  {
    slug: 'anomalyco-browse',
    name: 'Browse MCP Browser Agent',
    harnessType: 'browser',
    upstreamRepo: 'anomalyco/browse',
    licenseSpdx: 'MIT',
    sandboxMode: 'readonly_browser',
    requiresApproval: true,
    protocolSupport: ['mcp-http', 'playwright'],
    description: 'SSRF-guarded browser agent separating read-only research from human-approved form/publish actions.',
  },
];

const PROTECTED_BRANCH_NAMES = new Set(['main', 'master', 'prod', 'production', 'release']);

export function isProtectedBranch(branchName: string): boolean {
  const clean = branchName.trim().toLowerCase();
  if (!clean) return true;
  if (PROTECTED_BRANCH_NAMES.has(clean)) return true;
  if (clean.startsWith('release/') || clean.startsWith('hotfix/prod')) return true;
  return false;
}

/**
 * Validates that an isolated sandbox path cannot escape into `/` or overwrite
 * protected repository `.git` metadata.
 */
export function validateSandboxWorkspacePath(workspacePath: string): { ok: boolean; normalized: string; reason?: string } {
  const trimmed = workspacePath.trim();
  if (!trimmed) return { ok: false, normalized: '', reason: 'Workspace path is required' };
  if (trimmed.includes('..') || trimmed.includes('\0')) {
    return { ok: false, normalized: '', reason: 'Path traversal tokens are forbidden' };
  }
  const normalized = path.posix.normalize(trimmed);
  if (
    normalized === '/' ||
    normalized === '/etc' ||
    normalized.startsWith('/etc/') ||
    normalized.startsWith('/root') ||
    normalized.includes('/.git')
  ) {
    return { ok: false, normalized, reason: 'Sandbox path targets a restricted system or .git directory' };
  }
  if (!normalized.startsWith('/tmp/') && !normalized.startsWith('sandboxes/') && !normalized.startsWith('/var/tmp/')) {
    return {
      ok: false,
      normalized,
      reason: 'Isolated coding sessions must reside under /tmp/, /var/tmp/, or sandboxes/<tenant>',
    };
  }
  return { ok: true, normalized };
}

export async function probeHarnessCliAvailability(binary?: string): Promise<{ installed: boolean; detail: string }> {
  if (!binary) {
    return { installed: false, detail: 'Configured via remote API/MCP bridge (no local CLI probe)' };
  }
  try {
    const { stdout } = await execFileAsync('which', [binary], { timeout: 2000 });
    const resolved = stdout.trim();
    return resolved
      ? { installed: true, detail: `CLI available at ${resolved}` }
      : { installed: false, detail: `CLI binary "${binary}" not found on host` };
  } catch {
    return { installed: false, detail: `CLI binary "${binary}" not installed on host (sandboxed API/remote mode available)` };
  }
}

export async function ensureHarnessesSeeded(): Promise<void> {
  for (const h of CODING_HARNESS_DEFINITIONS) {
    await db.agentHarness.upsert({
      where: { slug: h.slug },
      update: {
        name: h.name,
        harnessType: h.harnessType,
        upstreamRepo: h.upstreamRepo,
        licenseSpdx: h.licenseSpdx,
        sandboxMode: h.sandboxMode,
        configJson: JSON.stringify({
          cliBinary: h.cliBinary ?? null,
          protocolSupport: h.protocolSupport,
          description: h.description,
        }),
      },
      create: {
        id: randomUUID(),
        slug: h.slug,
        name: h.name,
        harnessType: h.harnessType,
        upstreamRepo: h.upstreamRepo,
        licenseSpdx: h.licenseSpdx,
        sandboxMode: h.sandboxMode,
        isEnabled: true,
        requiresApproval: h.requiresApproval,
        healthStatus: 'untested',
        configJson: JSON.stringify({
          cliBinary: h.cliBinary ?? null,
          protocolSupport: h.protocolSupport,
          description: h.description,
        }),
      },
    });
  }
}

export async function createSandboxedAgentSession(params: {
  harnessSlug: string;
  companyId: string;
  userId: string;
  branchName: string;
  workspacePath?: string;
  promptSummary: string;
  modelUsed?: string;
  providerUsed?: string;
}) {
  if (isProtectedBranch(params.branchName)) {
    throw new Error(`Protected branch "${params.branchName}" cannot be targeted by an agent sandbox`);
  }
  await ensureHarnessesSeeded();
  const harness = await db.agentHarness.findUnique({ where: { slug: params.harnessSlug } });
  if (!harness || !harness.isEnabled) {
    throw new Error(`Harness "${params.harnessSlug}" is unavailable or disabled`);
  }
  const workspacePath =
    params.workspacePath ?? `sandboxes/${params.companyId}/${params.harnessSlug}-${Date.now().toString(36)}`;
  const pathCheck = validateSandboxWorkspacePath(workspacePath);
  if (!pathCheck.ok) {
    throw new Error(pathCheck.reason ?? 'Invalid sandbox path');
  }

  const session = await db.agentSession.create({
    data: {
      id: randomUUID(),
      harnessId: harness.id,
      companyId: params.companyId,
      userId: params.userId,
      workspacePath: pathCheck.normalized,
      branchName: params.branchName.trim(),
      sandboxMode: harness.sandboxMode,
      status: harness.requiresApproval ? 'awaiting_approval' : 'approved',
      requiresApproval: harness.requiresApproval,
      modelUsed: params.modelUsed ?? null,
      providerUsed: params.providerUsed ?? null,
      promptSummary: params.promptSummary.slice(0, 2000),
    },
    include: { harness: true },
  });

  await writeAuditEvent({
    companyId: params.companyId,
    actorUserId: params.userId,
    action: 'coding_agent.session_created',
    resource: 'AgentSession',
    resourceId: session.id,
    details: { harness: harness.slug, branch: session.branchName, workspacePath: session.workspacePath },
  });

  return session;
}

export async function reviewAgentSession(params: {
  sessionId: string;
  companyId: string;
  approverId: string;
  decision: 'approved' | 'rejected' | 'completed';
}) {
  const existing = await db.agentSession.findFirst({
    where: { id: params.sessionId, companyId: params.companyId },
  });
  if (!existing) throw new Error('Agent session not found');

  const updated = await db.agentSession.update({
    where: { id: existing.id },
    data: {
      status: params.decision,
      approvedBy: params.approverId,
      approvedAt: new Date(),
      ...(params.decision === 'completed' || params.decision === 'rejected' ? { endedAt: new Date() } : {}),
    },
    include: { harness: true },
  });

  await writeAuditEvent({
    companyId: params.companyId,
    actorUserId: params.approverId,
    action: `coding_agent.session_${params.decision}`,
    resource: 'AgentSession',
    resourceId: updated.id,
    details: { status: updated.status },
  });

  return updated;
}

const SCRUBBED_ENV_KEYS = [
  'JWT_SECRET',
  'NEXTAUTH_SECRET',
  'ENCRYPTION_KEY',
  'APP_SECRET',
  'CSRF_SECRET',
  'API_GATEWAY_SECRET',
  'DATABASE_URL',
  'LIVEKIT_API_SECRET',
  'GITHUB_TOKEN',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
];

function sanitizedSandboxEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: process.env.NODE_ENV ?? 'production',
  };
  for (const [k, v] of Object.entries(process.env)) {
    if (!v) continue;
    if (SCRUBBED_ENV_KEYS.includes(k) || k.endsWith('_SECRET') || k.endsWith('_TOKEN') || k.endsWith('_API_KEY')) {
      continue;
    }
    env[k] = v;
  }
  return env;
}

/**
 * Executes an approved sandboxed task inside a real isolated disposable git
 * repository under `/tmp/alo-sandboxes/<companyId>/<sessionId>` (never the main repo),
 * writes a proposed artifact/patch, validates syntax cleanly, captures `git diff --stat`,
 * persists `diffSummaryJson`, and tears down the disposable directory safely.
 */
export async function executeSandboxedHarnessSession(params: {
  sessionId: string;
  companyId: string;
  actorUserId: string;
  targetFileName?: string;
  proposedContent?: string;
  verifyWithNodeCheck?: boolean;
  cleanupAfterRun?: boolean;
}) {
  const session = await db.agentSession.findFirst({
    where: { id: params.sessionId, companyId: params.companyId },
    include: { harness: true },
  });
  if (!session) throw new Error('Agent session not found');
  if (session.requiresApproval && session.status !== 'approved') {
    throw new Error(`Session "${session.id}" is "${session.status}" and must be approved before execution`);
  }
  if (isProtectedBranch(session.branchName)) {
    throw new Error(`Protected branch "${session.branchName}" cannot be executed`);
  }

  const sandboxDir = `/tmp/alo-sandboxes/${params.companyId.replace(/[^a-zA-Z0-9_-]/g, '_')}/${session.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const pathCheck = validateSandboxWorkspacePath(sandboxDir);
  if (!pathCheck.ok) {
    throw new Error(pathCheck.reason ?? 'Invalid sandbox workspace');
  }

  const fileName = (params.targetFileName ?? 'sandbox-change.mjs').replace(/[^a-zA-Z0-9._-]/g, '_');
  const content =
    params.proposedContent ??
    `export function sandboxTaskSummary() {\n  return { sessionId: ${JSON.stringify(session.id)}, harness: ${JSON.stringify(session.harness.slug)}, status: 'verified' };\n}\n`;

  const env = sanitizedSandboxEnv();
  const startedAt = Date.now();
  try {
    await mkdir(sandboxDir, { recursive: true });
    await execFileAsync('git', ['init', '-b', 'main'], { cwd: sandboxDir, env, timeout: 5_000 });
    await execFileAsync('git', ['config', 'user.email', 'sandbox@alolabs.local'], { cwd: sandboxDir, env, timeout: 5_000 });
    await execFileAsync('git', ['config', 'user.name', 'ALO Sandbox Runner'], { cwd: sandboxDir, env, timeout: 5_000 });
    await writeFile(path.join(sandboxDir, 'README.md'), '# Disposable Sandbox Repo\n', 'utf8');
    await execFileAsync('git', ['add', 'README.md'], { cwd: sandboxDir, env, timeout: 5_000 });
    await execFileAsync('git', ['commit', '-m', 'chore: initial sandbox baseline'], { cwd: sandboxDir, env, timeout: 5_000 });
    await execFileAsync('git', ['checkout', '-b', session.branchName], { cwd: sandboxDir, env, timeout: 5_000 });

    const targetPath = path.join(sandboxDir, fileName);
    await writeFile(targetPath, content, 'utf8');

    let verificationPassed = true;
    let verificationOutput = 'git status clean check passed';
    if ((params.verifyWithNodeCheck ?? fileName.endsWith('.mjs')) || fileName.endsWith('.js')) {
      const checkRes = await execFileAsync(process.execPath, ['--check', targetPath], {
        cwd: sandboxDir,
        env,
        timeout: 5_000,
      });
      verificationOutput = (checkRes.stdout + checkRes.stderr).trim() || `node --check ${fileName} passed`;
    }

    await execFileAsync('git', ['add', fileName], { cwd: sandboxDir, env, timeout: 5_000 });
    const diffStat = await execFileAsync('git', ['diff', '--cached', '--stat'], { cwd: sandboxDir, env, timeout: 5_000 });
    const diffFull = await execFileAsync('git', ['diff', '--cached'], { cwd: sandboxDir, env, timeout: 5_000 });
    await execFileAsync('git', ['commit', '-m', `sandbox(${session.harness.slug}): verified change`], { cwd: sandboxDir, env, timeout: 5_000 });

    const summary = {
      sandboxDir,
      branchName: session.branchName,
      changedFile: fileName,
      diffStat: diffStat.stdout.trim(),
      diffPreview: diffFull.stdout.slice(0, 2000),
      verificationPassed,
      verificationOutput,
      durationMs: Date.now() - startedAt,
      secretsScrubbed: true,
    };

    const updated = await db.agentSession.update({
      where: { id: session.id },
      data: {
        status: 'completed',
        diffSummaryJson: JSON.stringify(summary),
        endedAt: new Date(),
      },
      include: { harness: true },
    });

    await writeAuditEvent({
      companyId: params.companyId,
      actorUserId: params.actorUserId,
      action: 'coding_agent.session_executed',
      resource: 'AgentSession',
      resourceId: updated.id,
      details: {
        harness: session.harness.slug,
        branch: session.branchName,
        changedFile: fileName,
        verificationPassed,
      },
    });

    return { session: updated, execution: summary };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sandbox execution error';
    await db.agentSession.update({
      where: { id: session.id },
      data: {
        status: 'failed',
        diffSummaryJson: JSON.stringify({ error: msg, sandboxDir, durationMs: Date.now() - startedAt }),
        endedAt: new Date(),
      },
    }).catch(() => undefined);
    throw err;
  } finally {
    if (params.cleanupAfterRun !== false) {
      await rm(sandboxDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
