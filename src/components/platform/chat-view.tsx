'use client';

/**
 * The platform chat panel.
 *
 * Three things this screen must do that a generic chat UI does not:
 *
 *  1. Let the user choose **Auto** or pin a specific model, and show which
 *     model actually answered — not which one was requested.
 *  2. Show the routing trail when a fallback happened, with the reason each
 *     candidate was skipped, so "why did this get slower?" is answerable.
 *  3. Refuse to offer a model whose backend is not running, and say what is
 *     missing, instead of letting the request fail after the user hits send.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { platformApi, attemptReason, hostingLabel, type ChatResponse, type ModelEntry } from '@/lib/platform/client';

interface Turn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  meta?: ChatResponse;
  error?: { message: string; remediation?: string };
}

const TASKS = [
  { id: 'chat', label: 'Chat' },
  { id: 'code', label: 'Code' },
  { id: 'reasoning', label: 'Reasoning' },
  { id: 'vision', label: 'Vision' },
  { id: 'summarise', label: 'Summarise' },
];

export function ChatView() {
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [task, setTask] = useState('chat');
  const [pinned, setPinned] = useState('');
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [modelError, setModelError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    platformApi.models({ only: 'all' }).then((result) => {
      if (result.ok) {
        setModels(result.data.models);
        const first = result.data.models.find((m) => m.selectable);
        if (first) setPinned(first.id);
      } else {
        setModelError(result.message);
      }
    });
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns.length, busy]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    const userTurn: Turn = { id: `u-${Date.now()}`, role: 'user', content: text };
    setTurns((prev) => [...prev, userTurn]);
    setInput('');
    setBusy(true);

    // Send the whole visible transcript so the model has context even before
    // the server has persisted the conversation.
    const history = [...turns, userTurn]
      .filter((t) => t.role === 'user' || !t.error)
      .map((t) => ({ role: t.role as 'user' | 'assistant', content: t.content }));

    const result = await platformApi.chat({
      messages: history,
      mode,
      ...(mode === 'manual' && pinned ? { model: pinned } : {}),
      task,
      temperature: 0.7,
      maxTokens: 600,
      ...(conversationId ? { conversationId } : {}),
    });

    if (result.ok) {
      setTurns((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: 'assistant', content: result.data.content, meta: result.data },
      ]);
      if (result.data.conversationId) setConversationId(result.data.conversationId);
    } else {
      setTurns((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content: '',
          error: { message: result.message, ...(result.remediation ? { remediation: result.remediation } : {}) },
        },
      ]);
    }
    setBusy(false);
  }, [input, busy, turns, mode, pinned, task, conversationId]);

  const selectable = models.filter((m) => m.selectable);
  const blocked = models.filter((m) => !m.selectable);
  const pinnedModel = models.find((m) => m.id === pinned);

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2">
        <div className="flex rounded-md border border-slate-700 p-0.5">
          {(['auto', 'manual'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              className={`rounded px-2.5 py-1 text-xs font-medium capitalize ${
                mode === option ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        {mode === 'auto' ? (
          <select
            value={task}
            onChange={(event) => setTask(event.target.value)}
            className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
            aria-label="Task type"
          >
            {TASKS.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        ) : (
          <select
            value={pinned}
            onChange={(event) => setPinned(event.target.value)}
            className="max-w-md rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
            aria-label="Model"
          >
            {selectable.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName} · {hostingLabel(m.hostingType)}
              </option>
            ))}
            {blocked.length > 0 && (
              <optgroup label="Unavailable">
                {blocked.map((m) => (
                  <option key={m.id} value={m.id} disabled>
                    {m.displayName} — unavailable
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        )}

        <div className="ml-auto text-[11px] text-slate-500">
          {selectable.length} of {models.length} models available
        </div>
      </div>

      {mode === 'auto' && (
        <p className="px-1 text-[11px] text-slate-500">
          Auto routing picks the fastest working model for the task and falls back automatically. The
          model that actually answers is shown under every reply.
        </p>
      )}
      {mode === 'manual' && pinnedModel && !pinnedModel.selectable && (
        <p className="rounded border border-amber-800/60 bg-amber-950/40 px-2 py-1 text-[11px] text-amber-300">
          {pinnedModel.displayName} is not selectable: {pinnedModel.blockedReason ?? 'backend unreachable'}
        </p>
      )}
      {modelError && (
        <p className="rounded border border-red-800/60 bg-red-950/40 px-2 py-1 text-[11px] text-red-300">{modelError}</p>
      )}

      {/* Transcript */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/40 p-3">
        {turns.length === 0 && (
          <div className="grid h-full place-items-center text-center">
            <div>
              <p className="text-sm text-slate-400">Ask anything. Every reply records the model that produced it.</p>
              {selectable.length === 0 && (
                <p className="mt-2 max-w-md text-xs text-amber-400">
                  No model is currently available. Start the local runtime
                  (<code className="rounded bg-slate-800 px-1">node scripts/local-model-runtime.mjs</code>)
                  or an Ollama server with at least one model pulled.
                </p>
              )}
            </div>
          </div>
        )}

        {turns.map((turn) => (
          <div key={turn.id} className={turn.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                turn.role === 'user'
                  ? 'bg-cyan-600/20 text-cyan-50'
                  : turn.error
                  ? 'border border-red-800/60 bg-red-950/30 text-red-200'
                  : 'bg-slate-800/70 text-slate-100'
              }`}
            >
              {turn.error ? (
                <>
                  <div className="font-medium">{turn.error.message}</div>
                  {turn.error.remediation && <div className="mt-1 text-xs text-red-300/80">{turn.error.remediation}</div>}
                </>
              ) : (
                <div className="whitespace-pre-wrap">{turn.content}</div>
              )}

              {turn.meta && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-700/60 pt-1.5 text-[10px] text-slate-400">
                  <span className="rounded bg-slate-700/60 px-1.5 py-0.5 font-mono text-slate-200">
                    {turn.meta.model}
                  </span>
                  <span>· {turn.meta.provider}</span>
                  <span>· {hostingLabel(turn.meta.hostingType)}</span>
                  <span>· {turn.meta.usage.totalTokens} tokens</span>
                  <span>· {turn.meta.latencyMs} ms</span>
                  {turn.meta.routing.usedFallback && (
                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-300">
                      fallback after {turn.meta.routing.attempts.filter((a) => !a.ok).length} failure(s)
                    </span>
                  )}
                </div>
              )}

              {turn.meta && turn.meta.routing.attempts.length > 1 && (
                <details className="mt-1 text-[10px] text-slate-500">
                  <summary className="cursor-pointer select-none">routing trail</summary>
                  <ol className="mt-1 space-y-0.5">
                    {turn.meta.routing.attempts.map((attempt, index) => (
                      <li key={`${attempt.deployment}-${index}`} className="font-mono">
                        {index + 1}. {attempt.deployment}{' '}
                        {attempt.ok ? (
                          <span className="text-emerald-400">answered</span>
                        ) : (
                          <span className="text-rose-400">{attemptReason(attempt.errorClass)}</span>
                        )}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-slate-800/70 px-3 py-2 text-sm text-slate-400">
              <span className="inline-flex gap-1">
                <span className="animate-pulse">●</span> routing…
              </span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
        className="flex items-end gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2"
      >
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          rows={2}
          placeholder="Send a message… (Enter to send, Shift+Enter for a new line)"
          className="max-h-40 min-h-[2.5rem] flex-1 resize-none bg-transparent px-2 py-1 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-medium text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
        >
          Send
        </button>
      </form>
    </div>
  );
}
