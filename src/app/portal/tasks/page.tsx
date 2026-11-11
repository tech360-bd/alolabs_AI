'use client'

/**
 * /portal/tasks — the caller's task history.
 *
 * Calls GET /api/v1/ai/tasks (the public, tenant-scoped task surface). Renders
 * a table with task_id, service, status, created_at, completed_at. Clicking a
 * row opens an inline detail panel that fetches the single task by id.
 *
 * Honest empty state if no tasks. Error banner if the fetch fails.
 */

import * as React from 'react'
import { useApiGet } from '@/hooks/use-api-actions'
import { fetchApi } from '@/lib/api'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  PortalPageHero,
  SectionCard,
  StateList,
  Pill,
  Spinner,
  fmtDate,
} from '@/components/portal/portal-primitives'
import { BRAND, BRAND_FONTS } from '@/lib/brand/tokens'
import { ArrowLeft, ListChecks, RefreshCw } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────

type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

interface PortalTask {
  task_id: string
  service: string
  status: TaskStatus | string
  created_at: string
  completed_at?: string | null
  result?: {
    summary?: string
    output?: unknown
    recommendations?: string[]
    citations?: Array<{ label: string; ref: string }>
  }
  usage?: { units: number }
}

interface TasksResponse {
  data?: PortalTask[]
  tasks?: PortalTask[]
}

// ── Status tone mapping ───────────────────────────────────────────────────

function statusTone(status: string): 'blue' | 'orange' | 'green' | 'red' | 'gray' {
  switch (status) {
    case 'completed':
      return 'green'
    case 'running':
      return 'blue'
    case 'pending':
      return 'gray'
    case 'failed':
      return 'red'
    case 'cancelled':
      return 'gray'
    default:
      return 'gray'
  }
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function PortalTasksPage() {
  const { data, loading, error, refresh } = useApiGet<TasksResponse>('/api/v1/ai/tasks')
  const tasks = React.useMemo(() => data?.data ?? data?.tasks ?? [], [data])
  const [selectedId, setSelectedId] = React.useState<string | null>(null)

  const isEmpty = tasks.length === 0

  return (
    <>
      <PortalPageHero
        eyebrow="Tasks"
        title="Your task history"
        lead="Every asynchronous task your API keys have submitted — chat completions, knowledge searches, and long-running agentic tasks. Click a row for the full detail."
      />

      <SectionCard
        title="Tasks"
        description="Tenant-scoped; sorted newest first."
        action={
          <button
            onClick={refresh}
            className="text-[12px] font-semibold inline-flex items-center gap-1"
            style={{ color: BRAND.orange }}
            type="button"
          >
            <RefreshCw className="size-3.5" /> Refresh
          </button>
        }
      >
        <StateList
          loading={loading}
          error={error}
          isEmpty={isEmpty}
          onRetry={refresh}
          emptyTitle="No tasks yet"
          emptyHint="Once your API keys submit tasks, they’ll appear here with full status and result detail."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task ID</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead className="text-right">Units</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => {
                const isSelected = selectedId === task.task_id
                return (
                  <TableRow
                    key={task.task_id}
                    onClick={() => setSelectedId(isSelected ? null : task.task_id)}
                    className="cursor-pointer"
                    data-state={isSelected ? 'selected' : undefined}
                  >
                    <TableCell>
                      <span className="font-mono text-[11px]" style={{ color: BRAND.ink }}>
                        {task.task_id}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Pill tone="blue">{task.service}</Pill>
                    </TableCell>
                    <TableCell>
                      <Pill tone={statusTone(task.status)}>{task.status}</Pill>
                    </TableCell>
                    <TableCell className="text-[12px]" style={{ color: BRAND.gray }}>
                      {fmtDate(task.created_at)}
                    </TableCell>
                    <TableCell className="text-[12px]" style={{ color: BRAND.gray }}>
                      {fmtDate(task.completed_at)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-[12px]" style={{ color: BRAND.ink }}>
                      {task.usage?.units ?? '—'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </StateList>
      </SectionCard>

      {/* Detail drawer */}
      {selectedId ? (
        <TaskDetailDrawer
          taskId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </>
  )
}

// ── Detail drawer ──────────────────────────────────────────────────────────

function TaskDetailDrawer({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const [task, setTask] = React.useState<PortalTask | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    fetchApi<PortalTask>(`/api/v1/ai/tasks/${taskId}`)
      .then((d) => {
        if (!cancelled) setTask(d)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [taskId])

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
      <button
        aria-label="Close detail panel"
        className="absolute inset-0 cursor-default"
        style={{ background: 'rgba(15,23,42,0.40)' }}
        onClick={onClose}
        type="button"
      />
      <aside
        className="relative h-full w-full max-w-[560px] overflow-y-auto border-l shadow-xl"
        style={{ background: '#FFFFFF', borderColor: BRAND.grayLine }}
      >
        <header
          className="sticky top-0 flex items-center justify-between gap-3 border-b px-5 py-3"
          style={{ borderColor: BRAND.grayLine, background: '#FFFFFF' }}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center size-7 rounded-md hover:bg-slate-100"
              aria-label="Back to list"
            >
              <ArrowLeft className="size-4" style={{ color: BRAND.ink }} />
            </button>
            <div className="flex flex-col leading-none">
              <span
                className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: BRAND.gray }}
              >
                Task detail
              </span>
              <span
                className="mt-0.5 font-mono text-[12px]"
                style={{ color: BRAND.ink }}
                title={taskId}
              >
                {taskId}
              </span>
            </div>
          </div>
          <ListChecks className="size-4" style={{ color: BRAND.orange }} />
        </header>

        <div className="p-5">
          {loading ? (
            <div className="flex items-center gap-2 py-12 justify-center text-[13px]" style={{ color: BRAND.gray }}>
              <Spinner /> Loading task…
            </div>
          ) : error ? (
            <div
              className="rounded-md border p-4 text-[12px] font-mono"
              style={{ borderColor: 'rgba(220,38,38,0.35)', background: 'rgba(220,38,38,0.05)', color: '#b91c1c' }}
            >
              {error}
            </div>
          ) : task ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 text-[12px]">
                <DetailRow label="Service" value={<Pill tone="blue">{task.service}</Pill>} />
                <DetailRow
                  label="Status"
                  value={<Pill tone={statusTone(task.status)}>{task.status}</Pill>}
                />
                <DetailRow label="Created" value={fmtDate(task.created_at)} mono />
                <DetailRow label="Completed" value={fmtDate(task.completed_at)} mono />
                <DetailRow
                  label="Units"
                  value={task.usage?.units != null ? task.usage.units.toString() : '—'}
                  mono
                />
              </div>

              {task.result?.summary ? (
                <DetailBlock title="Summary">
                  <p className="text-[13px] leading-relaxed" style={{ color: BRAND.ink }}>
                    {task.result.summary}
                  </p>
                </DetailBlock>
              ) : null}

              {task.result?.recommendations && task.result.recommendations.length > 0 ? (
                <DetailBlock title="Recommendations">
                  <ul className="space-y-1.5 text-[13px]" style={{ color: BRAND.ink }}>
                    {task.result.recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span
                          className="mt-[7px] size-[5px] shrink-0 rounded-full"
                          style={{ background: BRAND.orange }}
                          aria-hidden="true"
                        />
                        {rec}
                      </li>
                    ))}
                  </ul>
                </DetailBlock>
              ) : null}

              {task.result?.citations && task.result.citations.length > 0 ? (
                <DetailBlock title="Citations">
                  <ul className="space-y-1.5 text-[12px]" style={{ color: BRAND.ink }}>
                    {task.result.citations.map((c, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span
                          className="font-mono text-[10px]"
                          style={{ color: BRAND.gray }}
                        >
                          [{i + 1}]
                        </span>
                        <span className="font-medium">{c.label}</span>
                        <span className="font-mono text-[11px]" style={{ color: BRAND.gray }}>
                          {c.ref}
                        </span>
                      </li>
                    ))}
                  </ul>
                </DetailBlock>
              ) : null}

              {task.result?.output !== undefined ? (
                <DetailBlock title="Output">
                  <pre
                    className="overflow-x-auto rounded-md border p-3 font-mono text-[11px]"
                    style={{ borderColor: BRAND.grayLine, background: BRAND.canvas, color: BRAND.ink }}
                  >
                    {JSON.stringify(task.result.output, null, 2)}
                  </pre>
                </DetailBlock>
              ) : null}

              {!task.result ? (
                <p className="text-[12px]" style={{ color: BRAND.gray }}>
                  No result payload for this task.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  )
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
}) {
  return (
    <div>
      <dt
        className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]"
        style={{ color: BRAND.gray }}
      >
        {label}
      </dt>
      <dd
        className="mt-1"
        style={{
          fontFamily: mono ? BRAND_FONTS.primary.stack : undefined,
          color: BRAND.ink,
        }}
      >
        {value}
      </dd>
    </div>
  )
}

function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3
        className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] mb-2"
        style={{ color: BRAND.orange }}
      >
        {title}
      </h3>
      {children}
    </div>
  )
}
