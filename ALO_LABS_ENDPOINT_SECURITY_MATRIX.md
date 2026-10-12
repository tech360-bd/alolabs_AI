# Per-endpoint security verification matrix

**2026-10-09. Overall: NOT VERIFIED.** Generated from the 362 route-handler files / 682 literal method exports in [`ALO_LABS_API_VERIFICATION.md`](ALO_LABS_API_VERIFICATION.md). Presence of `requireAuth`, `v1Handler` or a validation call is only a *static indicator*; it is **not** a reviewed role, tenant, CSRF, output-validation, rate-limit or audit contract. This matrix explicitly marks every method unverified unless a narrow real isolated HTTP scenario exists; such cases are only PARTIAL. `UNKNOWN` denotes a handler with no literal exported method identified by the static scanner. Any dynamic/re-exported routes require separate inspection.

| Endpoint | Method | Auth (static indicator) | Role | Tenant Isolation | Validation (static indicator) | Rate Limit | Audit | Test | Status |
|---|---|---|---|---|---|---|---|---|---|
| /api/agent-company-access | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-company-access | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-company-access | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-company-access | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-factory/build | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-factory/build | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-intelligence/agent-detail | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-intelligence/agents | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-intelligence/chat | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-intelligence/departments | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-learning/dashboard | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-learning/evolution | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-learning/evolution | PUT | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-learning/knowledge | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-learning/knowledge | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-learning/knowledge | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-learning/protective-mode | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-learning/protective-mode | PUT | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-learning/trigger-learning | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-learning/trigger-learning | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-memory | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-memory | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-memory | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-memory | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-performance | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-performance | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-performance | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-performance | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-permissions | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-permissions | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-permissions | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-permissions | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-runs/{taskId} | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-runtime/execute | DELETE | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-runtime/execute | POST | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-runtime/health | GET | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-runtime/status | GET | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-stability/health | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-status-history | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-status-history | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-status-history | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-status-history | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-usage-summaries | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-usage-summaries | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-usage-summaries | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-usage-summaries | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-versions | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-versions | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-versions | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agent-versions | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agents/{id} | DELETE | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agents/{id} | PUT | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agents/registry | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/agents | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai/batch | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai/chat | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai/models | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai/parallel | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai/providers | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai/route | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai/stream | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai-security/events | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai-security/events | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai-security/rules | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai-security/rules | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai-security/stats | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai-workforce/alerts | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai-workforce/alerts | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai-workforce/alerts | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai-workforce/catalog | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai-workforce/catalog | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai-workforce/communications | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai-workforce/communications | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai-workforce/execute | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai-workforce/execute | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai-workforce/executions/{id} | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai-workforce/executions/{id} | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai-workforce/instances/{id}/health | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai-workforce/instances/{id}/health | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai-workforce/instances | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai-workforce/instances | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai-workforce/metrics | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai-workforce/metrics | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai-workforce/optimizations | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai-workforce/optimizations | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai-workforce/oversight | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai-workforce/oversight | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai-workforce/oversight | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai-workforce/recovery | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/ai-workforce/recovery | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/alerts | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/alerts | PATCH | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/alerts | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/analytics | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/api-keys/{id} | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/api-keys/{id} | PATCH | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/api-keys | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/api-keys | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/api-management | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/api-management | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/approval-engine | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/approval-engine | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/approvals | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/approvals | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/approvals | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/artifacts/{id}/download | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/artifacts/{id} | DELETE | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/artifacts/{id} | GET | requireAuth (call) | NOT VERIFIED | PARTIAL: selected cases | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | Real isolated two-tenant HTTP (selected cases) | PARTIAL (isolated HTTP) |
| /api/artifacts/{id} | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/artifacts | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/artifacts | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/audit-logs | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/auth/login | POST | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/auth/logout | POST | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/auth/me | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/auth/mfa/disable | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/auth/mfa/resend | POST | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/auth/mfa/setup | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/auth/mfa/verify | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/auth/oauth/{provider} | GET | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/auth/oauth/{provider} | POST | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/auth/oauth/providers | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/auth/oauth/providers | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/auth/oauth/providers | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/auth/password-change | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/auth/password-reset | POST | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/auth/register | POST | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/auth/sessions/cleanup | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/auth/sessions | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/auth/sessions | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/auth/sessions | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/auth/sso | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/auth/sso | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/automation/execute | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/automation/logs | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/automation/triggers/{id} | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/automation/triggers/{id} | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/automation/triggers/{id} | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/automation/triggers/{id}/toggle | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/automation/triggers | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/automation/triggers | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/automation-suggestions | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/automation-suggestions | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/automation-suggestions | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/automation-suggestions | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/billing/invoices | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/billing/invoices | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/billing/payments | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/billing/payments | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/billing/plans | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/billing/plans | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/billing/subscriptions/{id} | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/billing/subscriptions/{id} | PATCH | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/billing/subscriptions | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/billing/subscriptions | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/brands | DELETE | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/brands | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/brands | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/brands | PUT | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/capability/request | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/capability/requests | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/commands | DELETE | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/commands | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/commands | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/commands | PUT | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/companies/{id} | DELETE | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/companies/{id} | PUT | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/companies | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/companies | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/company/agents/allowed | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/company/command | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/company/tasks | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/company/usage | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/company/workflows/allowed | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/company-access | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/company-access | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/company-access | PATCH | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/company-access | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/company-memory | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/company-memory | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/company-memory | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/company-memory | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/company-usage-summaries | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/company-usage-summaries | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/company-usage-summaries | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/company-usage-summaries | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/cost-estimate | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/cost-estimate | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/cost-estimates/{id} | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/cost-estimates/{id} | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/crm/activities | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/crm/activities | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/crm/contacts/{id} | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/crm/contacts/{id} | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/crm/contacts/{id} | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/crm/contacts | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/crm/contacts | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/crm/deals/{id} | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/crm/deals/{id} | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/crm/deals/{id} | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/crm/deals | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/crm/deals | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/crm/lead-score | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/crm/notes | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/crm/notes | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/crm/notes | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/crm/notes | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/crm/pipelines | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/crm/pipelines | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/crm-connections | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/crm-connections | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/cron | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/cron | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/dashboard/cost | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/dashboard/security | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/dashboard/stats | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/dashboard/super-admin | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/dashboard/usage | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/db/backup | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/db/backup | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/db/migrate | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/db/restore | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/department-memory | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/department-memory | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/department-memory | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/department-memory | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/departments/{id} | DELETE | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/departments/{id} | PUT | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/departments | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/departments | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/deploy | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/deploy | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/disaster-recovery | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/disaster-recovery | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/documents | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/documents | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/education-hub | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/education-hub | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/email/accounts | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/email/accounts | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/email/accounts | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/email/accounts | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/email/inbox | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/email/reply | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/email/send | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/email/sync | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/email/templates | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/email/templates | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/email/templates | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/email/templates | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/emergency/action | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/emergency | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/emergency | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/agent-chat | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/agent-factory/{id} | DELETE | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/agent-factory/{id} | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/agent-factory/create | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/agents/{agentId}/detail | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/agents/adaptive | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/agents | GET | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/agents/run | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/collaborations | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/constitution | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/constitution | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/conversations | DELETE | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/conversations | GET | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/data-lake | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/dcc | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/department-ai | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/department-ai | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/departments | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/engines | GET | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/events | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/integrations | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/knowledge | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/mobile-apps | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/orchestrator | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/orchestrator | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/orchestrator/run | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/orchestrator/status | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/overview | GET | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/prompts | GET | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/rbac | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/rbac | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/roadmap | GET | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/rules | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/skills | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/sops | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/stats | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/workflows | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/workforce-evolution | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/enterprise/workforce-evolution | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/evaluations | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/evaluations | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/feature-flags | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/feature-flags | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/feature-flags | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/feature-flags | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/feedback | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/feedback | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/funnels | DELETE | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/funnels | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/funnels | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/funnels | PUT | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/gateway/sign | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/gateway/verify | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/gpu-monitor | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/health/deep | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/health/live | GET | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/health/ping | GET | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/health/ready | GET | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/health | GET | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/incidents/{id} | DELETE | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/incidents/{id} | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/incidents/{id} | PUT | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/incidents | DELETE | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/incidents | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/incidents | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/incidents | PUT | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/infra/connect | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/infra/minio/objects | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/infra/minio/objects | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/infra/ping | POST | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/infra/postgres/query | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/infra/redis/keys | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/infra/redis/keys | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/infra/redis/keys | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/infra/status | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/integrations | DELETE | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/integrations | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/integrations | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/integrations | PUT | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/interview-hub | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/interview-hub | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/jobs/{id} | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/jobs/{id} | PATCH | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/jobs | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/jobs/stats | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/llm/models | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/llm/models | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/llm/route | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/llm/stream | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/logs | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/logs | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/logs | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/marketing-kit/{slug} | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/marketing-kit | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/marketing-kit | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/marketplace/{id}/install | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/marketplace/{id}/reviews | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/marketplace/{id}/reviews | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/marketplace/{id} | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/marketplace/{id} | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/marketplace/{id} | PATCH | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/marketplace/installs | GET | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/marketplace/installs | POST | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/marketplace | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/marketplace | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/marketplace/templates | GET | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/marketplace/templates | POST | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/mcp-servers | DELETE | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/mcp-servers | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/mcp-servers | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/mcp-servers | PUT | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/media/ai-tag | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/media/folders | DELETE | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/media/folders | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/media/folders | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/media/folders | PUT | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/media | DELETE | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/media | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/media | PUT | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/meetings | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/meetings | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/memory/{id} | DELETE | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/memory | DELETE | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/memory | GET | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/memory | POST | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/metrics/collect | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/metrics/prometheus | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/metrics | DELETE | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/metrics | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/metrics | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/metrics | PUT | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/model-assignments | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/model-assignments | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/model-assignments | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/model-assignments | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/model-health | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/model-health | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/model-health | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/model-health | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/model-hub | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/models | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/models | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/notifications/read | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/notifications | DELETE | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/notifications | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/notifications | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/notifications | PUT | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/observability/dashboard | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/open-source-models | GET | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/outputs/{taskId} | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/outputs | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/payment-guard/report | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/payment-guard | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/payment-guard | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/productivity/report | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/productivity | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/productivity | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/projects/{id} | DELETE | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/projects/{id} | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/projects/{id} | PATCH | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/projects/{id}/runs | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/projects/{id}/runs | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/projects | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/projects | PATCH | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/projects | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/prompts/{id} | PUT | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/prompts | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/prompts | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/prompts | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/prompts | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/protection/evaluate | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/protection/logs | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/protection/report | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/protection | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/protection | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/quality | DELETE | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/quality | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/quality | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/quality | PUT | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/queues/{id}/items/{itemId} | PATCH | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/queues/{id}/items | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/queues/{id}/items | PATCH | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/queues/{id}/items | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/queues/{id}/process | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/queues/dead-letter | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/queues/dead-letter | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/queues/dead-letter | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/queues | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/queues | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/rag/chunks/{id} | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/rag/chunks/{id} | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/rag/collections | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/rag/collections | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/rag/documents/{id} | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/rag/documents/{id} | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/rag/documents | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/rag/documents | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/rag/engine-stats | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/rag/feedback | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/rag/feedback | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/rag/feedback | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/rag/feedback | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/rag/ingest | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/rag/logs | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/rag/query | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/rag/search | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/research-hub | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/research-hub | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/roles | DELETE | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/roles | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/roles | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/roles | PUT | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/runs/{id}/events | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/runs/{id} | DELETE | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/runs/{id} | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/runs | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/runs | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/security/secrets | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/security/secrets | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/security/secrets | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/security/session | DELETE | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/security/session | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/security/session | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/security-events | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/security-events | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/security-events | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/security-events | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/self-improvement/report | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/self-improvement | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/self-improvement | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/seo/challenges | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/seo/challenges | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/seo/challenges | PUT | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/seo | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/seo | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/seo | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/settings | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/settings | PUT | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/sister-companies | GET | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/skill-factory/build | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/skill-permissions | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/skill-permissions | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/skill-permissions | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/skill-permissions | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/skill-runs/{taskId} | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/skill-validation-logs | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/skill-validation-logs | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/skill-validation-logs | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/skill-validation-logs | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/skill-versions | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/skill-versions | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/skill-versions | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/skill-versions | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/skills/{id} | DELETE | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/skills/{id} | PUT | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/skills/registry | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/skills | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/skills | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/sms/campaigns | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/sms/campaigns | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/sms | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/sms | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/social/accounts | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/social/accounts | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/social/accounts | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/social/analytics | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/social/oauth/{provider} | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/social/publish | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/social/publish | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/social/webhooks/{platform} | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/social/webhooks/{platform} | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/sop-updates | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/sop-updates | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/sop-updates | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/sop-updates | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/storage/files/{id} | GET | other auth indicator; inspect | NOT VERIFIED | PARTIAL: selected cases | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | Real isolated two-tenant HTTP (selected cases) | PARTIAL (isolated HTTP) |
| /api/storage/files | DELETE | other auth indicator; inspect | NOT VERIFIED | PARTIAL: selected cases | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | Real isolated two-tenant HTTP (selected cases) | PARTIAL (isolated HTTP) |
| /api/storage/files | GET | other auth indicator; inspect | NOT VERIFIED | PARTIAL: selected cases | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | Real isolated two-tenant HTTP (selected cases) | PARTIAL (isolated HTTP) |
| /api/storage/files | POST | other auth indicator; inspect | NOT VERIFIED | PARTIAL: selected cases | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | Real isolated two-tenant HTTP (selected cases) | PARTIAL (isolated HTTP) |
| /api/super-admin | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/super-admin | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/super-chat | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/super-chat | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/sync | GET | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/sync | POST | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/system-health | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/task-errors | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/task-errors | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/task-errors | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/task-errors | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/task-steps/{taskId} | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/tasks/{id} | DELETE | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/tasks/{id} | PUT | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/tasks | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/tenant-admin/config | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/tenant-admin/config | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/tenant-admin/config | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/tenant-admin/config | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/tenant-admin/quotas | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/tenant-admin/users | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/tenant-admin/users | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/tenant-admin/users | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/tenant-gateway/distribution | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/tenant-gateway/logs | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/tenant-gateway | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/tickets/{id} | DELETE | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/tickets/{id} | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/tickets/{id} | PUT | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/tickets | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/tickets | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/token-budget | DELETE | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/token-budget | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/token-budget | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/token-budget | PUT | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/token-usage | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/token-usage | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/token-usage | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/tool-approvals | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/tool-approvals | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/tool-approvals | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/tool-approvals | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/tool-runs | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/tool-runs | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/tool-runs | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/tool-runs | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/tools | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/tools | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/tools | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/training/evaluations | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/training/evaluations | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/training | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/training | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/training/sources | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/training/sources | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/universities/{id} | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/universities/{id} | PUT | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/universities/accommodation | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/universities/courses | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/universities | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/universities/scholarships | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/universities/stats | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/uploads | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/usage/agents | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/usage/check | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/usage | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/usage/workflows | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/users/{id} | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/users/{id} | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/users/invite | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/users/invite | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/users/invite | PUT | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/users | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/users | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/v1/agents/{id} | GET | v1Handler (wrapper) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/v1/agents/{id}/run | POST | v1Handler (wrapper) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/v1/agents/execute | POST | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/v1/agents | GET | v1Handler (wrapper) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/v1/agents | POST | v1Handler (wrapper) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/v1/approvals/{id} | GET | v1Handler (wrapper) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/v1/approvals/{id} | POST | v1Handler (wrapper) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/v1/approvals | GET | v1Handler (wrapper) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/v1/artifacts/{id} | DELETE | v1Handler (wrapper) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/v1/artifacts/{id} | GET | v1Handler (wrapper) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/v1/artifacts | GET | v1Handler (wrapper) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/v1/artifacts | POST | v1Handler (wrapper) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/v1/command | POST | v1Handler (wrapper) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/v1/events | GET | v1Handler (wrapper) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/v1/health | GET | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/v1/memory | GET | v1Handler (wrapper) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/v1/memory | POST | v1Handler (wrapper) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/v1/models | GET | v1Handler (wrapper) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/v1/projects/{id} | GET | v1Handler (wrapper) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/v1/projects | GET | v1Handler (wrapper) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/v1/projects | POST | v1Handler (wrapper) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/v1/projects | PUT | v1Handler (wrapper) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/v1/runs/{id} | DELETE | v1Handler (wrapper) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/v1/runs/{id} | GET | v1Handler (wrapper) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/v1/runs | GET | v1Handler (wrapper) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/v1/runs | POST | v1Handler (wrapper) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/v1/skills | GET | v1Handler (wrapper) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/v1/skills | POST | v1Handler (wrapper) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/v1/tasks/{id} | GET | v1Handler (wrapper) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/v1/tasks | GET | v1Handler (wrapper) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/v1/tools | GET | v1Handler (wrapper) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/v1/workflows/{id}/run | POST | v1Handler (wrapper) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/v1/workflows | GET | v1Handler (wrapper) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/v1/workflows | POST | v1Handler (wrapper) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/video-hub | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/video-hub | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/voice-system | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/voice-system | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/webhooks/{id} | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/webhooks/{id} | PATCH | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/webhooks/deliveries | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/webhooks | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/webhooks | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/whatsapp/campaigns | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/whatsapp/campaigns | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/whatsapp/numbers | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/whatsapp/numbers | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/whatsapp/numbers | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/whatsapp/numbers | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/whatsapp/send | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/whatsapp/webhook | GET | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/whatsapp/webhook | POST | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/workers/action | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/workers/action | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/workers | DELETE | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/workers | GET | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/workers | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/workers | PUT | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/workflow-factory/build | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/workflow-improvements | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/workflow-improvements | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/workflow-improvements | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/workflow-improvements | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/workflow-steps | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/workflow-steps | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/workflow-steps | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/workflow-steps | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/workflow-usage-summaries | DELETE | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/workflow-usage-summaries | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/workflow-usage-summaries | POST | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/workflow-usage-summaries | PUT | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/workflows/{id} | DELETE | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/workflows/{id} | PUT | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/workflows/{id}/run | POST | requireAuth (call) | NOT VERIFIED | NOT VERIFIED | validator indicator (static) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |
| /api/workflows | GET | other auth indicator; inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED per method | NOT VERIFIED |

**Rows: 682.** Remaining gate: independently execute auth/role/tenant/validation/output/CSRF/rate-limit/error/audit/security tests for every critical endpoint; do not promote static indicators to PASS. The public aggregate `/api/v1/health` returns operational error details and needs redaction review; legacy route bypasses in `src/proxy.ts` require separate manual review.
