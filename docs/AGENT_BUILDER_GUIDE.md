# Agent Builder guide

Agent configurations are persisted in `Agent` and `AgentVersion`, with `AgentPermission`, `AgentCompanyAccess`, `AgentInstance` and model/skill/tool policy fields. The existing enterprise agent panels and API routes remain in place; the new `/api/v1/agents` lists tenant-accessible active agents. `POST /api/v1/agents` registers a tenant-granted agent; `POST /api/v1/agents/:id/run` uses the AgentExecutionEngine synchronously (not a durable orchestration job).

**Not yet production-complete:** the v1 create route does not create an immutable AgentVersion or implement publish/rollback policy; the visual builder's save/version/publish/disable/rollback journey is not end-to-end certified. Do not use the new route to alter production agents without an administrative review. An AI agent must not inherit an administrator's role or credentials.

For new agent templates define purpose, department, least-privilege allowedSkills/allowedTools, model policy, input/output schema, validation rules, retry/timeout policy and approval requirements. Test in a non-production tenant before enabling access.
