import { clientRoute } from '@/lib/portal/auth';
import {
  accountDto, deliverableDto, invoiceDto, notificationDto, projectDto, quotationDto, ticketDto,
} from '@/lib/portal/dto';
import { OPEN_PROJECT_STATUSES } from '@/lib/client-services/status';

/**
 * GET /api/portal/dashboard — everything on the client's home page, and only
 * that client's. Each query runs through the tenant-scoped handle.
 */
export const GET = clientRoute(async (ctx) => {
  const { tdb } = ctx;
  const forUser = { OR: [{ userId: null }, { userId: ctx.userId }] };

  const [projects, deliverables, invoices, quotations, tickets, notifications, unread] = await Promise.all([
    tdb.clientProject.findMany({ orderBy: { updatedAt: 'desc' }, take: 50 }),
    tdb.clientDeliverable.findMany({ where: { status: { not: 'superseded' } }, orderBy: { deliveredAt: 'desc' }, take: 6 }),
    tdb.clientInvoice.findMany({ where: { status: { not: 'void' } }, orderBy: { issuedAt: 'desc' }, take: 100 }),
    tdb.clientQuotation.findMany({ where: { status: 'sent' }, orderBy: { issuedAt: 'desc' }, take: 10 }),
    tdb.clientSupportTicket.findMany({ where: { status: { in: ['open', 'awaiting_support', 'awaiting_client'] } }, orderBy: { updatedAt: 'desc' }, take: 5 }),
    tdb.clientNotification.findMany({ where: forUser, orderBy: { createdAt: 'desc' }, take: 6 }),
    tdb.clientNotification.count({ where: { ...forUser, readAt: null } }),
  ]);

  const projectList = projects.map(projectDto);
  const titles = new Map(projects.map((p) => [p.id, String(p.title)]));
  const invoiceList = invoices.map(invoiceDto);
  const active = projectList.filter((p) => (OPEN_PROJECT_STATUSES as readonly string[]).includes(p.status));
  const outstanding = invoiceList.reduce((sum, i) => sum + i.balanceDue, 0);

  // One list of things waiting on the client, across every area.
  const pendingActions = [
    ...projectList
      .filter((p) => p.status === 'client_review')
      .map((p) => ({ type: 'review_deliverable', title: p.title, description: 'Review the delivered work', link: `/portal/projects/${p.id}` })),
    ...quotations.map((q) => ({ type: 'respond_quotation', title: String(q.title), description: `Quotation ${q.number} is awaiting your response`, link: '/portal/billing' })),
    ...invoiceList
      .filter((i) => i.balanceDue > 0)
      .map((i) => ({ type: 'pay_invoice', title: `Invoice ${i.number}`, description: i.status === 'overdue' ? 'Payment is overdue' : 'Payment is due', link: '/portal/billing' })),
    ...tickets
      .filter((t) => t.status === 'awaiting_client')
      .map((t) => ({ type: 'reply_ticket', title: String(t.subject), description: 'Our team is waiting for your reply', link: `/portal/support/${t.id}` })),
  ];

  return {
    account: accountDto(ctx),
    summary: {
      activeProjects: active.length,
      completedProjects: projectList.filter((p) => p.status === 'completed').length,
      pendingActions: pendingActions.length,
      openTickets: tickets.length,
      outstandingBalance: Math.round(outstanding * 100) / 100,
      unreadNotifications: unread,
      currency: ctx.account.currency,
    },
    services: [...new Set(projectList.filter((p) => p.status !== 'cancelled' && p.serviceName).map((p) => p.serviceName))],
    activeProjects: active.slice(0, 6),
    pendingActions,
    recentDeliverables: deliverables.map((d) => deliverableDto(d, titles.get(String(d.projectId)) ?? '')),
    invoices: invoiceList.slice(0, 5),
    quotations: quotations.map(quotationDto),
    tickets: tickets.map(ticketDto),
    notifications: notifications.map(notificationDto),
  };
});
