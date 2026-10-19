'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, History, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { useAppStore } from '@/store/app'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface EmployeeIdentity {
  id: string
  employeeKey: string
  status: string
  statusReason: string | null
  roleKey: string
  title: string
  department: { id: string; slug: string; name: string }
  agent: { id: string; agentKey: string; name: string } | null
  modelPolicy: string
  resourceLimits: unknown
  configurationHash: string
  lastVerifiedAt: string | null
  lastVerificationExecutionId: string | null
  integrity: string
}

interface EmployeeSummary {
  provisioned: number
  tested: number
  active: number
  suspended: number
  retired: number
  other: number
}

interface AuditItem {
  id: string
  actorUserId: string | null
  action: string
  details: unknown
  createdAt: string
}

type TransitionStatus = 'tested' | 'active' | 'suspended' | 'retired'

const PAGE_SIZE = 50
const DEFAULT_SUMMARY: EmployeeSummary = { provisioned: 0, tested: 0, active: 0, suspended: 0, retired: 0, other: 0 }

function statusClass(status: string) {
  if (status === 'active') return 'bg-emerald-100 text-emerald-800'
  if (status === 'tested') return 'bg-blue-100 text-blue-800'
  if (status === 'suspended') return 'bg-amber-100 text-amber-800'
  if (status === 'retired') return 'bg-slate-200 text-slate-700'
  return 'bg-slate-100 text-slate-700'
}

function resourceSummary(value: unknown): string {
  if (!value || typeof value !== 'object') return 'Limits unavailable'
  const limits = value as Record<string, unknown>
  const tokens = typeof limits.maxTokensPerTask === 'number' ? limits.maxTokensPerTask.toLocaleString() : '—'
  const concurrency = typeof limits.maxConcurrentTasks === 'number' ? limits.maxConcurrentTasks : '—'
  const timeout = typeof limits.timeoutSeconds === 'number' ? limits.timeoutSeconds : '—'
  return `${tokens} tokens/task · ${concurrency} concurrent · ${timeout}s timeout`
}

export default function AIEmployeeGovernancePanel() {
  const userRole = useAppStore((state) => state.user?.role)
  const [items, setItems] = useState<EmployeeIdentity[]>([])
  const [summary, setSummary] = useState<EmployeeSummary>(DEFAULT_SUMMARY)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [transitionTarget, setTransitionTarget] = useState<EmployeeIdentity | null>(null)
  const [transitionStatus, setTransitionStatus] = useState<TransitionStatus>('tested')
  const [reason, setReason] = useState('')
  const [executionId, setExecutionId] = useState('')
  const [historyTarget, setHistoryTarget] = useState<EmployeeIdentity | null>(null)
  const [history, setHistory] = useState<AuditItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const load = useCallback(async (requestedPage: number) => {
    setLoading(true)
    setError('')
    try {
      const response = await fetchApi<{
        data: EmployeeIdentity[]
        summary: EmployeeSummary
        pagination: { total: number }
      }>(`/api/workforce/ai-employees?page=${requestedPage}&limit=${PAGE_SIZE}`)
      setItems(response.data)
      setSummary(response.summary)
      setTotal(response.pagination.total)
      setPage(requestedPage)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load employee identities.')
      setItems([])
      setSummary(DEFAULT_SUMMARY)
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(1) }, [load])

  const openTransition = (employee: EmployeeIdentity, status: TransitionStatus) => {
    setTransitionTarget(employee)
    setTransitionStatus(status)
    setReason('')
    setExecutionId('')
    setError('')
    setNotice('')
  }

  const submitTransition = async () => {
    if (!transitionTarget || saving) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await fetchApi(`/api/workforce/ai-employees/${encodeURIComponent(transitionTarget.id)}/lifecycle`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: transitionStatus,
          reason: reason.trim(),
          ...(transitionStatus === 'tested' ? { verificationExecutionId: executionId.trim() } : {}),
        }),
      })
      setTransitionTarget(null)
      setNotice(`${transitionTarget.employeeKey} status changed to ${transitionStatus}.`)
      await load(page)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Status transition was rejected.')
    } finally {
      setSaving(false)
    }
  }

  const openHistory = async (employee: EmployeeIdentity) => {
    setHistoryTarget(employee)
    setHistory([])
    setHistoryLoading(true)
    try {
      const response = await fetchApi<{ data: AuditItem[] }>(`/api/workforce/ai-employees/${encodeURIComponent(employee.id)}/history`)
      setHistory(response.data)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load audit history.')
    } finally {
      setHistoryLoading(false)
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <ShieldCheck className="h-6 w-6 text-blue-700" /> AI employee governance
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Persistent tenant-scoped identities linked to the existing workforce. Identity records are not inference processes; activation requires validated execution evidence and explicit Super Admin approval.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load(page)} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{error}</span>
        </div>
      )}
      {notice && (
        <div role="status" className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> <span>{notice}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Object.entries(summary).map(([status, count]) => (
          <Card key={status}>
            <CardHeader className="pb-1"><CardDescription className="capitalize">{status}</CardDescription></CardHeader>
            <CardContent><div className="text-2xl font-semibold">{count.toLocaleString()}</div></CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Employee identities</CardTitle>
          <CardDescription>{total.toLocaleString()} persisted identities in the selected company. Status is not a claim of model availability or production operation.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-12 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Loading tenant-scoped identities…</div>
          ) : items.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-slate-600">
              No identities are available. Confirm an authorized company is selected and the additive schema migration has been applied in that environment.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-left text-sm">
                <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-3">Identity</th><th className="px-3 py-3">Department / role</th><th className="px-3 py-3">Assignment</th><th className="px-3 py-3">Policy</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Controls</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((employee) => (
                    <tr key={employee.id} className="border-b align-top last:border-0">
                      <td className="px-3 py-3">
                        <div className="font-mono font-medium">{employee.employeeKey}</div>
                        <div className="mt-1 max-w-[240px] truncate text-xs text-slate-500">{employee.title}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div>{employee.department.name}</div>
                        <div className="text-xs capitalize text-slate-500">{employee.roleKey}</div>
                      </td>
                      <td className="px-3 py-3">
                        {employee.agent ? <><div>{employee.agent.name}</div><div className="font-mono text-xs text-slate-500">{employee.agent.agentKey}</div></> : <span className="text-red-700">Assignment mismatch</span>}
                        {employee.integrity !== 'tenant_scoped' && <div className="mt-1 text-xs text-red-700">Needs admin review</div>}
                      </td>
                      <td className="px-3 py-3">
                        <div>Model tier: <span className="font-medium">{employee.modelPolicy}</span></div>
                        <div className="mt-1 max-w-[240px] text-xs text-slate-500">{resourceSummary(employee.resourceLimits)}</div>
                        {employee.lastVerifiedAt && <div className="mt-1 text-xs text-slate-500">Verified {new Date(employee.lastVerifiedAt).toLocaleString()}</div>}
                      </td>
                      <td className="px-3 py-3">
                        <Badge className={statusClass(employee.status)}>{employee.status}</Badge>
                        {employee.statusReason && <div className="mt-1 max-w-[200px] text-xs text-slate-500">{employee.statusReason}</div>}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {(employee.status === 'provisioned' || employee.status === 'suspended') && (
                            <Button size="sm" variant="outline" onClick={() => openTransition(employee, 'tested')}>Test</Button>
                          )}
                          {employee.status === 'tested' && userRole === 'super_admin' && (
                            <Button size="sm" onClick={() => openTransition(employee, 'active')}>Activate</Button>
                          )}
                          {(employee.status === 'active' || employee.status === 'tested') && (
                            <Button size="sm" variant="outline" onClick={() => openTransition(employee, 'suspended')}>Suspend</Button>
                          )}
                          {employee.status !== 'retired' && (
                            <Button size="sm" variant="ghost" className="text-red-700 hover:text-red-800" onClick={() => openTransition(employee, 'retired')}>Retire</Button>
                          )}
                          <Button size="icon" variant="ghost" aria-label={`View ${employee.employeeKey} audit history`} onClick={() => void openHistory(employee)}>
                            <History className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 flex items-center justify-between border-t pt-4 text-sm text-slate-600">
            <span>Page {page} of {pageCount}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => void load(page - 1)}><ChevronLeft className="mr-1 h-4 w-4" />Previous</Button>
              <Button size="sm" variant="outline" disabled={page >= pageCount || loading} onClick={() => void load(page + 1)}>Next<ChevronRight className="ml-1 h-4 w-4" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={transitionTarget !== null} onOpenChange={(open) => { if (!open && !saving) setTransitionTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{transitionStatus === 'active' ? 'Super Admin activation' : `Mark ${transitionStatus}`}</DialogTitle>
            <DialogDescription>
              {transitionTarget?.employeeKey}. Status changes are tenant-scoped and audited. Activation rechecks the recorded execution, quality review, and successful model-usage evidence.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {transitionStatus === 'tested' && (
              <div className="space-y-2">
                <Label htmlFor="verification-execution-id">Completed execution ID</Label>
                <Input id="verification-execution-id" value={executionId} onChange={(event) => setExecutionId(event.target.value)} maxLength={191} placeholder="AgentExecution ID" />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="employee-status-reason">Reason</Label>
              <Textarea id="employee-status-reason" value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={200} placeholder="Document the human decision or review outcome." />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setTransitionTarget(null)} disabled={saving}>Cancel</Button>
              <Button onClick={() => void submitTransition()} disabled={saving || reason.trim().length < 3 || (transitionStatus === 'tested' && !executionId.trim())}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm {transitionStatus}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={historyTarget !== null} onOpenChange={(open) => { if (!open) setHistoryTarget(null) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Audit history · {historyTarget?.employeeKey}</DialogTitle>
            <DialogDescription>Append-only administrative events for this tenant-owned identity.</DialogDescription>
          </DialogHeader>
          {historyLoading ? <div className="flex items-center gap-2 py-8 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading audit events…</div> : history.length === 0 ? <p className="py-8 text-sm text-slate-500">No audit events found.</p> : (
            <div className="max-h-[55vh] space-y-3 overflow-y-auto">
              {history.map((event) => (
                <div key={event.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap justify-between gap-2 text-sm font-medium"><span>{event.action}</span><time className="text-xs text-slate-500">{new Date(event.createdAt).toLocaleString()}</time></div>
                  <div className="mt-1 text-xs text-slate-500">Actor: {event.actorUserId ?? 'system'}</div>
                  <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-slate-700">{JSON.stringify(event.details, null, 2)}</pre>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
