# ALO Labs API Gateway Specification

All endpoints are hosted relative to the base URL `https://api.alolabs.net` or proxy directly through the Command Center domain under `/api/*`.

---

## 🔒 Authentication & Session Gate

### `POST /api/auth/login`
Validates Super Admin or Operator credentials and generates a secure session cookie.
- **Request Body:**
  ```json
  { "email": "ceo.alo.alaminn@gmail.com", "password": "..." }
  ```
- **Response (200 OK):**
  ```json
  { "success": true, "session": "...", "role": "Super Admin" }
  ```

### `POST /api/auth/logout`
Destroys the current session cookie and logs out the user.

### `POST /api/auth/otp-verify`
Validates two-factor OTP.
- **Request Body:**
  ```json
  { "email": "ceo.alo.alaminn@gmail.com", "code": "123456" }
  ```

---

## 🏢 Connected Companies Router

### `GET /api/companies`
Retrieve connectivity metrics, health statuses, and agent workloads for all workspaces.

### `POST /api/companies`
Registers a new company workspace into the command center.

---

## 🤖 Agent Lifecycle Orchestrator

### `GET /api/agents`
Retrieve list of all active, paused, failed, draft, or archived agents.

### `POST /api/agents`
Instantly spawn or register a new custom agent.
- **Request Body:**
  ```json
  {
    "name": "IELTS Academic Assistant",
    "companyId": "english_portal",
    "department": "Education",
    "agentType": "Creative",
    "purpose": "Generate mock essay scores and suggest corrections.",
    "knowledgeBase": "Grammar Guides",
    "workflowTrigger": "User Submit",
    "permissionLevel": "L2_Sandbox"
  }
  ```

### `PUT /api/agents/:id/status`
Toggle agent running state (Active, Paused, Failed, Draft, Archived).

### `POST /api/agents/:id/test`
Trigger a dry-run test execution in the secure sandbox.

---

## ⚡ Workflows & Automations

### `GET /api/workflows`
Retrieve active pipelines, schedules, and run times.

### `POST /api/workflows`
Registers or deploys a new custom workflow pipeline.

---

## 📑 Knowledge Base & Documents

### `GET /api/knowledge-base`
List knowledge base entries, sync statuses, and storage buckets.

### `POST /api/knowledge-base`
Add a document, website URL, policy, or FAQ to the knowledge base RAG indexer.

---

## 🚥 Admin Approvals Queue

### `GET /api/approvals`
List all pending approval checkpoints.

### `POST /api/approvals/:id/approve`
Approve a high-risk agent action.

### `POST /api/approvals/:id/reject`
Reject a high-risk agent action.

---

## 📈 System Health & Observability

### `GET /api/health`
Basic server health-check. Returns `200 OK` with JSON status.

### `GET /api/version`
Returns the current deployment build version (e.g. `v3.0.0-release`).

### `GET /api/monitoring/status`
Detailed hardware and container telemetry (CPU, RAM, Disk, Redis connection, PostgreSQL pool, MinIO, Qdrant, Neo4j).

### `GET /api/backups/status`
Get historical logs of backup jobs, MinIO snapshots, and restore states.

### `GET /api/logs`
Retrieve comprehensive logs across agents, APIs, workflows, and security audits.
