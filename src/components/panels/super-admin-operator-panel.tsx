'use client';

/**
 * Super Admin Command Center — operator panel.
 *
 * Chat-first, but not chat-only: every submitted instruction goes to
 * `/api/super-admin/command`, which persists a `Command` row and a durable run in
 * the Run Engine (or a precise approval request when the intent is gated). The
 * timeline below the composer is the real event stream from
 * `/api/runs/<id>/events` — the same SSE endpoint the rest of the product uses —
 * so what the operator watches is execution, not typing animation.
 *
 * Three deliberate behaviours:
 *
 * 1. **The plan is shown before the result is claimed.** The API returns the
 *    intent, risk, capability state, steps and evidence list, and the panel
 *    renders them; an intent whose tooling is not wired says so instead of
 *    looking busy.
 * 2. **Gated work is not "done".** When the response is `approval_required` the
 *    panel links to the approval instead of showing a progress bar it cannot
 *    justify.
 * 3. **Attachments are references.** Files, images, videos and URLs are sent as
 *    name/type/size only — the panel never reads file bytes into memory, and the
 *    run engine fetches content by reference on the server.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  Clock,
  ExternalLink,
  Loader2,
  Paperclip,
  Play,
  RefreshCw,
  Send,
  ShieldAlert,
  Square,
  Terminal,
  X,
} from 'lucide-react';
import {
  CAPABILITY_META,
  RISK_META,
  classifyAttachment,
  summariseAttachments,
  type OperatorAttachment,
  type OperatorIntentId,
  type OperatorRisk,
} from '@/lib/super-admin/operator';

interface CommandResponse {
  success?: boolean;
  error?: string;
  status?: 'dispatched' | 'approval_required';
  commandId?: string;
  runId?: string;
  runStatus?: string;
  streamUrl?: string;
  approvalId?: string;
  approvalUrl?: string;
  reason?: string;
  risk?: { label: string; meaning: string; tone: 'green' | 'blue' | 'amber' | 'rose' };
  capability?: { label: string; tone: 'green' | 'amber' | 'rose' };
  intent?: { id: OperatorIntentId; label: string; summary: string };
  steps?: string[];
  evidence?: string[];
  matched?: { phrase: string; weight: number }[];
  confidence?: number;
}

interface RunEvent {
  id: string;
  type: string;
  source?: string;
  createdAt?: string;
  data?: Record<string, unknown>;
}

interface HistoryRun {
  runId: string;
  objective: string;
  status: string;
  createdAt: string;
}

interface Turn {
  id: string;
  instruction: string;
  at: string;
  plan?: CommandResponse;
}

const TONE: Record<'green' | 'blue' | 'amber' | 'rose', string> = {
  green: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  blue: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  rose: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};

const STATUS_COLOUR: Record<string, string> = {
  queued: 'text-slate-300',
  planning: 'text-sky-300',
  running: 'text-sky-300',
  waiting_approval: 'text-amber-300',
  validating: 'text-indigo-300',
  completed: 'text-emerald-300',
  failed: 'text-rose-300',
  cancelled: 'text-slate-400',
  blocked: 'text-amber-300',
  timed_out: 'text-rose-300',
};

const SUGGESTIONS = [
  'Show me which agents are running and what they are doing',
  'Review https://github.com/tech360-bd/alolabs_AI for security issues',
  'Open https://www.alolabs.net/site/stack in the browser and verify it renders',
  'Inspect host capacity and report headroom',
  'Run the full test suite and fix the failures',
  'Deploy the approved changes to staging',
];

export default function SuperAdminOperatorPanel() {
  const [instruction, setInstruction] = useState('');
  const [attachments, setAttachments] = useState<OperatorAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [runStatus, setRunStatus] = useState<string>('');
  const [history, setHistory] = useState<HistoryRun[]>([]);
  const [streamError, setStreamError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const response = await apiFetch('/api/super-admin/command');
      if (!response.ok) return;
      const payload = (await response.json()) as { runs?: HistoryRun[] };
      setHistory(payload.runs ?? []);
    } catch {
      /* history is a convenience; the composer still works */
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // Replay then stream. The route sends persisted events first, then live ones,
  // so refreshing the browser recovers the same timeline (run identity is the
  // run row, not the socket).
  useEffect(() => {
    if (!activeRunId) return;
    setEvents([]);
    setStreamError(null);
    const source = new EventSource(`/api/runs/${encodeURIComponent(activeRunId)}/events`);
    sourceRef.current = source;

    const handle = (raw: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(raw.data) as RunEvent | { type: 'status'; status?: string };
        if (parsed && typeof parsed === 'object' && 'type' in parsed) {
          const event = parsed as RunEvent;
          if (!event.id) return;
          setEvents((previous) => (previous.some((entry) => entry.id === event.id) ? previous : [...previous, event]));
          if (typeof event.data?.status === 'string') setRunStatus(event.data.status);
          if (event.type === 'run.completed') setRunStatus('completed');
          if (event.type === 'run.failed') setRunStatus('failed');
          if (event.type === 'run.cancelled') setRunStatus('cancelled');
        }
      } catch {
        setStreamError('Received an unreadable event from the run stream.');
      }
    };

    source.onmessage = handle;
    source.addEventListener('run', handle as unknown as EventListener);
    source.onerror = () => {
      setStreamError('The live stream dropped. The run continues on the server; reload to replay its history.');
      source.close();
    };

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, [activeRunId]);

  useEffect(() => {
    timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight, behavior: 'smooth' });
  }, [events.length]);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const next: OperatorAttachment[] = Array.from(files)
      .slice(0, 10)
      .map((file) => ({
        kind: classifyAttachment({ name: file.name, mimeType: file.type }),
        name: file.name,
        size: file.size,
        ...(file.type ? { mimeType: file.type } : {}),
      }));
    setAttachments((previous) => [...previous, ...next].slice(0, 20));
  };

  const addUrlAttachment = () => {
    const value = instruction.trim();
    if (!/^https?:\/\//i.test(value)) return;
    setAttachments((previous) =>
      [...previous, { kind: classifyAttachment({ name: value }), name: value }].slice(0, 20),
    );
  };

  const submit = async () => {
    const text = instruction.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    const turnId = `turn-${Date.now()}`;
    try {
      const response = await apiFetch('/api/super-admin/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: text,
          ...(attachments.length ? { attachments } : {}),
        }),
      });
      const payload = (await response.json()) as CommandResponse;
      if (!response.ok) {
        setError(payload.error ?? 'The instruction could not be dispatched.');
        setTurns((previous) => [...previous, { id: turnId, instruction: text, at: new Date().toISOString() }]);
        return;
      }
      setTurns((previous) => [...previous, { id: turnId, instruction: text, at: new Date().toISOString(), plan: payload }]);
      setInstruction('');
      setAttachments([]);
      if (payload.status === 'dispatched' && payload.runId) {
        setActiveRunId(payload.runId);
        setRunStatus(payload.runStatus ?? 'queued');
      } else if (payload.status === 'approval_required') {
        setActiveRunId(null);
        setRunStatus('waiting_approval');
      }
      void loadHistory();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Network error.');
    } finally {
      setSending(false);
    }
  };

  const cancelRun = async () => {
    if (!activeRunId) return;
    try {
      await apiFetch(`/api/runs/${encodeURIComponent(activeRunId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
      setRunStatus('cancelled');
    } catch {
      setError('Cancellation request failed.');
    }
  };

  const retryRun = async () => {
    if (!activeRunId) return;
    try {
      const response = await apiFetch(`/api/runs/${encodeURIComponent(activeRunId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry' }),
      });
      if (response.ok) {
        setRunStatus('queued');
        setEvents([]);
        setActiveRunId(activeRunId);
      }
    } catch {
      setError('Retry request failed.');
    }
  };

  const lastTurn = turns[turns.length - 1];
  const plan = lastTurn?.plan;

  const riskMeta = plan?.risk;
  const capabilityMeta = plan?.capability;
  const riskColour = useMemo(() => (riskMeta ? TONE[riskMeta.tone] : TONE.blue), [riskMeta]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Super Admin Command Center</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Describe the objective. Every instruction becomes a persisted command and a durable run; gated operations
            stop at an approval that names the exact steps, and browser checks report measured evidence rather than an
            assertion.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Link href="/dashboard?panel=approvals" className="rounded-md border border-slate-700 px-2 py-1 hover:text-slate-200">
            Approvals
          </Link>
          <Link href="/dashboard?panel=ecosystem-stack" className="rounded-md border border-slate-700 px-2 py-1 hover:text-slate-200">
            Stack register
          </Link>
          <button
            type="button"
            onClick={() => void loadHistory()}
            className="rounded-md border border-slate-700 p-1.5 hover:text-slate-200"
            aria-label="Refresh run history"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="space-y-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <label htmlFor="operator-instruction" className="text-[11px] uppercase tracking-wide text-slate-500">
              Instruction
            </label>
            <textarea
              id="operator-instruction"
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void submit();
              }}
              rows={3}
              placeholder="e.g. Review https://github.com/owner/repo for security issues, then open the live site and check the navigation."
              className="mt-1 w-full resize-y rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500"
            />

            {attachments.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {attachments.map((item, index) => (
                  <li
                    key={`${item.name}-${index}`}
                    className="flex items-center gap-1 rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-300"
                  >
                    <span className="uppercase text-slate-500">{item.kind}</span>
                    <span className="max-w-[220px] truncate">{item.name}</span>
                    <button
                      type="button"
                      onClick={() => setAttachments((previous) => previous.filter((_, position) => position !== index))}
                      aria-label={`Remove ${item.name}`}
                      className="text-slate-500 hover:text-rose-300"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-700 px-2 py-1.5 text-xs text-slate-300 hover:border-slate-600">
                <Paperclip className="h-3.5 w-3.5" />
                Attach
                <input
                  type="file"
                  multiple
                  accept="image/*,video/*,.pdf,.md,.txt,.json,.csv"
                  className="hidden"
                  onChange={(event) => {
                    addFiles(event.target.files);
                    event.target.value = '';
                  }}
                />
              </label>
              <button
                type="button"
                onClick={addUrlAttachment}
                disabled={!/^https?:\/\//i.test(instruction.trim())}
                className="rounded-md border border-slate-700 px-2 py-1.5 text-xs text-slate-300 disabled:opacity-40 hover:border-slate-600"
              >
                Attach URL
              </button>
              <span className="text-[11px] text-slate-500">
                {attachments.length ? summariseAttachments(attachments) : 'References only — file bytes stay in the browser.'}
              </span>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!instruction.trim() || sending}
                className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 hover:bg-sky-500"
              >
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {sending ? 'Dispatching' : 'Dispatch'}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-slate-600">⌘/Ctrl + Enter to dispatch.</p>
          </div>

          {error ? (
            <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {plan ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${riskColour}`}>
                  {riskMeta?.label ?? plan.intent?.label}
                </span>
                {capabilityMeta ? (
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONE[capabilityMeta.tone]}`}>
                    {capabilityMeta.label}
                  </span>
                ) : null}
                <span className="text-xs font-medium text-slate-200">{plan.intent?.label}</span>
                {typeof plan.confidence === 'number' ? (
                  <span className="text-[11px] text-slate-500">match {plan.confidence}</span>
                ) : null}
                {plan.runId ? (
                  <Link
                    href={`/dashboard?panel=runs`}
                    className="ml-auto inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300"
                  >
                    run {plan.runId.slice(0, 8)} <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : null}
              </div>

              {riskMeta ? <p className="mt-1 text-[11px] text-slate-500">{riskMeta.meaning}</p> : null}

              {plan.status === 'approval_required' ? (
                <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">
                  <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div>
                    <p>{plan.reason}</p>
                    <Link href={plan.approvalUrl ?? '/dashboard?panel=approvals'} className="mt-1 inline-block underline">
                      Review approval {plan.approvalId?.slice(0, 8)}
                    </Link>
                  </div>
                </div>
              ) : null}

              {plan.steps?.length ? (
                <ol className="mt-2 space-y-1 text-[11px] text-slate-400">
                  {plan.steps.map((step, index) => (
                    <li key={step} className="flex gap-2">
                      <span className="text-slate-600">{index + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              ) : null}
              {plan.evidence?.length ? (
                <p className="mt-2 text-[11px] text-slate-500">Evidence: {plan.evidence.join(' · ')}</p>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-xl border border-slate-800 bg-slate-900/60">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-3 py-2">
              <Terminal className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-xs font-medium text-slate-300">Execution timeline</span>
              {runStatus ? (
                <span className={`text-[11px] font-medium ${STATUS_COLOUR[runStatus] ?? 'text-slate-400'}`}>{runStatus}</span>
              ) : null}
              {activeRunId ? (
                <div className="ml-auto flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void retryRun()}
                    className="rounded border border-slate-700 px-1.5 py-0.5 text-[11px] text-slate-300 hover:border-slate-600"
                  >
                    <Play className="mr-1 inline h-3 w-3" />
                    Retry
                  </button>
                  <button
                    type="button"
                    onClick={() => void cancelRun()}
                    className="rounded border border-slate-700 px-1.5 py-0.5 text-[11px] text-slate-300 hover:border-rose-500/50 hover:text-rose-300"
                  >
                    <Square className="mr-1 inline h-3 w-3" />
                    Cancel
                  </button>
                </div>
              ) : null}
            </div>
            <div ref={timelineRef} className="max-h-[320px] overflow-y-auto p-3">
              {!activeRunId ? (
                <p className="text-xs text-slate-500">
                  No run is attached. Dispatch an instruction to see persisted execution events here.
                </p>
              ) : events.length === 0 ? (
                <div className="space-y-2">
                  {streamError ? (
                    <div className="flex items-start gap-2 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-200">
                      <CircleSlash className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>{streamError}</span>
                    </div>
                  ) : null}
                  <p className="flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="h-3 w-3 animate-spin" /> Waiting for the first persisted event…
                  </p>
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {events.map((event) => (
                    <li key={event.id} className="flex gap-2 text-[11px]">
                      <Clock className="mt-0.5 h-3 w-3 shrink-0 text-slate-600" />
                      <div className="min-w-0">
                        <span className="font-mono text-slate-300">{event.type}</span>
                        {event.source ? <span className="ml-1.5 text-slate-600">{event.source}</span> : null}
                        {event.data ? (
                          <pre className="mt-0.5 max-h-24 overflow-auto whitespace-pre-wrap break-words text-slate-500">
                            {JSON.stringify(event.data).slice(0, 600)}
                          </pre>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        <aside className="space-y-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <h2 className="text-xs font-medium text-slate-300">Try an objective</h2>
            <ul className="mt-2 space-y-1.5">
              {SUGGESTIONS.map((suggestion) => (
                <li key={suggestion}>
                  <button
                    type="button"
                    onClick={() => setInstruction(suggestion)}
                    className="w-full rounded-md border border-slate-800 px-2 py-1.5 text-left text-[11px] text-slate-400 hover:border-slate-700 hover:text-slate-200"
                  >
                    {suggestion}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <h2 className="flex items-center justify-between text-xs font-medium text-slate-300">
              Recent runs
              <span className="text-[11px] text-slate-600">{history.length}</span>
            </h2>
            {history.length === 0 ? (
              <p className="mt-2 text-[11px] text-slate-500">No runs yet for this company.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {history.slice(0, 10).map((run) => (
                  <li key={run.runId}>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveRunId(run.runId);
                        setRunStatus(run.status);
                      }}
                      className="w-full rounded-md px-2 py-1.5 text-left text-[11px] hover:bg-slate-800/70"
                    >
                      <span className={` ${STATUS_COLOUR[run.status] ?? 'text-slate-400'}`}>{run.status}</span>
                      <span className="ml-1.5 line-clamp-2 text-slate-400">{run.objective}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-[11px] text-slate-500">
            <h2 className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> How this stays honest
            </h2>
            <ul className="mt-2 space-y-1">
              <li>· Every instruction is a persisted command and run, not a message.</li>
              <li>· Risk and capability come from the intent table, not from the wording of the request.</li>
              <li>· Production, migration, rotation and cross-tenant work stops at an approval.</li>
              <li>· Browser checks report <code className="text-slate-400">unavailable</code> when no browser is installed.</li>
              <li>· The timeline replays from the database, so a refresh loses nothing.</li>
            </ul>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-[11px]">
            <h2 className="text-xs font-medium text-slate-300">Risk vocabulary</h2>
            <ul className="mt-2 space-y-1.5">
              {(Object.keys(RISK_META) as OperatorRisk[]).map((risk) => (
                <li key={risk} className="flex items-start gap-2">
                  <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${TONE[RISK_META[risk].tone]}`}>
                    {RISK_META[risk].label}
                  </span>
                  <span className="text-slate-500">{RISK_META[risk].meaning}</span>
                </li>
              ))}
            </ul>
            <h2 className="mt-3 text-xs font-medium text-slate-300">Capability states</h2>
            <ul className="mt-1.5 space-y-1">
              {(Object.keys(CAPABILITY_META) as (keyof typeof CAPABILITY_META)[]).map((key) => (
                <li key={key} className="flex items-center gap-2">
                  <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${TONE[CAPABILITY_META[key].tone]}`}>
                    {CAPABILITY_META[key].label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      {turns.length > 0 ? (
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
          <h2 className="text-xs font-medium text-slate-300">This session</h2>
          <ul className="mt-2 space-y-1.5">
            {turns.map((turn) => (
              <li key={turn.id} className="text-[11px] text-slate-400">
                <span className="text-slate-600">{new Date(turn.at).toLocaleTimeString()}</span>{' '}
                <span className="text-slate-300">{turn.instruction}</span>
                {turn.plan?.status ? <span className="ml-1.5 text-slate-500">→ {turn.plan.status}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
