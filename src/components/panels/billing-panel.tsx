'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  CreditCard,
  Receipt,
  FileText,
  Plus,
  Ban,
  Pause,
  Play,
  Eye,
  DollarSign,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

/* ────────────── Types ────────────── */

interface Plan {
  id: string
  name: string
  slug: string
  description: string | null
  priceMonthly: number
  priceYearly: number
  agentLimit: number
  skillLimit: number
  workflowLimit: number
  monthlyTokens: number
  monthlyRequests: number
  features: string[]
  isEnterprise: boolean
  sortOrder: number
}

interface Subscription {
  id: string
  companyId: string
  company: { id: string; name: string; slug: string }
  planId: string
  plan: { id: string; name: string; slug: string; priceMonthly: number; priceYearly: number }
  status: string
  trialEndsAt: string | null
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelledAt: string | null
  createdAt: string
}

interface Invoice {
  id: string
  subscriptionId: string
  companyId: string
  company: { id: string; name: string; slug: string }
  subscription: {
    id: string
    status: string
    plan: { id: string; name: string; slug: string }
  }
  invoiceNumber: string
  amount: number
  currency: string
  status: string
  dueDate: string
  paidAt: string | null
  periodStart: string
  periodEnd: string
  lineItems: { description: string; amount: number; quantity: number }[]
  notes: string | null
  createdAt: string
}

interface Payment {
  id: string
  invoiceId: string | null
  companyId: string
  company: { id: string; name: string; slug: string }
  invoice: { id: string; invoiceNumber: string; amount: number; status: string } | null
  amount: number
  currency: string
  method: string
  status: string
  transactionRef: string | null
  notes: string | null
  paidAt: string | null
  createdAt: string
}

/* ────────────── Helpers ────────────── */

function fmtMoney(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n / 100)
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtNum(n: number) {
  return new Intl.NumberFormat('en-US').format(n)
}

/* ────────────── Status Badges ────────────── */

function SubscriptionBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    trial: 'bg-sky-100 text-sky-700 border-sky-200',
    past_due: 'bg-amber-100 text-amber-700 border-amber-200',
    paused: 'bg-violet-100 text-violet-700 border-violet-200',
    cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
  }
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize ${map[status] ?? 'bg-slate-100 text-slate-500 border-slate-200'}`}
    >
      {status.replace('_', ' ')}
    </span>
  )
}

function InvoiceBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-500 border-slate-200',
    sent: 'bg-blue-100 text-blue-700 border-blue-200',
    paid: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    failed: 'bg-red-100 text-red-700 border-red-200',
  }
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize ${map[status] ?? 'bg-slate-100 text-slate-500 border-slate-200'}`}
    >
      {status}
    </span>
  )
}

function PaymentBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    pending: 'bg-amber-100 text-amber-700 border-amber-200',
    failed: 'bg-red-100 text-red-700 border-red-200',
    refunded: 'bg-slate-100 text-slate-500 border-slate-200',
  }
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize ${map[status] ?? 'bg-slate-100 text-slate-500 border-slate-200'}`}
    >
      {status}
    </span>
  )
}

/* ────────────── Create Plan Dialog ────────────── */

function CreatePlanDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: () => void
}) {
  const [form, setForm] = useState({
    name: '',
    slug: '',
    description: '',
    priceMonthly: '0',
    priceYearly: '0',
    agentLimit: '100',
    skillLimit: '500',
    workflowLimit: '100',
    monthlyTokens: '1000000',
    monthlyRequests: '50000',
    features: '',
  })
  const [submitting, setSubmitting] = useState(false)

  const handleChange = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async () => {
    if (!form.name || !form.slug) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/billing/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          priceMonthly: Number(form.priceMonthly) * 100,
          priceYearly: Number(form.priceYearly) * 100,
          agentLimit: Number(form.agentLimit),
          skillLimit: Number(form.skillLimit),
          workflowLimit: Number(form.workflowLimit),
          monthlyTokens: Number(form.monthlyTokens),
          monthlyRequests: Number(form.monthlyRequests),
          features: form.features
            .split('\n')
            .map((f) => f.trim())
            .filter(Boolean),
        }),
      })
      if (res.ok) {
        onCreated()
        onOpenChange(false)
        setForm({
          name: '',
          slug: '',
          description: '',
          priceMonthly: '0',
          priceYearly: '0',
          agentLimit: '100',
          skillLimit: '500',
          workflowLimit: '100',
          monthlyTokens: '1000000',
          monthlyRequests: '50000',
          features: '',
        })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[#1E293B]">Create Plan</DialogTitle>
          <DialogDescription>Add a new subscription plan to the billing system.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#1E293B]">Plan Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="e.g. Pro Plan"
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#1E293B]">Slug *</Label>
              <Input
                value={form.slug}
                onChange={(e) => handleChange('slug', e.target.value)}
                placeholder="e.g. pro-plan"
                className="text-sm"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-[#1E293B]">Description</Label>
            <Input
              value={form.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Short description"
              className="text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#1E293B]">Monthly Price ($)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.priceMonthly}
                onChange={(e) => handleChange('priceMonthly', e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#1E293B]">Yearly Price ($)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.priceYearly}
                onChange={(e) => handleChange('priceYearly', e.target.value)}
                className="text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#1E293B]">Agent Limit</Label>
              <Input
                type="number"
                min="0"
                value={form.agentLimit}
                onChange={(e) => handleChange('agentLimit', e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#1E293B]">Skill Limit</Label>
              <Input
                type="number"
                min="0"
                value={form.skillLimit}
                onChange={(e) => handleChange('skillLimit', e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#1E293B]">Workflow Limit</Label>
              <Input
                type="number"
                min="0"
                value={form.workflowLimit}
                onChange={(e) => handleChange('workflowLimit', e.target.value)}
                className="text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#1E293B]">Monthly Tokens</Label>
              <Input
                type="number"
                min="0"
                value={form.monthlyTokens}
                onChange={(e) => handleChange('monthlyTokens', e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#1E293B]">Monthly Requests</Label>
              <Input
                type="number"
                min="0"
                value={form.monthlyRequests}
                onChange={(e) => handleChange('monthlyRequests', e.target.value)}
                className="text-sm"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-[#1E293B]">Features (one per line)</Label>
            <Textarea
              value={form.features}
              onChange={(e) => handleChange('features', e.target.value)}
              placeholder={'Unlimited agents\nPriority support\nCustom integrations'}
              rows={4}
              className="text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="text-sm">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !form.name || !form.slug}
            className="bg-[#003ABC] hover:bg-[#002A9E] text-white text-sm"
          >
            {submitting ? 'Creating...' : 'Create Plan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ────────────── Invoice Detail Dialog ────────────── */

function InvoiceDetailDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: Invoice | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  if (!invoice) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[#1E293B]">Invoice {invoice.invoiceNumber}</DialogTitle>
          <DialogDescription>Invoice details</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-500 text-xs mb-1">Company</p>
              <p className="font-medium text-[#1E293B]">{invoice.company?.name ?? '—'}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-1">Status</p>
              <InvoiceBadge status={invoice.status} />
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-1">Amount</p>
              <p className="font-semibold text-[#1E293B]">{fmtMoney(invoice.amount)}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-1">Due Date</p>
              <p className="text-[#1E293B]">{fmtDate(invoice.dueDate)}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-1">Plan</p>
              <p className="text-[#1E293B]">{invoice.subscription?.plan?.name ?? '—'}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-1">Period</p>
              <p className="text-[#1E293B] text-xs">
                {fmtDate(invoice.periodStart)} — {fmtDate(invoice.periodEnd)}
              </p>
            </div>
            {invoice.paidAt && (
              <div>
                <p className="text-slate-500 text-xs mb-1">Paid At</p>
                <p className="text-[#1E293B]">{fmtDate(invoice.paidAt)}</p>
              </div>
            )}
          </div>
          {invoice.lineItems?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-[#1E293B] mb-2">Line Items</p>
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="text-left px-3 py-2 text-xs text-slate-500 font-medium">Description</th>
                      <th className="text-right px-3 py-2 text-xs text-slate-500 font-medium">Qty</th>
                      <th className="text-right px-3 py-2 text-xs text-slate-500 font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.lineItems.map((item, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-[#1E293B]">{item.description}</td>
                        <td className="px-3 py-2 text-right text-[#1E293B]">{item.quantity}</td>
                        <td className="px-3 py-2 text-right text-[#1E293B]">{fmtMoney(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {invoice.notes && (
            <div>
              <p className="text-xs font-medium text-[#1E293B] mb-1">Notes</p>
              <p className="text-sm text-slate-600">{invoice.notes}</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="text-sm">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ────────────── Main Panel ────────────── */

export default function BillingPanel() {
  const [activeTab, setActiveTab] = useState('plans')

  // Data states
  const [plans, setPlans] = useState<Plan[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [payments, setPayments] = useState<Payment[]>([])

  // Loading states
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [loadingSubs, setLoadingSubs] = useState(true)
  const [loadingInvoices, setLoadingInvoices] = useState(true)
  const [loadingPayments, setLoadingPayments] = useState(true)

  // Dialog states
  const [createPlanOpen, setCreatePlanOpen] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [invoiceDetailOpen, setInvoiceDetailOpen] = useState(false)

  // Fetch plans
  const fetchPlans = useCallback(() => {
    fetch('/api/billing/plans')
      .then((r) => r.json())
      .then((res) => setPlans(res.data ?? []))
      .catch(() => {})
      .finally(() => setLoadingPlans(false))
  }, [])

  // Fetch subscriptions
  const fetchSubscriptions = useCallback(() => {
    fetch('/api/billing/subscriptions')
      .then((r) => r.json())
      .then((res) => setSubscriptions(res.data ?? []))
      .catch(() => {})
      .finally(() => setLoadingSubs(false))
  }, [])

  // Fetch invoices
  const fetchInvoices = useCallback(() => {
    fetch('/api/billing/invoices')
      .then((r) => r.json())
      .then((res) => setInvoices(res.data ?? []))
      .catch(() => {})
      .finally(() => setLoadingInvoices(false))
  }, [])

  // Fetch payments
  const fetchPayments = useCallback(() => {
    fetch('/api/billing/payments')
      .then((r) => r.json())
      .then((res) => setPayments(res.data ?? []))
      .catch(() => {})
      .finally(() => setLoadingPayments(false))
  }, [])

  useEffect(() => {
    fetchPlans()
    fetchSubscriptions()
    fetchInvoices()
    fetchPayments()
  }, [fetchPlans, fetchSubscriptions, fetchInvoices, fetchPayments])

  // Subscription actions
  const handleSubscriptionAction = async (id: string, action: 'cancel' | 'pause' | 'resume') => {
    try {
      const res = await fetch(`/api/billing/subscriptions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (res.ok) fetchSubscriptions()
    } catch {}
  }

  // View invoice
  const viewInvoice = (invoice: Invoice) => {
    setSelectedInvoice(invoice)
    setInvoiceDetailOpen(true)
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-[#1E293B]">Billing Management</h2>
        {activeTab === 'plans' && (
          <Button
            onClick={() => setCreatePlanOpen(true)}
            className="bg-[#003ABC] hover:bg-[#002A9E] text-white text-sm"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Create Plan
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-100">
          <TabsTrigger value="plans" className="text-sm data-[state=active]:bg-white data-[state=active]:text-[#003ABC] data-[state=active]:shadow-sm">
            <DollarSign className="w-4 h-4 mr-1.5" />
            Plans
          </TabsTrigger>
          <TabsTrigger value="subscriptions" className="text-sm data-[state=active]:bg-white data-[state=active]:text-[#003ABC] data-[state=active]:shadow-sm">
            <CreditCard className="w-4 h-4 mr-1.5" />
            Subscriptions
          </TabsTrigger>
          <TabsTrigger value="invoices" className="text-sm data-[state=active]:bg-white data-[state=active]:text-[#003ABC] data-[state=active]:shadow-sm">
            <Receipt className="w-4 h-4 mr-1.5" />
            Invoices
          </TabsTrigger>
          <TabsTrigger value="payments" className="text-sm data-[state=active]:bg-white data-[state=active]:text-[#003ABC] data-[state=active]:shadow-sm">
            <FileText className="w-4 h-4 mr-1.5" />
            Payments
          </TabsTrigger>
        </TabsList>

        {/* ── Plans Tab ── */}
        <TabsContent value="plans" className="mt-4">
          {loadingPlans ? (
            <div className="flex items-center justify-center py-8"><div className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-28" /></div></div>
          ) : plans.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">No plans found. Create your first plan.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {plans.map((plan) => (
                <Card
                  key={plan.id}
                  className="border-slate-200 bg-white hover:shadow-md transition-shadow"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base font-semibold text-[#1E293B]">
                        {plan.name}
                      </CardTitle>
                      {plan.isEnterprise && (
                        <Badge className="bg-[#FF6A00] text-white text-[10px] border-0">
                          Enterprise
                        </Badge>
                      )}
                    </div>
                    {plan.description && (
                      <p className="text-xs text-slate-500 mt-1">{plan.description}</p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-[#003ABC]">
                        {fmtMoney(plan.priceMonthly)}
                      </span>
                      <span className="text-xs text-slate-500">/month</span>
                      {plan.priceYearly > 0 && (
                        <span className="text-xs text-slate-400 ml-auto">
                          {fmtMoney(plan.priceYearly)}/yr
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex justify-between bg-slate-50 rounded px-2 py-1.5">
                        <span className="text-slate-500">Agents</span>
                        <span className="font-medium text-[#1E293B]">{fmtNum(plan.agentLimit)}</span>
                      </div>
                      <div className="flex justify-between bg-slate-50 rounded px-2 py-1.5">
                        <span className="text-slate-500">Skills</span>
                        <span className="font-medium text-[#1E293B]">{fmtNum(plan.skillLimit)}</span>
                      </div>
                      <div className="flex justify-between bg-slate-50 rounded px-2 py-1.5">
                        <span className="text-slate-500">Workflows</span>
                        <span className="font-medium text-[#1E293B]">{fmtNum(plan.workflowLimit)}</span>
                      </div>
                      <div className="flex justify-between bg-slate-50 rounded px-2 py-1.5">
                        <span className="text-slate-500">Tokens/mo</span>
                        <span className="font-medium text-[#1E293B]">{fmtNum(plan.monthlyTokens)}</span>
                      </div>
                    </div>
                    {plan.features?.length > 0 && (
                      <ul className="space-y-1 mt-2">
                        {plan.features.map((f, i) => (
                          <li key={i} className="text-xs text-slate-600 flex items-start gap-1.5">
                            <span className="text-emerald-500 mt-0.5">✓</span>
                            {f}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Subscriptions Tab ── */}
        <TabsContent value="subscriptions" className="mt-4">
          <Card className="border-slate-200 bg-white overflow-hidden">
            {loadingSubs ? (
              <div className="flex items-center justify-center py-8"><div className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-28" /></div></div>
            ) : subscriptions.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">No subscriptions found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50 border-slate-200">
                    <TableHead className="text-xs font-medium text-slate-500">Company</TableHead>
                    <TableHead className="text-xs font-medium text-slate-500">Plan</TableHead>
                    <TableHead className="text-xs font-medium text-slate-500">Status</TableHead>
                    <TableHead className="text-xs font-medium text-slate-500 hidden md:table-cell">Period Start</TableHead>
                    <TableHead className="text-xs font-medium text-slate-500 hidden md:table-cell">Period End</TableHead>
                    <TableHead className="text-xs font-medium text-slate-500 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscriptions.map((sub) => (
                    <TableRow key={sub.id} className="border-slate-100 hover:bg-slate-50/50">
                      <TableCell className="text-sm font-medium text-[#1E293B]">
                        {sub.company?.name ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm text-[#1E293B]">{sub.plan?.name ?? '—'}</TableCell>
                      <TableCell>
                        <SubscriptionBadge status={sub.status} />
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 hidden md:table-cell">
                        {fmtDate(sub.currentPeriodStart)}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 hidden md:table-cell">
                        {fmtDate(sub.currentPeriodEnd)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {(sub.status === 'active' || sub.status === 'trial') && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSubscriptionAction(sub.id, 'pause')}
                                className="h-7 px-2 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                title="Pause"
                              >
                                <Pause className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSubscriptionAction(sub.id, 'cancel')}
                                className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                                title="Cancel"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )}
                          {sub.status === 'paused' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSubscriptionAction(sub.id, 'resume')}
                              className="h-7 px-2 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              title="Resume"
                            >
                              <Play className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        {/* ── Invoices Tab ── */}
        <TabsContent value="invoices" className="mt-4">
          <Card className="border-slate-200 bg-white overflow-hidden">
            {loadingInvoices ? (
              <div className="flex items-center justify-center py-8"><div className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-28" /></div></div>
            ) : invoices.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">No invoices found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50 border-slate-200">
                    <TableHead className="text-xs font-medium text-slate-500">Invoice #</TableHead>
                    <TableHead className="text-xs font-medium text-slate-500">Company</TableHead>
                    <TableHead className="text-xs font-medium text-slate-500 text-right">Amount</TableHead>
                    <TableHead className="text-xs font-medium text-slate-500">Status</TableHead>
                    <TableHead className="text-xs font-medium text-slate-500 hidden md:table-cell">Due Date</TableHead>
                    <TableHead className="text-xs font-medium text-slate-500 text-right">View</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id} className="border-slate-100 hover:bg-slate-50/50 cursor-pointer" onClick={() => viewInvoice(inv)}>
                      <TableCell className="text-sm font-mono font-medium text-[#003ABC]">
                        {inv.invoiceNumber}
                      </TableCell>
                      <TableCell className="text-sm text-[#1E293B]">
                        {inv.company?.name ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm font-semibold text-[#1E293B] text-right">
                        {fmtMoney(inv.amount)}
                      </TableCell>
                      <TableCell>
                        <InvoiceBadge status={inv.status} />
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 hidden md:table-cell">
                        {fmtDate(inv.dueDate)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            viewInvoice(inv)
                          }}
                          className="h-7 px-2 text-xs text-[#003ABC] hover:text-[#002A9E] hover:bg-blue-50"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        {/* ── Payments Tab ── */}
        <TabsContent value="payments" className="mt-4">
          <Card className="border-slate-200 bg-white overflow-hidden">
            {loadingPayments ? (
              <div className="flex items-center justify-center py-8"><div className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-28" /></div></div>
            ) : payments.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">No payments found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50 border-slate-200">
                    <TableHead className="text-xs font-medium text-slate-500">Company</TableHead>
                    <TableHead className="text-xs font-medium text-slate-500 text-right">Amount</TableHead>
                    <TableHead className="text-xs font-medium text-slate-500">Method</TableHead>
                    <TableHead className="text-xs font-medium text-slate-500">Status</TableHead>
                    <TableHead className="text-xs font-medium text-slate-500 hidden md:table-cell">Date</TableHead>
                    <TableHead className="text-xs font-medium text-slate-500 hidden lg:table-cell">Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((pay) => (
                    <TableRow key={pay.id} className="border-slate-100 hover:bg-slate-50/50">
                      <TableCell className="text-sm font-medium text-[#1E293B]">
                        {pay.company?.name ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm font-semibold text-[#1E293B] text-right">
                        {fmtMoney(pay.amount)}
                      </TableCell>
                      <TableCell className="text-sm text-[#1E293B] capitalize">
                        {pay.method}
                      </TableCell>
                      <TableCell>
                        <PaymentBadge status={pay.status} />
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 hidden md:table-cell">
                        {pay.paidAt ? fmtDate(pay.paidAt) : fmtDate(pay.createdAt)}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500 font-mono hidden lg:table-cell">
                        {pay.transactionRef ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <CreatePlanDialog
        open={createPlanOpen}
        onOpenChange={setCreatePlanOpen}
        onCreated={fetchPlans}
      />
      <InvoiceDetailDialog
        invoice={selectedInvoice}
        open={invoiceDetailOpen}
        onOpenChange={setInvoiceDetailOpen}
      />
    </div>
  )
}