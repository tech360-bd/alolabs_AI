import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";

const db = new PrismaClient();

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function main() {
  console.log("🌱 Seeding missing data (Skills, WorkflowSteps, CompanyApiKeys)...");

  // ===== 1. SEED SKILLS (per department) =====
  console.log("\n1. Creating Skills per department...");
  const departments = await db.department.findMany({ orderBy: { sortOrder: "asc" } });
  const existingSkillCount = await db.skill.count();

  if (existingSkillCount === 0) {
    const skillTemplates = [
      "Content Generation", "Data Analysis", "Report Building", "Auto Reply",
      "Lead Scoring", "SEO Optimization", "Social Posting", "Email Drafting",
      "Code Review", "Quality Check", "Compliance Scan", "Risk Assessment",
      "Cost Estimation", "Resource Allocation", "Schedule Planning", "Trend Analysis",
      "Sentiment Analysis", "Translation", "Summarization", "Fact Checking",
      "Image Processing", "Video Scripting", "Audio Transcription", "Document Parsing",
      "Knowledge Retrieval", "Pattern Detection", "Anomaly Detection", "Forecasting",
      "Classification", "Clustering", "Recommendation", "Personalization",
      "A/B Testing", "Conversion Tracking", "Funnel Analysis", "Cohort Analysis",
      "Churn Prediction", "Lifetime Value Calc", "Revenue Analysis", "Budget Tracking",
      "Invoice Processing", "Receipt Scanning", "Contract Review", "Legal Research",
      "Candidate Screening", "Interview Scheduling", "Onboarding Flow", "Training Plan",
      "Backup Automation", "Deployment Pipeline", "Health Monitoring", "Alert Routing",
      "Webhook Processing", "API Integration", "Data Migration", "Schema Validation"
    ];

    let skillCount = 0;
    const skillBatches: any[] = [];

    for (const dept of departments) {
      // 2-5 skills per department based on sortOrder
      const numSkills = 3 + (dept.sortOrder % 3);
      for (let j = 0; j < numSkills; j++) {
        const template = skillTemplates[(dept.sortOrder * 5 + j) % skillTemplates.length];
        const skillName = `${template} - ${dept.name}`;
        skillBatches.push({
          name: skillName,
          slug: slugify(skillName),
          category: dept.name,
          categorySlug: dept.slug,
          title: `${template} Skill for ${dept.name}`,
          version: "1.0.0",
          status: "private",
          riskLevel: j === 0 ? "medium" : "low",
          requiresApproval: j === 0,
          allowedTools: '["search", "calculator", "file_read"]',
          forbiddenTools: '["shell_execute", "external_api_paid"]',
          inputs: JSON.stringify([{ name: "query", type: "string", required: true }]),
          outputs: JSON.stringify([{ name: "result", type: "string" }]),
          purpose: `Performs ${template.toLowerCase()} operations within ${dept.name} department`,
          safetyRules: JSON.stringify([
            "Never expose company data to other tenants",
            "Log all operations for audit trail",
            "Flag high-risk outputs for human review"
          ]),
          approvalRules: j === 0 ? JSON.stringify({ requiresHumanApproval: true, minRole: "manager" }) : "",
          failureHandling: JSON.stringify({ retryCount: 3, fallbackTo: "human_review", escalationRole: "admin" }),
          content: `# ${skillName}\n\n## Purpose\n${template} operations for ${dept.name}\n\n## When to Use\nUse this skill when ${template.toLowerCase()} is needed within the ${dept.name} department scope.\n\n## Steps\n1. Receive input query\n2. Validate against department scope\n3. Execute ${template.toLowerCase()}\n4. Apply quality checks\n5. Return result\n\n## Output Format\nStructured JSON result with status, data, and metadata.`,
        });
        skillCount++;
      }
    }

    // Batch insert
    for (let i = 0; i < skillBatches.length; i += 100) {
      const chunk = skillBatches.slice(i, i + 100);
      await db.skill.createMany({ data: chunk });
      if (i % 200 === 0) console.log(`    ... ${i}/${skillBatches.length}`);
    }
    console.log(`  ✅ Created ${skillCount} Skills`);
  } else {
    console.log(`  ℹ️  Skills already exist (${existingSkillCount}), skipping`);
  }

  // ===== 2. SEED WORKFLOW STEPS =====
  console.log("\n2. Creating Workflow Steps...");
  const existingSteps = await db.workflowStep.count();

  if (existingSteps === 0) {
    const workflows = await db.workflow.findMany();
    const agents = await db.agent.findMany({ take: 200, orderBy: { agentId: "asc" } });

    let stepCount = 0;
    const stepBatches: any[] = [];

    for (const wf of workflows) {
      const numSteps = 3 + Math.floor(Math.random() * 5); // 3-7 steps per workflow
      for (let s = 0; s < numSteps; s++) {
        const agent = agents[(stepCount + s) % agents.length];
        const actions = [
          "analyze_input", "validate_data", "execute_task", "apply_rules",
          "check_approval", "generate_output", "quality_check", "log_result"
        ];
        stepBatches.push({
          workflowId: wf.id,
          stepNumber: s + 1,
          agentId: agent?.id || null,
          action: actions[s % actions.length],
          config: JSON.stringify({
            timeout: 30000,
            retries: 2,
            parallel: false,
          }),
        });
        stepCount++;
      }
    }

    // Batch insert
    for (let i = 0; i < stepBatches.length; i += 100) {
      const chunk = stepBatches.slice(i, i + 100);
      await db.workflowStep.createMany({ data: chunk });
    }
    console.log(`  ✅ Created ${stepCount} WorkflowSteps for ${workflows.length} workflows`);
  } else {
    console.log(`  ℹ️  WorkflowSteps already exist (${existingSteps}), skipping`);
  }

  // ===== 3. SEED COMPANY API KEYS =====
  console.log("\n3. Creating Company API Keys...");
  const existingKeys = await db.companyApiKey.count();

  if (existingKeys === 0) {
    const companies = await db.company.findMany();
    for (const company of companies) {
      const rawKey = `alohub_${company.slug}_${randomBytes(24).toString("hex")}`;
      const keyHash = await hashKey(rawKey);
      const keyPrefix = rawKey.substring(0, 12) + "...";

      await db.companyApiKey.create({
        data: {
          companyId: company.id,
          keyHash: rawKey, // Store full key for demo (in production, store hash)
          keyPrefix,
          name: `${company.name} API Key`,
          isActive: true,
          lastUsedAt: new Date(),
        },
      });
      console.log(`  ✅ ${company.name}: ${keyPrefix}`);
    }
    console.log(`  ✅ Created ${companies.length} Company API Keys`);
  } else {
    console.log(`  ℹ️  CompanyApiKeys already exist (${existingKeys}), skipping`);
  }

  // ===== 4. SEED COMPANY PERMISSIONS =====
  console.log("\n4. Creating Company Permissions...");
  const existingPerms = await db.companyPermission.count();

  if (existingPerms === 0) {
    const companies = await db.company.findMany();
    const allDepts = await db.department.findMany({ take: 30 });
    let permCount = 0;

    for (const company of companies) {
      // Each company gets access to ~15 random departments
      const shuffled = [...allDepts].sort(() => Math.random() - 0.5);
      const assignedDepts = shuffled.slice(0, 15);
      for (const dept of assignedDepts) {
        await db.companyPermission.create({
          data: {
            companyId: company.id,
            departmentId: dept.id,
            accessLevel: company.slug === "alo-labs" ? "admin" : "read",
          },
        });
        permCount++;
      }
    }
    console.log(`  ✅ Created ${permCount} Company Permissions`);
  } else {
    console.log(`  ℹ️  CompanyPermissions already exist (${existingPerms}), skipping`);
  }

  // ===== 5. SEED WEBHOOK CONFIGS =====
  console.log("\n5. Creating Webhook Configs...");
  const existingWebhooks = await db.webhookConfig.count();

  if (existingWebhooks === 0) {
    const companies = await db.company.findMany({ where: { webCrmConnected: true } });
    for (const company of companies) {
      await db.webhookConfig.create({
        data: {
          companyId: company.id,
          name: `${company.name} CRM Webhook`,
          url: `https://${company.domain || company.slug + ".com"}/api/webhook/alolabs`,
          events: JSON.stringify(["agent.completed", "task.created", "approval.requested", "usage.logged"]),
          isActive: true,
        },
      });
    }
    console.log(`  ✅ Created ${companies.length} Webhook Configs`);
  } else {
    console.log(`  ℹ️  WebhookConfigs already exist (${existingWebhooks}), skipping`);
  }

  // ===== 6. SEED SAMPLE MEMORY =====
  console.log("\n6. Creating Sample Memory Records...");
  const existingMemory = await db.agentMemory.count();

  if (existingMemory === 0) {
    const memoryAgents = await db.agent.findMany({ take: 20, orderBy: { agentId: "asc" } });
    const memBatches: any[] = [];

    for (const agent of memoryAgents) {
      // 2-3 memories per agent
      for (let m = 0; m < 3; m++) {
        const categories = ["general", "learning", "correction", "pattern"];
        const temps = ["hot", "warm", "cold"];
        const contents = [
          `Learned that ${agent.departmentName} tasks require structured output format`,
          `Corrected: Previous approach to ${agent.purpose.split("for")[0]}was inefficient, optimized workflow`,
          `Pattern detected: Peak usage times for ${agent.departmentName} are 9-11 AM and 2-4 PM`,
          `Best practice: Always validate input schema before processing in ${agent.departmentName}`,
        ];
        memBatches.push({
          agentId: agent.id,
          category: categories[m % categories.length],
          content: contents[m % contents.length],
          temperature: temps[m % temps.length],
          successCount: Math.floor(Math.random() * 50) + 10,
          useCount: Math.floor(Math.random() * 100) + 20,
          promotedAt: m === 0 ? new Date() : null,
        });
      }
    }

    for (let i = 0; i < memBatches.length; i += 50) {
      await db.agentMemory.createMany({ data: memBatches.slice(i, i + 50) });
    }
    console.log(`  ✅ Created ${memBatches.length} Agent Memory records`);
  } else {
    console.log(`  ℹ️  AgentMemory already exists (${existingMemory}), skipping`);
  }

  // ===== FINAL SUMMARY =====
  console.log("\n" + "=".repeat(50));
  console.log("✅ SUPPLEMENTARY SEED COMPLETE");
  console.log("=".repeat(50));

  const finalCounts = {
    Skills: await db.skill.count(),
    WorkflowSteps: await db.workflowStep.count(),
    CompanyApiKeys: await db.companyApiKey.count(),
    CompanyPermissions: await db.companyPermission.count(),
    WebhookConfigs: await db.webhookConfig.count(),
    AgentMemory: await db.agentMemory.count(),
  };

  for (const [name, count] of Object.entries(finalCounts)) {
    console.log(`  ${name.padEnd(25)} ${count}`);
  }
}

async function hashKey(key: string): Promise<string> {
  // Simple hash for demo - in production use bcrypt
  const { createHash } = await import("crypto");
  return createHash("sha256").update(key).digest("hex");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());