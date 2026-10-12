// ==========================================================================
// ALO Labs AI-EOS — Master Enterprise Roadmap Data Module
// Founder: Al Aminn | alolabs.net | USA / Bangladesh
// 52-Week Plan · 6 Phases · 4 Parallel Streams · $250K Budget
// ==========================================================================

// ── Interfaces ───────────────────────────────────────────────────────────

export interface RoadmapTask {
  id: string;
  name: string;
  weeks: [number, number];
  status: "planned" | "in_progress" | "completed" | "blocked";
  assignee: string;
  deps: string[];
  percentComplete: number;
}

export interface RoadmapDeliverable {
  name: string;
  count?: number;
  unit?: string;
}

export interface RoadmapStream {
  id: string;
  name: string;
  icon: string;
  tasks: RoadmapTask[];
  deliverables: RoadmapDeliverable[];
}

export interface RoadmapMilestone {
  id: string;
  name: string;
  week: number;
  stream: string;
  type: "release" | "certification" | "revenue" | "technical";
  description: string;
  kpis: string[];
}

export interface RoadmapRisk {
  id: string;
  description: string;
  probability: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
  mitigation: string;
}

export interface RoadmapPhase {
  id: string;
  name: string;
  weekStart: number;
  weekEnd: number;
  description: string;
  color: string;
  streams: RoadmapStream[];
  milestones: RoadmapMilestone[];
  risks: RoadmapRisk[];
  budget: number;
}

// ── Stream Definitions ───────────────────────────────────────────────────

export const STREAM_DEFINITIONS = [
  {
    id: "platform",
    name: "Platform & Infrastructure",
    description:
      "Core AI-EOS platform built on Next.js 16, Bun, Prisma, SQLite, Redis. Covers hosting infra, API gateway, multi-tenant architecture, security, CI/CD, and the 12-division organizational backbone.",
  },
  {
    id: "ai-engine",
    name: "AI Engine & Agents",
    description:
      "Multi-model AI orchestration (Claude, GPT-4, Gemini, Llama, Mistral) with fine-tuned Bengali models, 100-department agent factory, RAG pipeline, DCC self-recovery, and 2000-agent scaling architecture.",
  },
  {
    id: "mobile",
    name: "Mobile Apps & UX",
    description:
      "Four Flutter mobile apps — Customer App, Admin App, Agent Management App, Reseller App — with Bengali/English/Hindi/Arabic i18n, offline-first sync, bKash/Nagad/SSLCommerz/Stripe payment integration.",
  },
  {
    id: "enterprise",
    name: "Enterprise & Go-to-Market",
    description:
      "9-criteria DCC certification pipeline, 100-department SOP framework, revenue engines (hosting, domains, ecommerce, AI services), Bangladesh-first GTM with global expansion, reseller network, and 1M-business target.",
  },
] as const;

// ── Roadmap Phases ───────────────────────────────────────────────────────

export const ROADMAP_PHASES: RoadmapPhase[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 1 — FOUNDATION (Weeks 1-8) · $40,000
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "phase-1-foundation",
    name: "Phase 1: Foundation",
    weekStart: 1,
    weekEnd: 8,
    description:
      "Lay the technical, organizational, and AI infrastructure groundwork. Deploy core platform scaffolding, onboard foundational AI models, begin Flutter app shells, and establish DCC certification framework with first 10 department SOPs.",
    color: "#3B82F6",
    budget: 40_000,
    streams: [
      {
        id: "p1-platform",
        name: "Platform & Infrastructure",
        icon: "server",
        tasks: [
          {
            id: "P1-PL-001",
            name: "Bootstrap Next.js 16 monorepo with Bun runtime and Turborepo",
            weeks: [1, 2],
            status: "planned",
            assignee: "Core Platform Team",
            deps: [],
            percentComplete: 0,
          },
          {
            id: "P1-PL-002",
            name: "Configure Prisma ORM with SQLite (dev) and PostgreSQL (prod) adapters",
            weeks: [2, 3],
            status: "planned",
            assignee: "Core Platform Team",
            deps: ["P1-PL-001"],
            percentComplete: 0,
          },
          {
            id: "P1-PL-003",
            name: "Deploy Redis cache layer with session management and rate limiting",
            weeks: [3, 4],
            status: "planned",
            assignee: "Infrastructure Team",
            deps: ["P1-PL-002"],
            percentComplete: 0,
          },
          {
            id: "P1-PL-004",
            name: "Build multi-tenant API gateway with per-division routing (12 divisions)",
            weeks: [4, 6],
            status: "planned",
            assignee: "Core Platform Team",
            deps: ["P1-PL-002"],
            percentComplete: 0,
          },
          {
            id: "P1-PL-005",
            name: "Implement JWT + refresh-token auth with role-based access (RBAC)",
            weeks: [5, 6],
            status: "planned",
            assignee: "Security Team",
            deps: ["P1-PL-003"],
            percentComplete: 0,
          },
          {
            id: "P1-PL-006",
            name: "Set up CI/CD pipeline with GitHub Actions, Bun test runner, staging env",
            weeks: [6, 8],
            status: "planned",
            assignee: "DevOps Team",
            deps: ["P1-PL-004"],
            percentComplete: 0,
          },
          {
            id: "P1-PL-007",
            name: "Deploy MinIO S3-compatible object storage for file uploads and media",
            weeks: [7, 8],
            status: "planned",
            assignee: "Infrastructure Team",
            deps: ["P1-PL-003"],
            percentComplete: 0,
          },
        ],
        deliverables: [
          { name: "Next.js 16 Monorepo", count: 1, unit: "repo" },
          { name: "API Gateway with 12 Division Routes", count: 12, unit: "routes" },
          { name: "CI/CD Pipeline", count: 1, unit: "pipeline" },
          { name: "Staging Environment", count: 1, unit: "env" },
        ],
      },
      {
        id: "p1-ai-engine",
        name: "AI Engine & Agents",
        icon: "brain",
        tasks: [
          {
            id: "P1-AI-001",
            name: "Integrate Claude API, GPT-4o, and Gemini Pro as primary LLM providers",
            weeks: [1, 3],
            status: "planned",
            assignee: "AI Engineering Team",
            deps: [],
            percentComplete: 0,
          },
          {
            id: "P1-AI-002",
            name: "Deploy Ollama runtime for local Llama 3.1 and Mistral 7B inference",
            weeks: [2, 4],
            status: "planned",
            assignee: "AI Infrastructure Team",
            deps: [],
            percentComplete: 0,
          },
          {
            id: "P1-AI-003",
            name: "Build AI Router with fallback chain: Claude → GPT-4 → Gemini → local model",
            weeks: [3, 5],
            status: "planned",
            assignee: "AI Engineering Team",
            deps: ["P1-AI-001", "P1-AI-002"],
            percentComplete: 0,
          },
          {
            id: "P1-AI-004",
            name: "Collect and curate 50K Bengali domain-specific training sentences",
            weeks: [3, 6],
            status: "planned",
            assignee: "Data Team",
            deps: [],
            percentComplete: 0,
          },
          {
            id: "P1-AI-005",
            name: "Fine-tune Bengali customer-support model on Llama 3.1-8B (LoRA QLoRA)",
            weeks: [5, 8],
            status: "planned",
            assignee: "AI Research Team",
            deps: ["P1-AI-002", "P1-AI-004"],
            percentComplete: 0,
          },
          {
            id: "P1-AI-006",
            name: "Implement RAG pipeline with Qdrant vector DB and embedding generation",
            weeks: [4, 7],
            status: "planned",
            assignee: "AI Engineering Team",
            deps: ["P1-AI-003"],
            percentComplete: 0,
          },
          {
            id: "P1-AI-007",
            name: "Design agent factory schema for 100 departments with prompt templates",
            weeks: [6, 8],
            status: "planned",
            assignee: "AI Architecture Team",
            deps: ["P1-AI-003"],
            percentComplete: 0,
          },
        ],
        deliverables: [
          { name: "Integrated LLM Providers", count: 3, unit: "providers" },
          { name: "Local Model Inference (Ollama)", count: 2, unit: "models" },
          { name: "Bengali Training Dataset", count: 50_000, unit: "sentences" },
          { name: "Fine-tuned Bengali Model v0.1", count: 1, unit: "model" },
        ],
      },
      {
        id: "p1-mobile",
        name: "Mobile Apps & UX",
        icon: "smartphone",
        tasks: [
          {
            id: "P1-MO-001",
            name: "Scaffold 4 Flutter apps with shared core package (auth, networking, theming)",
            weeks: [1, 3],
            status: "planned",
            assignee: "Mobile Team",
            deps: [],
            percentComplete: 0,
          },
          {
            id: "P1-MO-002",
            name: "Implement i18n layer with Bengali (bn), English (en), Hindi (hi), Arabic (ar)",
            weeks: [2, 4],
            status: "planned",
            assignee: "Mobile Team",
            deps: ["P1-MO-001"],
            percentComplete: 0,
          },
          {
            id: "P1-MO-003",
            name: "Build Customer App shell: onboarding, login, dashboard skeleton",
            weeks: [3, 5],
            status: "planned",
            assignee: "Mobile Team",
            deps: ["P1-MO-002"],
            percentComplete: 0,
          },
          {
            id: "P1-MO-004",
            name: "Build Admin App shell: division selector, KPI cards, user management list",
            weeks: [4, 6],
            status: "planned",
            assignee: "Mobile Team",
            deps: ["P1-MO-002"],
            percentComplete: 0,
          },
          {
            id: "P1-MO-005",
            name: "Integrate bKash and Nagad payment SDKs into Customer App",
            weeks: [5, 7],
            status: "planned",
            assignee: "Payments Team",
            deps: ["P1-MO-003"],
            percentComplete: 0,
          },
          {
            id: "P1-MO-006",
            name: "Implement offline-first sync with Isar DB and background queue",
            weeks: [6, 8],
            status: "planned",
            assignee: "Mobile Team",
            deps: ["P1-MO-003"],
            percentComplete: 0,
          },
        ],
        deliverables: [
          { name: "Flutter App Shells", count: 4, unit: "apps" },
          { name: "Supported Languages", count: 4, unit: "locales" },
          { name: "bKash Payment Integration", count: 1, unit: "integration" },
          { name: "Nagad Payment Integration", count: 1, unit: "integration" },
        ],
      },
      {
        id: "p1-enterprise",
        name: "Enterprise & Go-to-Market",
        icon: "briefcase",
        tasks: [
          {
            id: "P1-EN-001",
            name: "Define SOP templates for first 10 departments (Sales, Support, Finance, HR, Engineering, Marketing, Legal, Operations, Product, QA)",
            weeks: [1, 4],
            status: "planned",
            assignee: "Operations Team",
            deps: [],
            percentComplete: 0,
          },
          {
            id: "P1-EN-002",
            name: "Build DCC certification scoring engine (SOP≥95%, Knowledge≥95%, Skills≥95%, Test≥95%, KPI≥90%, Security=100%, Audit=100%, Self-Recovery≥90%, Escalation≤10%)",
            weeks: [3, 6],
            status: "planned",
            assignee: "Quality Team",
            deps: ["P1-EN-001"],
            percentComplete: 0,
          },
          {
            id: "P1-EN-003",
            name: "Integrate SSLCommerz merchant gateway for ecommerce and subscription billing",
            weeks: [4, 6],
            status: "planned",
            assignee: "Payments Team",
            deps: [],
            percentComplete: 0,
          },
          {
            id: "P1-EN-004",
            name: "Create reseller tier structure (Bronze/Silver/Gold/Platinum) with commission matrix",
            weeks: [5, 7],
            status: "planned",
            assignee: "Business Team",
            deps: [],
            percentComplete: 0,
          },
          {
            id: "P1-EN-005",
            name: "Onboard first 50 beta businesses from Bangladesh SMB market",
            weeks: [6, 8],
            status: "planned",
            assignee: "Sales Team",
            deps: ["P1-EN-003"],
            percentComplete: 0,
          },
        ],
        deliverables: [
          { name: "Department SOPs Drafted", count: 10, unit: "departments" },
          { name: "DCC Scoring Engine v0.1", count: 1, unit: "engine" },
          { name: "SSLCommerz Integration", count: 1, unit: "gateway" },
          { name: "Beta Businesses Onboarded", count: 50, unit: "businesses" },
        ],
      },
    ],
    milestones: [
      {
        id: "M1-001",
        name: "Platform MVP Live on Staging",
        week: 4,
        stream: "platform",
        type: "release",
        description: "Next.js 16 monorepo with Prisma, Redis, and 12-division API routes deployed to staging environment.",
        kpis: ["All 12 division routes responding", "Prisma migrations passing", "Redis session store operational"],
      },
      {
        id: "M1-002",
        name: "Multi-Model AI Router Operational",
        week: 5,
        stream: "ai-engine",
        type: "technical",
        description: "Claude, GPT-4, Gemini, and local Llama/Mistral models accessible through unified AI Router with automatic fallback.",
        kpis: ["4 providers connected", "Fallback latency < 2s", "Bengali model fine-tuning started"],
      },
      {
        id: "M1-003",
        name: "Customer App First Build on TestFlight/Internal",
        week: 6,
        stream: "mobile",
        type: "release",
        description: "Customer App with Bengali/English UI, bKash payment flow, and offline sync capability available for internal testing.",
        kpis: ["4 language locales working", "bKash sandbox payment succeeds", "Offline data syncs on reconnect"],
      },
      {
        id: "M1-004",
        name: "First 50 Beta Businesses Onboarded",
        week: 8,
        stream: "enterprise",
        type: "revenue",
        description: "50 Bangladesh SMBs actively using AI-EOS with at least web hosting or AI service subscription.",
        kpis: ["50 active business accounts", "$5K MRR from beta", "NPS score ≥ 7"],
      },
      {
        id: "M1-005",
        name: "DCC Framework v0.1 with 9 Criteria Defined",
        week: 7,
        stream: "enterprise",
        type: "certification",
        description: "Automated DCC scoring engine evaluates agents against all 9 certification criteria with dashboard reporting.",
        kpis: ["9 criteria scores calculated", "10 department SOPs loaded", "Audit trail logging enabled"],
      },
    ],
    risks: [
      {
        id: "R1-001",
        description: "Bun runtime instability with Next.js 16 edge cases in production may cause unexpected build failures.",
        probability: "medium",
        impact: "high",
        mitigation: "Maintain Node.js fallback in CI; pin Bun version; allocate 1 sprint buffer for runtime issues.",
      },
      {
        id: "R1-002",
        description: "Bengali training data quality insufficient for fine-tuned model to reach production-grade accuracy.",
        probability: "medium",
        impact: "medium",
        mitigation: "Partner with Bengali NLP researchers; use back-translation augmentation; validate with native speaker QA panel of 10+ reviewers.",
      },
      {
        id: "R1-003",
        description: "bKash/Nagad sandbox environments unreliable during integration testing, blocking payment flow.",
        probability: "high",
        impact: "medium",
        mitigation: "Build payment abstraction layer with mock providers; schedule bKash/Nagad technical calls early; prepare SSLCommerz as interim fallback.",
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 2 — MOBILE LAUNCH (Weeks 9-16) · $50,000
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "phase-2-mobile-launch",
    name: "Phase 2: Mobile Launch",
    weekStart: 9,
    weekEnd: 16,
    description:
      "Ship all 4 Flutter apps to production stores. Complete payment integrations (bKash, Nagad, SSLCommerz, Stripe). Deploy 100 AI agents across first 25 departments. Achieve DCC certification for pilot departments.",
    color: "#10B981",
    budget: 50_000,
    streams: [
      {
        id: "p2-platform",
        name: "Platform & Infrastructure",
        icon: "server",
        tasks: [
          {
            id: "P2-PL-001",
            name: "Implement WebSocket real-time event bus for agent-to-dashboard communication",
            weeks: [9, 11],
            status: "planned",
            assignee: "Core Platform Team",
            deps: ["P1-PL-004"],
            percentComplete: 0,
          },
          {
            id: "P2-PL-002",
            name: "Build Stripe Connect integration for global subscription and marketplace payments",
            weeks: [10, 12],
            status: "planned",
            assignee: "Payments Team",
            deps: ["P1-EN-003"],
            percentComplete: 0,
          },
          {
            id: "P2-PL-003",
            name: "Deploy production Kubernetes cluster with auto-scaling (2-8 pods) and monitoring",
            weeks: [11, 14],
            status: "planned",
            assignee: "DevOps Team",
            deps: ["P1-PL-006"],
            percentComplete: 0,
          },
          {
            id: "P2-PL-004",
            name: "Implement multi-region CDN with Bangladesh edge node (Dhaka) and US primary",
            weeks: [12, 14],
            status: "planned",
            assignee: "Infrastructure Team",
            deps: ["P1-PL-007"],
            percentComplete: 0,
          },
          {
            id: "P2-PL-005",
            name: "Build audit logging system with tamper-proof signed entries for DCC Audit=100% criterion",
            weeks: [13, 15],
            status: "planned",
            assignee: "Security Team",
            deps: ["P1-PL-005"],
            percentComplete: 0,
          },
          {
            id: "P2-PL-006",
            name: "Implement end-to-end encryption for all inter-agent and agent-customer communications",
            weeks: [14, 16],
            status: "planned",
            assignee: "Security Team",
            deps: ["P2-PL-005"],
            percentComplete: 0,
          },
        ],
        deliverables: [
          { name: "WebSocket Event Bus", count: 1, unit: "service" },
          { name: "Stripe Connect Integration", count: 1, unit: "gateway" },
          { name: "Production K8s Cluster", count: 1, unit: "cluster" },
          { name: "Bangladesh Edge Node", count: 1, unit: "node" },
        ],
      },
      {
        id: "p2-ai-engine",
        name: "AI Engine & Agents",
        icon: "brain",
        tasks: [
          {
            id: "P2-AI-001",
            name: "Deploy first 100 AI agents across 25 departments (4 agents/department avg)",
            weeks: [9, 12],
            status: "planned",
            assignee: "AI Engineering Team",
            deps: ["P1-AI-007", "P1-AI-006"],
            percentComplete: 0,
          },
          {
            id: "P2-AI-002",
            name: "Implement agent self-recovery system (auto-retry, prompt correction, context reset)",
            weeks: [10, 13],
            status: "planned",
            assignee: "AI Engineering Team",
            deps: ["P2-AI-001"],
            percentComplete: 0,
          },
          {
            id: "P2-AI-003",
            name: "Build agent-to-agent communication protocol for cross-department workflows",
            weeks: [11, 14],
            status: "planned",
            assignee: "AI Architecture Team",
            deps: ["P2-AI-001", "P2-PL-001"],
            percentComplete: 0,
          },
          {
            id: "P2-AI-004",
            name: "Create knowledge base ingestion pipeline (PDF, DOCX, web scrape → Qdrant embeddings)",
            weeks: [12, 15],
            status: "planned",
            assignee: "Data Team",
            deps: ["P1-AI-006"],
            percentComplete: 0,
          },
          {
            id: "P2-AI-005",
            name: "Implement escalation engine with ≤10% target (auto-escalation rules, human handoff)",
            weeks: [13, 15],
            status: "planned",
            assignee: "AI Engineering Team",
            deps: ["P2-AI-002"],
            percentComplete: 0,
          },
          {
            id: "P2-AI-006",
            name: "Run DCC certification for first 25 departments against all 9 DCC criteria",
            weeks: [14, 16],
            status: "planned",
            assignee: "Quality Team",
            deps: ["P2-AI-002", "P2-AI-005", "P1-EN-002"],
            percentComplete: 0,
          },
          {
            id: "P2-AI-007",
            name: "Benchmark Bengali model v0.2 against GPT-4 Bengali on 500 test conversations",
            weeks: [15, 16],
            status: "planned",
            assignee: "AI Research Team",
            deps: ["P1-AI-005"],
            percentComplete: 0,
          },
        ],
        deliverables: [
          { name: "Production AI Agents", count: 100, unit: "agents" },
          { name: "Departments Covered", count: 25, unit: "departments" },
          { name: "Knowledge Base Documents Ingested", count: 5_000, unit: "documents" },
          { name: "DCC-Certified Departments", count: 25, unit: "departments" },
        ],
      },
      {
        id: "p2-mobile",
        name: "Mobile Apps & UX",
        icon: "smartphone",
        tasks: [
          {
            id: "P2-MO-001",
            name: "Complete Customer App: service catalog, order placement, chat with AI agents, order tracking",
            weeks: [9, 11],
            status: "planned",
            assignee: "Mobile Team",
            deps: ["P1-MO-003", "P1-MO-005"],
            percentComplete: 0,
          },
          {
            id: "P2-MO-002",
            name: "Complete Admin App: department dashboards, agent monitoring, KPI widgets, approval queue",
            weeks: [9, 12],
            status: "planned",
            assignee: "Mobile Team",
            deps: ["P1-MO-004"],
            percentComplete: 0,
          },
          {
            id: "P2-MO-003",
            name: "Build Agent Management App: agent config, performance view, escalation handling, live logs",
            weeks: [10, 13],
            status: "planned",
            assignee: "Mobile Team",
            deps: ["P2-AI-001"],
            percentComplete: 0,
          },
          {
            id: "P2-MO-004",
            name: "Build Reseller App: client management, commission dashboard, white-label settings",
            weeks: [11, 14],
            status: "planned",
            assignee: "Mobile Team",
            deps: ["P1-EN-004"],
            percentComplete: 0,
          },
          {
            id: "P2-MO-005",
            name: "Implement push notifications (FCM) for order updates, agent alerts, and DCC events",
            weeks: [12, 14],
            status: "planned",
            assignee: "Mobile Team",
            deps: ["P2-MO-001", "P2-MO-002"],
            percentComplete: 0,
          },
          {
            id: "P2-MO-006",
            name: "Submit all 4 apps to Google Play Store and Apple App Store with Bangladesh targeting",
            weeks: [14, 16],
            status: "planned",
            assignee: "Mobile Team",
            deps: ["P2-MO-001", "P2-MO-002", "P2-MO-003", "P2-MO-004"],
            percentComplete: 0,
          },
        ],
        deliverables: [
          { name: "Apps Published to Stores", count: 4, unit: "apps" },
          { name: "Push Notification Channels", count: 3, unit: "channels" },
          { name: "App Store Rating Target", count: 4.5, unit: "stars" },
          { name: "First-week Downloads Target", count: 5_000, unit: "downloads" },
        ],
      },
      {
        id: "p2-enterprise",
        name: "Enterprise & Go-to-Market",
        icon: "briefcase",
        tasks: [
          {
            id: "P2-EN-001",
            name: "Launch web hosting reseller program with automated cPanel/WHM provisioning",
            weeks: [9, 11],
            status: "planned",
            assignee: "Product Team",
            deps: ["P1-EN-004"],
            percentComplete: 0,
          },
          {
            id: "P2-EN-002",
            name: "Deploy domain registration automation with .com/.net/.bd/.org support",
            weeks: [10, 12],
            status: "planned",
            assignee: "Product Team",
            deps: ["P2-EN-001"],
            percentComplete: 0,
          },
          {
            id: "P2-EN-003",
            name: "Execute Bangladesh digital marketing campaign (Facebook, YouTube, local influencers)",
            weeks: [11, 16],
            status: "planned",
            assignee: "Marketing Team",
            deps: [],
            percentComplete: 0,
          },
          {
            id: "P2-EN-004",
            name: "Onboard 20 reseller partners across Dhaka, Chittagong, and Sylhet",
            weeks: [12, 15],
            status: "planned",
            assignee: "Sales Team",
            deps: ["P1-EN-004"],
            percentComplete: 0,
          },
          {
            id: "P2-EN-005",
            name: "Publish 100 department SOP documentation with version control and approval workflow",
            weeks: [13, 16],
            status: "planned",
            assignee: "Operations Team",
            deps: ["P1-EN-001"],
            percentComplete: 0,
          },
          {
            id: "P2-EN-006",
            name: "Achieve $15K MRR from combined hosting, domains, ecommerce, and AI services",
            weeks: [15, 16],
            status: "planned",
            assignee: "Business Team",
            deps: ["P2-EN-001", "P2-EN-002", "P2-EN-003"],
            percentComplete: 0,
          },
        ],
        deliverables: [
          { name: "Reseller Partners Active", count: 20, unit: "partners" },
          { name: "Department SOPs Published", count: 100, unit: "SOPs" },
          { name: "Monthly Recurring Revenue", count: 15_000, unit: "USD" },
          { name: "Active Business Customers", count: 200, unit: "businesses" },
        ],
      },
    ],
    milestones: [
      {
        id: "M2-001",
        name: "All 4 Flutter Apps Live on Stores",
        week: 16,
        stream: "mobile",
        type: "release",
        description: "Customer App, Admin App, Agent Management App, and Reseller App published to Google Play and Apple App Store with Bangladesh market targeting.",
        kpis: ["4 apps approved", "5,000+ downloads week-1", "App crash rate < 1%"],
      },
      {
        id: "M2-002",
        name: "100 AI Agents Deployed in Production",
        week: 12,
        stream: "ai-engine",
        type: "technical",
        description: "First 100 AI agents serving real customer requests across 25 departments with measurable response quality.",
        kpis: ["100 agents active", "Avg response time < 3s", "Customer satisfaction ≥ 4.0/5"],
      },
      {
        id: "M2-003",
        name: "DCC Certification Passed for 25 Departments",
        week: 16,
        stream: "enterprise",
        type: "certification",
        description: "25 of 100 departments pass all 9 DCC criteria (SOP≥95%, Knowledge≥95%, Skills≥95%, Test≥95%, KPI≥90%, Security=100%, Audit=100%, Self-Recovery≥90%, Escalation≤10%).",
        kpis: ["25 departments certified", "9/9 criteria met per dept", "Zero critical audit findings"],
      },
      {
        id: "M2-004",
        name: "$15K MRR Milestone Reached",
        week: 16,
        stream: "enterprise",
        type: "revenue",
        description: "Combined revenue from web hosting, domain registration, ecommerce, and AI service subscriptions reaches $15K monthly recurring.",
        kpis: ["$15K MRR", "200 active businesses", "20 reseller partners generating revenue"],
      },
      {
        id: "M2-005",
        name: "Production Infrastructure Hardened",
        week: 14,
        stream: "platform",
        type: "technical",
        description: "K8s cluster with auto-scaling, Bangladesh CDN edge node, Stripe + bKash + Nagad + SSLCommerz payments, and E2E encryption all operational in production.",
        kpis: ["99.9% uptime SLA", "P95 latency < 200ms (BD)", "4 payment gateways live"],
      },
    ],
    risks: [
      {
        id: "R2-001",
        description: "App Store review rejection due to payment gateway policy violations (bKash/Nagad not standard iOS SDKs).",
        probability: "medium",
        impact: "high",
        mitigation: "Use WebView fallback for bKash/Nagad; pre-submit app for expedited review; maintain rejection response template and resubmission plan within 48 hours.",
      },
      {
        id: "R2-002",
        description: "100-agent deployment overwhelms Redis memory and Prisma connection pool under concurrent load.",
        probability: "medium",
        impact: "high",
        mitigation: "Implement connection pooling with PgBouncer; set Redis maxmemory policy; load-test with 500 concurrent agent sessions before go-live.",
      },
      {
        id: "R2-003",
        description: "Bangladesh marketing campaign fails to convert free trials to paid due to price sensitivity.",
        probability: "medium",
        impact: "medium",
        mitigation: "Offer freemium tier with 3 agents free; provide BD-specific pricing in BDT; partner with local business associations for trusted referrals.",
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 3 — AI ARMY SCALE (Weeks 17-24) · $55,000
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "phase-3-ai-army-scale",
    name: "Phase 3: AI Army Scale",
    weekStart: 17,
    weekEnd: 24,
    description:
      "Scale from 100 to 500 AI agents. Deploy Bengali model v1.0 to production. Build agent marketplace. Expand to 50 departments with DCC certification. Launch ecommerce AI storefront builder.",
    color: "#8B5CF6",
    budget: 55_000,
    streams: [
      {
        id: "p3-platform",
        name: "Platform & Infrastructure",
        icon: "server",
        tasks: [
          {
            id: "P3-PL-001",
            name: "Implement horizontal agent scaling with Redis pub/sub message queue (BullMQ)",
            weeks: [17, 19],
            status: "planned",
            assignee: "Core Platform Team",
            deps: ["P2-PL-001"],
            percentComplete: 0,
          },
          {
            id: "P3-PL-002",
            name: "Build multi-tenant data isolation with row-level security and encrypted at-rest storage",
            weeks: [17, 20],
            status: "planned",
            assignee: "Security Team",
            deps: ["P2-PL-006"],
            percentComplete: 0,
          },
          {
            id: "P3-PL-003",
            name: "Deploy GPU inference server (A100 80GB) for local Llama 3.1-70B production inference",
            weeks: [18, 21],
            status: "planned",
            assignee: "AI Infrastructure Team",
            deps: ["P1-AI-002"],
            percentComplete: 0,
          },
          {
            id: "P3-PL-004",
            name: "Build agent marketplace backend (listing, rating, versioning, deployment pipeline)",
            weeks: [19, 22],
            status: "planned",
            assignee: "Platform Team",
            deps: ["P3-PL-001"],
            percentComplete: 0,
          },
          {
            id: "P3-PL-005",
            name: "Implement observability stack (Prometheus, Grafana, Loki) with agent-specific metrics",
            weeks: [20, 23],
            status: "planned",
            assignee: "DevOps Team",
            deps: ["P2-PL-003"],
            percentComplete: 0,
          },
          {
            id: "P3-PL-006",
            name: "Build automated backup and disaster recovery (RPO < 1hr, RTO < 4hr)",
            weeks: [22, 24],
            status: "planned",
            assignee: "Infrastructure Team",
            deps: ["P3-PL-002"],
            percentComplete: 0,
          },
        ],
        deliverables: [
          { name: "Agent Message Queue Throughput", count: 10_000, unit: "msgs/sec" },
          { name: "GPU Inference Server", count: 1, unit: "server" },
          { name: "Agent Marketplace Backend", count: 1, unit: "service" },
          { name: "Grafana Dashboards", count: 12, unit: "dashboards" },
        ],
      },
      {
        id: "p3-ai-engine",
        name: "AI Engine & Agents",
        icon: "brain",
        tasks: [
          {
            id: "P3-AI-001",
            name: "Scale to 500 AI agents across 50 departments (10 agents/department avg)",
            weeks: [17, 20],
            status: "planned",
            assignee: "AI Engineering Team",
            deps: ["P2-AI-001", "P3-PL-001"],
            percentComplete: 0,
          },
          {
            id: "P3-AI-002",
            name: "Deploy Bengali model v1.0 (Llama 3.1-8B fine-tuned on 200K sentences) to production",
            weeks: [17, 20],
            status: "planned",
            assignee: "AI Research Team",
            deps: ["P1-AI-005", "P3-PL-003"],
            percentComplete: 0,
          },
          {
            id: "P3-AI-003",
            name: "Build AI-powered ecommerce storefront generator (product descriptions, images, SEO in Bengali)",
            weeks: [18, 22],
            status: "planned",
            assignee: "AI Engineering Team",
            deps: ["P3-AI-002"],
            percentComplete: 0,
          },
          {
            id: "P3-AI-004",
            name: "Implement agent skill testing framework with automated pass/fail scoring (≥95% target)",
            weeks: [19, 22],
            status: "planned",
            assignee: "Quality Team",
            deps: ["P3-AI-001"],
            percentComplete: 0,
          },
          {
            id: "P3-AI-005",
            name: "Build agent performance analytics: response quality, latency percentiles, cost per interaction",
            weeks: [20, 23],
            status: "planned",
            assignee: "Data Team",
            deps: ["P3-AI-001", "P3-PL-005"],
            percentComplete: 0,
          },
          {
            id: "P3-AI-006",
            name: "DCC certify remaining 25 departments (total 50 of 100)",
            weeks: [21, 24],
            status: "planned",
            assignee: "Quality Team",
            deps: ["P3-AI-004", "P2-AI-006"],
            percentComplete: 0,
          },
          {
            id: "P3-AI-007",
            name: "Fine-tune Hindi customer-support model (Llama 3.1-8B on 100K Hindi sentences)",
            weeks: [22, 24],
            status: "planned",
            assignee: "AI Research Team",
            deps: ["P3-PL-003"],
            percentComplete: 0,
          },
          {
            id: "P3-AI-008",
            name: "Build agent versioning and A/B testing framework for prompt iterations",
            weeks: [23, 24],
            status: "planned",
            assignee: "AI Architecture Team",
            deps: ["P3-AI-001"],
            percentComplete: 0,
          },
        ],
        deliverables: [
          { name: "Production AI Agents", count: 500, unit: "agents" },
          { name: "Departments DCC-Certified", count: 50, unit: "departments" },
          { name: "Bengali Model v1.0 in Production", count: 1, unit: "model" },
          { name: "Ecommerce Storefronts Generated", count: 500, unit: "stores" },
        ],
      },
      {
        id: "p3-mobile",
        name: "Mobile Apps & UX",
        icon: "smartphone",
        tasks: [
          {
            id: "P3-MO-001",
            name: "Add AI chat interface with voice input/output in Bengali and English to Customer App",
            weeks: [17, 19],
            status: "planned",
            assignee: "Mobile Team",
            deps: ["P2-MO-001", "P3-AI-002"],
            percentComplete: 0,
          },
          {
            id: "P3-MO-002",
            name: "Build in-app ecommerce store builder with AI-generated product listings",
            weeks: [18, 21],
            status: "planned",
            assignee: "Mobile Team",
            deps: ["P3-AI-003"],
            percentComplete: 0,
          },
          {
            id: "P3-MO-003",
            name: "Add agent marketplace browsing and one-tap deployment in Reseller App",
            weeks: [19, 22],
            status: "planned",
            assignee: "Mobile Team",
            deps: ["P3-PL-004"],
            percentComplete: 0,
          },
          {
            id: "P3-MO-004",
            name: "Implement real-time agent monitoring with live transcript view in Agent Management App",
            weeks: [20, 23],
            status: "planned",
            assignee: "Mobile Team",
            deps: ["P2-MO-003", "P3-PL-005"],
            percentComplete: 0,
          },
          {
            id: "P3-MO-005",
            name: "Add Arabic locale support and RTL layout to all 4 apps",
            weeks: [21, 24],
            status: "planned",
            assignee: "Mobile Team",
            deps: ["P1-MO-002"],
            percentComplete: 0,
          },
        ],
        deliverables: [
          { name: "Voice Chat Languages", count: 2, unit: "languages" },
          { name: "RTL Layout Support", count: 1, unit: "feature" },
          { name: "In-App Store Builder", count: 1, unit: "feature" },
          { name: "App Downloads Target", count: 25_000, unit: "downloads" },
        ],
      },
      {
        id: "p3-enterprise",
        name: "Enterprise & Go-to-Market",
        icon: "briefcase",
        tasks: [
          {
            id: "P3-EN-001",
            name: "Launch AI-powered ecommerce hosting plan with automated store setup ($29/mo tier)",
            weeks: [17, 19],
            status: "planned",
            assignee: "Product Team",
            deps: ["P3-AI-003", "P2-EN-001"],
            percentComplete: 0,
          },
          {
            id: "P3-EN-002",
            name: "Expand reseller network to 50 partners across 8 Bangladesh divisions",
            weeks: [18, 22],
            status: "planned",
            assignee: "Sales Team",
            deps: ["P2-EN-004"],
            percentComplete: 0,
          },
          {
            id: "P3-EN-003",
            name: "Publish case studies from first 10 successful beta businesses (web + AI metrics)",
            weeks: [19, 21],
            status: "planned",
            assignee: "Marketing Team",
            deps: ["P2-EN-006"],
            percentComplete: 0,
          },
          {
            id: "P3-EN-004",
            name: "Deploy enterprise sales team targeting Bangladesh mid-market (50-500 employees)",
            weeks: [20, 24],
            status: "planned",
            assignee: "Sales Team",
            deps: ["P3-EN-003"],
            percentComplete: 0,
          },
          {
            id: "P3-EN-005",
            name: "Achieve $35K MRR with 500 active business customers",
            weeks: [22, 24],
            status: "planned",
            assignee: "Business Team",
            deps: ["P3-EN-001", "P3-EN-002"],
            percentComplete: 0,
          },
          {
            id: "P3-EN-006",
            name: "Complete SOP documentation and knowledge base for all 100 departments",
            weeks: [21, 24],
            status: "planned",
            assignee: "Operations Team",
            deps: ["P2-EN-005"],
            percentComplete: 0,
          },
        ],
        deliverables: [
          { name: "Reseller Partners", count: 50, unit: "partners" },
          { name: "Active Business Customers", count: 500, unit: "businesses" },
          { name: "Monthly Recurring Revenue", count: 35_000, unit: "USD" },
          { name: "Published Case Studies", count: 10, unit: "studies" },
          { name: "Department SOPs Complete", count: 100, unit: "SOPs" },
        ],
      },
    ],
    milestones: [
      {
        id: "M3-001",
        name: "500 AI Agents in Production",
        week: 20,
        stream: "ai-engine",
        type: "technical",
        description: "500 AI agents actively serving customers across 50 departments with DCC certification tracking.",
        kpis: ["500 agents active", "P95 response latency < 2s", "Self-recovery rate ≥ 90%"],
      },
      {
        id: "M3-002",
        name: "Bengali Model v1.0 Production Deploy",
        week: 20,
        stream: "ai-engine",
        type: "release",
        description: "Fine-tuned Llama 3.1-8B Bengali model serving production traffic with 200K training sentences, achieving ≥ 92% Bengali conversation accuracy.",
        kpis: ["200K training sentences", "Bengali accuracy ≥ 92%", "Inference latency < 500ms"],
      },
      {
        id: "M3-003",
        name: "Agent Marketplace Backend Live",
        week: 22,
        stream: "platform",
        type: "release",
        description: "Agent marketplace with listing, versioning, rating, and one-tap deployment pipeline available for resellers and enterprise clients.",
        kpis: ["50+ marketplace listings", "Deployment time < 60s", "Rating system operational"],
      },
      {
        id: "M3-004",
        name: "$35K MRR with 500 Customers",
        week: 24,
        stream: "enterprise",
        type: "revenue",
        description: "Revenue milestone driven by ecommerce hosting, AI services, and reseller channel expansion across Bangladesh.",
        kpis: ["$35K MRR", "500 active businesses", "50 reseller partners", "Churn < 5%"],
      },
      {
        id: "M3-005",
        name: "50 Departments DCC Certified",
        week: 24,
        stream: "enterprise",
        type: "certification",
        description: "Half of all 100 departments achieve full DCC certification across all 9 criteria.",
        kpis: ["50/100 departments certified", "Avg SOP score ≥ 96%", "Escalation rate ≤ 8%"],
      },
    ],
    risks: [
      {
        id: "R3-001",
        description: "GPU server cost (A100 80GB) exceeds budget at $2,500/mo, forcing model downgrades.",
        probability: "high",
        impact: "high",
        mitigation: "Negotiate annual discount with cloud provider; use spot instances for batch fine-tuning; deploy quantized (4-bit) models for inference to reduce VRAM needs.",
      },
      {
        id: "R3-002",
        description: "Agent quality degrades as count scales from 100 to 500 due to prompt collision and context window limits.",
        probability: "medium",
        impact: "high",
        mitigation: "Implement department-scoped prompt namespaces; use RAG to reduce context injection; deploy per-department fine-tuned models rather than one-size-fits-all.",
      },
      {
        id: "R3-003",
        description: "Ecommerce storefront generator produces low-quality Bengali product descriptions hurting brand trust.",
        probability: "medium",
        impact: "medium",
        mitigation: "Implement human-in-the-loop review for first 100 stores; add quality scoring model; allow merchants to edit AI output before publishing.",
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 4 — ENTERPRISE HARDENING (Weeks 25-32) · $40,000
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "phase-4-enterprise-hardening",
    name: "Phase 4: Enterprise Hardening",
    weekStart: 25,
    weekEnd: 32,
    description:
      "Achieve SOC 2 Type I readiness. Scale to 1000 agents across all 100 departments. Full DCC certification. Enterprise SLA guarantees. Begin India and Middle East market entry.",
    color: "#F59E0B",
    budget: 40_000,
    streams: [
      {
        id: "p4-platform",
        name: "Platform & Infrastructure",
        icon: "server",
        tasks: [
          {
            id: "P4-PL-001",
            name: "Implement SOC 2 Type I compliance controls (access logging, encryption, incident response)",
            weeks: [25, 28],
            status: "planned",
            assignee: "Security Team",
            deps: ["P3-PL-002", "P2-PL-005"],
            percentComplete: 0,
          },
          {
            id: "P4-PL-002",
            name: "Build enterprise API rate limiting and quota management per tenant",
            weeks: [25, 27],
            status: "planned",
            assignee: "Core Platform Team",
            deps: ["P3-PL-001"],
            percentComplete: 0,
          },
          {
            id: "P4-PL-003",
            name: "Deploy multi-region failover (US East → Singapore → Frankfurt) with < 30s DNS cutover",
            weeks: [26, 29],
            status: "planned",
            assignee: "Infrastructure Team",
            deps: ["P3-PL-006"],
            percentComplete: 0,
          },
          {
            id: "P4-PL-004",
            name: "Implement GraphQL API layer alongside REST for complex agent data queries",
            weeks: [27, 30],
            status: "planned",
            assignee: "Core Platform Team",
            deps: ["P4-PL-002"],
            percentComplete: 0,
          },
          {
            id: "P4-PL-005",
            name: "Build enterprise SSO integration (SAML 2.0, OIDC) for large customer onboarding",
            weeks: [28, 31],
            status: "planned",
            assignee: "Security Team",
            deps: ["P4-PL-001"],
            percentComplete: 0,
          },
          {
            id: "P4-PL-006",
            name: "Achieve 99.95% uptime SLA with automated incident detection and remediation",
            weeks: [30, 32],
            status: "planned",
            assignee: "DevOps Team",
            deps: ["P4-PL-003", "P3-PL-005"],
            percentComplete: 0,
          },
        ],
        deliverables: [
          { name: "SOC 2 Type I Controls", count: 45, unit: "controls" },
          { name: "Multi-Region Failover", count: 3, unit: "regions" },
          { name: "SSO Integrations", count: 5, unit: "providers" },
          { name: "Uptime SLA", count: 99.95, unit: "percent" },
        ],
      },
      {
        id: "p4-ai-engine",
        name: "AI Engine & Agents",
        icon: "brain",
        tasks: [
          {
            id: "P4-AI-001",
            name: "Scale to 1,000 AI agents across all 100 departments (10 agents/department)",
            weeks: [25, 28],
            status: "planned",
            assignee: "AI Engineering Team",
            deps: ["P3-AI-001", "P3-AI-008"],
            percentComplete: 0,
          },
          {
            id: "P4-AI-002",
            name: "Implement agent cost optimization: model routing by task complexity (simple→local, complex→Claude)",
            weeks: [25, 27],
            status: "planned",
            assignee: "AI Architecture Team",
            deps: ["P3-AI-005"],
            percentComplete: 0,
          },
          {
            id: "P4-AI-003",
            name: "Build enterprise knowledge graph linking all 100 department knowledge bases",
            weeks: [26, 29],
            status: "planned",
            assignee: "AI Research Team",
            deps: ["P2-AI-004", "P3-AI-006"],
            percentComplete: 0,
          },
          {
            id: "P4-AI-004",
            name: "Deploy Hindi model v1.0 and Arabic model v0.5 for India/Middle East expansion",
            weeks: [27, 30],
            status: "planned",
            assignee: "AI Research Team",
            deps: ["P3-AI-007"],
            percentComplete: 0,
          },
          {
            id: "P4-AI-005",
            name: "Implement automated agent regression testing (500 test scenarios per department)",
            weeks: [28, 31],
            status: "planned",
            assignee: "Quality Team",
            deps: ["P3-AI-004", "P4-AI-001"],
            percentComplete: 0,
          },
          {
            id: "P4-AI-006",
            name: "Achieve DCC certification for all 100 departments (9/9 criteria each)",
            weeks: [29, 32],
            status: "planned",
            assignee: "Quality Team",
            deps: ["P4-AI-001", "P4-AI-005", "P3-AI-006"],
            percentComplete: 0,
          },
          {
            id: "P4-AI-007",
            name: "Build agent audit trail with cryptographic signing for compliance evidence",
            weeks: [30, 32],
            status: "planned",
            assignee: "Security Team",
            deps: ["P4-AI-006", "P4-PL-001"],
            percentComplete: 0,
          },
        ],
        deliverables: [
          { name: "Production AI Agents", count: 1_000, unit: "agents" },
          { name: "Departments Fully Certified", count: 100, unit: "departments" },
          { name: "Regression Test Scenarios", count: 50_000, unit: "scenarios" },
          { name: "Language Models in Production", count: 4, unit: "models" },
        ],
      },
      {
        id: "p4-mobile",
        name: "Mobile Apps & UX",
        icon: "smartphone",
        tasks: [
          {
            id: "P4-MO-001",
            name: "Add enterprise dashboard with custom KPI widgets and report generation to Admin App",
            weeks: [25, 28],
            status: "planned",
            assignee: "Mobile Team",
            deps: ["P2-MO-002"],
            percentComplete: 0,
          },
          {
            id: "P4-MO-002",
            name: "Implement SSO login flow in all 4 apps (Google, Microsoft, enterprise SAML)",
            weeks: [26, 28],
            status: "planned",
            assignee: "Mobile Team",
            deps: ["P4-PL-005"],
            percentComplete: 0,
          },
          {
            id: "P4-MO-003",
            name: "Build offline AI agent with on-device Llama 3.2-1B for basic queries without network",
            weeks: [27, 30],
            status: "planned",
            assignee: "Mobile + AI Team",
            deps: ["P3-MO-001"],
            percentComplete: 0,
          },
          {
            id: "P4-MO-004",
            name: "Add advanced analytics and cohort views to Reseller App",
            weeks: [28, 31],
            status: "planned",
            assignee: "Mobile Team",
            deps: ["P3-MO-003"],
            percentComplete: 0,
          },
          {
            id: "P4-MO-005",
            name: "Achieve 50,000 cumulative downloads with 4.6+ star rating across all stores",
            weeks: [30, 32],
            status: "planned",
            assignee: "Marketing + Mobile Team",
            deps: ["P4-MO-001", "P4-MO-002"],
            percentComplete: 0,
          },
        ],
        deliverables: [
          { name: "Cumulative App Downloads", count: 50_000, unit: "downloads" },
          { name: "On-Device AI Model", count: 1, unit: "model" },
          { name: "SSO Login Providers", count: 3, unit: "providers" },
          { name: "App Store Rating", count: 4.6, unit: "stars" },
        ],
      },
      {
        id: "p4-enterprise",
        name: "Enterprise & Go-to-Market",
        icon: "briefcase",
        tasks: [
          {
            id: "P4-EN-001",
            name: "Launch India market entry with Hindi language support and INR/Stripe payments",
            weeks: [25, 28],
            status: "planned",
            assignee: "Business Development Team",
            deps: ["P4-AI-004", "P2-PL-002"],
            percentComplete: 0,
          },
          {
            id: "P4-EN-002",
            name: "Begin Middle East market research with Arabic model and UAE/Saudi focus",
            weeks: [26, 29],
            status: "planned",
            assignee: "Business Development Team",
            deps: ["P4-AI-004"],
            percentComplete: 0,
          },
          {
            id: "P4-EN-003",
            name: "Deploy enterprise sales playbook for 100+ employee companies with dedicated account managers",
            weeks: [27, 30],
            status: "planned",
            assignee: "Sales Team",
            deps: ["P3-EN-004"],
            percentComplete: 0,
          },
          {
            id: "P4-EN-004",
            name: "Launch white-label AI-EOS offering for agencies and system integrators",
            weeks: [28, 31],
            status: "planned",
            assignee: "Product Team",
            deps: ["P4-EN-003"],
            percentComplete: 0,
          },
          {
            id: "P4-EN-005",
            name: "Achieve $60K MRR with 1,000 active businesses (Bangladesh 700, India 300)",
            weeks: [30, 32],
            status: "planned",
            assignee: "Business Team",
            deps: ["P4-EN-001", "P4-EN-003"],
            percentComplete: 0,
          },
          {
            id: "P4-EN-006",
            name: "Secure first 3 enterprise contracts (>$500 ACV each) with SLA guarantees",
            weeks: [30, 32],
            status: "planned",
            assignee: "Enterprise Sales Team",
            deps: ["P4-EN-004", "P4-PL-006"],
            percentComplete: 0,
          },
        ],
        deliverables: [
          { name: "Active Business Customers", count: 1_000, unit: "businesses" },
          { name: "Monthly Recurring Revenue", count: 60_000, unit: "USD" },
          { name: "Markets Active", count: 2, unit: "countries" },
          { name: "Enterprise Contracts", count: 3, unit: "contracts" },
        ],
      },
    ],
    milestones: [
      {
        id: "M4-001",
        name: "1,000 AI Agents Across 100 Departments",
        week: 28,
        stream: "ai-engine",
        type: "technical",
        description: "Full complement of 1,000 AI agents deployed with 10 agents per department, all tracked against DCC criteria.",
        kpis: ["1,000 agents active", "100 departments covered", "Avg uptime per agent ≥ 99.5%"],
      },
      {
        id: "M4-002",
        name: "All 100 Departments DCC Certified",
        week: 32,
        stream: "enterprise",
        type: "certification",
        description: "Every department achieves DCC certification across all 9 criteria — the flagship quality milestone for AI-EOS.",
        kpis: ["100/100 departments certified", "9/9 criteria per dept", "Self-recovery ≥ 92% avg"],
      },
      {
        id: "M4-003",
        name: "SOC 2 Type I Audit Initiated",
        week: 31,
        stream: "platform",
        type: "certification",
        description: "SOC 2 Type I audit process kicked off with 45 compliance controls documented and evidence collected.",
        kpis: ["45 controls implemented", "Evidence collection automated", "Auditor engaged"],
      },
      {
        id: "M4-004",
        name: "India Market Live with Hindi Support",
        week: 28,
        stream: "enterprise",
        type: "release",
        description: "AI-EOS available in India with Hindi model, INR pricing, and Stripe India payment processing.",
        kpis: ["300 India businesses onboarded", "Hindi model ≥ 90% accuracy", "INR payments flowing"],
      },
      {
        id: "M4-005",
        name: "$60K MRR Milestone",
        week: 32,
        stream: "enterprise",
        type: "revenue",
        description: "Revenue scaled to $60K MRR through Bangladesh dominance, India entry, and enterprise contracts.",
        kpis: ["$60K MRR", "1,000 businesses", "3 enterprise contracts", "Net revenue retention ≥ 110%"],
      },
    ],
    risks: [
      {
        id: "R4-001",
        description: "SOC 2 audit reveals gaps in access control or logging that require 4-6 weeks to remediate.",
        probability: "medium",
        impact: "high",
        mitigation: "Engage SOC 2 consultant from week 25; use automated compliance tools (Vanta/Drata); budget 20% time buffer for remediation.",
      },
      {
        id: "R4-002",
        description: "India market entry blocked by GST compliance requirements for SaaS billing.",
        probability: "medium",
        impact: "medium",
        mitigation: "Partner with Indian CA firm for GST registration; use Stripe India tax-inclusive billing; hire India-based compliance contractor.",
      },
      {
        id: "R4-003",
        description: "On-device Llama 3.2-1B model too slow on low-end Android phones common in Bangladesh.",
        probability: "high",
        impact: "low",
        mitigation: "Set minimum device spec (4GB RAM, Android 10+); use quantized 4-bit model; provide server-side fallback for unsupported devices.",
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 5 — GLOBAL EXPANSION (Weeks 33-40) · $35,000
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "phase-5-global-expansion",
    name: "Phase 5: Global Expansion",
    weekStart: 33,
    weekEnd: 40,
    description:
      "Scale to 1,500 agents. Launch in 5 countries (Bangladesh, India, UAE, Saudi Arabia, UK). White-label program with 100 resellers. Reach $100K MRR. Begin SOC 2 Type II.",
    color: "#EF4444",
    budget: 35_000,
    streams: [
      {
        id: "p5-platform",
        name: "Platform & Infrastructure",
        icon: "server",
        tasks: [
          {
            id: "P5-PL-001",
            name: "Deploy edge inference nodes in Singapore (APAC), Frankfurt (EU), and Virginia (US)",
            weeks: [33, 36],
            status: "planned",
            assignee: "Infrastructure Team",
            deps: ["P4-PL-003"],
            percentComplete: 0,
          },
          {
            id: "P5-PL-002",
            name: "Build white-label deployment system (custom domain, branding, feature flags per reseller)",
            weeks: [33, 37],
            status: "planned",
            assignee: "Platform Team",
            deps: ["P4-PL-004"],
            percentComplete: 0,
          },
          {
            id: "P5-PL-003",
            name: "Implement GDPR compliance module (data residency, right-to-erasure, consent management)",
            weeks: [34, 37],
            status: "planned",
            assignee: "Security Team",
            deps: ["P4-PL-001"],
            percentComplete: 0,
          },
          {
            id: "P5-PL-004",
            name: "Build global CDN with automatic locale detection and asset optimization",
            weeks: [35, 38],
            status: "planned",
            assignee: "Infrastructure Team",
            deps: ["P5-PL-001"],
            percentComplete: 0,
          },
          {
            id: "P5-PL-005",
            name: "Implement multi-currency billing engine (BDT, INR, AED, SAR, GBP, USD) with FX rate sync",
            weeks: [36, 39],
            status: "planned",
            assignee: "Payments Team",
            deps: ["P2-PL-002"],
            percentComplete: 0,
          },
          {
            id: "P5-PL-006",
            name: "Achieve SOC 2 Type II compliance with continuous monitoring evidence",
            weeks: [37, 40],
            status: "planned",
            assignee: "Security + DevOps Team",
            deps: ["P4-PL-006", "M4-003"],
            percentComplete: 0,
          },
        ],
        deliverables: [
          { name: "Edge Inference Regions", count: 3, unit: "regions" },
          { name: "White-Label Deployments", count: 100, unit: "instances" },
          { name: "Supported Currencies", count: 6, unit: "currencies" },
          { name: "SOC 2 Type II Status", count: 1, unit: "certification" },
        ],
      },
      {
        id: "p5-ai-engine",
        name: "AI Engine & Agents",
        icon: "brain",
        tasks: [
          {
            id: "P5-AI-001",
            name: "Scale to 1,500 AI agents with 15 agents per critical department (Sales, Support, Engineering)",
            weeks: [33, 36],
            status: "planned",
            assignee: "AI Engineering Team",
            deps: ["P4-AI-001"],
            percentComplete: 0,
          },
          {
            id: "P5-AI-002",
            name: "Deploy Arabic model v1.0 (Llama 3.1-8B fine-tuned on 150K Arabic business sentences)",
            weeks: [33, 36],
            status: "planned",
            assignee: "AI Research Team",
            deps: ["P4-AI-004"],
            percentComplete: 0,
          },
          {
            id: "P5-AI-003",
            name: "Build cross-lingual agent handoff (Bengali → English → Hindi → Arabic) with context preservation",
            weeks: [34, 38],
            status: "planned",
            assignee: "AI Architecture Team",
            deps: ["P5-AI-002", "P4-AI-003"],
            percentComplete: 0,
          },
          {
            id: "P5-AI-004",
            name: "Implement agent marketplace with 200+ agent templates for reseller deployment",
            weeks: [35, 38],
            status: "planned",
            assignee: "Product Team",
            deps: ["P3-PL-004", "P5-AI-001"],
            percentComplete: 0,
          },
          {
            id: "P5-AI-005",
            name: "Build continuous DCC monitoring with automated remediation alerts (target: maintain 100-dept certification)",
            weeks: [36, 39],
            status: "planned",
            assignee: "Quality Team",
            deps: ["P4-AI-006"],
            percentComplete: 0,
          },
          {
            id: "P5-AI-006",
            name: "Fine-tune domain-specific models: legal, medical, financial (3 vertical models)",
            weeks: [37, 40],
            status: "planned",
            assignee: "AI Research Team",
            deps: ["P5-AI-001"],
            percentComplete: 0,
          },
          {
            id: "P5-AI-007",
            name: "Implement agent cost analytics: per-interaction cost, model usage distribution, optimization recommendations",
            weeks: [38, 40],
            status: "planned",
            assignee: "Data Team",
            deps: ["P4-AI-002", "P5-AI-001"],
            percentComplete: 0,
          },
        ],
        deliverables: [
          { name: "Production AI Agents", count: 1_500, unit: "agents" },
          { name: "Agent Marketplace Templates", count: 200, unit: "templates" },
          { name: "Arabic Model v1.0", count: 1, unit: "model" },
          { name: "Vertical Fine-Tuned Models", count: 3, unit: "models" },
        ],
      },
      {
        id: "p5-mobile",
        name: "Mobile Apps & UX",
        icon: "smartphone",
        tasks: [
          {
            id: "P5-MO-001",
            name: "Localize all 4 apps for UAE and Saudi markets (Arabic RTL, AED/SAR pricing)",
            weeks: [33, 36],
            status: "planned",
            assignee: "Mobile Team",
            deps: ["P3-MO-005", "P5-AI-002"],
            percentComplete: 0,
          },
          {
            id: "P5-MO-002",
            name: "Build white-label app builder allowing resellers to brand Customer App with custom colors/logos",
            weeks: [34, 38],
            status: "planned",
            assignee: "Mobile Team",
            deps: ["P5-PL-002"],
            percentComplete: 0,
          },
          {
            id: "P5-MO-003",
            name: "Add advanced biometric auth (fingerprint, face ID) for Admin and Agent Management Apps",
            weeks: [35, 37],
            status: "planned",
            assignee: "Mobile Team",
            deps: ["P4-MO-002"],
            percentComplete: 0,
          },
          {
            id: "P5-MO-004",
            name: "Implement cross-lingual chat with real-time translation in Customer App",
            weeks: [36, 39],
            status: "planned",
            assignee: "Mobile + AI Team",
            deps: ["P5-AI-003"],
            percentComplete: 0,
          },
          {
            id: "P5-MO-005",
            name: "Achieve 100,000 cumulative downloads across 5 country app stores",
            weeks: [38, 40],
            status: "planned",
            assignee: "Marketing + Mobile Team",
            deps: ["P5-MO-001"],
            percentComplete: 0,
          },
        ],
        deliverables: [
          { name: "Cumulative App Downloads", count: 100_000, unit: "downloads" },
          { name: "Country-Specific App Listings", count: 5, unit: "stores" },
          { name: "White-Label App Builds", count: 50, unit: "builds" },
          { name: "Real-Time Translation Languages", count: 4, unit: "languages" },
        ],
      },
      {
        id: "p5-enterprise",
        name: "Enterprise & Go-to-Market",
        icon: "briefcase",
        tasks: [
          {
            id: "P5-EN-001",
            name: "Launch UAE market with Arabic support, AED billing, and Dubai-based reseller partners",
            weeks: [33, 36],
            status: "planned",
            assignee: "Business Development Team",
            deps: ["P4-EN-002", "P5-AI-002"],
            percentComplete: 0,
          },
          {
            id: "P5-EN-002",
            name: "Expand India to 1,000 businesses with Mumbai and Delhi focused sales teams",
            weeks: [33, 37],
            status: "planned",
            assignee: "India Sales Team",
            deps: ["P4-EN-001"],
            percentComplete: 0,
          },
          {
            id: "P5-EN-003",
            name: "Scale reseller network to 100 active partners generating ≥$1K MRR each",
            weeks: [34, 38],
            status: "planned",
            assignee: "Partner Team",
            deps: ["P3-EN-002", "P5-PL-002"],
            percentComplete: 0,
          },
          {
            id: "P5-EN-004",
            name: "Launch UK market entry with GBP pricing and Stripe UK integration",
            weeks: [35, 38],
            status: "planned",
            assignee: "Business Development Team",
            deps: ["P5-PL-005"],
            percentComplete: 0,
          },
          {
            id: "P5-EN-005",
            name: "Achieve $100K MRR with 3,000 active businesses across 5 countries",
            weeks: [38, 40],
            status: "planned",
            assignee: "Business Team",
            deps: ["P5-EN-001", "P5-EN-002", "P5-EN-003", "P5-EN-004"],
            percentComplete: 0,
          },
          {
            id: "P5-EN-006",
            name: "Secure 10 enterprise contracts (>$1K ACV) with dedicated SLA and account management",
            weeks: [38, 40],
            status: "planned",
            assignee: "Enterprise Sales Team",
            deps: ["P4-EN-006", "P5-PL-006"],
            percentComplete: 0,
          },
        ],
        deliverables: [
          { name: "Active Business Customers", count: 3_000, unit: "businesses" },
          { name: "Monthly Recurring Revenue", count: 100_000, unit: "USD" },
          { name: "Active Markets", count: 5, unit: "countries" },
          { name: "Active Reseller Partners", count: 100, unit: "partners" },
          { name: "Enterprise Contracts", count: 10, unit: "contracts" },
        ],
      },
    ],
    milestones: [
      {
        id: "M5-001",
        name: "1,500 AI Agents in Production",
        week: 36,
        stream: "ai-engine",
        type: "technical",
        description: "Agent army scaled to 1,500 with enhanced cross-lingual capabilities and vertical specialization.",
        kpis: ["1,500 agents active", "4 language models", "200+ marketplace templates"],
      },
      {
        id: "M5-002",
        name: "5 Countries Live",
        week: 38,
        stream: "enterprise",
        type: "release",
        description: "AI-EOS operational in Bangladesh, India, UAE, Saudi Arabia, and UK with localized experiences.",
        kpis: ["5 countries active", "6 currencies supported", "100 reseller partners"],
      },
      {
        id: "M5-003",
        name: "$100K MRR Milestone",
        week: 40,
        stream: "enterprise",
        type: "revenue",
        description: "Revenue breakthrough to $100K MRR from multi-country operations, enterprise deals, and reseller channel.",
        kpis: ["$100K MRR", "3,000 businesses", "10 enterprise contracts", "Run rate: $1.2M ARR"],
      },
      {
        id: "M5-004",
        name: "SOC 2 Type II Certification",
        week: 40,
        stream: "platform",
        type: "certification",
        description: "SOC 2 Type II achieved with continuous monitoring evidence, enabling enterprise sales acceleration.",
        kpis: ["Type II certified", "Zero critical findings", "Continuous monitoring active"],
      },
      {
        id: "M5-005",
        name: "100K App Downloads",
        week: 40,
        stream: "mobile",
        type: "release",
        description: "Combined downloads across all 4 apps and 5 country stores reach 100,000 with 4.6+ rating.",
        kpis: ["100K downloads", "4.6+ stars", "DAU/MAU ≥ 35%"],
      },
    ],
    risks: [
      {
        id: "R5-001",
        description: "GDPR compliance gaps in EU data handling trigger regulatory attention during UK launch.",
        probability: "medium",
        impact: "high",
        mitigation: "Engage EU DPO consultant; implement data residency per country; conduct privacy impact assessment before UK go-live.",
      },
      {
        id: "R5-002",
        description: "Cross-lingual agent handoff loses context accuracy when switching between Bengali and Arabic.",
        probability: "high",
        impact: "medium",
        mitigation: "Use shared English intermediate representation; validate with 500 cross-lingual test conversations; implement confidence scoring with human fallback below threshold.",
      },
      {
        id: "R5-003",
        description: "$100K MRR target missed due to slower-than-expected India and UAE adoption.",
        probability: "medium",
        impact: "high",
        mitigation: "Double down on Bangladesh reseller channel (proven); offer 90-day free trial for India/UAE; deploy local sales reps in Dubai and Mumbai.",
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 6 — OPTIMIZATION & GROWTH (Weeks 41-52) · $30,000
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "phase-6-optimization-growth",
    name: "Phase 6: Optimization & Growth",
    weekStart: 41,
    weekEnd: 52,
    description:
      "Scale to 2,000 agents. Reach 10,000 businesses across 8+ countries. Optimize unit economics toward profitability. Prepare Series A pitch deck. Build self-improving AI feedback loop.",
    color: "#06B6D4",
    budget: 30_000,
    streams: [
      {
        id: "p6-platform",
        name: "Platform & Infrastructure",
        icon: "server",
        tasks: [
          {
            id: "P6-PL-001",
            name: "Implement auto-scaling inference cluster with demand-based GPU allocation",
            weeks: [41, 44],
            status: "planned",
            assignee: "AI Infrastructure Team",
            deps: ["P5-PL-001"],
            percentComplete: 0,
          },
          {
            id: "P6-PL-002",
            name: "Build platform analytics engine: cohort analysis, funnel tracking, LTV/CAC by country",
            weeks: [41, 45],
            status: "planned",
            assignee: "Data Team",
            deps: ["P5-PL-005"],
            percentComplete: 0,
          },
          {
            id: "P6-PL-003",
            name: "Deploy Saudi Arabia edge node and comply with NCA (National Cybersecurity Authority) requirements",
            weeks: [43, 46],
            status: "planned",
            assignee: "Infrastructure + Security Team",
            deps: ["P5-PL-003"],
            percentComplete: 0,
          },
          {
            id: "P6-PL-004",
            name: "Build API developer portal with interactive docs, SDKs (Python, Node.js, Flutter), and sandbox",
            weeks: [44, 48],
            status: "planned",
            assignee: "Platform Team",
            deps: ["P4-PL-004"],
            percentComplete: 0,
          },
          {
            id: "P6-PL-005",
            name: "Optimize infrastructure costs: target 40% reduction through reserved instances, caching, and model quantization",
            weeks: [46, 50],
            status: "planned",
            assignee: "DevOps + Finance Team",
            deps: ["P6-PL-001", "P6-PL-002"],
            percentComplete: 0,
          },
          {
            id: "P6-PL-006",
            name: "Achieve 99.99% uptime SLA with zero-downtime deployments and chaos engineering tests",
            weeks: [49, 52],
            status: "planned",
            assignee: "DevOps Team",
            deps: ["P6-PL-005"],
            percentComplete: 0,
          },
        ],
        deliverables: [
          { name: "API Developer Portal", count: 1, unit: "portal" },
          { name: "SDKs Published", count: 3, unit: "SDKs" },
          { name: "Infrastructure Cost Reduction", count: 40, unit: "percent" },
          { name: "Uptime SLA", count: 99.99, unit: "percent" },
        ],
      },
      {
        id: "p6-ai-engine",
        name: "AI Engine & Agents",
        icon: "brain",
        tasks: [
          {
            id: "P6-AI-001",
            name: "Scale to 2,000 AI agents with 20 agents per top-20 department for enterprise load",
            weeks: [41, 44],
            status: "planned",
            assignee: "AI Engineering Team",
            deps: ["P5-AI-001"],
            percentComplete: 0,
          },
          {
            id: "P6-AI-002",
            name: "Build self-improving AI feedback loop (customer ratings → automatic prompt optimization)",
            weeks: [41, 46],
            status: "planned",
            assignee: "AI Research Team",
            deps: ["P5-AI-005"],
            percentComplete: 0,
          },
          {
            id: "P6-AI-003",
            name: "Implement multimodal agents (text + image + document understanding) for ecommerce and support",
            weeks: [43, 47],
            status: "planned",
            assignee: "AI Engineering Team",
            deps: ["P6-AI-001"],
            percentComplete: 0,
          },
          {
            id: "P6-AI-004",
            name: "Deploy fine-tuned models for 5 new languages: Urdu, Tamil, Malay, Indonesian, French",
            weeks: [44, 49],
            status: "planned",
            assignee: "AI Research Team",
            deps: ["P5-AI-002"],
            percentComplete: 0,
          },
          {
            id: "P6-AI-005",
            name: "Build agent performance prediction model (ML-based forecasting of agent quality degradation)",
            weeks: [46, 50],
            status: "planned",
            assignee: "Data + AI Team",
            deps: ["P6-AI-002", "P5-AI-007"],
            percentComplete: 0,
          },
          {
            id: "P6-AI-006",
            name: "Achieve DCC re-certification for all 100 departments with improved scores (all ≥ 97%)",
            weeks: [49, 52],
            status: "planned",
            assignee: "Quality Team",
            deps: ["P6-AI-002", "P6-AI-005"],
            percentComplete: 0,
          },
          {
            id: "P6-AI-007",
            name: "Reduce per-agent inference cost by 50% through caching, model distillation, and smart routing",
            weeks: [48, 52],
            status: "planned",
            assignee: "AI Architecture Team",
            deps: ["P6-PL-005", "P6-AI-005"],
            percentComplete: 0,
          },
        ],
        deliverables: [
          { name: "Production AI Agents", count: 2_000, unit: "agents" },
          { name: "Language Models in Production", count: 9, unit: "models" },
          { name: "Self-Improvement Feedback Loop", count: 1, unit: "system" },
          { name: "Per-Agent Cost Reduction", count: 50, unit: "percent" },
        ],
      },
      {
        id: "p6-mobile",
        name: "Mobile Apps & UX",
        icon: "smartphone",
        tasks: [
          {
            id: "P6-MO-001",
            name: "Redesign Customer App with AI-first UX: proactive suggestions, smart search, predictive actions",
            weeks: [41, 45],
            status: "planned",
            assignee: "Mobile + UX Team",
            deps: ["P5-MO-004"],
            percentComplete: 0,
          },
          {
            id: "P6-MO-002",
            name: "Add multimodal input (camera for document scanning, voice, image) to Customer App",
            weeks: [43, 47],
            status: "planned",
            assignee: "Mobile Team",
            deps: ["P6-AI-003"],
            percentComplete: 0,
          },
          {
            id: "P6-MO-003",
            name: "Build Admin App executive dashboard with AI-generated insights and recommendation engine",
            weeks: [44, 48],
            status: "planned",
            assignee: "Mobile Team",
            deps: ["P4-MO-001", "P6-PL-002"],
            percentComplete: 0,
          },
          {
            id: "P6-MO-004",
            name: "Localize apps for 3 new markets: Pakistan (Urdu), Malaysia (Malay), Indonesia (Indonesian)",
            weeks: [46, 50],
            status: "planned",
            assignee: "Mobile + Localization Team",
            deps: ["P6-AI-004"],
            percentComplete: 0,
          },
          {
            id: "P6-MO-005",
            name: "Achieve 250,000 cumulative downloads with 4.7+ rating across 8 country stores",
            weeks: [49, 52],
            status: "planned",
            assignee: "Marketing + Mobile Team",
            deps: ["P6-MO-001", "P6-MO-004"],
            percentComplete: 0,
          },
        ],
        deliverables: [
          { name: "Cumulative App Downloads", count: 250_000, unit: "downloads" },
          { name: "Country-Specific App Listings", count: 8, unit: "stores" },
          { name: "App Store Rating", count: 4.7, unit: "stars" },
          { name: "Supported App Locales", count: 9, unit: "locales" },
        ],
      },
      {
        id: "p6-enterprise",
        name: "Enterprise & Go-to-Market",
        icon: "briefcase",
        tasks: [
          {
            id: "P6-EN-001",
            name: "Launch Pakistan, Malaysia, and Indonesia markets with localized AI and payment support",
            weeks: [41, 46],
            status: "planned",
            assignee: "Business Development Team",
            deps: ["P6-AI-004", "P5-PL-005"],
            percentComplete: 0,
          },
          {
            id: "P6-EN-002",
            name: "Scale to 10,000 active businesses across 8 countries with 150 reseller partners",
            weeks: [42, 48],
            status: "planned",
            assignee: "Sales + Partner Team",
            deps: ["P5-EN-003", "P6-EN-001"],
            percentComplete: 0,
          },
          {
            id: "P6-EN-003",
            name: "Build and distribute Series A pitch deck targeting $2M-5M raise for global scaling",
            weeks: [44, 48],
            status: "planned",
            assignee: "CEO / Al Aminn",
            deps: ["P6-EN-002"],
            percentComplete: 0,
          },
          {
            id: "P6-EN-004",
            name: "Launch AI-EOS enterprise tier at $499/mo with dedicated agents, SLA, and priority support",
            weeks: [45, 49],
            status: "planned",
            assignee: "Product Team",
            deps: ["P6-EN-002"],
            percentComplete: 0,
          },
          {
            id: "P6-EN-005",
            name: "Achieve $200K MRR with positive unit economics (LTV/CAC ≥ 3:1)",
            weeks: [48, 52],
            status: "planned",
            assignee: "Business Team",
            deps: ["P6-EN-002", "P6-EN-004", "P6-PL-005"],
            percentComplete: 0,
          },
          {
            id: "P6-EN-006",
            name: "Secure 25 enterprise contracts with $2.4M ARR pipeline and 90%+ renewal rate target",
            weeks: [49, 52],
            status: "planned",
            assignee: "Enterprise Sales Team",
            deps: ["P6-EN-004", "P5-EN-006"],
            percentComplete: 0,
          },
        ],
        deliverables: [
          { name: "Active Business Customers", count: 10_000, unit: "businesses" },
          { name: "Monthly Recurring Revenue", count: 200_000, unit: "USD" },
          { name: "Active Markets", count: 8, unit: "countries" },
          { name: "Enterprise Contracts", count: 25, unit: "contracts" },
          { name: "Series A Pitch Deck", count: 1, unit: "deck" },
          { name: "Active Reseller Partners", count: 150, unit: "partners" },
        ],
      },
    ],
    milestones: [
      {
        id: "M6-001",
        name: "2,000 AI Agents — Full Army Deployed",
        week: 44,
        stream: "ai-engine",
        type: "technical",
        description: "Complete deployment of 2,000 AI agents across 100 departments with 9 language models and self-improvement capabilities.",
        kpis: ["2,000 agents active", "9 language models", "Self-improvement loop live", "Agent P95 latency < 1.5s"],
      },
      {
        id: "M6-002",
        name: "10,000 Businesses on AI-EOS",
        week: 48,
        stream: "enterprise",
        type: "revenue",
        description: "Platform reaches 10,000 active business customers across 8 countries, establishing ALO Labs as a significant AI-EOS player.",
        kpis: ["10,000 businesses", "8 countries", "150 reseller partners", "Churn < 3%"],
      },
      {
        id: "M6-003",
        name: "$200K MRR — Path to Profitability",
        week: 52,
        stream: "enterprise",
        type: "revenue",
        description: "$200K MRR achieved with positive unit economics (LTV/CAC ≥ 3:1), demonstrating sustainable business model for Series A.",
        kpis: ["$200K MRR", "$2.4M ARR run rate", "LTV/CAC ≥ 3:1", "Gross margin ≥ 70%"],
      },
      {
        id: "M6-004",
        name: "250K App Downloads, 4.7 Stars",
        week: 52,
        stream: "mobile",
        type: "release",
        description: "Mobile apps reach 250,000 cumulative downloads across 8 country stores with best-in-class ratings.",
        kpis: ["250K downloads", "4.7+ stars", "DAU/MAU ≥ 40%", "Crash rate < 0.3%"],
      },
      {
        id: "M6-005",
        name: "Series A Ready — All 100 Depts Re-Certified",
        week: 52,
        stream: "enterprise",
        type: "certification",
        description: "All 100 departments re-certified with improved DCC scores (≥ 97% all criteria), Series A pitch deck complete, SOC 2 Type II current.",
        kpis: ["100/100 depts re-certified", "Avg score ≥ 97%", "Series A deck finalized", "SOC 2 Type II maintained"],
      },
    ],
    risks: [
      {
        id: "R6-001",
        description: "Series A fundraising delayed due to unfavorable VC market conditions in Bangladesh/South Asia.",
        probability: "medium",
        impact: "high",
        mitigation: "Target US/Singapore VCs with emerging market thesis; bootstrap extended runway through $200K MRR; explore revenue-based financing as backup.",
      },
      {
        id: "R6-002",
        description: "Scaling to 2,000 agents creates undetected quality degradation that erodes customer trust.",
        probability: "medium",
        impact: "high",
        mitigation: "Deploy agent performance prediction model (P6-AI-005); implement automated quality gates blocking low-scoring agents; weekly executive quality review.",
      },
      {
        id: "R6-003",
        description: "Multi-country expansion stretches support team thin, increasing response times and churn.",
        probability: "high",
        impact: "medium",
        mitigation: "Use AI agents for first-line support in all languages; hire country-specific support leads; implement AI-powered ticket routing and prioritization.",
      },
    ],
  },
];

// ── Helper Functions ─────────────────────────────────────────────────────

/**
 * Returns a high-level summary of the entire 52-week roadmap.
 */
export function getRoadmapSummary() {
  const totalPhases = ROADMAP_PHASES.length;
  const totalWeeks = 52;

  const allMilestones = ROADMAP_PHASES.flatMap((p) => p.milestones);
  const totalMilestones = allMilestones.length;

  const allTasks = ROADMAP_PHASES.flatMap((p) =>
    p.streams.flatMap((s) => s.tasks)
  );
  const totalTasks = allTasks.length;

  const totalBudget = ROADMAP_PHASES.reduce((sum, p) => sum + p.budget, 0);

  const completedTasks = allTasks.filter((t) => t.status === "completed").length;
  const completionPercent =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Critical path: longest dependency chain
  const taskMap = new Map(allTasks.map((t) => [t.id, t]));
  const visited = new Set<string>();

  function getChainLength(taskId: string): number {
    if (visited.has(taskId)) return 0;
    visited.add(taskId);
    const task = taskMap.get(taskId);
    if (!task || task.deps.length === 0) return 1;
    return 1 + Math.max(...task.deps.map(getChainLength));
  }

  let criticalPath = 0;
  let criticalPathTask = "";
  for (const task of allTasks) {
    visited.clear();
    const len = getChainLength(task.id);
    if (len > criticalPath) {
      criticalPath = len;
      criticalPathTask = task.id;
    }
  }

  return {
    totalPhases,
    totalWeeks,
    totalMilestones,
    totalTasks,
    totalBudget,
    completionPercent,
    criticalPath: {
      length: criticalPath,
      leafTask: criticalPathTask,
    },
  };
}

/**
 * Retrieve a single phase by its ID.
 */
export function getPhaseById(id: string): RoadmapPhase | undefined {
  return ROADMAP_PHASES.find((p) => p.id === id);
}

/**
 * Retrieve all tasks belonging to a specific stream across all phases.
 */
export function getTasksByStream(streamId: string): RoadmapTask[] {
  return ROADMAP_PHASES.flatMap((p) =>
    p.streams
      .filter((s) => s.id === streamId)
      .flatMap((s) => s.tasks)
  );
}
