import { PrismaClient } from "@prisma/client";
import { hash } from "bcrypt";
import * as fs from "fs";
import * as path from "path";

const db = new PrismaClient();

const registryPath = path.join(
  process.cwd(),
  "upload",
  "alo_labs_agenthub_full_2000_agent_registry.json"
);

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function main() {
  console.log("🌱 Seeding ALO Labs Agent Hub...");

  // 1. Load registry
  const raw = fs.readFileSync(registryPath, "utf-8");
  const registry = JSON.parse(raw);
  const departments = registry.departments;
  const agents = registry.agents;

  console.log(`  Loaded ${departments.length} departments, ${agents.length} agents`);

  // 2. Clear existing data (order matters for FK constraints)
  console.log("  Clearing existing data...");
  await db.usageLog.deleteMany();
  await db.agentRun.deleteMany();
  await db.skillRun.deleteMany();
  await db.workflowRun.deleteMany();
  await db.companyPermission.deleteMany();
  await db.companyApiKey.deleteMany();
  await db.companyUser.deleteMany();
  await db.company.deleteMany();
  await db.taskStep.deleteMany();
  await db.output.deleteMany();
  await db.task.deleteMany();
  await db.command.deleteMany();
  await db.workflowStep.deleteMany();
  await db.workflow.deleteMany();
  await db.agentMemory.deleteMany();
  await db.departmentMemory.deleteMany();
  await db.companyMemory.deleteMany();
  await db.agentVersion.deleteMany();
  await db.agentPermission.deleteMany();
  await db.agent.deleteMany();
  await db.department.deleteMany();
  await db.skillVersion.deleteMany();
  await db.skillPermission.deleteMany();
  await db.skillValidationLog.deleteMany();
  await db.skill.deleteMany();
  await db.approval.deleteMany();
  await db.blockedAction.deleteMany();
  await db.paymentGuardLog.deleteMany();
  await db.protectionLog.deleteMany();
  await db.auditLog.deleteMany();
  await db.user.deleteMany();
  await db.settings.deleteMany();
  await db.healthCheck.deleteMany();

  // 3. Create Super Admin user
  console.log("  Creating super admin...");
  const passwordHash = await hash("admin123", 10);
  const admin = await db.user.create({
    data: {
      email: "admin@alolabs.com",
      passwordHash,
      name: "ALO Super Admin",
      role: "super_admin",
      isActive: true,
    },
  });

  // 4. Create 8 companies
  console.log("  Creating companies...");
  const companiesData = [
    { name: "ALO Education", slug: "alo-education", domain: "aloeducation.com", webCrmConnected: true },
    { name: "English AI", slug: "english-ai", domain: "english.aloeducation.com", webCrmConnected: true },
    { name: "ICLA Global Academy", slug: "icla-global-academy", domain: "icla.edu", webCrmConnected: true },
    { name: "TECH360", slug: "tech360", domain: "tech360.com", webCrmConnected: true },
    { name: "ALO Labs", slug: "alo-labs", domain: "alolabs.com", webCrmConnected: true },
    { name: "alamin.info", slug: "alamin-info", domain: "alamin.info", webCrmConnected: false },
    { name: "Future Expansion A", slug: "future-expansion-a", domain: null, webCrmConnected: false },
    { name: "Future Expansion B", slug: "future-expansion-b", domain: null, webCrmConnected: false },
  ];

  const companies = [];
  for (const c of companiesData) {
    const company = await db.company.create({
      data: {
        name: c.name,
        slug: c.slug,
        domain: c.domain,
        webCrmConnected: c.webCrmConnected,
        monthlyUsageLimit: 10000,
        status: "active",
      },
    });
    companies.push(company);

    // Link admin to each company
    await db.companyUser.create({
      data: {
        companyId: company.id,
        userId: admin.id,
        role: "super_admin",
      },
    });
  }

  // 5. Create 100 departments
  console.log("  Creating 100 departments...");
  const deptMap = new Map<number, string>(); // department_id -> db id
  for (const dept of departments) {
    const created = await db.department.create({
      data: {
        name: dept.department_name,
        slug: slugify(dept.department_name),
        description: `Department ${dept.department_id}: ${dept.department_name}`,
        agentCount: 20,
        sortOrder: dept.department_id,
        status: "active",
      },
    });
    deptMap.set(dept.department_id, created.id);
  }

  // 6. Create 2000 agents
  console.log("  Creating 2000 agents...");
  let created = 0;
  const agentBatches: any[] = [];

  for (const agent of agents) {
    const deptId = deptMap.get(agent.department_id);
    if (!deptId) {
      console.warn(`  Warning: No department for agent ${agent.agent_code} (dept ${agent.department_id})`);
      continue;
    }

    agentBatches.push({
      agentId: agent.agent_code,
      name: agent.agent_name,
      slug: slugify(agent.agent_code + "-" + agent.agent_name),
      departmentId: deptId,
      departmentName: agent.department_name,
      purpose: `${agent.agent_name} for ${agent.department_name}`,
      role: "specialist",
      status: agent.status || "active",
      version: 1,
      protectionRules: agent.protection_enabled ? '["enabled"]' : "[]",
    });

    created++;
  }

  // Batch insert in chunks of 100
  for (let i = 0; i < agentBatches.length; i += 100) {
    const chunk = agentBatches.slice(i, i + 100);
    await db.agent.createMany({ data: chunk });
    if (i % 500 === 0) console.log(`    ... ${i}/${agentBatches.length}`);
  }
  console.log(`  ✅ Created ${created} agents`);

  // 7. Create 60 workflows
  console.log("  Creating workflows...");
  const workflowNames = [
    "Student Lead Capture", "WhatsApp Auto Reply", "Content Writing Pipeline",
    "SEO Audit Pipeline", "Website Build Pipeline", "Social Media Calendar",
    "Paid Ads Planner", "CRM Data Sync", "Avatar Video Production",
    "Email Campaign Builder", "Course Content Generator", "Exam Paper Generator",
    "Proposal Writer", "Client Onboarding", "Invoice Generator",
    "Support Ticket Router", "Knowledge Base Builder", "Report Generator",
    "Market Research", "Competitor Analysis", "Brand Strategy",
    "Funnel Builder", "Landing Page Builder", "Blog Writer",
    "Product Description Writer", "Customer Segmentation", "Churn Prediction",
    "Revenue Forecast", "Sales Pipeline Manager", "Deal Stage Mover",
    "Appointment Scheduler", "Follow Up Automator", "Re-Engagement Campaign",
    "Social Post Creator", "Video Script Writer", "Thumbnail Generator",
    "Music Composer", "Voice Clone Pipeline", "Study Plan Generator",
    "Visa Application Assistant", "University Research", "Scholarship Finder",
    "SOP Writer", "Mock Test Generator", "Score Report Builder",
    "Recruitment Pipeline", "Employee Onboarding", "Performance Review",
    "Budget Planner", "Legal Document Review", "Compliance Checker",
    "Data Cleaning Pipeline", "Dashboard Builder", "API Integration",
    "Webhook Handler", "Backup & Restore", "Security Scanner",
    "Multi-Company Router", "RAG Query Pipeline", "Self-Improvement Loop",
    "Productivity Analyzer", "Payment Guard Check", "Protection Mode Scan",
  ];

  for (let i = 0; i < workflowNames.length; i++) {
    await db.workflow.create({
      data: {
        name: workflowNames[i],
        slug: slugify(workflowNames[i]),
        description: `${workflowNames[i]} workflow`,
        status: "active",
      },
    });
  }

  // 8. Create sample usage logs
  console.log("  Creating sample usage logs...");
  const statuses = ["completed", "completed", "completed", "failed", "blocked"];
  const agentSamples = agents.slice(0, 20);
  const now = Date.now();

  for (let i = 0; i < 50; i++) {
    const company = companies[i % companies.length];
    const agent = agentSamples[i % agentSamples.length];
    const status = statuses[i % statuses.length];
    const startTime = new Date(now - Math.random() * 7 * 24 * 60 * 60 * 1000);
    const completedAt = status === "completed" || status === "failed"
      ? new Date(startTime.getTime() + Math.random() * 60000)
      : null;

    await db.usageLog.create({
      data: {
        companyId: company.id,
        companyName: company.name,
        userId: admin.id,
        userName: admin.name,
        agentId: agent.agent_code,
        agentName: agent.agent_name,
        tokensOrLocalUsed: Math.floor(Math.random() * 5000),
        paidApiUsed: false,
        externalCostRisk: "none",
        status,
        startedAt: startTime,
        completedAt,
      },
    });
  }

  // 9. Create sample approvals
  console.log("  Creating sample approvals...");
  const approvalTypes = [
    "paid_api", "deployment", "bulk_whatsapp", "public_publish",
    "new_agent", "new_workflow", "file_delete", "dns_change",
    "real_human_face", "sms"
  ];
  const approvalTitles = [
    "OpenAI API Access Request", "Deploy to Production", "Bulk WhatsApp Campaign",
    "Publish Blog Post", "Create New Agent: Data Analyst", "New Workflow: Lead Scoring",
    "Delete Old Logs", "DNS Change: aloeducation.com", "Avatar Video with Human Face",
    "SMS Campaign: Student Follow-up",
  ];

  for (let i = 0; i < 10; i++) {
    await db.approval.create({
      data: {
        type: approvalTypes[i],
        title: approvalTitles[i],
        description: `Approval request for ${approvalTitles[i].toLowerCase()}`,
        status: i < 3 ? "pending" : i < 7 ? "approved" : "rejected",
        requestedBy: admin.id,
        reviewedBy: i >= 3 ? admin.id : null,
        reviewedAt: i >= 3 ? new Date(now - Math.random() * 3 * 24 * 60 * 60 * 1000) : null,
      },
    });
  }

  // 10. Create protection logs
  console.log("  Creating protection logs...");
  const protectionActions = [
    { action: "cross_company_data_access", reason: "Blocked attempt to access another company's data", blocked: true },
    { action: "credential_theft_attempt", reason: "Blocked credential extraction pattern", blocked: true },
    { action: "unsafe_shell_command", reason: "Blocked: curl pipe bash pattern detected", blocked: true },
    { action: "dns_change", reason: "Blocked DNS change without approval", blocked: true },
    { action: "file_delete", reason: "Blocked file deletion without approval", blocked: true },
    { action: "public_publish", reason: "Blocked public publish without approval", blocked: true },
    { action: "bulk_whatsapp", reason: "Blocked bulk WhatsApp without approval", blocked: true },
    { action: "paid_api_access", reason: "Blocked paid API: requires owner approval", blocked: true },
    { action: "env_file_read", reason: "Blocked .env file read attempt", blocked: true },
    { action: "malware_upload", reason: "Blocked potential malware upload", blocked: true },
    { action: "cross_company_data_access", reason: "Company isolation enforced - query scoped", blocked: false },
    { action: "paid_api_access", reason: "Local replacement found: Ollama instead of OpenAI", blocked: false },
    { action: "shell_command", reason: "Shell command passed safety check", blocked: false },
    { action: "file_operation", reason: "File read within allowed scope", blocked: false },
    { action: "script_execution", reason: "Script passed content safety check", blocked: false },
  ];

  for (let i = 0; i < protectionActions.length; i++) {
    const p = protectionActions[i];
    await db.protectionLog.create({
      data: {
        actionType: p.action,
        blocked: p.blocked,
        reason: p.reason,
        createdAt: new Date(now - Math.random() * 7 * 24 * 60 * 60 * 1000),
      },
    });
  }

  // 11. Create payment guard logs
  console.log("  Creating payment guard logs...");
  const paymentApis = [
    { api: "OpenAI GPT-4", replaced: true, replacement: "Ollama Llama 3" },
    { api: "Anthropic Claude", replaced: true, replacement: "Ollama Mistral" },
    { api: "HeyGen Avatar", replaced: false, replacement: null },
    { api: "ElevenLabs TTS", replaced: true, replacement: "Local TTS Engine" },
    { api: "Google Gemini Pro", replaced: true, replacement: "Ollama DeepSeek" },
    { api: "Paid SMS Gateway", replaced: false, replacement: null },
    { api: "Paid SEO API", replaced: true, replacement: "Local SEO Analyzer" },
    { api: "Midjourney API", replaced: true, replacement: "Local Stable Diffusion" },
    { api: "WhatsApp Business API", replaced: false, replacement: null },
    { api: "Paid Ads API", replaced: false, replacement: null },
  ];

  for (let i = 0; i < paymentApis.length; i++) {
    const p = paymentApis[i];
    await db.paymentGuardLog.create({
      data: {
        apiName: p.api,
        blocked: true,
        replacementUsed: p.replaced,
        replacementName: p.replacement,
        reason: p.replaced
          ? `Local replacement available: ${p.replacement}`
          : "No local replacement - requires owner approval",
        createdAt: new Date(now - Math.random() * 7 * 24 * 60 * 60 * 1000),
      },
    });
  }

  // 12. Create audit logs
  console.log("  Creating audit logs...");
  const auditActions = [
    { action: "login", resource: "auth", detail: "Super admin logged in" },
    { action: "agent_view", resource: "agents", detail: "Viewed agent registry" },
    { action: "company_create", resource: "companies", detail: "Created new company" },
    { action: "approval_approve", resource: "approvals", detail: "Approved deployment request" },
    { action: "protection_override", resource: "protection", detail: "Manually reviewed blocked action" },
    { action: "settings_update", resource: "settings", detail: "Updated system settings" },
    { action: "workflow_create", resource: "workflows", detail: "Created new workflow" },
    { action: "user_create", resource: "users", detail: "Created new user account" },
    { action: "api_key_rotate", resource: "api-keys", detail: "Rotated company API key" },
    { action: "dashboard_view", resource: "dashboard", detail: "Viewed super admin dashboard" },
    { action: "agent_lock", resource: "agents", detail: "Locked agent for maintenance" },
    { action: "company_lock", resource: "companies", detail: "Locked company account" },
    { action: "data_export", resource: "data", detail: "Exported usage report" },
    { action: "backup_create", resource: "backups", detail: "Created system backup" },
    { action: "rag_upload", resource: "rag", detail: "Uploaded knowledge documents" },
    { action: "webhook_create", resource: "webhooks", detail: "Created webhook endpoint" },
    { action: "role_update", resource: "roles", detail: "Updated user role permissions" },
    { action: "memory_cleanup", resource: "memory", detail: "Ran memory cleanup task" },
    { action: "cost_estimate", resource: "payment-guard", detail: "Requested cost estimate for paid API" },
    { action: "health_check", resource: "system", detail: "Ran deep health check" },
  ];

  for (let i = 0; i < auditActions.length; i++) {
    const a = auditActions[i];
    await db.auditLog.create({
      data: {
        userId: admin.id,
        action: a.action,
        resource: a.resource,
        details: JSON.stringify({ detail: a.detail }),
        createdAt: new Date(now - Math.random() * 7 * 24 * 60 * 60 * 1000),
      },
    });
  }

  // 13. Create sample tasks
  console.log("  Creating sample tasks...");
  const taskTitles = [
    "Generate SEO article for ALO Education",
    "Create WhatsApp campaign for ICLA",
    "Build landing page for TECH360 client",
    "Analyze competitor keywords for alamin.info",
    "Create social media calendar for English AI",
    "Generate IELTS mock test questions",
    "Design logo for new client project",
    "Write course description for ICLA Academy",
    "Build CRM report for ALO Education",
    "Create avatar video script",
  ];

  for (let i = 0; i < taskTitles.length; i++) {
    const company = companies[i % companies.length];
    const agent = agentSamples[i % agentSamples.length];
    const status = i < 5 ? "completed" : i < 8 ? "in_progress" : "pending";

    await db.task.create({
      data: {
        title: taskTitles[i],
        description: `Task for ${company.name}: ${taskTitles[i]}`,
        status,
        priority: i === 0 ? "high" : i < 5 ? "medium" : "low",
        userId: admin.id,
        startedAt: status !== "pending" ? new Date(now - Math.random() * 3 * 24 * 60 * 60 * 1000) : null,
        completedAt: status === "completed" ? new Date(now - Math.random() * 2 * 24 * 60 * 60 * 1000) : null,
      },
    });
  }

  // 14. Create system settings
  console.log("  Creating system settings...");
  const settings = [
    { key: "payment_guard_enabled", value: "true", type: "boolean" },
    { key: "protection_mode_enabled", value: "true", type: "boolean" },
    { key: "self_improvement_enabled", value: "true", type: "boolean" },
    { key: "productivity_mode_enabled", value: "true", type: "boolean" },
    { key: "rag_enabled", value: "true", type: "boolean" },
    { key: "paid_ai_api_allowed", value: "false", type: "boolean" },
    { key: "central_agent_hub_enabled", value: "true", type: "boolean" },
    { key: "multi_company_routing_enabled", value: "true", type: "boolean" },
    { key: "company_usage_tracking_enabled", value: "true", type: "boolean" },
    { key: "selected_agent_runtime_enabled", value: "true", type: "boolean" },
    { key: "web_crm_auto_connected", value: "true", type: "boolean" },
  ];

  for (const s of settings) {
    await db.settings.upsert({
      where: { key: s.key },
      update: { value: s.value },
      create: { key: s.key, value: s.value, type: s.type },
    });
  }

  console.log("✅ Seed completed successfully!");
  console.log(`  - 1 Super Admin user`);
  console.log(`  - ${companies.length} Companies`);
  console.log(`  - ${departments.length} Departments`);
  console.log(`  - ${created} Agents`);
  console.log(`  - ${workflowNames.length} Workflows`);
  console.log(`  - 50 Usage logs`);
  console.log(`  - 10 Approvals`);
  console.log(`  - 15 Protection logs`);
  console.log(`  - 10 Payment guard logs`);
  console.log(`  - 20 Audit logs`);
  console.log(`  - 10 Tasks`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());