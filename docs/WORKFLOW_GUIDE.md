# Workflow guide

Persisted `Workflow` and ordered `WorkflowStep` records are executed with `POST /api/workflows/:id/run` (or `/api/v1/workflows/:id/run`). Body: `{ "input": { "topic": "UK universities" } }`. A `WorkflowRun`, `AgentOSRun`, container `Task`, queued job and per-step Task/TaskSteps are persisted; the worker passes a persisted plan to the Master Orchestrator and records a final aggregate output. `{{var}}` placeholders are substituted from the request input. The `research-report` seed workflow has three ordered steps.

**Implemented:** sequential dependencies, persisted state, queued execution, status/output aggregation, QC through the run pipeline. **Not implemented:** parallel/conditional branches, loops, compensation, timeouts per workflow, and reliable mid-run resume after failure or approval. An approval currently records the decision but intentionally leaves the run paused rather than pretending work resumed.

A configured AI provider and accessible tenant agents are required for execution to complete. Missing configuration fails honestly. See [architecture](ARCHITECTURE.md) and [final audit](../ALO_LABS_AGENTOS_FINAL_AUDIT.md).
