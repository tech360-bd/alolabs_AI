# Database Schema & Storage Architecture Plan

ALO Labs is configured with a modern, hybrid persistent storage engine. Metadata and audit records reside in a relational **PostgreSQL** instance, while state caches live in **Redis**, and documents for RAG processing reside in **MinIO S3**.

---

## 🐘 1. PostgreSQL Schema (Drizzle ORM Format)

### `companies`
Tracks connected company workspaces.
```sql
CREATE TABLE "companies" (
  "id" varchar PRIMARY KEY,
  "name" varchar NOT NULL,
  "domain" varchar NOT NULL,
  "api_status" varchar DEFAULT 'Active',
  "agent_count" integer DEFAULT 0,
  "workflow_count" integer DEFAULT 0,
  "kb_status" varchar DEFAULT 'Synced',
  "last_sync" timestamp DEFAULT now(),
  "health" varchar DEFAULT 'Healthy',
  "created_at" timestamp DEFAULT now()
);
```

### `users`
System administrators, company managers, and viewers.
```sql
CREATE TABLE "users" (
  "id" serial PRIMARY KEY,
  "email" varchar UNIQUE NOT NULL,
  "name" varchar NOT NULL,
  "role" varchar NOT NULL DEFAULT 'Viewer', -- 'Super Admin', 'Admin', 'Company Manager', 'AI Operator', 'Developer', 'Viewer'
  "otp_secret" varchar,
  "session_token" varchar,
  "created_at" timestamp DEFAULT now()
);
```

### `agents`
Core AI agents and their execution profiles.
```sql
CREATE TABLE "agents" (
  "id" varchar PRIMARY KEY,
  "name" varchar NOT NULL,
  "company_id" varchar REFERENCES "companies"("id"),
  "department" varchar NOT NULL,
  "agent_type" varchar NOT NULL, -- 'Creative', 'Analytical', 'Automated'
  "status" varchar NOT NULL DEFAULT 'Draft', -- 'Draft', 'Active', 'Paused', 'Failed', 'Archived'
  "permission_level" varchar NOT NULL DEFAULT 'L2_Sandbox',
  "success_rate" varchar DEFAULT '100%',
  "last_run" timestamp,
  "approval_required" boolean DEFAULT true,
  "purpose" text,
  "knowledge_base" varchar,
  "workflow_trigger" varchar,
  "api_access" boolean DEFAULT false,
  "created_at" timestamp DEFAULT now()
);
```

### `workflows`
Automation pipelines connected to active agents.
```sql
CREATE TABLE "workflows" (
  "id" varchar PRIMARY KEY,
  "name" varchar NOT NULL,
  "trigger" varchar NOT NULL,
  "action" varchar NOT NULL,
  "agent_id" varchar REFERENCES "agents"("id"),
  "company_id" varchar REFERENCES "companies"("id"),
  "status" varchar NOT NULL DEFAULT 'Idle', -- 'Idle', 'Running', 'Success', 'Failed'
  "approval_mode" boolean DEFAULT true,
  "last_executed_at" timestamp,
  "created_at" timestamp DEFAULT now()
);
```

### `knowledge_documents`
Embedded resources uploaded for Retrieval-Augmented Generation (RAG).
```sql
CREATE TABLE "knowledge_documents" (
  "id" serial PRIMARY KEY,
  "company_id" varchar REFERENCES "companies"("id"),
  "name" varchar NOT NULL,
  "source_type" varchar NOT NULL, -- 'File', 'URL', 'FAQ', 'Policy'
  "source_value" varchar NOT NULL,
  "sync_status" varchar DEFAULT 'Synced',
  "size_kb" integer,
  "rag_health_score" integer DEFAULT 100,
  "created_at" timestamp DEFAULT now()
);
```

### `prompts`
Version-controlled command prompt catalog.
```sql
CREATE TABLE "prompts" (
  "id" serial PRIMARY KEY,
  "category" varchar NOT NULL, -- 'Education', 'Visa', 'SOP', 'Marketing', 'SEO', 'CRM', 'Support', 'Report'
  "title" varchar NOT NULL,
  "content" text NOT NULL,
  "version" varchar NOT NULL DEFAULT '1.0.0',
  "assigned_agent" varchar,
  "created_at" timestamp DEFAULT now()
);
```

### `approvals`
Audit-ready admin validation checkpoint queue.
```sql
CREATE TABLE "approvals" (
  "id" varchar PRIMARY KEY,
  "request_type" varchar NOT NULL, -- 'WhatsApp', 'Email', 'Publish', 'CRM Update'
  "agent_id" varchar REFERENCES "agents"("id"),
  "company_id" varchar REFERENCES "companies"("id"),
  "payload" text NOT NULL,
  "risk_level" varchar DEFAULT 'Medium', -- 'Low', 'Medium', 'High', 'Critical'
  "status" varchar DEFAULT 'Pending', -- 'Pending', 'Approved', 'Rejected'
  "reviewer_id" integer REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now()
);
```

### `audit_logs`
Immutable records of workspace operations.
```sql
CREATE TABLE "audit_logs" (
  "id" serial PRIMARY KEY,
  "category" varchar NOT NULL, -- 'Agent', 'System', 'Security', 'Database'
  "action" varchar NOT NULL,
  "details" text,
  "user_email" varchar,
  "created_at" timestamp DEFAULT now()
);
```

---

## ⚡ 2. Redis Key-Value Store Plan

Redis acts as our lightning-fast transactional memory cache and task queue:

| Key Pattern | Data Type | Purpose | TTL |
| :--- | :--- | :--- | :--- |
| `session:token:<token>` | String | Active session tracker containing decrypted roles | 24 Hours |
| `agent:memory:<agent_id>` | List | Direct short-term context/recent interaction memory | 3 Days |
| `workflow:queue:<company_id>` | Queue (List) | Backlog of running workflows for processing workers | Indefinite |
| `rate_limit:ip:<ip_address>` | String | API Gateway protection limits | 1 Minute |

---

## 🪣 3. MinIO S3 Object Storage Schema

MinIO manages raw, non-relational document assets uploaded for training or reference:

- **Bucket:** `alo-education-kb` ➔ Holds PDFs, brochures, embassy rules, SOP samples.
- **Bucket:** `tech360-kb` ➔ Holds source code components, compliance checklists, audit policies.
- **Bucket:** `english-portal-kb` ➔ Holds grammar syllabus and vocabulary guides.
- **Bucket:** `alaminn-kb` ➔ Holds CRM lead sheets and script outlines.
