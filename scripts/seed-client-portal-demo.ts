/**
 * Local demo data for the two surfaces — idempotent. Development only.
 *
 * Creates one internal staff login and one client account with a project in
 * progress, so both the internal platform and the client portal can be opened
 * side by side.
 *
 * Usage:
 *   DEMO_PASSWORD='<at least 12 characters>' npx tsx scripts/seed-client-portal-demo.ts
 *
 * Logins created (both use DEMO_PASSWORD):
 *   staff@alolabs.test    — super_admin  → /dashboard
 *   client@example.test   — client       → /portal
 */
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { CLIENT_ROLE } from '@/lib/access/surfaces';
import { ensureServiceCatalogue, provisionClientAccount, setProjectStatus, newReference, logActivity, notifyClient } from '@/lib/client-services/operations';

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed demo logins in production.');
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 12) throw new Error('Set DEMO_PASSWORD (at least 12 characters).');
  const passwordHash = await hashPassword(password);

  const internalCompany = await db.company.upsert({
    where: { slug: 'alo-labs' },
    update: { accountType: 'internal' },
    create: { name: 'ALO Labs', slug: 'alo-labs', domain: 'alolabs.net', status: 'active', accountType: 'internal' },
  });
  const staff = await db.user.upsert({
    where: { email: 'staff@alolabs.test' },
    update: { passwordHash, role: 'super_admin', isActive: true },
    create: { email: 'staff@alolabs.test', name: 'Demo Staff', role: 'super_admin', passwordHash },
  });
  await db.companyUser.upsert({
    where: { companyId_userId: { companyId: internalCompany.id, userId: staff.id } },
    update: {},
    create: { companyId: internalCompany.id, userId: staff.id, role: 'owner' },
  });

  await ensureServiceCatalogue();

  let client = await db.user.findUnique({ where: { email: 'client@example.test' } });
  if (!client) {
    client = await db.user.create({ data: { email: 'client@example.test', name: 'Dana Client', role: CLIENT_ROLE, passwordHash } });
  } else {
    client = await db.user.update({ where: { id: client.id }, data: { passwordHash, role: CLIENT_ROLE, isActive: true } });
  }
  let membership = await db.companyUser.findFirst({ where: { userId: client.id, company: { accountType: 'client' } } });
  if (!membership) {
    const { companyId } = await provisionClientAccount({ userId: client.id, companyName: 'Example Trading Co', billingEmail: client.email });
    membership = await db.companyUser.findFirst({ where: { userId: client.id, companyId } });
    await db.clientAccount.update({
      where: { companyId },
      data: { accountManagerName: 'Demo Staff', accountManagerTitle: 'Account Manager', accountManagerEmail: 'info@alolabs.net' },
    });
  }
  const companyId = membership!.companyId;

  if ((await db.clientProject.count({ where: { companyId } })) === 0) {
    const offering = await db.serviceOffering.findUnique({ where: { slug: 'business-process-automation' } });
    const project = await db.clientProject.create({
      data: {
        companyId,
        reference: newReference('PRJ'),
        serviceOfferingId: offering?.id ?? null,
        serviceName: offering?.name ?? 'Business process automation',
        title: 'Automate invoice approvals',
        requirements: 'We approve around 300 supplier invoices a month by email. We would like one tracked approval workflow.',
        requestedByUserId: client.id,
      },
    });
    await logActivity(companyId, { projectId: project.id, entityType: 'project', entityId: project.id, type: 'project.requested', summary: 'Service request submitted.', actorType: 'client' });
    for (const status of ['reviewing', 'approved', 'in_progress'] as const) {
      await setProjectStatus(companyId, project.id, status, 'staff');
    }
    await db.clientProject.update({ where: { id: project.id }, data: { progress: 40 } });
    await db.clientProjectMilestone.createMany({
      data: [
        { companyId, projectId: project.id, title: 'Discovery and process map', status: 'completed', sortOrder: 1, completedAt: new Date() },
        { companyId, projectId: project.id, title: 'Approval workflow build', status: 'in_progress', sortOrder: 2 },
        { companyId, projectId: project.id, title: 'Handover and training', status: 'pending', sortOrder: 3 },
      ],
    });
    await notifyClient(companyId, { type: 'project', title: 'Your project is under way', message: 'Work has started on "Automate invoice approvals".', link: `/portal/projects/${project.id}` });
  }

  console.log('\nDemo data ready.');
  console.log('  Internal:  staff@alolabs.test   → /dashboard');
  console.log('  Client:    client@example.test  → /portal\n');
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await db.$disconnect(); });
