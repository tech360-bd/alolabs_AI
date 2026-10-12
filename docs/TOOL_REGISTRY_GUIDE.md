# Tool Registry guide

The existing tool infrastructure includes `ToolRun` audit rows and runtime tool policies. `/api/v1/tools` aggregates **observed executions** of tools by tenant-accessible agents; it is not a complete registry of every installed or configured capability. The router/agent runtime may use allowed tools from agent config, but the new Master Orchestrator's plan `tools` are currently hints in the task input — **tool selection/invocation is not proven end-to-end**.

Before exposing any external action, define a typed input/output contract, explicit permissions, risk/approval policy, tenant ownership, SSRF defenses, timeout, rate limits, audit redaction and idempotency. Never grant production terminal/computer access to an agent by default. Browser/computer agents are not sandboxed in the new execution path and must remain disabled until reviewed.
