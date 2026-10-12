# AgentOS administration

Use a named human admin session for sensitive operations. The seed script (`npm run seed:agentos`) creates or reuses the admin user, company, 100 departments, starter agents/skills and a three-step workflow; it requires `SEED_ADMIN_PASSWORD` (12+ characters) and never prints it. Rotate credentials after staging setup and use MFA where available.

Admin areas are exposed by the existing enterprise UI; the new Command Center and Runs panels are registered in `enterprise-shell.tsx`. Health checks are at `/api/v1/health`; a 503 with `modelRouter: degraded` means a provider is missing, not a healthy AI service. Queue data is stored in `JobQueue`/`QueueItem`; `AgentOSRun` and `RunEvent` give persisted execution history. Investigate `failed` runs and diagnostic report artifacts; don't label failure reports as deliverables.

Approval decisions require a human admin session. Automatic continuation after a QC approval is **not implemented**; the UI must show the run paused rather than claiming resumed execution. API keys need explicit scopes and must be revoked on rotation. Agents should have only the tools and company access they need.

Before production, review tenant isolation across legacy APIs, file storage ACLs, rate limits, retention, provider budgets, secret redaction, destructive action approvals, and backup restores. See the final audit for an exact checklist.
